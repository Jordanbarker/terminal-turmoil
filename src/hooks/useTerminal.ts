import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { parseInput, parsePipeline } from "../engine/commands/parser";
import { execute, executeAsync, isAsyncCommand } from "../engine/commands/registry";
import { resolvePath } from "../lib/pathUtils";
import { colorize, ansi } from "../lib/ansi";
import { motd, getSshConnectionSequence, getBootSequence } from "../lib/ascii";
import { createDefaultContext } from "../engine/snowflake/session/context";
import { SaveSlotId } from "../state/saveTypes";
import { formatSlotName } from "../state/saveManager";
import { COMPUTERS } from "../state/types";
import { computeEffects, AppliedEffects } from "../engine/commands/applyResult";
import { BOOT_LINE_INTERVAL_MS } from "../lib/timing";
import { useSessionRouter } from "./useSessionRouter";
import { useCommandLine } from "./useCommandLine";

// Ensure all builtins are registered
import "../engine/commands/builtins";

export function useTerminal() {
  const busyRef = useRef(false);
  const confirmNewGameRef = useRef(false);
  const {
    fs,
    cwd,
    username,
    setFs,
    setCwd,
    deliveredEmailIds,
    addDeliveredEmails,
    saveGame,
    loadGame,
    resetGame,
    activeComputer,
    storyFlags,
    setActiveComputer,
    setStoryFlag,
    setGamePhase,
    setCurrentChapter,
  } = useGameStore();

  // Keep refs for current values to avoid stale closures
  const fsRef = useRef(fs);
  const cwdRef = useRef(cwd);
  const usernameRef = useRef(username);
  const deliveredIdsRef = useRef(deliveredEmailIds);
  const activeComputerRef = useRef(activeComputer);
  const storyFlagsRef = useRef(storyFlags);

  useEffect(() => {
    fsRef.current = fs;
    cwdRef.current = cwd;
    usernameRef.current = username;
    deliveredIdsRef.current = deliveredEmailIds;
    activeComputerRef.current = activeComputer;
    storyFlagsRef.current = storyFlags;
  });

  const getPrompt = useCallback((currentCwd?: string) => {
    const displayCwd = currentCwd || cwdRef.current;
    const home = fsRef.current.homeDir;
    const displayPath = displayCwd.startsWith(home)
      ? "~" + displayCwd.slice(home.length)
      : displayCwd;
    const hostname = COMPUTERS[activeComputerRef.current].promptHostname;
    return `${colorize(`${usernameRef.current}@${hostname}`, ansi.green)}:${colorize(displayPath, ansi.blue)}$ `;
  }, []);

  const writePrompt = useCallback(
    (term: Terminal) => {
      term.write("\r\n" + getPrompt());
    },
    [getPrompt]
  );

  const runSshTransition = useCallback((term: Terminal) => {
    setGamePhase("transitioning");

    // Phase 1: SSH connection lines
    const sshLines = getSshConnectionSequence(usernameRef.current);
    let i = 0;
    const sshInterval = setInterval(() => {
      if (i < sshLines.length) {
        term.writeln(sshLines[i]);
        i++;
      } else {
        clearInterval(sshInterval);

        // Switch computer and rebuild filesystem
        setTimeout(() => {
          term.clear();
          setActiveComputer("nexacorp");
          activeComputerRef.current = "nexacorp";
          setCurrentChapter("chapter-2");

          // setUsername rebuilds NexaCorp filesystem
          const store = useGameStore.getState();
          store.setUsername(store.username);

          // Sync refs from rebuilt state
          const state = useGameStore.getState();
          fsRef.current = state.fs;
          cwdRef.current = state.cwd;

          // Phase 2: Boot sequence
          setGamePhase("booting");
          const bootLines = getBootSequence(usernameRef.current);
          let j = 0;
          const bootInterval = setInterval(() => {
            if (j < bootLines.length) {
              term.writeln(bootLines[j]);
              j++;
            } else {
              clearInterval(bootInterval);
              term.writeln("");
              motd.forEach((line) => term.writeln(line));
              setGamePhase("playing");
            }
          }, BOOT_LINE_INTERVAL_MS);
        }, BOOT_LINE_INTERVAL_MS);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [setGamePhase, setActiveComputer, setCurrentChapter]);

  // Compose sub-hooks
  const sessionRouter = useSessionRouter({
    fsRef,
    usernameRef,
    deliveredIdsRef,
    activeComputerRef,
    storyFlagsRef,
    setFs,
    addDeliveredEmails,
    setStoryFlag,
    writePrompt,
    runSshTransition,
  });

  const commandLine = useCommandLine({
    fsRef,
    cwdRef,
    activeComputerRef,
    storyFlagsRef,
    writePrompt,
  });

  /** Execute the computed effects from applyResult. Returns true if prompt should be suppressed. */
  const executeEffects = useCallback(
    (term: Terminal, effects: AppliedEffects) => {
      if (effects.clearScreen) {
        term.clear();
      }

      if (effects.output) {
        term.write(effects.output.replace(/\n/g, "\r\n"));
      }

      if (effects.newFs) {
        setFs(effects.newFs);
        fsRef.current = effects.newFs;
      }

      if (effects.newCwd) {
        setCwd(effects.newCwd);
        cwdRef.current = effects.newCwd;
      }

      // Start sessions
      if (effects.startSession) {
        sessionRouter.startSession(term, effects.startSession);
        return true;
      }

      // Handle game actions that need imperative logic
      if (effects.gameAction) {
        const action = effects.gameAction;
        if (action.type === "save") {
          const slotName = formatSlotName(action.slotId as SaveSlotId);
          const ok = saveGame(action.slotId as SaveSlotId);
          if (ok) {
            term.write(colorize(`Game saved to ${slotName}.`, ansi.cyan));
          } else {
            term.write(colorize("Error: failed to save game.", ansi.red));
          }
        } else if (action.type === "load") {
          const slotName = formatSlotName(action.slotId as SaveSlotId);
          const ok = loadGame(action.slotId as SaveSlotId);
          if (ok) {
            const state = useGameStore.getState();
            fsRef.current = state.fs;
            cwdRef.current = state.cwd;
            usernameRef.current = state.username;
            deliveredIdsRef.current = state.deliveredEmailIds;
            term.clear();
            motd.forEach((line) => term.writeln(line));
            term.write(colorize(`\r\nLoaded save from ${slotName}.\r\n`, ansi.cyan));
            term.write(getPrompt(state.cwd));
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

      // Apply story flag updates
      for (const update of effects.storyFlagUpdates) {
        setStoryFlag(update.flag, update.value);
        storyFlagsRef.current = { ...storyFlagsRef.current, [update.flag]: update.value };
      }

      // Apply email deliveries
      if (effects.newDeliveredEmailIds.length > 0) {
        addDeliveredEmails(effects.newDeliveredEmailIds);
        deliveredIdsRef.current = [...deliveredIdsRef.current, ...effects.newDeliveredEmailIds];
      }

      if (effects.emailNotifications > 0) {
        term.write(`\r\n\nYou have new mail in /var/mail/${usernameRef.current}`);
      }

      return effects.suppressPrompt;
    },
    [setFs, setCwd, sessionRouter, addDeliveredEmails, saveGame, loadGame, getPrompt, setStoryFlag]
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
          resetGame();
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

      // Ignore input while an async command is running
      if (busyRef.current) return;

      // Handle special characters
      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        const code = char.charCodeAt(0);

        // Arrow key escape sequences
        if (char === "\x1b" && data[i + 1] === "[") {
          const arrow = data[i + 2];
          i += 2;
          commandLine.handleArrow(term, arrow);
          continue;
        }

        const result = commandLine.handleChar(term, char, code);
        if (!result) continue;

        // Command submitted — check for pipeline
        const pipeline = parsePipeline(result.input);

        // Check for redirection in the last segment
        let redirectFile: string | null = null;
        let redirectAppend = false;
        const lastSegment = pipeline[pipeline.length - 1];
        if (lastSegment.raw.includes(">>") || lastSegment.raw.includes(">")) {
          // Parse redirection from the last pipeline segment
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

        const currentFs = fsRef.current;
        const currentCwd = cwdRef.current;

        const store = useGameStore.getState();

        const applyCommandResult = (cmdResult: import("../engine/commands/types").CommandResult, parsedCmd: import("../engine/commands/types").ParsedCommand) => {
          const effects = computeEffects(cmdResult, {
            parsedCommand: parsedCmd.command,
            parsedArgs: parsedCmd.args,
            cwd: currentCwd,
            homeDir: currentFs.homeDir,
            activeComputer: activeComputerRef.current,
            username: usernameRef.current,
            deliveredEmailIds: deliveredIdsRef.current,
            storyFlags: storyFlagsRef.current,
            fs: fsRef.current,
          });

          return executeEffects(term, effects);
        };

        // Check if any command in the pipeline is async
        const hasAsyncCmd = pipeline.some((p) => isAsyncCommand(p.command));

        if (hasAsyncCmd) {
          busyRef.current = true;
          term.write(colorize("Loading...", ansi.dim));

          (async () => {
            let stdin: string | undefined;
            let lastResult: import("../engine/commands/types").CommandResult = { output: "" };

            for (let pi = 0; pi < pipeline.length; pi++) {
              const p = pipeline[pi];
              if (!p.command) continue;

              const ctx = {
                fs: fsRef.current,
                cwd: cwdRef.current,
                homeDir: currentFs.homeDir,
                activeComputer: activeComputerRef.current,
                storyFlags: storyFlagsRef.current,
                stdin,
                rawArgs: p.rawArgs,
                isPiped: pi < pipeline.length - 1 || !!redirectFile,
                commandHistory: store.commandHistory,
                snowflakeState: store.snowflakeState,
                snowflakeContext: createDefaultContext(store.username),
                setSnowflakeState: store.setSnowflakeState,
              };

              if (isAsyncCommand(p.command)) {
                lastResult = await executeAsync(p.command, p.args, p.flags, ctx);
              } else {
                lastResult = execute(p.command, p.args, p.flags, ctx);
              }
              stdin = lastResult.output;
            }

            // Handle redirection
            if (redirectFile && lastResult) {
              const absPath = resolvePath(redirectFile, currentCwd, currentFs.homeDir);
              let content = lastResult.output;
              if (redirectAppend) {
                const existing = fsRef.current.readFile(absPath);
                if (existing.content !== undefined) {
                  content = existing.content + "\n" + content;
                }
              }
              const writeResult = fsRef.current.writeFile(absPath, content);
              if (writeResult.fs) {
                setFs(writeResult.fs);
                fsRef.current = writeResult.fs;
              }
              lastResult = { ...lastResult, output: "" };
            }

            term.write("\r\x1b[K");
            const earlyReturn = applyCommandResult(lastResult, pipeline[pipeline.length - 1]);
            busyRef.current = false;
            if (!earlyReturn) {
              writePrompt(term);
            }
          })();
          return;
        }

        // Synchronous pipeline execution
        let stdin: string | undefined;
        let lastResult: import("../engine/commands/types").CommandResult = { output: "" };

        for (let pi = 0; pi < pipeline.length; pi++) {
          const p = pipeline[pi];
          if (!p.command) continue;

          const ctx = {
            fs: fsRef.current,
            cwd: cwdRef.current,
            homeDir: currentFs.homeDir,
            activeComputer: activeComputerRef.current,
            storyFlags: storyFlagsRef.current,
            stdin,
            rawArgs: p.rawArgs,
            isPiped: pi < pipeline.length - 1 || !!redirectFile,
            commandHistory: store.commandHistory,
            snowflakeState: store.snowflakeState,
            snowflakeContext: createDefaultContext(store.username),
            setSnowflakeState: store.setSnowflakeState,
          };

          lastResult = execute(p.command, p.args, p.flags, ctx);

          // Apply FS changes mid-pipeline
          if (lastResult.newFs) {
            setFs(lastResult.newFs);
            fsRef.current = lastResult.newFs;
          }

          stdin = lastResult.output;
        }

        // Handle redirection
        if (redirectFile && lastResult) {
          const absPath = resolvePath(redirectFile, currentCwd, currentFs.homeDir);
          let content = lastResult.output;
          if (redirectAppend) {
            const existing = fsRef.current.readFile(absPath);
            if (existing.content !== undefined) {
              content = existing.content + "\n" + content;
            }
          }
          const writeResult = fsRef.current.writeFile(absPath, content);
          if (writeResult.fs) {
            setFs(writeResult.fs);
            fsRef.current = writeResult.fs;
          }
          lastResult = { ...lastResult, output: "" };
        }

        const earlyReturn = applyCommandResult(lastResult, pipeline[pipeline.length - 1]);
        if (earlyReturn) return;

        writePrompt(term);
      }
    },
    [writePrompt, resetGame, sessionRouter, commandLine, executeEffects]
  );

  return { handleInput, getPrompt, startSession: sessionRouter.startSession };
}
