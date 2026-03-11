import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { parseInput, parsePipeline } from "../engine/commands/parser";
import { execute, executeAsync, isAsyncCommand } from "../engine/commands/registry";
import { resolvePath } from "../lib/pathUtils";
import { colorize, ansi } from "../lib/ansi";
import { nexacorpLogo, getSshConnectionSequence, getBootSequence, getCoderConnectionSequence, coderBanner } from "../lib/ascii";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createDevcontainerFilesystem } from "../story/filesystem/devcontainer";
import { createDefaultContext } from "../engine/snowflake/session/context";
import { SaveSlotId } from "../state/saveTypes";
import { formatSlotName } from "../state/saveManager";
import { COMPUTERS } from "../state/types";
import { computeEffects, AppliedEffects } from "../engine/commands/applyResult";
import { seedImmediatePiper } from "../engine/piper/delivery";
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
    deliveredPiperIds,
    addDeliveredPiperMessages,
    saveGame,
    loadGame,
    resetGame,
    activeComputer,
    storyFlags,
    setActiveComputer,
    setStoryFlag,
    setGamePhase,
    setCurrentChapter,
    stashedFs,
    stashedCwd,
    setStashedFs,
    setStashedCwd,
  } = useGameStore();

  // Keep refs for current values to avoid stale closures
  const fsRef = useRef(fs);
  const cwdRef = useRef(cwd);
  const usernameRef = useRef(username);
  const deliveredIdsRef = useRef(deliveredEmailIds);
  const deliveredPiperIdsRef = useRef(deliveredPiperIds);
  const activeComputerRef = useRef(activeComputer);
  const storyFlagsRef = useRef(storyFlags);
  const stashedFsRef = useRef(stashedFs);
  const stashedCwdRef = useRef(stashedCwd);

  useEffect(() => {
    fsRef.current = fs;
    cwdRef.current = cwd;
    usernameRef.current = username;
    deliveredIdsRef.current = deliveredEmailIds;
    deliveredPiperIdsRef.current = deliveredPiperIds;
    activeComputerRef.current = activeComputer;
    storyFlagsRef.current = storyFlags;
    stashedFsRef.current = stashedFs;
    stashedCwdRef.current = stashedCwd;
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

          // Seed immediate piper messages for NexaCorp
          const piperIds = seedImmediatePiper(state.username);
          if (piperIds.length > 0) {
            addDeliveredPiperMessages(piperIds);
            deliveredPiperIdsRef.current = [...deliveredPiperIdsRef.current, ...piperIds];
          }

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
              nexacorpLogo.forEach((line) => term.writeln(line));
              setGamePhase("playing");
            }
          }, BOOT_LINE_INTERVAL_MS);
        }, BOOT_LINE_INTERVAL_MS);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [setGamePhase, setActiveComputer, setCurrentChapter]);

  const runCoderTransition = useCallback((term: Terminal) => {
    setGamePhase("transitioning");

    // Capture old stash (previous devcontainer FS, or null on first visit) before overwriting
    const previousDevcontainerFs = stashedFsRef.current;
    const previousDevcontainerCwd = stashedCwdRef.current;

    // Stash current NexaCorp FS so we can restore it on exit
    setStashedFs(fsRef.current);
    setStashedCwd(cwdRef.current);
    stashedFsRef.current = fsRef.current;
    stashedCwdRef.current = cwdRef.current;

    // Show connection animation
    const lines = getCoderConnectionSequence();
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        term.writeln(lines[i]);
        i++;
      } else {
        clearInterval(interval);

        setActiveComputer("devcontainer");
        activeComputerRef.current = "devcontainer";

        // Restore previous devcontainer FS or build fresh on first visit
        let newFs: VirtualFS;
        let newCwd: string;
        if (previousDevcontainerFs) {
          newFs = previousDevcontainerFs;
          newCwd = (previousDevcontainerCwd && previousDevcontainerFs.getNode(previousDevcontainerCwd))
            ? previousDevcontainerCwd
            : previousDevcontainerFs.cwd;
        } else {
          const username = usernameRef.current;
          const root = createDevcontainerFilesystem(username);
          newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);
          newCwd = newFs.cwd;
        }

        setFs(newFs);
        fsRef.current = newFs;
        setCwd(newCwd);
        cwdRef.current = newCwd;

        term.writeln("");
        coderBanner.forEach((line) => term.writeln(line));
        setGamePhase("playing");
        writePrompt(term);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [setGamePhase, setActiveComputer, setFs, setCwd, setStashedFs, setStashedCwd, writePrompt]);

  const runExitToNexacorp = useCallback((term: Terminal) => {
    // Capture the NexaCorp FS from stash before overwriting
    const nexaFs = stashedFsRef.current;
    const nexaCwd = stashedCwdRef.current;

    // Stash current devcontainer FS for re-entry
    setStashedFs(fsRef.current);
    setStashedCwd(cwdRef.current);
    stashedFsRef.current = fsRef.current;
    stashedCwdRef.current = cwdRef.current;

    // Restore NexaCorp FS
    if (nexaFs) {
      setFs(nexaFs);
      fsRef.current = nexaFs;
      const cwd = (nexaCwd && nexaFs.getNode(nexaCwd)) ? nexaCwd : nexaFs.cwd;
      setCwd(cwd);
      cwdRef.current = cwd;
    }

    setActiveComputer("nexacorp");
    activeComputerRef.current = "nexacorp";

    term.writeln(colorize("\r\nDisconnected from coder-ai.", ansi.dim));
    writePrompt(term);
  }, [setActiveComputer, setFs, setCwd, setStashedFs, setStashedCwd, writePrompt]);

  // Compose sub-hooks
  const sessionRouter = useSessionRouter({
    fsRef,
    usernameRef,
    deliveredIdsRef,
    deliveredPiperIdsRef,
    activeComputerRef,
    storyFlagsRef,
    setFs,
    addDeliveredEmails,
    addDeliveredPiperMessages,
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

  /** Apply state-only effects (FS, cwd, story flags, email/piper deliveries). No terminal writes. */
  const applyStateEffects = useCallback(
    (effects: AppliedEffects) => {
      if (effects.newFs) {
        setFs(effects.newFs);
        fsRef.current = effects.newFs;
      }
      if (effects.newCwd) {
        setCwd(effects.newCwd);
        cwdRef.current = effects.newCwd;
      }
      for (const update of effects.storyFlagUpdates) {
        setStoryFlag(update.flag, update.value);
        storyFlagsRef.current = { ...storyFlagsRef.current, [update.flag]: update.value };
        if (update.toast) {
          useGameStore.getState().addToast(update.toast);
        }
      }
      if (effects.newDeliveredEmailIds.length > 0) {
        addDeliveredEmails(effects.newDeliveredEmailIds);
        deliveredIdsRef.current = [...deliveredIdsRef.current, ...effects.newDeliveredEmailIds];
      }
      if (effects.newDeliveredPiperIds.length > 0) {
        addDeliveredPiperMessages(effects.newDeliveredPiperIds);
        deliveredPiperIdsRef.current = [...deliveredPiperIdsRef.current, ...effects.newDeliveredPiperIds];
      }
    },
    [setFs, setCwd, setStoryFlag, addDeliveredEmails, addDeliveredPiperMessages]
  );

  /** Write email/piper notification lines to the terminal. */
  const writeNotifications = useCallback(
    (term: Terminal, effects: AppliedEffects) => {
      if (effects.emailNotifications > 0) {
        term.write(`\r\n\n${colorize(`You have new mail in /var/mail/${usernameRef.current}`, ansi.yellow, ansi.bold)}`);
      }
      if (effects.piperNotifications > 0) {
        term.write(`\r\n\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
      }
    },
    []
  );

  /** Execute the computed effects from applyResult. Returns true if prompt should be suppressed. */
  const executeEffects = useCallback(
    (term: Terminal, effects: AppliedEffects) => {
      if (effects.clearScreen) {
        term.clear();
      }

      // Incremental line-by-line rendering (e.g. dbt output)
      if (effects.incrementalLines) {
        applyStateEffects(effects);
        busyRef.current = true;
        const lines = effects.incrementalLines;
        let i = 0;
        const writeNext = () => {
          if (i < lines.length) {
            const line = lines[i];
            term.writeln(line.text.replace(/\n/g, "\r\n"));
            i++;
            setTimeout(writeNext, i < lines.length ? lines[i].delayMs : 0);
          } else {
            writeNotifications(term, effects);
            busyRef.current = false;
            writePrompt(term);
          }
        };
        // Write first line immediately, then delay before each subsequent line
        writeNext();
        return true;
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

      // Computer transitions
      if (effects.transitionTo === "devcontainer") {
        runCoderTransition(term);
        return true;
      }
      if (effects.transitionTo === "nexacorp" && activeComputerRef.current === "devcontainer") {
        runExitToNexacorp(term);
        return true;
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
            nexacorpLogo.forEach((line) => term.writeln(line));
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
        if (update.toast) {
          useGameStore.getState().addToast(update.toast);
        }
      }

      // Apply email deliveries
      if (effects.newDeliveredEmailIds.length > 0) {
        addDeliveredEmails(effects.newDeliveredEmailIds);
        deliveredIdsRef.current = [...deliveredIdsRef.current, ...effects.newDeliveredEmailIds];
      }

      if (effects.emailNotifications > 0) {
        term.write(`\r\n\n${colorize(`You have new mail in /var/mail/${usernameRef.current}`, ansi.yellow, ansi.bold)}`);
      }

      // Apply piper deliveries
      if (effects.newDeliveredPiperIds.length > 0) {
        addDeliveredPiperMessages(effects.newDeliveredPiperIds);
        deliveredPiperIdsRef.current = [...deliveredPiperIdsRef.current, ...effects.newDeliveredPiperIds];
      }

      if (effects.piperNotifications > 0) {
        term.write(`\r\n\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
      }

      return effects.suppressPrompt;
    },
    [setFs, setCwd, sessionRouter, addDeliveredEmails, addDeliveredPiperMessages, saveGame, loadGame, getPrompt, setStoryFlag, runCoderTransition, runExitToNexacorp, applyStateEffects, writeNotifications, writePrompt]
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

        // CSI escape sequences (arrows, modifiers like Option+Arrow)
        if (char === "\x1b" && data[i + 1] === "[") {
          // Parse full CSI sequence: ESC [ <params> <final>
          let j = i + 2;
          while (j < data.length && data[j] >= "0" && data[j] <= "?") j++;
          const params = data.slice(i + 2, j);
          const final = data[j] ?? "";
          i = j;

          // Extract modifier from params like "1;3" → modifier 3 (Alt/Option)
          const parts = params.split(";");
          const modifier = parts.length > 1 ? parseInt(parts[1], 10) : 0;

          // Delete key sequences (e.g., \x1b[3;3~ for Option+Forward Delete)
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

        // Option+Backspace: ESC + DEL → delete word backward
        if (char === "\x1b" && i + 1 < data.length && data[i + 1].charCodeAt(0) === 127) {
          i += 1;
          commandLine.deleteWordBackward(term);
          continue;
        }

        // Ctrl+W → delete word backward
        if (code === 23) {
          commandLine.deleteWordBackward(term);
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
            deliveredPiperIds: deliveredPiperIdsRef.current,
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
