import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import { mkdirOrThrow, writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

const MESSY_DIR = "/home/player/downloads";

// Only ONE file needs to move — the .md/.txt files are decoys so the player
// has to pick out the log file from the tree readout.
const SEED_FILES = ["notes.md", "todo.txt", "build.log"];
const LOG_FILE = "build.log";
const LOGS_DIR = `${MESSY_DIR}/logs`;

/**
 * Seed the files flat at the top of ~/downloads. The logs subdir is
 * deliberately NOT created — making it is step 1.
 */
function setup(base: VirtualFS): VirtualFS {
  let fs = mkdirOrThrow(base, MESSY_DIR);
  for (const name of SEED_FILES) {
    fs = writeOrThrow(fs, `${MESSY_DIR}/${name}`, `# ${name}\n`);
  }
  return fs;
}

export const mvOrganize: Challenge = {
  id: "mv-organize",
  title: "Sort the downloads",
  type: "fs",
  fsWatchPath: MESSY_DIR,
  // Steps use bare filenames, so start the player in ~/downloads.
  startCwd: MESSY_DIR,
  commands: ["mkdir", "mv", "ls", "tree", "cd", "pwd"],
  brief:
    "A stray log file is loose in ~/downloads. Make a logs folder and move it in.",
  setup,
  steps: [
    {
      instruction: "Create a logs subfolder in ~/downloads.",
      hint: "List the directory, then create a directory named logs.",
      command: "mkdir logs",
      isComplete: (s) => {
        const node = s.fs.getNode(LOGS_DIR);
        return node !== null && isDirectory(node);
      },
    },
    {
      instruction: "Move the log file into logs/.",
      hint:
        "mv takes a source and a destination; a directory destination means " +
        "the file lands inside it.",
      command: `mv ${LOG_FILE} logs/`,
      // Copy-proof: the file must exist at its sorted path AND be gone from the
      // flat top level.
      isComplete: (s) =>
        s.fs.getNode(`${LOGS_DIR}/${LOG_FILE}`) !== null &&
        s.fs.getNode(`${MESSY_DIR}/${LOG_FILE}`) === null,
    },
  ],
};
