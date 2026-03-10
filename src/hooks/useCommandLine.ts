import { useCallback, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { getAvailableCommands } from "../engine/commands/registry";
import { getSuggestion } from "../engine/suggestions/suggest";
import { isBackspace, isPrintable, CTRL_C } from "../engine/terminal/keyCodes";
import { ComputerId, StoryFlags } from "../state/types";

interface CommandLineDeps {
  fsRef: React.MutableRefObject<VirtualFS>;
  cwdRef: React.MutableRefObject<string>;
  activeComputerRef: React.MutableRefObject<ComputerId>;
  storyFlagsRef: React.MutableRefObject<StoryFlags>;
  writePrompt: (term: Terminal) => void;
}

export interface CommandLineResult {
  type: "submit";
  input: string;
}

export function useCommandLine(deps: CommandLineDeps) {
  const { fsRef, cwdRef, activeComputerRef, storyFlagsRef, writePrompt } = deps;
  const lineBuffer = useRef("");
  const cursorPos = useRef(0);
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

  /** Rewrite visible text from cursor to end-of-line, clear any leftover chars. */
  const rewriteFromCursor = useCallback(
    (term: Terminal, buffer: string, pos: number) => {
      const tail = buffer.slice(pos);
      term.write(tail + "\x1b[K");
      // Move cursor back to pos
      const moveBack = buffer.length - pos;
      if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
    },
    []
  );

  /** Clear the entire input area and rewrite with new content at newPos. */
  const clearAndRewriteLine = useCallback(
    (term: Terminal, oldLen: number, oldPos: number, newBuffer: string, newPos: number) => {
      // Move cursor to start of input
      if (oldPos > 0) term.write(`\x1b[${oldPos}D`);
      // Write new content and clear leftover
      term.write(newBuffer + "\x1b[K");
      // Move cursor to newPos
      const moveBack = newBuffer.length - newPos;
      if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
    },
    []
  );

  const renderGhostText = useCallback((term: Terminal) => {
    const input = lineBuffer.current;
    if (!input) return;
    if (cursorPos.current !== input.length) return;

    const commandNames = getAvailableCommands(activeComputerRef.current, storyFlagsRef.current).map((c) => c.name);
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
  }, [fsRef, cwdRef, storyFlagsRef]);

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
        cursorPos.current = 0;
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
        const pos = cursorPos.current;
        if (pos > 0) {
          const buf = lineBuffer.current;
          lineBuffer.current = buf.slice(0, pos - 1) + buf.slice(pos);
          cursorPos.current = pos - 1;
          term.write("\b");
          rewriteFromCursor(term, lineBuffer.current, pos - 1);
        }
        renderGhostText(term);
        return null;
      }

      if (code === CTRL_C) {
        clearGhost(term);
        lineBuffer.current = "";
        cursorPos.current = 0;
        term.write("^C");
        writePrompt(term);
        return null;
      }

      if (isPrintable(code)) {
        clearGhost(term);
        const pos = cursorPos.current;
        const buf = lineBuffer.current;
        lineBuffer.current = buf.slice(0, pos) + char + buf.slice(pos);
        cursorPos.current = pos + 1;
        term.write(char);
        if (pos < buf.length) {
          rewriteFromCursor(term, lineBuffer.current, pos + 1);
        }
        renderGhostText(term);
        return null;
      }

      return null;
    },
    [clearGhost, renderGhostText, rewriteFromCursor, pushHistory, setHistoryIndex, writePrompt]
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
          const historyEntry = history[newIdx];
          clearAndRewriteLine(term, lineBuffer.current.length, cursorPos.current, historyEntry, historyEntry.length);
          lineBuffer.current = historyEntry;
          cursorPos.current = historyEntry.length;
          setHistoryIndex(newIdx);
          historyIndexRef.current = newIdx;
        }
        renderGhostText(term);
      } else if (arrow === "B") {
        // Down arrow — navigate history forward
        clearGhost(term);
        const history = historyRef.current;
        const idx = historyIndexRef.current;
        const oldLen = lineBuffer.current.length;
        const oldPos = cursorPos.current;

        if (idx === -1 || idx >= history.length - 1) {
          clearAndRewriteLine(term, oldLen, oldPos, "", 0);
          lineBuffer.current = "";
          cursorPos.current = 0;
          setHistoryIndex(-1);
          historyIndexRef.current = -1;
        } else {
          const newIdx = idx + 1;
          const historyEntry = history[newIdx];
          clearAndRewriteLine(term, oldLen, oldPos, historyEntry, historyEntry.length);
          lineBuffer.current = historyEntry;
          cursorPos.current = historyEntry.length;
          setHistoryIndex(newIdx);
          historyIndexRef.current = newIdx;
        }
        renderGhostText(term);
      } else if (arrow === "C") {
        // Right arrow — move cursor or accept suggestion
        const pos = cursorPos.current;
        if (pos < lineBuffer.current.length) {
          cursorPos.current = pos + 1;
          term.write("\x1b[C");
        } else if (ghostLengthRef.current > 0) {
          const commandNames = getAvailableCommands(activeComputerRef.current, storyFlagsRef.current).map((c) => c.name);
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
            cursorPos.current = suggestion.length;
            renderGhostText(term);
          }
        }
      } else if (arrow === "D") {
        // Left arrow — move cursor left
        if (cursorPos.current > 0) {
          clearGhost(term);
          cursorPos.current -= 1;
          term.write("\x1b[D");
          renderGhostText(term);
        }
      } else if (arrow === "H") {
        // Home — move cursor to start
        if (cursorPos.current > 0) {
          clearGhost(term);
          term.write(`\x1b[${cursorPos.current}D`);
          cursorPos.current = 0;
          renderGhostText(term);
        }
      } else if (arrow === "F") {
        // End — move cursor to end
        const pos = cursorPos.current;
        const len = lineBuffer.current.length;
        if (pos < len) {
          clearGhost(term);
          term.write(`\x1b[${len - pos}C`);
          cursorPos.current = len;
          renderGhostText(term);
        }
      }
    },
    [clearGhost, clearAndRewriteLine, renderGhostText, setHistoryIndex, fsRef, cwdRef]
  );

  return { handleChar, handleArrow };
}
