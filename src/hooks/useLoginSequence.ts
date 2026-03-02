import { useCallback, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { colorize, ansi } from "../lib/ansi";
import { nexacorpLogo, getBootSequence, motd } from "../lib/ascii";
import { isBackspace, isPrintable, CTRL_C } from "../engine/terminal/keyCodes";
import { PLAYER } from "../state/types";
import { BOOT_LINE_INTERVAL_MS } from "../lib/timing";

type LoginStep = "username" | "password";

export function useLoginSequence() {
  const lineBuffer = useRef("");
  const loginStep = useRef<LoginStep>("username");
  const setGamePhase = useGameStore((s) => s.setGamePhase);
  const setUsername = useGameStore((s) => s.setUsername);
  const capturedUsername = useRef("");

  const showLogo = useCallback((term: Terminal) => {
    loginStep.current = "username";
    lineBuffer.current = "";
    nexacorpLogo.forEach((line) => term.writeln(line));
    term.write(`${colorize("login:", ansi.brightWhite)} `);
  }, []);

  const runBootSequence = useCallback(
    (term: Terminal) => {
      const username = capturedUsername.current || PLAYER.username;
      setUsername(username);
      setGamePhase("booting");
      term.write("\r\n");

      const lines = getBootSequence(username);
      let i = 0;
      const interval = setInterval(() => {
        if (i < lines.length) {
          term.writeln(lines[i]);
          i++;
        } else {
          clearInterval(interval);
          term.writeln("");
          motd.forEach((line) => term.writeln(line));
          setGamePhase("playing");
        }
      }, BOOT_LINE_INTERVAL_MS);
    },
    [setGamePhase, setUsername]
  );

  const handleLoginInput = useCallback(
    (term: Terminal, data: string) => {
      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        const code = char.charCodeAt(0);

        if (char === "\r" || char === "\n") {
          if (loginStep.current === "username") {
            capturedUsername.current = lineBuffer.current.trim() || PLAYER.username;
          }
          lineBuffer.current = "";

          if (loginStep.current === "username") {
            loginStep.current = "password";
            term.write(`\r\n${colorize("password:", ansi.brightWhite)} `);
          } else {
            term.write("\r\n");
            runBootSequence(term);
          }
        } else if (isBackspace(code)) {
          if (lineBuffer.current.length > 0) {
            lineBuffer.current = lineBuffer.current.slice(0, -1);
            term.write("\b \b");
          }
        } else if (code === CTRL_C) {
          lineBuffer.current = "";
          loginStep.current = "username";
          term.write(`\r\n${colorize("login:", ansi.brightWhite)} `);
        } else if (isPrintable(code)) {
          lineBuffer.current += char;
          if (loginStep.current === "username") {
            term.write(char);
          } else {
            term.write("*");
          }
        }
      }
    },
    [runBootSequence]
  );

  return { showLogo, handleLoginInput };
}
