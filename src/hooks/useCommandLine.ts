import { useCallback, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { getAvailableCommands } from "../engine/commands/registry";
import { getSuggestion } from "../engine/suggestions/suggest";
import { isBackspace, isPrintable, CTRL_C } from "../engine/terminal/keyCodes";
import { ComputerId } from "../state/types";

interface CommandLineDeps {
  fsRef: React.MutableRefObject<VirtualFS>;
  cwdRef: React.MutableRefObject<string>;
  activeComputerRef: React.MutableRefObject<ComputerId>;
  writePrompt: (term: Terminal) => void;
}

export interface CommandLineResult {
  type: "submit";
  input: string;
}

export function useCommandLine(deps: CommandLineDeps) {
  const { fsRef, cwdRef, activeComputerRef, writePrompt } = deps;
  const lineBuffer = useRef("");
  const ghostLengthRef = useRef(0);

  const {
    commandHistory,
    historyIndex,
    pushHistory,
    setHistoryIndex,
  } = useGameStore();

  const historyRef = useRef(commandHistory);
  const historyIndexRef = useRef(historyIndex);
  historyRef.current = commandHistory;
  historyIndexRef.current = historyIndex;

  const clearGhost = useCallback((term: Terminal) => {
    if (ghostLengthRef.current > 0) {
      term.write("\x1b[s\x1b[K\x1b[u");
      ghostLengthRef.current = 0;
    }
  }, []);

  const renderGhostText = useCallback((term: Terminal) => {
    const input = lineBuffer.current;
    if (!input) return;

    const commandNames = getAvailableCommands(activeComputerRef.current).map((c) => c.name);
    const suggestion = getSuggestion(input, {
      commandHistory: historyRef.current,
      commandNames,
      fs: fsRef.current,
      cwd: cwdRef.current,
      homeDir: fsRef.current.homeDir,
    });

    if (suggestion && suggestion.length > input.length) {
      const suffix = suggestion.slice(input.length);
      term.write(`\x1b[s\x1b[2m${suffix}\x1b[0m\x1b[u`);
      ghostLengthRef.current = suffix.length;
    }
  }, [fsRef, cwdRef]);

  /**
   * Process a single character of input for the command line.
   * Returns a CommandLineResult if a command was submitted, null otherwise.
   */
  const handleChar = useCallback(
    (term: Terminal, char: string, code: number): CommandLineResult | null => {
      if (char === "\r" || char === "\n") {
        clearGhost(term);
        const input = lineBuffer.current;
        lineBuffer.current = "";
        term.write("\r\n");

        if (input.trim()) {
          pushHistory(input);
          setHistoryIndex(-1);
          return { type: "submit", input };
        }

        writePrompt(term);
        return null;
      }

      if (isBackspace(code)) {
        clearGhost(term);
        if (lineBuffer.current.length > 0) {
          lineBuffer.current = lineBuffer.current.slice(0, -1);
          term.write("\b \b");
        }
        renderGhostText(term);
        return null;
      }

      if (code === CTRL_C) {
        clearGhost(term);
        lineBuffer.current = "";
        term.write("^C");
        writePrompt(term);
        return null;
      }

      if (isPrintable(code)) {
        clearGhost(term);
        lineBuffer.current += char;
        term.write(char);
        renderGhostText(term);
        return null;
      }

      return null;
    },
    [clearGhost, renderGhostText, pushHistory, setHistoryIndex, writePrompt]
  );

  const handleArrow = useCallback(
    (term: Terminal, arrow: string): void => {
      if (arrow === "A") {
        // Up arrow — navigate history
        clearGhost(term);
        const history = historyRef.current;
        const idx = historyIndexRef.current;
        const newIdx = idx === -1 ? history.length - 1 : idx - 1;

        if (newIdx >= 0 && history.length > 0) {
          const clearLen = lineBuffer.current.length;
          term.write("\b \b".repeat(clearLen));

          const historyEntry = history[newIdx];
          lineBuffer.current = historyEntry;
          term.write(historyEntry);
          setHistoryIndex(newIdx);
          historyIndexRef.current = newIdx;
        }
        renderGhostText(term);
      } else if (arrow === "B") {
        // Down arrow — navigate history forward
        clearGhost(term);
        const history = historyRef.current;
        const idx = historyIndexRef.current;

        const clearLen = lineBuffer.current.length;
        term.write("\b \b".repeat(clearLen));

        if (idx === -1 || idx >= history.length - 1) {
          lineBuffer.current = "";
          setHistoryIndex(-1);
          historyIndexRef.current = -1;
        } else {
          const newIdx = idx + 1;
          const historyEntry = history[newIdx];
          lineBuffer.current = historyEntry;
          term.write(historyEntry);
          setHistoryIndex(newIdx);
          historyIndexRef.current = newIdx;
        }
        renderGhostText(term);
      } else if (arrow === "C") {
        // Right arrow — accept suggestion
        if (ghostLengthRef.current > 0) {
          const commandNames = getAvailableCommands(activeComputerRef.current).map((c) => c.name);
          const suggestion = getSuggestion(lineBuffer.current, {
            commandHistory: historyRef.current,
            commandNames,
            fs: fsRef.current,
            cwd: cwdRef.current,
            homeDir: fsRef.current.homeDir,
          });

          if (suggestion && suggestion.length > lineBuffer.current.length) {
            clearGhost(term);
            const suffix = suggestion.slice(lineBuffer.current.length);
            term.write(suffix);
            lineBuffer.current = suggestion;
            renderGhostText(term);
          }
        }
      }
    },
    [clearGhost, renderGhostText, setHistoryIndex, fsRef, cwdRef]
  );

  return { handleChar, handleArrow };
}
