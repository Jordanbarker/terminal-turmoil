import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { parseInput, parsePipeline } from "../engine/commands/parser";
import { execute, executeAsync, isAsyncCommand, commandReadsFiles } from "../engine/commands/registry";
import { resolvePath } from "../lib/pathUtils";
import { colorize, ansi } from "../lib/ansi";
import { nexacorpLogo } from "../lib/ascii";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createDefaultContext } from "../engine/snowflake/session/context";
import { SaveSlotId } from "../state/saveTypes";
import { formatSlotName } from "../state/saveManager";
import { COMPUTERS, ComputerId } from "../state/types";
import { computeEffects, AppliedEffects } from "../engine/commands/applyResult";
import { useSessionRouter } from "./useSessionRouter";
import { useCommandLine } from "./useCommandLine";
import { useComputerTransitions } from "./useComputerTransitions";
import { CommandContext } from "../engine/commands/types";
import { applyRedirection } from "../engine/commands/redirection";

// ---------------------------------------------------------------------------
// Module-scope helpers (no React dependencies)
// ---------------------------------------------------------------------------

// Per-computer command queue: serializes FS mutations to prevent TOCTOU races
// between tabs on the same computer.
const computerQueues: Partial<Record<ComputerId, Promise<void>>> = {};

function enqueueCommand(computerId: ComputerId, fn: () => void | Promise<void>): Promise<void> {
  const prev = computerQueues[computerId] ?? Promise.resolve();
  const next = prev.then(fn).catch(() => {}); // ensure chain continues if a command throws
  computerQueues[computerId] = next;
  return next;
}

/** Build a CommandContext from the provided FS/cwd and store state. */
function buildCommandContext(
  fs: VirtualFS,
  cwd: string,
  computerId: ComputerId,
  homeDir: string,
  stdin: string | undefined,
  rawArgs: string[],
  isPiped: boolean,
  store: ReturnType<typeof useGameStore.getState>
): CommandContext {
  return {
    fs,
    cwd,
    homeDir,
    activeComputer: computerId,
    storyFlags: store.storyFlags,
    stdin,
    rawArgs,
    isPiped,
    commandHistory: store.commandHistory,
    snowflakeState: store.snowflakeState,
    snowflakeContext: createDefaultContext(store.username),
    setSnowflakeState: store.setSnowflakeState,
  };
}

// Ensure all builtins are registered
import "../engine/commands/builtins";

export function useTerminal() {
  const busyRef = useRef(false);
  const busyTabIdRef = useRef<string | null>(null);
  const confirmNewGameRef = useRef(false);
  const pendingNotificationsRef = useRef<{ email: number; piper: number } | null>(null);

  // Per-tab local refs — derived from active tab
  const initState = useGameStore.getState();
  const initTab = initState.tabs.find((t) => t.id === initState.activeTabId);
  const cwdRef = useRef(initTab?.cwd ?? `/home/${initState.username}`);
  const activeComputerRef = useRef<ComputerId>(initTab?.computerId ?? "home");

  // Sync refs whenever the active tab changes (e.g. addTab, setActiveTab, removeTab)
  useEffect(() => {
    const unsub = useGameStore.subscribe((state) => {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (tab) {
        activeComputerRef.current = tab.computerId;
        cwdRef.current = tab.cwd;
      }
    });
    return unsub;
  }, []);

  const getPrompt = useCallback((currentCwd?: string) => {
    const store = useGameStore.getState();
    const displayCwd = currentCwd || cwdRef.current;
    const homeDir = store.computerState[activeComputerRef.current]?.fs?.homeDir ?? `/home/${store.username}`;
    const displayPath = displayCwd.startsWith(homeDir)
      ? "~" + displayCwd.slice(homeDir.length)
      : displayCwd;
    const hostname = COMPUTERS[activeComputerRef.current].promptHostname;
    return `${colorize(`${store.username}@${hostname}`, ansi.green)}:${colorize(displayPath, ansi.blue)}$ `;
  }, []);

  const writePrompt = useCallback(
    (term: Terminal) => {
      term.write("\r\n" + getPrompt());
    },
    [getPrompt]
  );

  // Compose transition functions
  const { runSshTransition, runCoderTransition, runExitToNexacorp, runExitToHome, runShutdownTransition } = useComputerTransitions({
    cwdRef,
    activeComputerRef,
    writePrompt,
  });

  // Compose sub-hooks
  const sessionRouter = useSessionRouter({
    activeComputerRef,
    writePrompt,
    getPrompt,
    runSshTransition,
    pendingNotificationsRef,
  });

  const commandLine = useCommandLine({
    cwdRef,
    activeComputerRef,
    writePrompt,
  });

  /** Apply state-only effects (FS, cwd, story flags, email/piper deliveries). No terminal writes. */
  const applyStateEffects = useCallback(
    (effects: AppliedEffects, computerId: ComputerId) => {
      const store = useGameStore.getState();
      if (effects.newFs) {
        store.setComputerFs(computerId, effects.newFs);
      }
      if (effects.newCwd) {
        store.setTabCwd(store.activeTabId, effects.newCwd);
        cwdRef.current = effects.newCwd;
      }
      for (const update of effects.storyFlagUpdates) {
        useGameStore.getState().setStoryFlag(update.flag, update.value);
        if (update.toast) {
          useGameStore.getState().addToast(update.toast);
        }
      }
      if (effects.newDeliveredEmailIds.length > 0) {
        useGameStore.getState().addDeliveredEmails(effects.newDeliveredEmailIds);
      }
      if (effects.newDeliveredPiperIds.length > 0) {
        useGameStore.getState().addDeliveredPiperMessages(effects.newDeliveredPiperIds);
      }
    },
    []
  );

  /** Write email/piper notification lines to the terminal. */
  const writeNotifications = useCallback(
    (term: Terminal, effects: AppliedEffects) => {
      if (effects.emailNotifications > 0) {
        const username = useGameStore.getState().username;
        term.write(`\r\n${colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold)}`);
      }
      if (effects.piperNotifications > 0) {
        term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
      }
    },
    []
  );

  /** Execute the computed effects from applyResult. Returns true if prompt should be suppressed. */
  const executeEffects = useCallback(
    (term: Terminal, effects: AppliedEffects, tabId?: string) => {
      const computerId = activeComputerRef.current;

      if (effects.clearScreen) {
        term.clear();
      }

      // Incremental line-by-line rendering (e.g. dbt output)
      if (effects.incrementalLines) {
        applyStateEffects(effects, computerId);
        busyRef.current = true;
        busyTabIdRef.current = useGameStore.getState().activeTabId;
        const lines = effects.incrementalLines;
        let i = 0;
        const writeNext = () => {
          if (i < lines.length) {
            const line = lines[i];
            term.writeln(line.text.replace(/\n/g, "\r\n"));
            i++;
            setTimeout(writeNext, i < lines.length ? lines[i].delayMs : 0);
          } else {
            busyRef.current = false;
            busyTabIdRef.current = null;
            if (effects.gameAction?.type === "shutdown") {
              runShutdownTransition(term);
            } else {
              writeNotifications(term, effects);
              writePrompt(term);
            }
          }
        };
        writeNext();
        return true;
      }

      if (effects.output) {
        term.write(effects.output.replace(/\n/g, "\r\n"));
      }

      // Apply all state effects (FS, cwd, story flags, deliveries) before any early returns
      applyStateEffects(effects, computerId);

      // Computer transitions — first-time (full animation)
      if (effects.transitionTo === "devcontainer") {
        runCoderTransition(term);
        return true;
      }
      if (effects.transitionTo === "nexacorp" && computerId === "devcontainer") {
        runExitToNexacorp(term);
        return true;
      }
      if (effects.transitionTo === "home" && computerId === "nexacorp") {
        runExitToHome(term);
        return true;
      }

      // Start sessions — defer notifications until session exits
      if (effects.startSession) {
        if (effects.emailNotifications > 0 || effects.piperNotifications > 0) {
          pendingNotificationsRef.current = {
            email: effects.emailNotifications,
            piper: effects.piperNotifications,
          };
        }
        sessionRouter.startSession(term, effects.startSession, tabId);
        return true;
      }

      // Handle game actions that need imperative logic
      if (effects.gameAction) {
        const action = effects.gameAction;
        if (action.type === "save") {
          const slotName = formatSlotName(action.slotId as SaveSlotId);
          const ok = useGameStore.getState().saveGame(action.slotId as SaveSlotId);
          if (ok) {
            term.write(colorize(`Game saved to ${slotName}.`, ansi.cyan));
          } else {
            term.write(colorize("Error: failed to save game.", ansi.red));
          }
        } else if (action.type === "load") {
          const slotName = formatSlotName(action.slotId as SaveSlotId);
          const ok = useGameStore.getState().loadGame(action.slotId as SaveSlotId);
          if (ok) {
            const state = useGameStore.getState();
            const loadedTab = state.tabs.find((t) => t.id === state.activeTabId);
            cwdRef.current = loadedTab?.cwd ?? `/home/${state.username}`;
            activeComputerRef.current = loadedTab?.computerId ?? "home";
            term.clear();
            nexacorpLogo.forEach((line) => term.writeln(line));
            term.write(colorize(`\r\nLoaded save from ${slotName}.\r\n`, ansi.cyan));
            term.write(getPrompt(cwdRef.current));
            return true;
          } else {
            term.write(colorize(`Error: ${slotName} is empty or corrupted.`, ansi.red));
          }
        } else if (action.type === "newGame") {
          term.write(colorize("Are you sure you want to start a new game? All unsaved progress will be lost. (y/n) ", ansi.yellow));
          confirmNewGameRef.current = true;
          return true;
        }
      }

      // Write notifications (state already applied by applyStateEffects above)
      writeNotifications(term, effects);

      return effects.suppressPrompt;
    },
    [sessionRouter, getPrompt, runCoderTransition, runExitToNexacorp, runExitToHome, runShutdownTransition, applyStateEffects, writeNotifications, writePrompt]
  );

  const handleInput = useCallback(
    (term: Terminal, data: string) => {
      // Handle newgame confirmation prompt
      if (confirmNewGameRef.current) {
        if (data === "\r" || data === "\n") return;
        const ch = data[0].toLowerCase();
        confirmNewGameRef.current = false;
        if (ch === "y") {
          term.write("y\r\n");
          useGameStore.getState().resetGame();
          window.location.reload();
        } else {
          term.write(ch === "n" ? "n" : ch);
          term.write(colorize("\r\nNew game cancelled.", ansi.yellow));
          writePrompt(term);
        }
        return;
      }

      // Route input to active session if one exists
      if (sessionRouter.routeInput(term, data)) return;

      // Ignore input while an async command is running in this tab
      const activeTabId = useGameStore.getState().activeTabId;
      if (busyRef.current && activeTabId === busyTabIdRef.current) return;

      // Handle special characters
      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        const code = char.charCodeAt(0);

        // CSI escape sequences (arrows, modifiers like Option+Arrow)
        if (char === "\x1b" && data[i + 1] === "[") {
          let j = i + 2;
          while (j < data.length && data[j] >= "0" && data[j] <= "?") j++;
          const params = data.slice(i + 2, j);
          const final = data[j] ?? "";
          i = j;

          const parts = params.split(";");
          const modifier = parts.length > 1 ? parseInt(parts[1], 10) : 0;

          if (final === "~") {
            const keyCode = parts.length > 0 ? parseInt(parts[0], 10) : 0;
            if (keyCode === 3 && (modifier === 3 || modifier === 5)) {
              commandLine.deleteWordForward(term);
            }
            continue;
          }

          commandLine.handleArrow(term, final, modifier);
          continue;
        }

        if (char === "\x1b" && i + 1 < data.length && data[i + 1].charCodeAt(0) === 127) {
          i += 1;
          commandLine.deleteWordBackward(term);
          continue;
        }

        if (code === 23) {
          commandLine.deleteWordBackward(term);
          continue;
        }

        const result = commandLine.handleChar(term, char, code);
        if (!result) continue;

        // Command submitted — check for pipeline
        const pipeline = parsePipeline(result.input);

        // Check for parse errors (e.g. unterminated quotes)
        const parseError = pipeline.find((p) => p.error);
        if (parseError) {
          term.write(colorize(parseError.error!, ansi.red));
          writePrompt(term);
          continue;
        }

        // Check for redirection in the last segment
        let redirectFile: string | null = null;
        let redirectAppend = false;
        const lastSegment = pipeline[pipeline.length - 1];
        if (lastSegment.raw.includes(">>") || lastSegment.raw.includes(">")) {
          const raw = lastSegment.raw;
          const appendIdx = raw.indexOf(">>");
          const overwriteIdx = raw.indexOf(">");
          if (appendIdx !== -1) {
            redirectAppend = true;
            const parts = raw.split(">>");
            pipeline[pipeline.length - 1] = parseInput(parts[0].trim());
            redirectFile = parts[1].trim();
          } else if (overwriteIdx !== -1) {
            const parts = raw.split(">");
            pipeline[pipeline.length - 1] = parseInput(parts[0].trim());
            redirectFile = parts[1].trim();
          }
        }

        const parsed = pipeline[0];
        if (!parsed.command && pipeline.length === 1) {
          writePrompt(term);
          continue;
        }

        const computerId = activeComputerRef.current;
        const hasAsyncCmd = pipeline.some((p) => isAsyncCommand(p.command));

        // Capture tab ID at submission time (before async enqueue)
        const submittingTabId = useGameStore.getState().activeTabId;

        // Gate input while command is queued/executing
        busyRef.current = true;
        busyTabIdRef.current = submittingTabId;
        if (hasAsyncCmd) {
          term.write(colorize("Loading...", ansi.dim));
        }

        // Enqueue command execution to serialize FS mutations per computer
        enqueueCommand(computerId, async () => {
          const store = useGameStore.getState();
          const initialFs = store.computerState[computerId]!.fs;
          const currentCwd = cwdRef.current;
          const homeDir = initialFs.homeDir;

          const applyCommandResult = (
            cmdResult: import("../engine/commands/types").CommandResult,
            parsedCmd: import("../engine/commands/types").ParsedCommand,
            runningFs: VirtualFS
          ) => {
            const latestStore = useGameStore.getState();
            const targetComputer = cmdResult.transitionTo;
            const effects = computeEffects(cmdResult, {
              parsedCommand: parsedCmd.command,
              parsedArgs: parsedCmd.args,
              cwd: cwdRef.current,
              homeDir,
              activeComputer: computerId,
              username: latestStore.username,
              deliveredEmailIds: latestStore.deliveredEmailIds,
              deliveredPiperIds: latestStore.deliveredPiperIds,
              storyFlags: latestStore.storyFlags,
              fs: runningFs,
              targetComputerExists: targetComputer ? !!latestStore.computerState[targetComputer] : undefined,
            });
            return executeEffects(term, effects, submittingTabId);
          };

          let stdin: string | undefined;
          let lastResult: import("../engine/commands/types").CommandResult = { output: "" };
          const allTriggerEvents: import("../engine/mail/delivery").GameEvent[] = [];
          let runningFs = initialFs;

          for (let pi = 0; pi < pipeline.length; pi++) {
            const p = pipeline[pi];
            if (!p.command) continue;

            const ctx = buildCommandContext(
              runningFs,
              cwdRef.current,
              computerId,
              homeDir,
              stdin,
              p.rawArgs,
              pi < pipeline.length - 1 || !!redirectFile,
              useGameStore.getState()
            );

            if (isAsyncCommand(p.command)) {
              lastResult = await executeAsync(p.command, p.args, p.flags, ctx);
            } else {
              lastResult = execute(p.command, p.args, p.flags, ctx);
            }

            if (lastResult.triggerEvents) {
              allTriggerEvents.push(...lastResult.triggerEvents);
            }

            // Intermediate pipeline commands: generate file_read events
            // (the last command's file reads are handled by computeEffects)
            if (pi < pipeline.length - 1 && commandReadsFiles(p.command)) {
              for (const arg of p.args) {
                if (!arg.startsWith("-")) {
                  const absPath = resolvePath(arg, cwdRef.current, homeDir);
                  if (!runningFs.readFile(absPath).error) {
                    allTriggerEvents.push({ type: "file_read" as const, detail: absPath });
                  }
                }
              }
            }

            if (lastResult.newFs) {
              runningFs = lastResult.newFs;
            }

            stdin = lastResult.output;
          }

          if (allTriggerEvents.length > 0) {
            lastResult = { ...lastResult, triggerEvents: allTriggerEvents };
          }

          if (redirectFile && lastResult) {
            const redir = applyRedirection(redirectFile, redirectAppend, lastResult, currentCwd, homeDir, runningFs);
            lastResult = redir.result;
            runningFs = redir.fs;
          }

          // Append command to .bash_history in the virtual filesystem
          const historyPath = `${homeDir}/.bash_history`;
          const existing = runningFs.readFile(historyPath);
          const prev = existing.content ?? "";
          const suffix = prev.endsWith("\n") || prev === "" ? "" : "\n";
          const historyUpdated = prev + suffix + result.input + "\n";
          const histWrite = runningFs.writeFile(historyPath, historyUpdated);
          if (histWrite.fs) runningFs = histWrite.fs;

          // Write final FS to store once
          if (runningFs !== initialFs) {
            useGameStore.getState().setComputerFs(computerId, runningFs);
          }

          if (hasAsyncCmd) {
            term.write("\r\x1b[K");
          }

          const earlyReturn = applyCommandResult(lastResult, pipeline[pipeline.length - 1], runningFs);
          busyRef.current = false;
          busyTabIdRef.current = null;
          if (!earlyReturn) {
            writePrompt(term);
          }
        });
      }
    },
    [writePrompt, sessionRouter, commandLine, executeEffects]
  );

  return {
    handleInput,
    getPrompt,
    startSession: sessionRouter.startSession,
    canCloseCurrentSession: sessionRouter.canCloseCurrentSession,
  };
}
