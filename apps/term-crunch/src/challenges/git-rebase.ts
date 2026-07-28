import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { gitInit, gitAdd, gitCommit, gitCheckout, createBranch, getCommitLog, hasConflictMarkers } from "@tt/core/git/repo";
import { GIT_AUTHOR } from "../lib/machine";
import { readGitState } from "../lib/gitState";
import { readTrimmed, writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

const PROJECT_DIR = "/home/player/project";
const CONFIG = `${PROJECT_DIR}/config.txt`;

// Same line edited on both branches → a guaranteed file-level conflict on rebase.
const BASE_CONFIG = "host = localhost\nport = 8080\ntimeout = 30\n";
const FEATURE_CONFIG = "host = localhost\nport = 8080\ntimeout = 60\n";
const MAIN_CONFIG = "host = localhost\nport = 8080\ntimeout = 45\n";

const MSG_FEATURE = "feature: set timeout to 60";
const MSG_MAIN = "main: set timeout to 45";

// Fixed timestamps keep seeded commit hashes deterministic.
const TS = 1_700_000_000_000;

function commit(fs: VirtualFS, message: string, ts: number): VirtualFS {
  fs = gitAdd(fs, PROJECT_DIR, PROJECT_DIR, ["config.txt"], false).fs;
  return gitCommit(fs, PROJECT_DIR, message, GIT_AUTHOR, false, false, ts).fs;
}

function checkout(fs: VirtualFS, branch: string): VirtualFS {
  const r = gitCheckout(fs, PROJECT_DIR, branch, false);
  if (r.error) throw new Error(r.error);
  return r.fs;
}

/**
 * Seed ~/project on `feature`, one commit ahead of where `main` diverged. Both branches
 * edited the same line of config.txt, so `git rebase main` conflicts. The player resolves
 * config.txt, stages it, and continues. Player starts checked out on `feature`.
 */
function setup(base: VirtualFS): VirtualFS {
  let fs = writeOrThrow(base, CONFIG, BASE_CONFIG);
  fs = gitInit(fs, PROJECT_DIR, GIT_AUTHOR).fs;
  fs = commit(fs, "Add service config", TS);

  // feature: branch off, bump timeout to 60
  fs = createBranch(fs, PROJECT_DIR, "feature").fs;
  fs = checkout(fs, "feature");
  fs = writeOrThrow(fs, CONFIG, FEATURE_CONFIG);
  fs = commit(fs, MSG_FEATURE, TS + 1000);

  // main: advances independently, bumps the same line to 45
  fs = checkout(fs, "main");
  fs = writeOrThrow(fs, CONFIG, MAIN_CONFIG);
  fs = commit(fs, MSG_MAIN, TS + 2000);

  return checkout(fs, "feature");
}

export const gitRebaseChallenge: Challenge = {
  id: "git-rebase",
  title: "Rebase onto main and resolve a conflict",
  type: "git",
  gitRepoPath: PROJECT_DIR,
  commands: ["git", "nano", "vim", "ls", "cat", "cd", "pwd"],
  brief:
    "main edited the same config.txt line as your feature commit. " +
    "Rebase feature onto main, resolve the conflict, and finish.",
  setup,
  steps: [
    {
      instruction: "Replay your feature commit on top of the latest main.",
      hint: "Rebase the current branch onto main. It will stop at a conflict for you to fix.",
      command: "git rebase main",
      isComplete: (s) => {
        const g = readGitState(s.fs, PROJECT_DIR);
        return g.rebaseInProgress && g.conflictFiles.length > 0;
      },
    },
    {
      instruction: "Edit config.txt: delete the conflict markers, keep the version you want.",
      hint: "In nano, remove the <<<<<<< / ======= / >>>>>>> lines, leave the content you want, and save.",
      command: "nano config.txt",
      isComplete: (s) => {
        const g = readGitState(s.fs, PROJECT_DIR);
        return g.rebaseInProgress && !hasConflictMarkers(readTrimmed(s.fs, CONFIG));
      },
    },
    {
      instruction: "Mark the conflict resolved.",
      hint: "Stage config.txt; staging is how a rebase learns the conflict is handled.",
      command: "git add config.txt",
      isComplete: (s) => {
        const g = readGitState(s.fs, PROJECT_DIR);
        return g.rebaseInProgress && g.conflictFiles.length === 0 && !hasConflictMarkers(readTrimmed(s.fs, CONFIG));
      },
    },
    {
      instruction: "Finish the rebase.",
      hint: "Tell the in-progress rebase to carry on from where it stopped.",
      command: "git rebase --continue",
      isComplete: (s) => {
        const g = readGitState(s.fs, PROJECT_DIR);
        if (g.rebaseInProgress || !g.clean) return false;
        const log = getCommitLog(s.fs, PROJECT_DIR).map((c) => c.message);
        // Your commit replayed on top of main's commit = truly rebased, not merged.
        return log[0] === MSG_FEATURE && log.includes(MSG_MAIN);
      },
    },
  ],
};
