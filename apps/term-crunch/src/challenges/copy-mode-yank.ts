import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import { writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

const LOG_PATH = "/home/player/passphrase.log";
const TOKEN = "moonlit-cipher-7f3c91a0e5";
const TARGET_DIR = `/home/player/${TOKEN}`;
const LOG_BODY = `
FREEZING
FREEZING
FREEZING
FREEZING
FREEZING

COLDER
COLDER
COLDER
COLDER
COLDER

COLD
COLD
COLD
COLD
COLD

WARM
WARM
WARM
WARM
WARM

WARMER
WARMER
WARMER
WARMER
WARMER

HOT 
HOT 
HOT 
HOT 
HOT 

HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 

BURNING
BURNING
BURNING
BURNING
BURNING

--------

${TOKEN}

--------

BURNING
BURNING
BURNING
BURNING
BURNING
BURNING

HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 

HOT
HOT
HOT
HOT
HOT

WARMER
WARMER
WARMER
WARMER
WARMER

WARM
WARM
WARM
WARM
WARM

COLD
COLD
COLD
COLD
COLD

COLDER
COLDER
COLDER
COLDER
COLDER

FREEZING
FREEZING
FREEZING
FREEZING
FREEZING
`;

function setup(base: VirtualFS): VirtualFS {
  return writeOrThrow(base, LOG_PATH, LOG_BODY);
}

export const copyModeYank: Challenge = {
  id: "copy-mode-yank",
  title: "Copy Mode",
  type: "tmux",
  fsWatchPath: "/home/player",
  // Copy mode is entered with the keyboard (<prefix> [), independent of this
  // allowlist; these are the commands the player types to read the log and
  // spend the recovered token.
  commands: ["cat", "mkdir", "ls", "cd", "pwd", "less"],
  brief:
    "A passphrase is buried inside passphrase.log. Print the file, copy the " +
    "passphrase from the scrollback, and create a directory named exactly after it.",
  setup,
  steps: [
    {
      // Reading the log and the copy-mode yank are read-only — not observable in
      // the fs snapshot — so the only completable state is the resulting mkdir.
      // The brief states the whole objective (no per-step instruction); copy
      // mode is guided entirely through the hint below.
      hint:
        "`cat passphrase.log` prints it; the passphrase scrolls off the top.\n" +
        "Enter copy mode with your prefix then `[`.\n" +
        "• Move: hjkl or arrows · g / G top / bottom · Ctrl+U / Ctrl+D half-page.\n" +
        "• Select: `v` starts a selection, `$` extends to end of line.\n" +
        "• Yank: `y` copies the selection to the system clipboard and exits copy mode.\n" +
        "Then type `mkdir ` and paste with Cmd+V (Ctrl+V elsewhere) — there is no tmux paste buffer.",
      command: `mkdir ${TOKEN}`,
      // Passes exactly when a DIRECTORY named after the token exists (a file of
      // that name is not the same move).
      isComplete: (s) => {
        const node = s.fs.getNode(TARGET_DIR);
        return node !== null && isDirectory(node);
      },
    },
  ],
};
