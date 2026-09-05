import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

const SITE_DIR = "/home/player/site";
const PAGE_PATH = `${SITE_DIR}/index.html`;

const PAGE_BODY = `<!doctype html>
<h1>Welcome</h1>
`;

/**
 * Seed ~/site/index.html at rw------- (600): only the owner can read it, so the
 * web server (which runs as a different user) gets 403. The single step is to
 * grant read to other users (chmod o+r / +r / 644).
 *
 * Why this framing: VirtualFS has no owner concept and gates reads on the
 * "other" bit (permissions[6]), so the honest lesson that matches the engine is
 * "let another user read this", not "you can't read your own 600 file" (an
 * owner can, and 600 is the right mode for secrets). The brief therefore never
 * claims `cat` fails for the player, and `cat` isn't in the allowlist.
 */
function setup(base: VirtualFS): VirtualFS {
  const fs = writeOrThrow(base, PAGE_PATH, PAGE_BODY);
  const lock = fs.setPermissions(PAGE_PATH, "rw-------");
  if (!lock.fs) throw new Error(lock.error ?? `chmod-perms: lock ${PAGE_PATH} failed`);
  return lock.fs;
}

export const chmodPerms: Challenge = {
  id: "chmod-perms",
  title: "Permissions",
  type: "fs",
  fsWatchPath: SITE_DIR,
  // Brief names index.html bare, so start the player in the site dir.
  startCwd: SITE_DIR,
  commands: ["chmod", "ls", "cd", "pwd"],
  brief:
    "nginx runs as another user and gets 403 on index.html, which is rw------- (600). " +
    "Grant read access to other users; check with ls -l.",
  setup,
  steps: [
    {
      instruction: "Turn on the read bit for other users on index.html.",
      hint:
        "chmod sets who can read (r), write (w), execute (x) a file.\n" +
        "• Symbolic: a target (u owner / g group / o others / a all), then +/- a bit.\n" +
        "• Octal: three digits = owner/group/other, each summing r=4 w=2 x=1 " +
        "(rw-r--r-- is 644; the current rw------- is 600).\n" +
        "The owner can already read it: the missing bit is on the others digit.",
      command: "chmod o+r index.html",
      // Readable by others exactly when permissions[6] is "r" — the same bit the
      // engine's readFile() checks. Lenient: accepts o+r, +r, a+r, 644, 604, 444
      // (but not u+r, which changes nothing).
      isComplete: (s) => s.fs.getNode(PAGE_PATH)?.permissions[6] === "r",
    },
  ],
};
