import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { gitInit, gitAdd, gitCommit, gitCheckout, createBranch, gitMerge, listBranches, resolveRef } from "@tt/core/git/repo";
import { GIT_AUTHOR } from "../lib/machine";
import { writeOrThrow } from "../lib/seedFs";
import type { Challenge } from "./types";

const PROJECT_DIR = "/home/player/project";
const MERGED = "feature/login";
const UNMERGED = "experiment";
const REMOTE_URL = "git@github.com:acme/storefront.git";

const README = "# storefront\n\nCheckout and account flows.\n";
const LOGIN = "export function login(user, pass) {\n  return session.start(user, pass);\n}\n";
// Lands on main *after* feature/login branched off, so the merge below is a real
// merge commit rather than a fast-forward (a FF would leave the branch tip equal
// to HEAD, which is a weaker demonstration of what `-d` accepts).
const CART = "export function cart() {\n  return items;\n}\n";
const SPIKE = "// spike: replace sessions with tokens — never finished\n";

// Fixed timestamps keep seeded commit hashes deterministic.
const TS = 1_700_000_000_000;

function commit(fs: VirtualFS, path: string, content: string, message: string, ts: number): VirtualFS {
  fs = writeOrThrow(fs, `${PROJECT_DIR}/${path}`, content);
  fs = gitAdd(fs, PROJECT_DIR, PROJECT_DIR, [path], false).fs;
  return gitCommit(fs, PROJECT_DIR, message, GIT_AUTHOR, false, false, ts).fs;
}

function checkout(fs: VirtualFS, branch: string): VirtualFS {
  const r = gitCheckout(fs, PROJECT_DIR, branch, false);
  if (r.error) throw new Error(r.error);
  return r.fs;
}

function branchFrom(fs: VirtualFS, name: string): VirtualFS {
  const r = createBranch(fs, PROJECT_DIR, name);
  if (r.error) throw new Error(r.error);
  return checkout(r.fs, name);
}

/**
 * Seed ~/project on `main` with two leftover branches that `git branch -d` treats
 * differently:
 *
 * - `feature/login` is merged into main (via a real `gitMerge`, so its tip is an
 *   ancestor of HEAD rather than equal to it) → `-d` deletes it. It also has a
 *   seeded refs/remotes/origin/feature/login plus upstream config, so the remote
 *   half of the cleanup (`git push origin --delete`) has something to delete.
 * - `experiment` carries one commit that never landed on main → `-d` refuses and
 *   teaches the `-D` escalation.
 *
 * Player starts on `main` (neither branch is checked out, so both are deletable).
 */
function setup(base: VirtualFS): VirtualFS {
  let fs = gitInit(writeOrThrow(base, `${PROJECT_DIR}/README.md`, README), PROJECT_DIR, GIT_AUTHOR).fs;
  fs = commit(fs, "README.md", README, "Initial commit", TS);

  fs = branchFrom(fs, MERGED);
  fs = commit(fs, "src/login.js", LOGIN, "Add login flow", TS + 1000);

  // main moves on independently, then absorbs feature/login as a merge commit.
  fs = checkout(fs, "main");
  fs = commit(fs, "src/cart.js", CART, "Add cart", TS + 2000);
  const merge = gitMerge(fs, PROJECT_DIR, MERGED, GIT_AUTHOR, TS + 3000);
  if (merge.error || merge.conflict) throw new Error(merge.error ?? "git-branch-delete: merge conflicted");
  fs = merge.fs;

  // The abandoned branch: one commit that is NOT reachable from main.
  fs = branchFrom(fs, UNMERGED);
  fs = commit(fs, "src/spike.js", SPIKE, "Spike token auth", TS + 4000);
  fs = checkout(fs, "main");

  // Remote-tracking ref for the merged branch (nested dir for the slash in the
  // name), plus the remote URL `git push --delete` needs to resolve a destination.
  const mergedHash = resolveRef(fs, PROJECT_DIR, MERGED);
  if (!mergedHash) throw new Error("git-branch-delete: missing feature/login ref");
  fs = writeOrThrow(fs, `${PROJECT_DIR}/.git/refs/remotes/origin/${MERGED}`, mergedHash);
  fs = writeOrThrow(
    fs,
    `${PROJECT_DIR}/.git/config`,
    `[remote "origin"]\n  url = ${REMOTE_URL}\n  fetch = +refs/heads/*:refs/remotes/origin/*\n[branch "${MERGED}"]\n  remote = origin\n  merge = refs/heads/${MERGED}\n`,
  );
  return fs;
}

const localBranches = (fs: VirtualFS): string[] => listBranches(fs, PROJECT_DIR).branches;
// listBranches prefixes remote-tracking refs with "remotes/", the same spelling
// `git branch -a` prints.
const remoteBranches = (fs: VirtualFS): string[] => listBranches(fs, PROJECT_DIR, "remotes").remotes;

export const gitBranchDelete: Challenge = {
  id: "git-branch-delete",
  title: "Clean up merged and abandoned branches",
  type: "git",
  gitRepoPath: PROJECT_DIR,
  commands: ["git", "ls", "cat", "cd", "pwd"],
  brief:
    "Two stale branches linger on ~/project: feature/login (merged, and still on origin) " +
    "and experiment (abandoned). Survey them with `git branch -a`, then delete all three refs.",
  setup,
  steps: [
    {
      instruction: "Delete the local branch that has already been merged into main.",
      hint: "The safe delete flag only removes a branch whose commits main already contains.",
      command: "git branch -d feature/login",
      isComplete: (s) => !localBranches(s.fs).includes(MERGED),
    },
    {
      instruction: "Delete the abandoned branch whose commit never landed on main.",
      hint: "The safe delete refuses here — its commit is unreachable from main. Force it with the uppercase flag.",
      command: "git branch -D experiment",
      isComplete: (s) => !localBranches(s.fs).includes(UNMERGED),
    },
    {
      instruction: "Delete the merged branch from origin too.",
      hint: "Deleting a remote branch is a push of nothing: `git push` with the delete flag names the remote and the branch.",
      command: "git push origin --delete feature/login",
      isComplete: (s) => !remoteBranches(s.fs).includes(`remotes/origin/${MERGED}`),
    },
  ],
};
