/** A single commit object stored in .git/objects/<hash>.json */
export interface GitCommit {
  hash: string;
  parent: string | null;
  /**
   * Second parent, present only on merge commits. Deliberately optional so every
   * existing `.parent` reader, remote-repo literal, and save file stays valid;
   * only `parentsOf`/`ancestorSet` and `^2` look at it. All other walks
   * (`git log`, `~N`, pull's ff check, rebase) are first-parent by design.
   */
  parent2?: string;
  message: string;
  author: string;
  timestamp: number;
  /** Full tree snapshot: relative path → file content */
  tree: Record<string, string>;
}

/** Staging area stored in .git/index.json */
export interface GitIndex {
  staged: Record<string, string>;
  deleted: string[];
}

/** Stash entry stored in .git/stash.json */
export interface GitStashEntry {
  tree: Record<string, string>;
  message: string;
  /**
   * HEAD content of each stashed path at save time (path absent = the file did not
   * exist in HEAD). Used by apply/pop to detect that the working tree has moved on
   * since the stash was taken. Optional so entries persisted before this field
   * existed still parse; a missing base simply skips the conflict check.
   */
  base?: Record<string, string>;
}

/**
 * In-progress rebase, persisted to .git/rebase-state.json (sibling of index.json).
 * Present only while a rebase is running; cleared on finalize/abort. The file is the
 * source of truth — HEAD stays on `originalBranch` for the whole rebase (no detach).
 */
export interface GitRebaseState {
  onto: string; // commit hash currently being built on; advances as commits replay
  originalBranch: string; // branch being rebased (moved to the final tip at the end)
  originalHead: string; // that branch's tip before rebase started (for --abort)
  todo: string[]; // ORIGINAL commit hashes still to replay, oldest first ([0] = current when conflicted)
  current: string | null; // original hash stopped on a conflict (null when not conflicted)
  conflictFiles: string[]; // working-tree files carrying conflict markers
}

/**
 * In-progress merge, persisted to .git/merge-state.json (real git's MERGE_HEAD).
 * Written only when a merge stops on conflicts; cleared by the concluding commit,
 * `git merge --continue`, or `git merge --abort`. HEAD never moves while it exists.
 */
export interface GitMergeState {
  targetHash: string; // commit being merged in — becomes the merge commit's parent2
  targetLabel: string; // the revision the player typed (conflict-marker label + story event)
  message: string; // prepared merge message, used by `git merge --continue`
  conflictFiles: string[]; // working-tree files carrying conflict markers
}

/** Parsed repo state (read from .git/ files) */
export interface GitRepo {
  root: string;
  head: string; // e.g. "ref: refs/heads/main" or a raw hash
  currentBranch: string | null; // null if detached HEAD
  index: GitIndex;
  stash: GitStashEntry[];
  remoteUrl: string | null; // from .git/config
  upstream: { remote: string; branch: string } | null;
}

/** Definition of a cloneable remote repository */
export interface RemoteRepoDef {
  /** Files to populate the working tree */
  files: Record<string, string>;
  /** Pre-built commit history (oldest first) */
  commits: GitCommit[];
  /** Default branch name */
  defaultBranch: string;
  /** Optional: returns new commits for git pull based on story state */
  getUpdates?: (storyFlags: Record<string, string | boolean>, localHead: string | null) => GitCommit[];
}
