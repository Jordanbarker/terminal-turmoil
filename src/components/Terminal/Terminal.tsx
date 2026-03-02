"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminal } from "../../hooks/useTerminal";
import { useGameStore } from "../../state/gameStore";
import { motd, homeWelcome, UNLOCK_BOX } from "../../lib/ascii";

export default function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { handleInput, getPrompt, startSession } = useTerminal();
  const gamePhase = useGameStore((s) => s.gamePhase);
  const activeComputer = useGameStore((s) => s.activeComputer);

  // Store callbacks in refs to avoid re-attaching the listener
  const handleInputRef = useRef(handleInput);
  const startSessionRef = useRef(startSession);
  const gamePhaseRef = useRef(gamePhase);
  const activeComputerRef = useRef(activeComputer);
  const initializedAsPlaying = useRef(false);
  const shownUnlockRef = useRef(false);

  useEffect(() => {
    handleInputRef.current = handleInput;
    startSessionRef.current = startSession;
    gamePhaseRef.current = gamePhase;
    activeComputerRef.current = activeComputer;
  });

  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#0a0e14",
        foreground: "#b3b1ad",
        cursor: "#e6b450",
        cursorAccent: "#0a0e14",
        selectionBackground: "#253340",
        black: "#01060e",
        red: "#ea6c73",
        green: "#91b362",
        yellow: "#f9af4f",
        blue: "#53bdfa",
        magenta: "#fae994",
        cyan: "#90e1c6",
        white: "#c7c7c7",
        brightBlack: "#686868",
        brightRed: "#f07178",
        brightGreen: "#c2d94c",
        brightYellow: "#ffb454",
        brightBlue: "#59c2ff",
        brightMagenta: "#ffee99",
        brightCyan: "#95e6cb",
        brightWhite: "#ffffff",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    let introTimer: ReturnType<typeof setTimeout> | undefined;

    if (gamePhaseRef.current === "playing") {
      initializedAsPlaying.current = true;
      const splash = activeComputerRef.current === "home" ? homeWelcome : motd;
      splash.forEach((line) => term.writeln(line));

      // Auto-open nano on first game start (home PC only)
      const store = useGameStore.getState();
      if (!store.hasSeenIntro && activeComputerRef.current === "home") {
        const filePath = `${store.fs.homeDir}/terminal_notes.txt`;
        const readResult = store.fs.readFile(filePath);
        const content = readResult.content ?? "";
        startSessionRef.current(term, {
          type: "editor",
          info: { filePath, content, readOnly: false, isNewFile: false },
        });
        // Defer flag so React 18 strict mode remount still sees hasSeenIntro=false
        introTimer = setTimeout(() => useGameStore.getState().setHasSeenIntro(), 0);
      } else {
        term.write(getPrompt());
      }
    }

    term.onData((data) => {
      const phase = gamePhaseRef.current;
      if (phase === "playing") {
        handleInputRef.current(term, data);
      }
      // Ignore input during "booting" and "transitioning"
    });

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);

    term.focus();

    return () => {
      if (introTimer) clearTimeout(introTimer);
      window.removeEventListener("resize", handleResize);
      term.dispose();
      termRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle phase transitions
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    if (gamePhase === "playing" && !initializedAsPlaying.current) {
      // Show unlock message when transitioning to NexaCorp
      if (activeComputer === "nexacorp" && !shownUnlockRef.current) {
        shownUnlockRef.current = true;
        UNLOCK_BOX.forEach((line) => term.writeln(line));
        useGameStore.getState().addToast("New commands unlocked! Type 'help' to see all.");
      }
      term.write(getPrompt());
    }

    // Clear the flag after first render so future transitions work
    initializedAsPlaying.current = false;
  }, [gamePhase, getPrompt, activeComputer]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ padding: "8px" }}
    />
  );
}
