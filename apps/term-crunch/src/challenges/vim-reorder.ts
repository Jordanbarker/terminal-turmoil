import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { readLines, writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

const WORK_DIR = "/home/player/work";
const FILE = `${WORK_DIR}/recipe.txt`;

// Step 3 is stranded at the top; the target order is 1, 2, 3.
const STEP1 = "Step 1: chop the vegetables";
const STEP2 = "Step 2: simmer for 20 minutes";
const STEP3 = "Step 3: serve";
const SEED = [STEP3, STEP1, STEP2].join("\n");
const TARGET = [STEP1, STEP2, STEP3];

function setup(base: VirtualFS): VirtualFS {
  return writeOrThrow(base, FILE, SEED + "\n");
}

export const vimReorder: Challenge = {
  id: "vim-reorder",
  title: "Reorder the steps",
  type: "vim",
  setup,
  startCwd: WORK_DIR,
  fsWatchPath: WORK_DIR,
  commands: ["vim", "cat", "ls"],
  brief:
    "Step 3 is stuck at the top of recipe.txt. Put the steps back into " +
    "1, 2, 3 order.",
  steps: [
    {
      instruction: "Reorder recipe.txt so the lines read Step 1, then Step 2, then Step 3.",
      hint:
        "Press V on the misplaced line (visual-line mode), cut it with d, " +
        "jump to the bottom with G, then p pastes it below the cursor.",
      command: "vim recipe.txt\nthen: on the Step 3 line  V  d  G  p  :wq",
      // Outcome-only: dd/p reaches the same result, so the predicate can't force
      // visual mode. The hint/command teach it; this just checks the final order.
      isComplete: (s) => {
        const l = readLines(s.fs, FILE);
        return l.length === TARGET.length && l.every((line, i) => line === TARGET[i]);
      },
    },
  ],
};
