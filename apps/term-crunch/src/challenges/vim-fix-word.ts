import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { readTrimmed, writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

const WORK_DIR = "/home/player/work";
const FILE = `${WORK_DIR}/app.conf`;

// One wrong value on line 1; line 2 is a decoy that must stay untouched.
const SEED = ["environment = staging", "debug = true"].join("\n");
const TARGET = ["environment = production", "debug = true"].join("\n");

function setup(base: VirtualFS): VirtualFS {
  return writeOrThrow(base, FILE, SEED + "\n");
}

export const vimFixWord: Challenge = {
  id: "vim-fix-word",
  title: "Fix the config value",
  type: "vim",
  setup,
  startCwd: WORK_DIR,
  fsWatchPath: WORK_DIR,
  commands: ["vim", "cat", "ls"],
  brief:
    "app.conf should read production, not staging. Fix it; leave the debug " +
    "line as is.",
  steps: [
    {
      instruction: "Change the environment value in app.conf from staging to production.",
      hint:
        "Move onto the start of the word (w jumps forward by word), then cw " +
        "changes the whole word and drops you into insert mode to type the new one.",
      command: "vim app.conf\nthen: move onto 'staging'  cw  production  <Esc>  :wq",
      isComplete: (s) => readTrimmed(s.fs, FILE) === TARGET,
    },
  ],
};
