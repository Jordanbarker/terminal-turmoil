import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { readTrimmed, writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

// All vim challenges share one scratch dir so the player just runs `vim <file>`
// (startCwd drops them here) and the panel tree readout stays focused.
const WORK_DIR = "/home/player/work";
const FILE = `${WORK_DIR}/notes.txt`;
const TARGET = "Hello, Vim!";

/**
 * Seed an EMPTY notes.txt. The whole challenge is "type one line and save", so
 * there's nothing to seed but the file itself (an empty buffer opens fine in vim).
 */
function setup(base: VirtualFS): VirtualFS {
  return writeOrThrow(base, FILE, "");
}

export const vimFirstEdit: Challenge = {
  id: "vim-first-edit",
  title: "Your first vim edit",
  type: "vim",
  setup,
  startCwd: WORK_DIR,
  fsWatchPath: WORK_DIR,
  commands: ["vim", "cat", "ls"],
  brief:
    "vim opens in NORMAL mode, where letters are commands, not text. " +
    "Switch to INSERT mode to type; save with an ex command from normal mode.",
  steps: [
    {
      // The predicate only sees the SAVED file (keystrokes inside the editor
      // are invisible, and completion fires on editor exit), so state the goal
      // as the file's final contents, not the keys that get there.
      instruction: "Make notes.txt contain exactly the line: Hello, Vim!",
      hint:
        "i enters insert mode; type the line, then Esc returns to normal mode. " +
        "A : command writes the file and quits.",
      command: "vim notes.txt\nthen: i  Hello, Vim!  <Esc>  :wq",
      isComplete: (s) => readTrimmed(s.fs, FILE) === TARGET,
    },
  ],
};
