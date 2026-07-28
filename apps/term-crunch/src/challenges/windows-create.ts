import { makeWindow, type WindowState } from "@tt/core/terminal/paneTypes";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";
import type { Challenge } from "./types";

/**
 * Target = three windows, one of them renamed. Built with the same pure
 * `makeWindow` helper the player drives — the monotonic id counters keep the
 * ids non-colliding, and the strip schematic shows count + labels, not ids.
 */
function buildTargetWindows(): WindowState[] {
  const wins: WindowState[] = [];
  for (let i = 0; i < 3; i++) {
    const win = makeWindow(CRUNCH_MACHINE, HOME_DIR);
    wins.push(i === 1 ? { ...win, name: "logs" } : win);
  }
  return wins;
}

const targetWindows = buildTargetWindows();

export const windowsCreate: Challenge = {
  id: "windows-create",
  title: "Open more windows",
  type: "tmux",
  targetWindows,
  // Pure keyboard-chord challenge — no shell commands needed.
  commands: [],
  setup: (base) => base,
  steps: [
    {
      instruction: "Open a second window.",
      hint: "Windows are the layer above panes; a prefix chord creates one, and the status bar grows a tab.",
      command: "prefix c",
      isComplete: (s) => s.windows.length >= 2,
    },
    {
      instruction: "Open a third window.",
      hint: "Same chord as before.",
      command: "prefix c",
      isComplete: (s) => s.windows.length >= 3,
    },
    {
      instruction: "Give one of the windows a name.",
      hint:
        "A prefix chord opens a rename prompt for the current window: type a name, press Enter. " +
        "Switch windows with prefix n / p or a number key.",
      command: "prefix r",
      isComplete: (s) => s.windows.some((w) => !!w.name),
    },
  ],
};
