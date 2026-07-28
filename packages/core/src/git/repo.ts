import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory, isFile } from "@tt/core/filesystem/types";
import { normalizePath } from "@tt/core/lib/pathUtils";
import { computeDiff } from "@tt/core/lib/diff";
import { GitCommit, GitIndex, GitRepo, GitStashEntry, GitRebaseState, GitMergeState } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

/** Walk up from cwd to find a directory containing .git/ */
export function findRepoRoot(fs: VirtualFS, cwd: string): string | null {
  let dir = normalizePath(cwd);
  while (true) {
    const gitDir = dir === "/" ? "/.git" : `${dir}/.git`;
    const node = fs.getNode(gitDir);
    if (node && isDirectory(node)) return dir;
    if (dir === "/") return null;
    const lastSlash = dir.lastIndexOf("/");
    dir = lastSlash === 0 ? "/" : dir.slice(0, lastSlash);
  }
}

/** 7-char hex hash from content string */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Second pass for more entropy
  let h2 = 0x6c62272e;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  return ((h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).slice(0, 7);
}

/**
 * Split file content into diffable lines. Empty content is zero lines (not one
 * empty one), and a single trailing newline is the line terminator rather than
 * an extra blank line — both so line counts match real git's.
 */
export function contentLines(content: string): string[] {
  if (content === "") return [];
  return content.replace(/\n$/, "").split("\n");
}

/** Exact insertion/deletion counts between two file contents (real-git `--stat` math). */
export function countLineChanges(oldContent: string, newContent: string): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;
  for (const entry of computeDiff(contentLines(oldContent), contentLines(newContent))) {
    if (entry.type === "added") insertions++;
    else if (entry.type === "removed") deletions++;
  }
  return { insertions, deletions };
}

/** Recursively collect all files under dirPath, skipping .git/, returning paths relative to relativeTo */
export function collectFiles(fs: VirtualFS, dirPath: string, relativeTo: string): Record<string, string> {
  const result: Record<string, string> = {};
  const { entries } = fs.listDirectory(dirPath);
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const childPath = dirPath === "/" ? `/${entry.name}` : `${dirPath}/${entry.name}`;
    if (isFile(entry)) {
      const rel = childPath.startsWith(relativeTo + "/")
        ? childPath.slice(relativeTo.length + 1)
        : childPath;
      result[rel] = entry.content;
    } else if (isDirectory(entry)) {
      Object.assign(result, collectFiles(fs, childPath, relativeTo));
    }
  }
  return result;
}

// ── Read/Write Repo State ────────────────────────────────────────────

export function readIndex(fs: VirtualFS, root: string): GitIndex {
  const indexPath = `${root}/.git/index.json`;
  const file = fs.readFile(indexPath);
  if (file.content) {
    try { return JSON.parse(file.content); } catch { /* fall through */ }
  }
  return { staged: {}, deleted: [] };
}

export function readStash(fs: VirtualFS, root: string): GitStashEntry[] {
  const stashPath = `${root}/.git/stash.json`;
  const file = fs.readFile(stashPath);
  if (file.content) {
    try { return JSON.parse(file.content); } catch { /* fall through */ }
  }
  return [];
}

export function readRebaseState(fs: VirtualFS, root: string): GitRebaseState | null {
  const file = fs.readFile(`${root}/.git/rebase-state.json`);
  if (file.content) {
    try { return JSON.parse(file.content); } catch { /* fall through */ }
  }
  return null;
}

export function readMergeState(fs: VirtualFS, root: string): GitMergeState | null {
  const file = fs.readFile(`${root}/.git/merge-state.json`);
  if (file.content) {
    try { return JSON.parse(file.content); } catch { /* fall through */ }
  }
  return null;
}

export function readHead(fs: VirtualFS, root: string): string {
  const headFile = fs.readFile(`${root}/.git/HEAD`);
  return headFile.content?.trim() ?? "ref: refs/heads/main";
}

export function getCurrentBranch(head: string): string | null {
  if (head.startsWith("ref: refs/heads/")) return head.slice("ref: refs/heads/".length);
  return null;
}

export function resolveHead(fs: VirtualFS, root: string): string | null {
  const head = readHead(fs, root);
  const branch = getCurrentBranch(head);
  if (branch) {
    const refFile = fs.readFile(`${root}/.git/refs/heads/${branch}`);
    return refFile.content?.trim() ?? null;
  }
  return head; // detached HEAD is a raw hash
}

export function readCommit(fs: VirtualFS, root: string, hash: string): GitCommit | null {
  const file = fs.readFile(`${root}/.git/objects/${hash}.json`);
  if (!file.content) return null;
  try { return JSON.parse(file.content); } catch { return null; }
}

export function readRemoteUrl(fs: VirtualFS, root: string): string | null {
  const configFile = fs.readFile(`${root}/.git/config`);
  if (!configFile.content) return null;
  const match = configFile.content.match(/url\s*=\s*(.+)/);
  return match ? match[1].trim() : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Real git stores upstream per-branch as:
//   [branch "<name>"]
//     remote = origin
//     merge = refs/heads/<name>
// We match the section for `branch` and pull its remote/merge keys.
export function readUpstream(fs: VirtualFS, root: string, branch: string | null): { remote: string; branch: string } | null {
  if (!branch) return null;
  const configFile = fs.readFile(`${root}/.git/config`);
  if (!configFile.content) return null;
  const sectionRe = new RegExp(`\\[branch "${escapeRegex(branch)}"\\]([\\s\\S]*?)(?=\\n\\[|$)`);
  const match = configFile.content.match(sectionRe);
  if (!match) return null;
  const body = match[1];
  const remoteMatch = body.match(/^\s*remote\s*=\s*(.+)$/m);
  const mergeMatch = body.match(/^\s*merge\s*=\s*(.+)$/m);
  if (!remoteMatch || !mergeMatch) return null;
  const mergeRef = mergeMatch[1].trim().replace(/^refs\/heads\//, "");
  return { remote: remoteMatch[1].trim(), branch: mergeRef };
}

export function readRepo(fs: VirtualFS, root: string): GitRepo {
  const head = readHead(fs, root);
  return {
    root,
    head,
    currentBranch: getCurrentBranch(head),
    index: readIndex(fs, root),
    stash: readStash(fs, root),
    remoteUrl: readRemoteUrl(fs, root),
    upstream: readUpstream(fs, root, getCurrentBranch(head)),
  };
}

/** Write a file to the FS, chaining immutably. Returns updated fs or throws. */
function writeOrFail(fs: VirtualFS, path: string, content: string): VirtualFS {
  const result = fs.writeFile(path, content);
  if (result.error) throw new Error(result.error);
  return result.fs!;
}

function mkdirOrFail(fs: VirtualFS, path: string): VirtualFS {
  if (fs.getNode(path)) return fs; // already exists
  const result = fs.makeDirectory(path);
  if (result.error) throw new Error(result.error);
  return result.fs!;
}

function removeOrFail(fs: VirtualFS, path: string): VirtualFS {
  const result = fs.removeNode(path);
  if (result.error) throw new Error(result.error);
  return result.fs!;
}

// Write a ref file under .git/refs/, creating any missing parent directories
// (refs can be nested, e.g. refs/heads/feature/x).
function writeRefOrFail(fs: VirtualFS, path: string, content: string): VirtualFS {
  const parts = path.split("/");
  for (let i = 1; i < parts.length - 1; i++) {
    fs = mkdirOrFail(fs, parts.slice(0, i + 1).join("/"));
  }
  return writeOrFail(fs, path, content);
}

// FS-safety subset of git check-ref-format: reject names that would corrupt
// the on-disk layout. Real git's full ruleset is stricter; we only enforce
// what's needed to keep the virtual FS consistent.
export function isValidRefName(name: string): boolean {
  if (!name) return false;
  const segments = name.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  return true;
}

// ── git init ─────────────────────────────────────────────────────────

export function gitInit(fs: VirtualFS, cwd: string, _author: string): { fs: VirtualFS; output: string; alreadyExisted: boolean } {
  const gitDir = `${cwd}/.git`;
  const existed = !!fs.getNode(gitDir);

  fs = mkdirOrFail(fs, gitDir);
  fs = mkdirOrFail(fs, `${gitDir}/refs`);
  fs = mkdirOrFail(fs, `${gitDir}/refs/heads`);
  fs = mkdirOrFail(fs, `${gitDir}/refs/remotes`);
  fs = mkdirOrFail(fs, `${gitDir}/refs/remotes/origin`);
  fs = mkdirOrFail(fs, `${gitDir}/objects`);
  fs = writeOrFail(fs, `${gitDir}/HEAD`, "ref: refs/heads/main");
  fs = writeOrFail(fs, `${gitDir}/index.json`, JSON.stringify({ staged: {}, deleted: [] }));

  if (existed) {
    return { fs, output: `Reinitialized existing Git repository in ${cwd}/.git/`, alreadyExisted: true };
  }
  return { fs, output: `Initialized empty Git repository in ${cwd}/.git/`, alreadyExisted: false };
}

// ── git add ──────────────────────────────────────────────────────────

export function gitAdd(fs: VirtualFS, root: string, cwd: string, paths: string[], allFlag: boolean): { fs: VirtualFS; output: string; error?: string } {
  const index = readIndex(fs, root);
  const headHash = resolveHead(fs, root);
  const headTree: Record<string, string> = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};

  // Pathspecs and `.` resolve relative to the working directory, not the repo
  // root: `cd subdir && git add file` stages subdir/file. Index keys stay
  // root-relative throughout.
  const toRel = (abs: string): string => (abs.startsWith(root + "/") ? abs.slice(root.length + 1) : abs);
  // Root-relative prefix (trailing "/") of a staged directory subtree; "" = whole repo.
  const relPrefix = (dir: string): string => (dir === root ? "" : toRel(dir) + "/");

  let filesToStage: Record<string, string>;
  // Subtree prefixes whose HEAD entries should be checked for on-disk deletion.
  const deletionScopes: string[] = [];

  if (allFlag || (paths.length === 1 && paths[0] === ".")) {
    // `-A` stages the whole repo; `.` stages the current directory and below.
    const scopeDir = allFlag ? root : normalizePath(cwd);
    filesToStage = collectFiles(fs, scopeDir, root);
    deletionScopes.push(relPrefix(scopeDir));
  } else {
    filesToStage = {};
    for (const p of paths) {
      const absPath = p.startsWith("/") ? p : normalizePath(`${cwd}/${p}`);
      const node = fs.getNode(absPath);
      if (!node) {
        // Check if it's a tracked file that was deleted
        const relPath = toRel(absPath);
        if (relPath in headTree) {
          if (!index.deleted.includes(relPath)) {
            index.deleted.push(relPath);
          }
          continue;
        }
        return { fs, output: "", error: `fatal: pathspec '${p}' did not match any files` };
      }
      if (isDirectory(node)) {
        Object.assign(filesToStage, collectFiles(fs, absPath, root));
        deletionScopes.push(relPrefix(absPath));
      } else if (isFile(node)) {
        filesToStage[toRel(absPath)] = node.content;
      }
    }
  }

  // Detect deletions: HEAD files under a staged subtree that are no longer on disk.
  for (const scope of deletionScopes) {
    for (const trackedPath of Object.keys(headTree)) {
      if (scope && !trackedPath.startsWith(scope)) continue;
      if (!(trackedPath in filesToStage) && !index.deleted.includes(trackedPath)) {
        index.deleted.push(trackedPath);
      }
    }
  }

  // Unmerged paths in a rebase or merge must always re-stage, even when the resolved
  // content equals HEAD (player resolved "in favor of ours"). HEAD is only one side of
  // the merge, so content-equality with it is not a meaningful "nothing to do" signal.
  const unmerged = new Set(
    readRebaseState(fs, root)?.conflictFiles ?? readMergeState(fs, root)?.conflictFiles ?? [],
  );

  // Only stage files that differ from HEAD (or are unmerged during a rebase)
  for (const [relPath, content] of Object.entries(filesToStage)) {
    if (headTree[relPath] !== content || unmerged.has(relPath)) {
      index.staged[relPath] = content;
    }
    // If it was in deleted, remove from deleted since it exists again
    const delIdx = index.deleted.indexOf(relPath);
    if (delIdx !== -1) index.deleted.splice(delIdx, 1);
  }

  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify(index));
  return { fs, output: "" };
}

// ── git rm ───────────────────────────────────────────────────────────

export function gitRm(fs: VirtualFS, root: string, paths: string[], recursive: boolean): { fs: VirtualFS; output: string; error?: string } {
  const index = readIndex(fs, root);

  for (const p of paths) {
    const absPath = p.startsWith("/") ? p : normalizePath(`${root}/${p}`);
    const node = fs.getNode(absPath);
    if (!node) {
      return { fs, output: "", error: `fatal: pathspec '${p}' did not match any files` };
    }
    if (isDirectory(node) && !recursive) {
      return { fs, output: "", error: `fatal: not removing '${p}' recursively without -r` };
    }
    const relPath = absPath.startsWith(root + "/") ? absPath.slice(root.length + 1) : p;
    if (isDirectory(node)) {
      // Collect all files in directory and mark them deleted
      const dirFiles = collectFiles(fs, absPath, root);
      for (const filePath of Object.keys(dirFiles)) {
        if (!index.deleted.includes(filePath)) index.deleted.push(filePath);
        delete index.staged[filePath];
      }
    } else {
      if (!index.deleted.includes(relPath)) index.deleted.push(relPath);
      delete index.staged[relPath];
    }
    fs = removeOrFail(fs, absPath);
  }

  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify(index));
  return { fs, output: "" };
}

// ── git commit ───────────────────────────────────────────────────────

export function gitCommit(
  fs: VirtualFS, root: string, message: string, author: string, amend: boolean, autoStage: boolean, timestamp: number
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  const index = readIndex(fs, root);
  const headHash = resolveHead(fs, root);
  const headCommit = headHash ? readCommit(fs, root, headHash) : null;
  const headTree = headCommit?.tree ?? {};
  const mergeState = readMergeState(fs, root);

  if (mergeState && amend) {
    return { fs, output: "", error: MERGE_IN_PROGRESS };
  }

  // Auto-stage modified tracked files if -a flag
  if (autoStage) {
    const workingTree = collectFiles(fs, root, root);
    for (const [path, content] of Object.entries(workingTree)) {
      if (path in headTree && headTree[path] !== content) {
        index.staged[path] = content;
      }
    }
    // Check for deleted tracked files
    for (const path of Object.keys(headTree)) {
      const absPath = `${root}/${path}`;
      if (!fs.getNode(absPath) && !index.deleted.includes(path)) {
        index.deleted.push(path);
      }
    }
  }

  let newTree: Record<string, string>;
  let parent2: string | undefined;

  if (mergeState) {
    // Concluding a conflicted merge. The clean side of the merge only exists in the
    // working tree (never staged), so rebuild the merged tree and lay the player's
    // staged resolutions over it — the same shape as `git rebase --continue`.
    const unresolved = unresolvedConflictError(fs, root, mergeState, index);
    if (unresolved) return { fs, output: "", error: unresolved };

    const base = mergeBase(fs, root, headHash!, mergeState.targetHash);
    newTree = mergeTrees(fs, root, base, headHash!, mergeState.targetHash, mergeState.targetLabel).tree;
    for (const [path, content] of Object.entries(index.staged)) newTree[path] = content;
    for (const path of index.deleted) delete newTree[path];
    parent2 = mergeState.targetHash;
  } else {
    const hasChanges = Object.keys(index.staged).length > 0 || index.deleted.length > 0;
    if (!hasChanges && !amend) {
      return { fs, output: "nothing to commit, working tree clean" };
    }

    if (amend && !headCommit) {
      return { fs, output: "", error: "fatal: You have nothing to amend." };
    }

    // Build new tree: start from head tree, apply staged, remove deleted
    newTree = { ...headTree };
    for (const [path, content] of Object.entries(index.staged)) {
      newTree[path] = content;
    }
    for (const path of index.deleted) {
      delete newTree[path];
    }
    // Amending a merge commit keeps it one: the second parent is part of the history
    // being rewritten, not of the change being amended.
    if (amend) parent2 = headCommit!.parent2;
  }

  const parent = amend ? headCommit!.parent : (headHash ?? null);
  // `parent2 ?? ""` keeps the hash of every non-merge commit byte-identical to before.
  const hash = shortHash(message + timestamp + (parent ?? "") + (parent2 ?? "") + JSON.stringify(newTree));

  const commit: GitCommit = { hash, parent, ...(parent2 ? { parent2 } : {}), message, author, timestamp, tree: newTree };
  fs = writeOrFail(fs, `${root}/.git/objects/${hash}.json`, JSON.stringify(commit));

  // Update branch ref
  const head = readHead(fs, root);
  const branch = getCurrentBranch(head);
  if (branch) {
    fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${branch}`, hash);
  } else {
    fs = writeOrFail(fs, `${root}/.git/HEAD`, hash);
  }

  // Clear index
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));
  if (mergeState) fs = clearMergeState(fs, root);

  const branchStr = branch ?? "detached HEAD";
  const rootStr = parent ? "" : " (root-commit)";
  // Amend replaces HEAD, so its stat is measured against the *parent*, not HEAD.
  const baseTree = parent ? (readCommit(fs, root, parent)?.tree ?? {}) : {};
  // Real git prints no diffstat for a merge commit — the interesting change is the
  // topology, and the per-file numbers would double-count both sides' work.
  const stat = mergeState ? [] : formatCommitStat(baseTree, newTree);
  return {
    fs,
    output: [`[${branchStr}${rootStr} ${hash}] ${message}`, ...stat].join("\n"),
    ...(mergeState ? { triggerEvents: mergeEvents(mergeState.targetLabel) } : {}),
  };
}

/**
 * Real-git commit summary: the `N files changed, X insertions(+), Y deletions(-)`
 * line followed by create/delete mode lines. Zero-valued clauses are omitted, as
 * in git. Mode is always 100644 — the VFS has no executable bit.
 */
function formatCommitStat(oldTree: Record<string, string>, newTree: Record<string, string>): string[] {
  const paths = [...new Set([...Object.keys(oldTree), ...Object.keys(newTree)])]
    .filter((p) => oldTree[p] !== newTree[p])
    .sort();

  let insertions = 0;
  let deletions = 0;
  for (const p of paths) {
    const counts = countLineChanges(oldTree[p] ?? "", newTree[p] ?? "");
    insertions += counts.insertions;
    deletions += counts.deletions;
  }

  const parts = [`${paths.length} file${paths.length !== 1 ? "s" : ""} changed`];
  if (insertions > 0) parts.push(`${insertions} insertion${insertions !== 1 ? "s" : ""}(+)`);
  if (deletions > 0) parts.push(`${deletions} deletion${deletions !== 1 ? "s" : ""}(-)`);

  const modeLines = paths.flatMap((p) => {
    if (!(p in oldTree)) return [` create mode 100644 ${p}`];
    if (!(p in newTree)) return [` delete mode 100644 ${p}`];
    return [];
  });
  return [` ${parts.join(", ")}`, ...modeLines];
}

// ── git status ───────────────────────────────────────────────────────

export interface StatusResult {
  branch: string | null;
  staged: { path: string; status: "new file" | "modified" | "deleted" }[];
  unstaged: { path: string; status: "modified" | "deleted" }[];
  untracked: string[];
  /** Commit a detached HEAD points at; present exactly when `branch` is null and a commit exists. */
  detachedAt?: string;
  /** Present while a rebase is in progress; `unmerged` excludes paths already `git add`ed. */
  rebase?: { onto: string; branch: string; unmerged: string[] };
  /**
   * Present while a conflicted merge is in progress. Unlike `rebase`, this is additive:
   * the branch/tracking header still prints above it, as in real git.
   */
  merge?: { target: string; unmerged: string[] };
  /**
   * Branch tracking info vs `refs/remotes/origin/<branch>`. Present ONLY when that
   * remote-tracking ref exists (so repos with no remote are byte-for-byte unchanged).
   */
  tracking?: { remoteRef: string; ahead: number; behind: number };
}

/**
 * `paths` are pathspecs resolved against `cwd`; they narrow the change lists only
 * (branch/tracking info is unaffected). Unlike diff/log, a pathspec that matches
 * nothing is not fatal in real git — the sections just come back empty.
 */
export function gitStatus(
  fs: VirtualFS, root: string, cwd?: string, paths?: string[]
): StatusResult {
  const repo = readRepo(fs, root);
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  const workingTree = collectFiles(fs, root, root);

  const staged: StatusResult["staged"] = [];
  const unstaged: StatusResult["unstaged"] = [];
  const untracked: string[] = [];

  const matches = paths && paths.length > 0
    ? pathMatcher(paths.map((p) => toRepoRelative(root, cwd ?? root, p)))
    : null;

  // Staged changes (index vs HEAD)
  for (const [path, content] of Object.entries(repo.index.staged)) {
    if (!(path in headTree)) {
      staged.push({ path, status: "new file" });
    } else if (headTree[path] !== content) {
      staged.push({ path, status: "modified" });
    }
  }
  for (const path of repo.index.deleted) {
    staged.push({ path, status: "deleted" });
  }

  // Determine effective tracked tree (HEAD + staged)
  const trackedTree: Record<string, string> = { ...headTree };
  for (const [path, content] of Object.entries(repo.index.staged)) {
    trackedTree[path] = content;
  }
  for (const path of repo.index.deleted) {
    delete trackedTree[path];
  }

  // Unstaged changes (working tree vs tracked tree)
  for (const [path, content] of Object.entries(trackedTree)) {
    if (!(path in workingTree)) {
      unstaged.push({ path, status: "deleted" });
    } else if (workingTree[path] !== content) {
      unstaged.push({ path, status: "modified" });
    }
  }

  // Untracked files
  for (const path of Object.keys(workingTree)) {
    if (!(path in trackedTree) && !(path in repo.index.staged)) {
      untracked.push(path);
    }
  }

  const tracking = computeTracking(fs, root, repo.currentBranch, headHash);

  const keptStaged = matches ? staged.filter((s) => matches(s.path)) : staged;
  const keptUnstaged = matches ? unstaged.filter((u) => matches(u.path)) : unstaged;
  const keptUntracked = matches ? untracked.filter(matches) : untracked;

  const detachedAt = !repo.currentBranch && headHash ? { detachedAt: headHash } : {};

  // During a rebase or merge, unresolved conflict files show as "both modified" under
  // Unmerged paths until `git add`ed; pull them out of the plain unstaged list.
  const rebaseState = readRebaseState(fs, root);
  if (rebaseState) {
    const unmerged = rebaseState.conflictFiles.filter((f) => !(f in repo.index.staged));
    const unmergedSet = new Set(unmerged);
    return {
      branch: repo.currentBranch,
      ...detachedAt,
      staged: keptStaged,
      unstaged: keptUnstaged.filter((u) => !unmergedSet.has(u.path)),
      untracked: keptUntracked,
      rebase: {
        onto: rebaseState.onto,
        branch: rebaseState.originalBranch,
        unmerged: matches ? unmerged.filter(matches) : unmerged,
      },
      tracking,
    };
  }

  const mergeState = readMergeState(fs, root);
  if (mergeState) {
    const unmerged = mergeState.conflictFiles.filter((f) => !(f in repo.index.staged));
    const unmergedSet = new Set(unmerged);
    return {
      branch: repo.currentBranch,
      ...detachedAt,
      staged: keptStaged,
      unstaged: keptUnstaged.filter((u) => !unmergedSet.has(u.path)),
      untracked: keptUntracked,
      merge: {
        target: mergeState.targetLabel,
        unmerged: matches ? unmerged.filter(matches) : unmerged,
      },
      tracking,
    };
  }

  return {
    branch: repo.currentBranch,
    ...detachedAt,
    staged: keptStaged,
    unstaged: keptUnstaged,
    untracked: keptUntracked,
    tracking,
  };
}

/**
 * Ahead/behind of the local branch vs `refs/remotes/origin/<branch>`. Returns
 * undefined unless that remote-tracking ref exists — callers must treat the
 * absence as "no upstream configured" and render nothing.
 */
function computeTracking(
  fs: VirtualFS, root: string, branch: string | null, localTip: string | null
): StatusResult["tracking"] {
  if (!branch) return undefined;
  const upTip = fs.readFile(`${root}/.git/refs/remotes/origin/${branch}`).content?.trim();
  if (!upTip) return undefined;

  const localAnc = localTip ? ancestorSet(fs, root, localTip) : new Set<string>();
  const upAnc = ancestorSet(fs, root, upTip);
  let ahead = 0;
  for (const h of localAnc) if (!upAnc.has(h)) ahead++;
  let behind = 0;
  for (const h of upAnc) if (!localAnc.has(h)) behind++;
  return { remoteRef: `origin/${branch}`, ahead, behind };
}

// ── git log ──────────────────────────────────────────────────────────

/** First-parent walk from `startHash` (default HEAD), newest first. */
export function getCommitLog(fs: VirtualFS, root: string, startHash?: string): GitCommit[] {
  const commits: GitCommit[] = [];
  let current: string | null = startHash ?? resolveHead(fs, root);
  while (current) {
    const commit = readCommit(fs, root, current);
    if (!commit) break;
    commits.push(commit);
    current = commit.parent;
  }
  return commits;
}

/** Keep only commits that changed at least one path under `relPaths` (`git log -- <path>`). */
export function filterCommitsByPaths(
  fs: VirtualFS, root: string, commits: GitCommit[], relPaths: string[]
): GitCommit[] {
  const matches = pathMatcher(relPaths);
  return commits.filter((commit) => {
    const parentTree = commit.parent ? (readCommit(fs, root, commit.parent)?.tree ?? {}) : {};
    const keys = new Set([...Object.keys(commit.tree), ...Object.keys(parentTree)]);
    for (const key of keys) {
      if (matches(key) && commit.tree[key] !== parentTree[key]) return true;
    }
    return false;
  });
}

// ── git branch ───────────────────────────────────────────────────────

export type BranchListMode = "local" | "remotes" | "all";

export function listBranches(
  fs: VirtualFS,
  root: string,
  mode: BranchListMode = "local",
): { branches: string[]; remotes: string[]; current: string | null } {
  const current = getCurrentBranch(readHead(fs, root));

  const collect = (startPath: string, initialPrefix: string): string[] => {
    const out: string[] = [];
    const walk = (dirPath: string, prefix: string) => {
      const { entries } = fs.listDirectory(dirPath);
      for (const entry of entries) {
        if (isFile(entry)) {
          out.push(prefix + entry.name);
        } else if (isDirectory(entry)) {
          walk(`${dirPath}/${entry.name}`, `${prefix}${entry.name}/`);
        }
      }
    };
    walk(startPath, initialPrefix);
    out.sort();
    return out;
  };

  const branches = mode === "remotes" ? [] : collect(`${root}/.git/refs/heads`, "");
  const remotes = mode === "local" ? [] : collect(`${root}/.git/refs/remotes`, "remotes/");
  return { branches, remotes, current };
}

export function createBranch(
  fs: VirtualFS, root: string, name: string
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  if (!isValidRefName(name)) {
    return { fs, output: "", error: `fatal: '${name}' is not a valid branch name` };
  }
  const existing = fs.readFile(`${root}/.git/refs/heads/${name}`);
  if (existing.content) {
    return { fs, output: "", error: `fatal: a branch named '${name}' already exists` };
  }

  const headHash = resolveHead(fs, root);
  if (!headHash) {
    return { fs, output: "", error: `fatal: Not a valid object name: 'HEAD'.` };
  }

  fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${name}`, headHash);
  return { fs, output: "", triggerEvents: [{ type: "command_executed", detail: "git_checkout_b" }] };
}

export function deleteBranch(fs: VirtualFS, root: string, name: string, force: boolean): { fs: VirtualFS; output: string; error?: string } {
  const current = getCurrentBranch(readHead(fs, root));
  if (name === current) {
    return { fs, output: "", error: `error: Cannot delete branch '${name}' checked out at '${root}'` };
  }

  const branchRef = fs.readFile(`${root}/.git/refs/heads/${name}`);
  if (!branchRef.content) {
    return { fs, output: "", error: `error: branch '${name}' not found.` };
  }

  if (!force) {
    // "Fully merged" is reachability from HEAD, not tip equality: after merging a
    // branch in, its tip is an ancestor of HEAD but no longer equal to it, and that
    // is exactly when `-d` is supposed to work.
    const headHash = resolveHead(fs, root);
    const merged = headHash ? ancestorSet(fs, root, headHash).has(branchRef.content.trim()) : false;
    if (!merged) {
      return { fs, output: "", error: `error: The branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'.` };
    }
  }

  const hash = branchRef.content.trim();
  fs = removeOrFail(fs, `${root}/.git/refs/heads/${name}`);
  return { fs, output: `Deleted branch ${name} (was ${hash.slice(0, 7)}).` };
}

// ── git checkout ─────────────────────────────────────────────────────

/**
 * `git checkout <branch|-b new|<rev>>`. A target that isn't a branch but resolves as a
 * revision detaches HEAD onto it. `allowDetach: false` is how `git switch` refuses a
 * commit without `--detach`.
 */
export function gitCheckout(
  fs: VirtualFS, root: string, target: string, createBranch: boolean, allowDetach = true
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  if (readMergeState(fs, root)) {
    return { fs, output: "", error: MERGE_IN_PROGRESS };
  }
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  const index = readIndex(fs, root);
  const hasUncommitted = Object.keys(index.staged).length > 0 || index.deleted.length > 0;

  if (createBranch) {
    if (!isValidRefName(target)) {
      return { fs, output: "", error: `fatal: '${target}' is not a valid branch name` };
    }
    // Check if branch already exists
    const existing = fs.readFile(`${root}/.git/refs/heads/${target}`);
    if (existing.content) {
      return { fs, output: "", error: `fatal: a branch named '${target}' already exists` };
    }
    // Create branch at current HEAD
    const hash = headHash ?? "";
    if (hash) {
      fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${target}`, hash);
    }
    fs = writeOrFail(fs, `${root}/.git/HEAD`, `ref: refs/heads/${target}`);
    return { fs, output: `Switched to a new branch '${target}'`, triggerEvents: [{ type: "command_executed", detail: "git_checkout_b" }] };
  }

  // `git checkout HEAD` is a no-op in real git — it must not detach a branch onto its own tip.
  if (target === "HEAD" && !fs.readFile(`${root}/.git/refs/heads/HEAD`).content) {
    return { fs, output: "" };
  }

  // Switch to an existing branch, or detach onto any other revision.
  const branchHash = fs.readFile(`${root}/.git/refs/heads/${target}`).content?.trim();
  const detachHash = branchHash ? null : resolveRef(fs, root, target);
  if (!branchHash && !detachHash) {
    return { fs, output: "", error: `error: pathspec '${target}' did not match any file(s) known to git` };
  }
  if (detachHash && !allowDetach) {
    return { fs, output: "", error: `fatal: a branch is expected, got commit '${target}'` };
  }

  const targetHash = branchHash ?? detachHash!;
  const targetCommit = readCommit(fs, root, targetHash);
  if (!targetCommit) {
    return { fs, output: "", error: `error: unable to read commit ${targetHash}` };
  }

  // Check for conflicting uncommitted changes
  if (hasUncommitted) {
    const workingTree = collectFiles(fs, root, root);
    const conflicts: string[] = [];
    for (const [path, content] of Object.entries(workingTree)) {
      if (headTree[path] !== content && targetCommit.tree[path] !== undefined && targetCommit.tree[path] !== content) {
        conflicts.push(path);
      }
    }
    if (conflicts.length > 0) {
      return {
        fs, output: "",
        error: `error: Your local changes to the following files would be overwritten by checkout:\n${conflicts.map((f) => `\t${f}`).join("\n")}\nPlease commit your changes or stash them before you switch branches.`,
      };
    }
  }

  // Restore working tree from target commit's snapshot
  const targetTree = targetCommit.tree;

  // Write all files from target tree
  for (const [relPath, content] of Object.entries(targetTree)) {
    const absPath = `${root}/${relPath}`;
    // Ensure parent directories exist
    const parts = relPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dirPath = `${root}/${parts.slice(0, i).join("/")}`;
      fs = mkdirOrFail(fs, dirPath);
    }
    fs = writeOrFail(fs, absPath, content);
  }

  // Delete files tracked by current branch but absent from target tree (leave untracked alone)
  for (const path of Object.keys(headTree)) {
    if (!(path in targetTree)) {
      const absPath = `${root}/${path}`;
      if (fs.getNode(absPath)) {
        fs = removeOrFail(fs, absPath);
      }
    }
  }

  // Update HEAD: a branch ref, or the raw hash when detaching.
  fs = writeOrFail(fs, `${root}/.git/HEAD`, detachHash ? targetHash : `ref: refs/heads/${target}`);
  // Clear index
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));

  if (detachHash) {
    // Real git follows this with a paragraph about experimenting in a detached state;
    // the two lines players act on are enough.
    const subject = targetCommit.message.split("\n")[0];
    return {
      fs,
      output: `Note: switching to '${target}'.\n\nHEAD is now at ${targetHash.slice(0, 7)} ${subject}`,
      triggerEvents: [{ type: "command_executed", detail: "git_checkout_detached" }],
    };
  }
  return { fs, output: `Switched to branch '${target}'` };
}

// ── git reset ────────────────────────────────────────────────────────

export type GitResetMode = "soft" | "mixed" | "hard";

/** A commit's parents, first parent first. Merge commits have two. */
export function parentsOf(commit: GitCommit): string[] {
  const out: string[] = [];
  if (commit.parent) out.push(commit.parent);
  if (commit.parent2) out.push(commit.parent2);
  return out;
}

/**
 * The one object whose hash starts with `prefix`. Null when nothing matches or
 * more than one does — real git's "ambiguous argument", which callers surface as
 * an unknown revision rather than picking a winner.
 */
function uniqueObjectByPrefix(fs: VirtualFS, root: string, prefix: string): string | null {
  const lower = prefix.toLowerCase();
  const { entries } = fs.listDirectory(`${root}/.git/objects`);
  const matches = entries
    .filter(isFile)
    .map((e) => e.name.replace(/\.json$/, ""))
    .filter((hash) => hash.startsWith(lower));
  return matches.length === 1 ? matches[0] : null;
}

/** Resolve the leading name of a revision (everything before the first `^`/`~`). */
function resolveRevBase(fs: VirtualFS, root: string, token: string, allowPrefix: boolean): string | null {
  if (token === "HEAD") return resolveHead(fs, root);

  const local = fs.readFile(`${root}/.git/refs/heads/${token}`).content?.trim();
  if (local) return local;

  // A slashed name that isn't a local branch is a remote-tracking ref, so
  // `origin/main` resolves without a special case at each call site.
  if (token.includes("/")) {
    const remote = fs.readFile(`${root}/.git/refs/remotes/${token}`).content?.trim();
    if (remote) return remote;
  }

  if (readCommit(fs, root, token)) return token;
  if (allowPrefix && /^[0-9a-f]{4,}$/i.test(token)) return uniqueObjectByPrefix(fs, root, token);
  return null;
}

/**
 * Resolve a revision to a commit hash. The grammar is a base name followed by any
 * number of `^`/`~` steps (`HEAD~2`, `main^`, `abc1234~1^2`):
 *
 * - base: `HEAD`, a local branch, a remote-tracking ref (`origin/main`), an exact
 *   object hash, or a unique abbreviated hash of 4+ hex chars.
 * - `~N` (bare `~` = `~1`): walk N first parents.
 * - `^`/`^1`: first parent. `^2`: a merge commit's second parent. `^0`: the commit itself.
 *
 * Returns null when any step doesn't exist — an unknown name, an ambiguous
 * abbreviation, `^2` on a non-merge commit, or a walk past the root commit.
 *
 * `allowPrefix: false` disables abbreviated-hash matching so pathspec parsing can
 * prefer a real file named e.g. `cafe` over a same-prefixed object.
 */
export function resolveRef(
  fs: VirtualFS, root: string, ref: string, opts: { allowPrefix?: boolean } = {},
): string | null {
  const m = ref.match(/^([^^~]+)((?:[\^~]\d*)*)$/);
  if (!m) return null;
  const [, base, ops] = m;

  let hash = resolveRevBase(fs, root, base, opts.allowPrefix !== false);

  for (const [, op, digits] of ops.matchAll(/([\^~])(\d*)/g)) {
    if (!hash) return null;
    const n = digits === "" ? 1 : parseInt(digits, 10);
    if (op === "~") {
      let remaining = n;
      while (hash && remaining-- > 0) {
        hash = readCommit(fs, root, hash)?.parent ?? null;
      }
    } else if (n > 0) {
      const commit = readCommit(fs, root, hash);
      hash = commit ? (parentsOf(commit)[n - 1] ?? null) : null;
    }
    // `^0` is the commit itself — no step.
  }
  return hash;
}

/** Remove pathspecs (files or directory prefixes) from the index. */
function unstagePaths(
  fs: VirtualFS, root: string, cwd: string, index: GitIndex, headTree: Record<string, string>, paths: string[]
): { index: GitIndex; error?: string } {
  for (const p of paths) {
    const absPath = p.startsWith("/") ? normalizePath(p) : normalizePath(`${cwd}/${p}`);
    // A pathspec resolving to the repo root (`.` at root) matches everything;
    // index keys are repo-relative, so its `rel` is "" rather than a prefix.
    const rel = absPath === root
      ? ""
      : absPath.startsWith(root + "/") ? absPath.slice(root.length + 1) : absPath;
    const matches = (key: string) => rel === "" || key === rel || key.startsWith(rel + "/");
    const hadEntry = Object.keys(index.staged).some(matches) || index.deleted.some(matches);
    if (!hadEntry && !fs.getNode(absPath) && !(rel in headTree)) {
      return { index, error: `fatal: pathspec '${p}' did not match any files` };
    }
    for (const key of Object.keys(index.staged)) {
      if (matches(key)) delete index.staged[key];
    }
    index.deleted = index.deleted.filter((key) => !matches(key));
  }
  return { index };
}

export function gitReset(
  fs: VirtualFS, root: string, cwd: string, args: string[], mode: GitResetMode | null
): { fs: VirtualFS; output: string; error?: string } {
  if (readRebaseState(fs, root)) {
    return { fs, output: "", error: "fatal: cannot reset during a rebase; finish it or run 'git rebase --abort' first" };
  }
  if (readMergeState(fs, root)) {
    return { fs, output: "", error: MERGE_IN_PROGRESS };
  }

  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};

  // Split args into an optional leading revision and trailing pathspecs. A
  // literal `--` is authoritative (as in `splitRevsAndPaths`). Without one:
  // with an explicit mode flag the sole arg is always a revision; otherwise a
  // lone arg that resolves as a revision is one, and anything else (or args
  // after a revision, e.g. `git reset HEAD file`) are pathspecs.
  let explicitTarget: string | null = null;
  let paths: string[] = [];
  const sep = args.indexOf("--");
  if (sep !== -1) {
    const revs = args.slice(0, sep);
    if (revs.length > 1) {
      return { fs, output: "", error: `fatal: ambiguous argument '${revs[1]}': unknown revision or path not in the working tree.` };
    }
    explicitTarget = revs[0] ?? null;
    paths = args.slice(sep + 1);
  } else if (mode !== null) {
    explicitTarget = args[0] ?? null;
    paths = args.slice(1);
  } else if (args.length > 0) {
    if (resolveRef(fs, root, args[0]) !== null) {
      explicitTarget = args[0];
      paths = args.slice(1);
    } else {
      paths = args;
    }
  }
  if (mode !== null && paths.length > 0) {
    return { fs, output: "", error: `fatal: Cannot do ${mode} reset with paths.` };
  }
  const target = explicitTarget ?? "HEAD";

  // Path form: reset index entries only, relative to the target commit's tree.
  if (paths.length > 0) {
    let pathTree = headTree;
    if (explicitTarget !== null) {
      const hash = resolveRef(fs, root, explicitTarget);
      if (!hash) {
        return { fs, output: "", error: `fatal: ambiguous argument '${explicitTarget}': unknown revision or path not in the working tree.` };
      }
      pathTree = readCommit(fs, root, hash)?.tree ?? {};
    }
    const index = readIndex(fs, root);
    const result = unstagePaths(fs, root, cwd, index, pathTree, paths);
    if (result.error) return { fs, output: "", error: result.error };
    fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify(result.index));
    return { fs, output: "" };
  }

  const targetHash = resolveRef(fs, root, target);
  if (!targetHash) {
    return { fs, output: "", error: `fatal: ambiguous argument '${target}': unknown revision or path not in the working tree.` };
  }
  const targetCommit = readCommit(fs, root, targetHash);
  if (!targetCommit) {
    return { fs, output: "", error: `fatal: Could not parse object '${target}'.` };
  }

  const effectiveMode: GitResetMode = mode ?? "mixed";
  const index = readIndex(fs, root);

  // Move HEAD (branch ref, or raw hash when detached).
  const branch = getCurrentBranch(readHead(fs, root));
  if (branch) {
    fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${branch}`, targetHash);
  } else {
    fs = writeOrFail(fs, `${root}/.git/HEAD`, targetHash);
  }

  if (effectiveMode === "soft") {
    return { fs, output: "" };
  }

  // mixed and hard both reset the index.
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));

  if (effectiveMode === "hard") {
    // Tracked files (HEAD or staged-new) absent from the target get removed;
    // untracked files survive, as in real git.
    const removable = [...Object.keys(headTree), ...Object.keys(index.staged)];
    fs = writeTreeToWorkingDir(fs, root, targetCommit.tree, removable);
    const subject = targetCommit.message.split("\n")[0];
    return { fs, output: `HEAD is now at ${targetHash.slice(0, 7)} ${subject}` };
  }

  // mixed: report tracked files whose working-tree content now differs from the target.
  const workingTree = collectFiles(fs, root, root);
  const unstagedLines: string[] = [];
  for (const [path, content] of Object.entries(targetCommit.tree)) {
    if (!(path in workingTree)) unstagedLines.push(`D\t${path}`);
    else if (workingTree[path] !== content) unstagedLines.push(`M\t${path}`);
  }
  if (unstagedLines.length === 0) return { fs, output: "" };
  return { fs, output: `Unstaged changes after reset:\n${unstagedLines.sort().join("\n")}` };
}

// ── git restore ──────────────────────────────────────────────────────

/**
 * `git restore [--staged] <paths>`. `--staged` drops the paths from the index
 * (same machinery as `git reset <paths>`); the working-tree form rewrites each
 * file from the index if it's staged there, else from HEAD. Both are silent on
 * success, as real git is.
 */
export function gitRestore(
  fs: VirtualFS, root: string, cwd: string, paths: string[], staged: boolean
): { fs: VirtualFS; output: string; error?: string } {
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};

  if (staged) {
    const result = unstagePaths(fs, root, cwd, readIndex(fs, root), headTree, paths);
    if (result.error) return { fs, output: "", error: result.error };
    return { fs: writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify(result.index)), output: "" };
  }

  const index = readIndex(fs, root);
  const source: Record<string, string> = { ...headTree, ...index.staged };
  for (const p of paths) {
    const rel = toRepoRelative(root, cwd, p);
    const matches = Object.keys(source).filter((key) => rel === "" || key === rel || key.startsWith(rel + "/"));
    if (matches.length === 0) {
      return { fs, output: "", error: `error: pathspec '${p}' did not match any file(s) known to git` };
    }
    for (const key of matches) {
      fs = writeFileWithDirs(fs, root, key, source[key]);
    }
  }
  return { fs, output: "" };
}

// ── git diff ─────────────────────────────────────────────────────────

export interface DiffFile {
  path: string;
  oldContent: string;
  newContent: string;
  /** Drives the `new file mode` / `deleted file mode` headers; "" content alone can't tell them apart. */
  status: "added" | "modified" | "deleted";
}

export interface DiffOptions {
  /** Compare the index rather than the working tree (`--staged`/`--cached`). */
  staged?: boolean;
  /** Commit hash for the "a" side; without it the comparison is index/worktree based. */
  from?: string;
  /** Commit hash for the "b" side; with `from` but no `to`, "b" is the working tree. */
  to?: string;
  /** Repo-relative pathspecs (file or directory prefix); `""` means the whole repo. */
  paths?: string[];
}

/** Effective tracked tree: HEAD overlaid with the index. */
function trackedTreeOf(fs: VirtualFS, root: string, headTree: Record<string, string>): Record<string, string> {
  const index = readIndex(fs, root);
  const tracked: Record<string, string> = { ...headTree, ...index.staged };
  for (const path of index.deleted) delete tracked[path];
  return tracked;
}

function diffTreePair(oldTree: Record<string, string>, newTree: Record<string, string>): DiffFile[] {
  const diffs: DiffFile[] = [];
  for (const path of [...new Set([...Object.keys(oldTree), ...Object.keys(newTree)])].sort()) {
    const oldContent = oldTree[path];
    const newContent = newTree[path];
    if (oldContent === newContent) continue;
    diffs.push({
      path,
      oldContent: oldContent ?? "",
      newContent: newContent ?? "",
      status: oldContent === undefined ? "added" : newContent === undefined ? "deleted" : "modified",
    });
  }
  return diffs;
}

export function gitDiffFiles(fs: VirtualFS, root: string, opts: DiffOptions = {}): DiffFile[] {
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  let diffs: DiffFile[];

  if (opts.from) {
    const oldTree = readCommit(fs, root, opts.from)?.tree ?? {};
    let newTree: Record<string, string>;
    if (opts.to) {
      newTree = readCommit(fs, root, opts.to)?.tree ?? {};
    } else if (opts.staged) {
      // `git diff --cached <rev>` compares the index against <rev>.
      newTree = trackedTreeOf(fs, root, headTree);
    } else {
      // Working-tree side, restricted to paths git knows about — untracked files
      // stay out of `git diff <rev>` just as they do out of plain `git diff`.
      const workingTree = collectFiles(fs, root, root);
      const known = new Set([...Object.keys(oldTree), ...Object.keys(trackedTreeOf(fs, root, headTree))]);
      newTree = {};
      for (const path of known) {
        if (path in workingTree) newTree[path] = workingTree[path];
      }
    }
    diffs = diffTreePair(oldTree, newTree);
  } else if (opts.staged) {
    const index = readIndex(fs, root);
    diffs = [];
    for (const [path, content] of Object.entries(index.staged)) {
      const oldContent = headTree[path] ?? "";
      if (oldContent !== content) {
        diffs.push({ path, oldContent, newContent: content, status: path in headTree ? "modified" : "added" });
      }
    }
    for (const path of index.deleted) {
      if (path in headTree) {
        diffs.push({ path, oldContent: headTree[path], newContent: "", status: "deleted" });
      }
    }
  } else {
    const trackedTree = trackedTreeOf(fs, root, headTree);
    const workingTree = collectFiles(fs, root, root);
    diffs = [];
    for (const [path, content] of Object.entries(trackedTree)) {
      if (path in workingTree) {
        if (workingTree[path] !== content) {
          diffs.push({ path, oldContent: content, newContent: workingTree[path], status: "modified" });
        }
      } else {
        diffs.push({ path, oldContent: content, newContent: "", status: "deleted" });
      }
    }
    // Untracked files are deliberately absent: real `git diff` only reports
    // changes to tracked paths.
  }

  if (opts.paths && opts.paths.length > 0) {
    const matches = pathMatcher(opts.paths);
    diffs = diffs.filter((d) => matches(d.path));
  }
  return diffs;
}

// ── pathspec / revision arguments ────────────────────────────────────

/** Match repo-relative keys against pathspecs (exact file, or directory prefix; `""` = everything). */
function pathMatcher(relPaths: string[]): (key: string) => boolean {
  if (relPaths.some((p) => p === "")) return () => true;
  return (key) => relPaths.some((p) => key === p || key.startsWith(p + "/"));
}

/** Normalize a user-supplied pathspec to a repo-relative key; the repo root becomes `""`. */
export function toRepoRelative(root: string, cwd: string, p: string): string {
  const abs = p.startsWith("/") ? normalizePath(p) : normalizePath(`${cwd}/${p}`);
  if (abs === root) return "";
  return abs.startsWith(root + "/") ? abs.slice(root.length + 1) : abs;
}

/** A single revision, or a `<rev1>..<rev2>` range — the two forms `git diff` accepts. */
export interface ParsedRev {
  from: string;
  to?: string;
}

/**
 * Split `git diff` / `git log` arguments into revisions and repo-relative pathspecs.
 *
 * A literal `--` is authoritative: everything before it is a revision, everything
 * after a path (unvalidated, as in real git). Without one, each argument that
 * resolves as a revision is one and the rest are paths — but a path that names
 * nothing git knows about is the classic `ambiguous argument` fatal, not a
 * silently-empty result.
 *
 * Undivided arguments try a *strict* revision parse first (no abbreviated hashes),
 * then a known path, then the loose parse. Otherwise a file named `cafe` would be
 * read as a revision the moment some object's hash happened to start with it.
 */
export function splitRevsAndPaths(
  fs: VirtualFS, root: string, cwd: string, args: string[]
): { revs: ParsedRev[]; paths: string[]; error?: string } {
  const sep = args.indexOf("--");
  const rel = (p: string) => toRepoRelative(root, cwd, p);
  if (sep !== -1) {
    const revs: ParsedRev[] = [];
    for (const token of args.slice(0, sep)) {
      const parsed = parseRevToken(fs, root, token, true);
      if (!parsed) return { revs: [], paths: [], error: ambiguousArg(token) };
      revs.push(parsed);
    }
    return { revs, paths: args.slice(sep + 1).map(rel) };
  }

  const revs: ParsedRev[] = [];
  const paths: string[] = [];
  for (const token of args) {
    // Once a path has been seen, later args can't go back to being revisions.
    const revsStillOpen = paths.length === 0;
    const strict = revsStillOpen ? parseRevToken(fs, root, token, false) : null;
    if (strict) {
      revs.push(strict);
      continue;
    }
    if (pathIsKnown(fs, root, cwd, token)) {
      paths.push(rel(token));
      continue;
    }
    const loose = revsStillOpen ? parseRevToken(fs, root, token, true) : null;
    if (loose) {
      revs.push(loose);
      continue;
    }
    return { revs: [], paths: [], error: ambiguousArg(token) };
  }
  return { revs, paths };
}

function ambiguousArg(token: string): string {
  return `fatal: ambiguous argument '${token}': unknown revision or path not in the working tree.`;
}

function parseRevToken(fs: VirtualFS, root: string, token: string, allowPrefix: boolean): ParsedRev | null {
  const opts = { allowPrefix };
  const range = token.split("..");
  if (range.length === 2 && range[0] && range[1]) {
    const from = resolveRef(fs, root, range[0], opts);
    const to = resolveRef(fs, root, range[1], opts);
    return from && to ? { from, to } : null;
  }
  const hash = resolveRef(fs, root, token, opts);
  return hash ? { from: hash } : null;
}

/** True when a pathspec names something on disk or tracked by HEAD/the index. */
function pathIsKnown(fs: VirtualFS, root: string, cwd: string, p: string): boolean {
  const abs = p.startsWith("/") ? normalizePath(p) : normalizePath(`${cwd}/${p}`);
  if (fs.getNode(abs)) return true;
  const relPath = toRepoRelative(root, cwd, p);
  if (relPath === "") return true;
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  const matches = pathMatcher([relPath]);
  return Object.keys(trackedTreeOf(fs, root, headTree)).some(matches);
}

// ── git stash ────────────────────────────────────────────────────────

export function gitStashSave(
  fs: VirtualFS, root: string, includeUntracked = false
): { fs: VirtualFS; output: string; error?: string } {
  if (readMergeState(fs, root)) {
    return { fs, output: "", error: MERGE_IN_PROGRESS };
  }
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  const workingTree = collectFiles(fs, root, root);

  // Find modified tracked files
  const modified: Record<string, string> = {};
  for (const [path, content] of Object.entries(workingTree)) {
    if (path in headTree && headTree[path] !== content) {
      modified[path] = content;
    }
  }
  // Check for new tracked (staged) files
  const index = readIndex(fs, root);
  for (const [path, content] of Object.entries(index.staged)) {
    modified[path] = content;
  }
  // With -u/--include-untracked, also shelve untracked files (same set gitStatus reports).
  // They aren't in headTree, so the revert loop below removes them from the working tree
  // and gitStashPop's generic restore recreates them on pop.
  if (includeUntracked) {
    for (const path of gitStatus(fs, root).untracked) {
      modified[path] = workingTree[path];
    }
  }

  if (Object.keys(modified).length === 0 && index.deleted.length === 0) {
    return { fs, output: "No local changes to save" };
  }

  const stash = readStash(fs, root);
  const repo = readRepo(fs, root);
  const branch = repo.currentBranch ?? "detached HEAD";
  const message = `WIP on ${branch}: ${headHash?.slice(0, 7) ?? "no commits"}`;
  stash.unshift({ tree: modified, message });

  fs = writeOrFail(fs, `${root}/.git/stash.json`, JSON.stringify(stash));

  // Revert working tree to HEAD state for modified files
  for (const path of Object.keys(modified)) {
    const absPath = `${root}/${path}`;
    if (path in headTree) {
      fs = writeOrFail(fs, absPath, headTree[path]);
    } else {
      // It was a new file — remove it
      if (fs.getNode(absPath)) fs = removeOrFail(fs, absPath);
    }
  }

  // Clear index
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));

  return { fs, output: `Saved working directory and index state ${message}` };
}

export function gitStashPop(fs: VirtualFS, root: string): { fs: VirtualFS; output: string; error?: string } {
  const stash = readStash(fs, root);
  if (stash.length === 0) {
    return { fs, output: "", error: "error: No stash entries found." };
  }

  const entry = stash.shift()!;
  fs = writeOrFail(fs, `${root}/.git/stash.json`, JSON.stringify(stash));

  // Restore stashed files
  for (const [relPath, content] of Object.entries(entry.tree)) {
    const absPath = `${root}/${relPath}`;
    const parts = relPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dirPath = `${root}/${parts.slice(0, i).join("/")}`;
      fs = mkdirOrFail(fs, dirPath);
    }
    fs = writeOrFail(fs, absPath, content);
  }

  return { fs, output: `On branch ${getCurrentBranch(readHead(fs, root)) ?? "HEAD"}, changes restored` };
}

export function gitStashList(fs: VirtualFS, root: string): string {
  const stash = readStash(fs, root);
  if (stash.length === 0) return "";
  return stash.map((entry, i) => `stash@{${i}}: ${entry.message}`).join("\n");
}

// ── git clone ────────────────────────────────────────────────────────

import { REMOTE_REPOS } from "./remotes";

function repoNameFromUrl(url: string): string {
  // Extract repo name from URL like github.com/nexacorp/analytics-pipeline
  const parts = url.replace(/\.git$/, "").split("/");
  return parts[parts.length - 1] || "repo";
}

export function gitClone(
  fs: VirtualFS, cwd: string, url: string, author: string, branchName?: string, _depth?: number
): { fs: VirtualFS; output: string; error?: string; repoName: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  const remote = REMOTE_REPOS[url];
  const repoName = repoNameFromUrl(url);
  const repoPath = `${cwd}/${repoName}`;

  if (fs.getNode(repoPath)) {
    return { fs, output: "", error: `fatal: destination path '${repoName}' already exists and is not an empty directory.`, repoName };
  }

  if (!remote) {
    // Check if it looks like a plausible github URL
    if (url.includes("github.com") || url.includes("gitlab.com")) {
      return { fs, output: "", error: `Cloning into '${repoName}'...\nfatal: repository '${url}' not found`, repoName };
    }
    const host = url.split("/")[0] || url;
    return { fs, output: "", error: `Cloning into '${repoName}'...\nfatal: unable to access '${url}': Could not resolve host: ${host}`, repoName };
  }

  const branch = branchName ?? remote.defaultBranch;

  // Create repo directory
  fs = mkdirOrFail(fs, repoPath);

  // Init .git
  const initResult = gitInit(fs, repoPath, author);
  fs = initResult.fs;

  // Set HEAD to desired branch
  fs = writeOrFail(fs, `${repoPath}/.git/HEAD`, `ref: refs/heads/${branch}`);

  // Write remote config + per-branch upstream section (matches real git layout)
  fs = writeOrFail(
    fs,
    `${repoPath}/.git/config`,
    `[remote "origin"]\n  url = ${url}\n  fetch = +refs/heads/*:refs/remotes/origin/*\n[branch "${branch}"]\n  remote = origin\n  merge = refs/heads/${branch}\n`,
  );

  // Write commit objects and set up refs
  let lastHash: string | null = null;
  for (const commit of remote.commits) {
    fs = writeOrFail(fs, `${repoPath}/.git/objects/${commit.hash}.json`, JSON.stringify(commit));
    lastHash = commit.hash;
  }

  if (lastHash) {
    fs = writeRefOrFail(fs, `${repoPath}/.git/refs/heads/${branch}`, lastHash);
    fs = writeRefOrFail(fs, `${repoPath}/.git/refs/remotes/origin/${branch}`, lastHash);
  }

  // Populate working tree from latest commit
  const latestCommit = lastHash ? readCommit(fs, repoPath, lastHash) : null;
  if (latestCommit) {
    for (const [relPath, content] of Object.entries(latestCommit.tree)) {
      const absPath = `${repoPath}/${relPath}`;
      const parts = relPath.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dirPath = `${repoPath}/${parts.slice(0, i).join("/")}`;
        fs = mkdirOrFail(fs, dirPath);
      }
      fs = writeOrFail(fs, absPath, content);
    }
  }

  const fileCount = latestCommit ? Object.keys(latestCommit.tree).length : 0;
  const output = [
    `Cloning into '${repoName}'...`,
    `remote: Enumerating objects: ${remote.commits.length * 3}, done.`,
    `remote: Counting objects: 100% (${remote.commits.length * 3}/${remote.commits.length * 3}), done.`,
    `remote: Compressing objects: 100%, done.`,
    `Receiving objects: 100%, done.`,
    `Resolving deltas: 100%, done.`,
    ...(fileCount > 0 ? [`Unpacking objects: 100% (${fileCount}/${fileCount}), done.`] : []),
  ].join("\n");

  return {
    fs, output, repoName,
    triggerEvents: [{ type: "command_executed", detail: `git_clone_${repoName}` }],
  };
}

// ── git push ─────────────────────────────────────────────────────────

export function gitPush(
  fs: VirtualFS, root: string, remote: string | undefined, branch: string | undefined, setUpstream: boolean, force: boolean
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  const repo = readRepo(fs, root);

  // Resolve remote and branch
  const targetRemote = remote ?? repo.upstream?.remote ?? "origin";
  const targetBranch = branch ?? repo.upstream?.branch ?? repo.currentBranch;
  if (!targetBranch) {
    return { fs, output: "", error: "fatal: No configured push destination" };
  }

  const remoteUrl = readRemoteUrl(fs, root);
  if (!remoteUrl && targetRemote === "origin") {
    return { fs, output: "", error: "fatal: No configured push destination" };
  }

  // A remote exists but bare `git push` has nothing to aim at: real git refuses
  // rather than guessing origin/<current>. `-u` alone doesn't help — it needs a
  // destination to record, which is why the hint spells out the full command. A
  // positional remote (`git push origin`) suffices, as with push.default=simple.
  if (!remote && !branch && !repo.upstream) {
    return {
      fs,
      output: "",
      error:
        `fatal: The current branch ${targetBranch} has no upstream branch.\n` +
        `To push the current branch and set the remote as upstream, use\n\n` +
        `    git push --set-upstream origin ${targetBranch}\n`,
    };
  }

  // Push the *named* ref, not HEAD. `git push origin other` from main used to
  // send main's tip under the name `other`, silently publishing the wrong
  // commits; a branch that doesn't exist locally is a refspec error, not a
  // no-op push of whatever happens to be checked out.
  const localHash = fs.readFile(`${root}/.git/refs/heads/${targetBranch}`).content?.trim();
  if (!localHash) {
    return {
      fs,
      output: "",
      error: `error: src refspec ${targetBranch} does not match any\nerror: failed to push some refs to '${remoteUrl ?? targetRemote}'`,
    };
  }

  // Check if remote ref is ahead (non-force)
  const remoteRefFile = fs.readFile(`${root}/.git/refs/remotes/${targetRemote}/${targetBranch}`);
  const remoteHash = remoteRefFile.content?.trim();

  // Already up to date. Still emit the push events: a player re-running the
  // command has performed the push, and story flags are set-to-true, so
  // re-crediting is idempotent. Without this a flag missed on the first push
  // (e.g. its gate wasn't satisfied yet) could never be earned.
  if (remoteHash === localHash) {
    return {
      fs,
      output: "Everything up-to-date",
      triggerEvents: pushEvents(targetBranch),
    };
  }

  if (remoteHash && remoteHash !== localHash && !force) {
    // Simple check: if the remote hash isn't an ancestor of local, reject
    let isAncestor = false;
    let current: string | null = localHash;
    while (current) {
      if (current === remoteHash) { isAncestor = true; break; }
      const commit = readCommit(fs, root, current);
      current = commit?.parent ?? null;
    }
    if (!isAncestor) {
      return { fs, output: "", error: "error: failed to push some refs\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally." };
    }
  }

  // Update remote ref (writeRefOrFail mkdir-p's the parent chain, including
  // the remote dir itself and any nested branch path like feature/x).
  const isNewBranch = remoteHash === undefined;
  fs = writeRefOrFail(fs, `${root}/.git/refs/remotes/${targetRemote}/${targetBranch}`, localHash);

  // Set upstream if requested — write a per-branch section so each branch
  // tracks its own upstream independently (real git layout).
  if (setUpstream) {
    const existingConfig = fs.readFile(`${root}/.git/config`);
    let configContent = existingConfig.content ?? "";
    // Drop legacy global keys from older saves so they can't shadow per-branch lookups
    configContent = configContent
      .replace(/^\s*merge-remote\s*=\s*.+$\n?/gm, "")
      .replace(/^\s*merge-branch\s*=\s*.+$\n?/gm, "");
    // Strip any existing section for this branch — terminate at the next [section] or EOF
    const sectionRe = new RegExp(
      `\\[branch "${escapeRegex(targetBranch)}"\\][\\s\\S]*?(?=\\n\\[|$)\\n?`,
      "g",
    );
    configContent = configContent.replace(sectionRe, "");
    configContent =
      configContent.trimEnd() +
      `\n[branch "${targetBranch}"]\n  remote = ${targetRemote}\n  merge = refs/heads/${targetBranch}\n`;
    fs = writeOrFail(fs, `${root}/.git/config`, configContent);
  }

  const forceStr = force ? "+ " : "";
  const refLine = isNewBranch
    ? ` * [new branch]      ${targetBranch} -> ${targetBranch}`
    : `   ${forceStr}${remoteHash!.slice(0, 7)}..${localHash.slice(0, 7)}  ${targetBranch} -> ${targetBranch}${force ? " (forced update)" : ""}`;
  const output = [
    `To ${remoteUrl ?? targetRemote}`,
    refLine,
    ...(setUpstream ? [`branch '${targetBranch}' set up to track '${targetRemote}/${targetBranch}'.`] : []),
  ].join("\n");

  return { fs, output, triggerEvents: pushEvents(targetBranch) };
}

/**
 * Story contract: every successful push emits both the per-branch detail and
 * the generic one, including no-op re-pushes. See the git skill's event table.
 */
function pushEvents(targetBranch: string): { type: "command_executed"; detail: string }[] {
  return [
    { type: "command_executed", detail: `git_push_origin_${targetBranch}` },
    { type: "command_executed", detail: "git_push" },
  ];
}

// ── tree diff helper ────────────────────────────────────────────────

function diffTrees(
  oldTree: Record<string, string>,
  newTree: Record<string, string>
): { path: string; insertions: number; deletions: number }[] {
  return [...new Set([...Object.keys(oldTree), ...Object.keys(newTree)])]
    .filter((p) => oldTree[p] !== newTree[p])
    .sort()
    .map((p) => ({ path: p, ...countLineChanges(oldTree[p] ?? "", newTree[p] ?? "") }));
}

/**
 * Real git's `--stat` block between two trees: one `path | N +++---` line per changed
 * file (bars scaled to a 40-column budget) then the `N files changed, ...` summary.
 * Shared by `git pull` and `git merge`, which print the identical block. The summary
 * line is always emitted, even for an empty change set.
 */
function formatDiffStat(oldTree: Record<string, string>, newTree: Record<string, string>): string[] {
  const changes = diffTrees(oldTree, newTree);

  const maxPathLen = Math.max(...changes.map((c) => c.path.length), 0);
  const maxTotal = Math.max(...changes.map((c) => c.insertions + c.deletions), 0);
  const barWidth = Math.min(maxTotal, 40);

  const fileLines = changes.map((c) => {
    const total = c.insertions + c.deletions;
    const scale = maxTotal > 0 ? barWidth / maxTotal : 0;
    const bar = "+".repeat(Math.round(c.insertions * scale)) + "-".repeat(Math.round(c.deletions * scale));
    return ` ${c.path.padEnd(maxPathLen)} | ${String(total).padStart(3)} ${bar}`;
  });

  const totalIns = changes.reduce((s, c) => s + c.insertions, 0);
  const totalDel = changes.reduce((s, c) => s + c.deletions, 0);
  const summaryParts = [`${changes.length} file${changes.length !== 1 ? "s" : ""} changed`];
  if (totalIns > 0) summaryParts.push(`${totalIns} insertion${totalIns !== 1 ? "s" : ""}(+)`);
  if (totalDel > 0) summaryParts.push(`${totalDel} deletion${totalDel !== 1 ? "s" : ""}(-)`);

  return [...fileLines, ` ${summaryParts.join(", ")}`];
}

// ── git pull ─────────────────────────────────────────────────────────

export function gitPull(
  fs: VirtualFS, root: string, remote: string | undefined, branch: string | undefined, storyFlags: Record<string, string | boolean>, ffOnly = false
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  if (readMergeState(fs, root)) {
    return { fs, output: "", error: MERGE_IN_PROGRESS };
  }
  const repo = readRepo(fs, root);
  const targetBranch = branch ?? repo.upstream?.branch ?? repo.currentBranch;
  if (!targetBranch) {
    return { fs, output: "", error: "fatal: No configured pull destination" };
  }

  const remoteUrl = readRemoteUrl(fs, root);
  if (!remoteUrl) {
    const host = (remote ?? "origin").split("/")[0];
    return { fs, output: "", error: `fatal: unable to access '${remote ?? "origin"}': Could not resolve host: ${host}` };
  }

  // Fast-forward to a pre-seeded remote-tracking ref (refs/remotes/origin/<branch>),
  // independent of REMOTE_REPOS. Fires ONLY when local is a STRICT ancestor of the
  // tracking tip, so it never triggers for a diverged/ahead branch, nor for termoil's
  // getUpdates flow (where the tracking ref equals local at pull time → handled below).
  const localTip = resolveHead(fs, root);
  const trackingTip = fs.readFile(`${root}/.git/refs/remotes/origin/${targetBranch}`).content?.trim();
  const localBehindTracking =
    !!localTip && !!trackingTip && trackingTip !== localTip && ancestorSet(fs, root, trackingTip).has(localTip);
  if (ffOnly && localTip && trackingTip && trackingTip !== localTip && !localBehindTracking
      && !ancestorSet(fs, root, localTip).has(trackingTip)) {
    // Diverged: neither tip is an ancestor of the other.
    return { fs, output: "", error: "fatal: Not possible to fast-forward, aborting." };
  }
  if (localBehindTracking) {
    const newTree = readCommit(fs, root, trackingTip)?.tree ?? {};

    // Refuse to clobber uncommitted local changes whose content differs in the
    // incoming tree — matches `git pull` / `git pull --ff-only`.
    const status = gitStatus(fs, root);
    const dirty = new Set([
      ...status.staged.map((s) => s.path),
      ...status.unstaged.map((u) => u.path),
      ...status.untracked,
    ]);
    const collisions = [...dirty].filter(
      (p) => p in newTree && newTree[p] !== fs.readFile(`${root}/${p}`).content,
    );
    if (collisions.length > 0) {
      return {
        fs,
        output: "",
        error:
          `error: Your local changes to the following files would be overwritten by merge:\n` +
          `${collisions.map((p) => `\t${p}`).join("\n")}\n` +
          `Please commit your changes or stash them before you merge.`,
      };
    }

    fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${targetBranch}`, trackingTip);
    for (const [relPath, content] of Object.entries(newTree)) {
      const parts = relPath.split("/");
      for (let i = 1; i < parts.length; i++) {
        fs = mkdirOrFail(fs, `${root}/${parts.slice(0, i).join("/")}`);
      }
      fs = writeOrFail(fs, `${root}/${relPath}`, content);
    }
    return {
      fs,
      output: `Updating ${localTip.slice(0, 7)}..${trackingTip.slice(0, 7)}\nFast-forward`,
      triggerEvents: [{ type: "command_executed", detail: `git_pull_origin_${targetBranch}` }],
    };
  }

  const remoteDef = REMOTE_REPOS[remoteUrl];
  if (!remoteDef) {
    // Unregistered remote with a seeded tracking ref: if the branch is caught up
    // to (or ahead of) the tracking tip, a repeat pull is a no-op, not a failure.
    if (localTip && trackingTip &&
        (localTip === trackingTip || ancestorSet(fs, root, localTip).has(trackingTip))) {
      return { fs, output: "Already up to date." };
    }
    return { fs, output: "", error: `fatal: repository '${remoteUrl}' not found` };
  }

  const headHash = resolveHead(fs, root);

  // Check for updates from remote
  if (remoteDef.getUpdates) {
    const newCommits = remoteDef.getUpdates(storyFlags, headHash);
    if (newCommits.length === 0) {
      return { fs, output: "Already up to date." };
    }
    if (ffOnly && newCommits[0].parent !== headHash) {
      return { fs, output: "", error: "fatal: Not possible to fast-forward, aborting." };
    }

    // Write new commit objects
    let lastHash = headHash;
    for (const commit of newCommits) {
      fs = writeOrFail(fs, `${root}/.git/objects/${commit.hash}.json`, JSON.stringify(commit));
      lastHash = commit.hash;
    }

    // Fast-forward local and remote refs
    if (lastHash) {
      fs = writeOrFail(fs, `${root}/.git/refs/heads/${targetBranch}`, lastHash);
      fs = writeOrFail(fs, `${root}/.git/refs/remotes/origin/${targetBranch}`, lastHash);

      // Update working tree from latest commit
      const latestCommit = readCommit(fs, root, lastHash);
      if (latestCommit) {
        for (const [relPath, content] of Object.entries(latestCommit.tree)) {
          const absPath = `${root}/${relPath}`;
          const parts = relPath.split("/");
          for (let i = 1; i < parts.length; i++) {
            const dirPath = `${root}/${parts.slice(0, i).join("/")}`;
            fs = mkdirOrFail(fs, dirPath);
          }
          fs = writeOrFail(fs, absPath, content);
        }
      }
    }

    const oldTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
    const newTree = newCommits[newCommits.length - 1].tree;

    const header = `From ${remoteUrl}\n   ${(headHash ?? "0000000").slice(0, 7)}..${(lastHash ?? "0000000").slice(0, 7)}  ${targetBranch} -> origin/${targetBranch}\nFast-forward`;
    const output = [header, ...formatDiffStat(oldTree, newTree)].join("\n");

    return {
      fs,
      output,
      triggerEvents: [{ type: "command_executed", detail: `git_pull_origin_${targetBranch}` }],
    };
  }

  return { fs, output: "Already up to date." };
}

// ── git rebase ───────────────────────────────────────────────────────

function writeRebaseState(fs: VirtualFS, root: string, state: GitRebaseState): VirtualFS {
  return writeOrFail(fs, `${root}/.git/rebase-state.json`, JSON.stringify(state));
}

function clearRebaseState(fs: VirtualFS, root: string): VirtualFS {
  const path = `${root}/.git/rebase-state.json`;
  return fs.getNode(path) ? removeOrFail(fs, path) : fs;
}

/** Detect git conflict markers anywhere in a file's content. */
export function hasConflictMarkers(content: string): boolean {
  return /^<{7} /m.test(content) || /^={7}\s*$/m.test(content) || /^>{7} /m.test(content);
}

/**
 * All ancestor hashes of `hash`, inclusive, following BOTH parents of merge
 * commits. Merge-awareness is what makes merge-base, `branch -d` safety, and
 * "Already up to date." correct once a merge exists; on linear history the walk is
 * identical to a first-parent one.
 */
function ancestorSet(fs: VirtualFS, root: string, hash: string): Set<string> {
  const set = new Set<string>();
  const stack: string[] = [hash];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (set.has(current)) continue;
    set.add(current);
    const commit = readCommit(fs, root, current);
    if (commit) stack.push(...parentsOf(commit));
  }
  return set;
}

/**
 * Closest common ancestor of two commits: a breadth-first walk out from `a`, so the
 * first commit that is also an ancestor of `b` is the nearest one. Null for
 * unrelated histories (merge then treats the base as the empty tree).
 */
function mergeBase(fs: VirtualFS, root: string, a: string, b: string): string | null {
  const bAncestors = ancestorSet(fs, root, b);
  const seen = new Set<string>();
  let frontier = [a];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const hash of frontier) {
      if (seen.has(hash)) continue;
      seen.add(hash);
      if (bAncestors.has(hash)) return hash;
      const commit = readCommit(fs, root, hash);
      if (commit) next.push(...parentsOf(commit));
    }
    frontier = next;
  }
  return null;
}

/** Commits reachable from branchTip but not upstreamTip, oldest first (the work to replay). */
export function commitsToReplay(fs: VirtualFS, root: string, upstreamTip: string, branchTip: string): GitCommit[] {
  const upstreamAncestors = ancestorSet(fs, root, upstreamTip);
  const out: GitCommit[] = [];
  let current: string | null = branchTip;
  while (current && !upstreamAncestors.has(current)) {
    const commit = readCommit(fs, root, current);
    if (!commit) break;
    out.push(commit);
    current = commit.parent;
  }
  return out.reverse();
}

function ensureTrailingNewline(s: string): string {
  return s === "" || s.endsWith("\n") ? s : s + "\n";
}

/**
 * File-level 3-way merge. Values are `undefined` when the file is absent on that side.
 * Returns `content: undefined` for "file should not exist". When both sides changed the
 * same file differently, returns the whole file wrapped in conflict markers.
 */
function threeWayMergeFile(
  base: string | undefined, ours: string | undefined, theirs: string | undefined, theirsLabel: string,
): { content: string | undefined; conflict: boolean } {
  if (ours === theirs) return { content: ours, conflict: false };
  if (ours === base) return { content: theirs, conflict: false }; // only theirs changed (incl. add/delete)
  if (theirs === base) return { content: ours, conflict: false }; // only ours changed
  const content =
    `<<<<<<< HEAD\n${ensureTrailingNewline(ours ?? "")}=======\n${ensureTrailingNewline(theirs ?? "")}>>>>>>> ${theirsLabel}\n`;
  return { content, conflict: true };
}

function writeFileWithDirs(fs: VirtualFS, root: string, relPath: string, content: string): VirtualFS {
  const parts = relPath.split("/");
  for (let i = 1; i < parts.length; i++) {
    fs = mkdirOrFail(fs, `${root}/${parts.slice(0, i).join("/")}`);
  }
  return writeOrFail(fs, `${root}/${relPath}`, content);
}

/**
 * Overwrite the working tree with `newTree`, deleting any `removable` (tracked) path not
 * in it. Writes the VFS directly — bypasses gitCheckout's dirty-overwrite guard, which
 * would refuse the mid-rebase working state. Untracked files (outside `removable`) survive.
 */
function writeTreeToWorkingDir(
  fs: VirtualFS, root: string, newTree: Record<string, string>, removable: Iterable<string>,
): VirtualFS {
  for (const [relPath, content] of Object.entries(newTree)) {
    fs = writeFileWithDirs(fs, root, relPath, content);
  }
  for (const path of removable) {
    if (!(path in newTree)) {
      const abs = `${root}/${path}`;
      if (fs.getNode(abs)) fs = removeOrFail(fs, abs);
    }
  }
  return fs;
}

/**
 * Land a merge result on the working tree, touching only the paths the merge actually
 * changes relative to HEAD. Files the merge leaves alone keep their working-copy
 * content, so uncommitted edits to unrelated files survive a merge as they do in real
 * git. (A *staged* edit to such a file survives only as an unstaged change, since the
 * concluding merge commit clears the index — an accepted approximation.)
 */
function writeMergeToWorkingDir(
  fs: VirtualFS, root: string, headTree: Record<string, string>, newTree: Record<string, string>,
): VirtualFS {
  for (const [relPath, content] of Object.entries(newTree)) {
    if (headTree[relPath] === content) continue;
    fs = writeFileWithDirs(fs, root, relPath, content);
  }
  for (const path of Object.keys(headTree)) {
    if (!(path in newTree)) {
      const abs = `${root}/${path}`;
      if (fs.getNode(abs)) fs = removeOrFail(fs, abs);
    }
  }
  return fs;
}

/** Merge a single replayed commit's tree onto `onto`. */
function mergeCommitOnto(
  fs: VirtualFS, root: string, commit: GitCommit, onto: string,
): { tree: Record<string, string>; conflictFiles: string[] } {
  const parentTree = commit.parent ? (readCommit(fs, root, commit.parent)?.tree ?? {}) : {};
  const ontoTree = readCommit(fs, root, onto)?.tree ?? {};
  const theirsTree = commit.tree;
  const label = `${commit.hash.slice(0, 7)} (${commit.message.split("\n")[0]})`;

  const allPaths = new Set([...Object.keys(parentTree), ...Object.keys(ontoTree), ...Object.keys(theirsTree)]);
  const tree: Record<string, string> = {};
  const conflictFiles: string[] = [];
  for (const path of allPaths) {
    const m = threeWayMergeFile(parentTree[path], ontoTree[path], theirsTree[path], label);
    if (m.conflict) {
      conflictFiles.push(path);
      tree[path] = m.content as string;
    } else if (m.content !== undefined) {
      tree[path] = m.content;
    }
  }
  conflictFiles.sort();
  return { tree, conflictFiles };
}

function trackedUnion(fs: VirtualFS, root: string, ...hashes: string[]): Set<string> {
  const set = new Set<string>();
  for (const h of hashes) {
    const tree = readCommit(fs, root, h)?.tree ?? {};
    for (const p of Object.keys(tree)) set.add(p);
  }
  return set;
}

function finalizeRebase(fs: VirtualFS, root: string, state: GitRebaseState): VirtualFS {
  fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${state.originalBranch}`, state.onto);
  fs = writeOrFail(fs, `${root}/.git/HEAD`, `ref: refs/heads/${state.originalBranch}`);
  const finalTree = readCommit(fs, root, state.onto)?.tree ?? {};
  fs = writeTreeToWorkingDir(fs, root, finalTree, trackedUnion(fs, root, state.originalHead, state.onto));
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));
  fs = clearRebaseState(fs, root);
  return fs;
}

/**
 * Replay `state.todo` onto `state.onto`, oldest first. Stops and persists rebase state on
 * the first conflict; finalizes (moves the branch ref, restores the working tree, clears
 * index + state) when the todo list drains.
 */
function replayNext(fs: VirtualFS, root: string, state: GitRebaseState): { fs: VirtualFS; output: string } {
  while (state.todo.length > 0) {
    const hash = state.todo[0];
    const commit = readCommit(fs, root, hash);
    if (!commit) { state.todo.shift(); continue; }

    const { tree, conflictFiles } = mergeCommitOnto(fs, root, commit, state.onto);

    if (conflictFiles.length > 0) {
      const removable = trackedUnion(fs, root, state.onto, hash, commit.parent ?? "");
      fs = writeTreeToWorkingDir(fs, root, tree, removable);
      state.current = hash;
      state.conflictFiles = conflictFiles;
      fs = writeRebaseState(fs, root, state);
      const lines: string[] = [];
      for (const f of conflictFiles) {
        lines.push(`Auto-merging ${f}`);
        lines.push(`CONFLICT (content): Merge conflict in ${f}`);
      }
      lines.push(`error: could not apply ${hash.slice(0, 7)}... ${commit.message.split("\n")[0]}`);
      lines.push(`hint: Resolve all conflicts manually, mark them as resolved with`);
      lines.push(`hint: "git add <conflicted_files>", then run "git rebase --continue".`);
      return { fs, output: lines.join("\n") };
    }

    fs = commitReplayed(fs, root, state, commit, tree);
  }
  fs = finalizeRebase(fs, root, state);
  return { fs, output: `Successfully rebased and updated refs/heads/${state.originalBranch}.` };
}

/** Write a replayed commit onto `state.onto`, advance onto, and pop the todo head. */
function commitReplayed(
  fs: VirtualFS, root: string, state: GitRebaseState, original: GitCommit, tree: Record<string, string>,
): VirtualFS {
  const newHash = shortHash(`rebase${original.message}${original.timestamp}${state.onto}${JSON.stringify(tree)}`);
  const replayed: GitCommit = {
    hash: newHash, parent: state.onto, message: original.message,
    author: original.author, timestamp: original.timestamp, tree,
  };
  fs = writeOrFail(fs, `${root}/.git/objects/${newHash}.json`, JSON.stringify(replayed));
  state.onto = newHash;
  state.todo.shift();
  state.current = null;
  state.conflictFiles = [];
  return fs;
}

export function gitRebase(fs: VirtualFS, root: string, upstream: string | undefined): { fs: VirtualFS; output: string; error?: string } {
  if (readRebaseState(fs, root)) {
    return { fs, output: "", error: 'fatal: It seems that there is already a rebase in progress.\nUse "git rebase (--continue | --abort)".' };
  }
  if (readMergeState(fs, root)) {
    return { fs, output: "", error: MERGE_IN_PROGRESS };
  }
  if (!upstream) {
    return { fs, output: "", error: "fatal: invalid upstream (no upstream specified)" };
  }
  const branch = getCurrentBranch(readHead(fs, root));
  if (!branch) {
    return { fs, output: "", error: "fatal: It looks like 'git rebase' is being run with a detached HEAD." };
  }
  const upstreamTip = fs.readFile(`${root}/.git/refs/heads/${upstream}`).content?.trim();
  if (!upstreamTip) {
    return { fs, output: "", error: `fatal: invalid upstream '${upstream}'` };
  }
  const status = gitStatus(fs, root);
  if (status.staged.length > 0 || status.unstaged.length > 0) {
    return { fs, output: "", error: "error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them." };
  }
  const branchTip = resolveHead(fs, root);
  if (!branchTip) {
    return { fs, output: "", error: "fatal: no commits on current branch" };
  }

  // Upstream already merged in → nothing to do.
  if (ancestorSet(fs, root, branchTip).has(upstreamTip)) {
    return { fs, output: `Current branch ${branch} is up to date.` };
  }

  const toReplay = commitsToReplay(fs, root, upstreamTip, branchTip);
  if (toReplay.length === 0) {
    // Branch is strictly behind upstream → fast-forward.
    fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${branch}`, upstreamTip);
    const finalTree = readCommit(fs, root, upstreamTip)?.tree ?? {};
    fs = writeTreeToWorkingDir(fs, root, finalTree, trackedUnion(fs, root, branchTip, upstreamTip));
    return { fs, output: `Successfully rebased and updated refs/heads/${branch}.` };
  }

  const state: GitRebaseState = {
    onto: upstreamTip,
    originalBranch: branch,
    originalHead: branchTip,
    todo: toReplay.map((c) => c.hash),
    current: null,
    conflictFiles: [],
  };
  return replayNext(fs, root, state);
}

export function gitRebaseContinue(fs: VirtualFS, root: string): { fs: VirtualFS; output: string; error?: string } {
  const state = readRebaseState(fs, root);
  if (!state) {
    return { fs, output: "", error: "fatal: no rebase in progress?" };
  }

  if (state.current) {
    const index = readIndex(fs, root);
    for (const f of state.conflictFiles) {
      const staged = f in index.staged;
      const node = fs.getNode(`${root}/${f}`);
      const working = node && isFile(node) ? node.content : "";
      if (!staged || hasConflictMarkers(working) || hasConflictMarkers(index.staged[f] ?? "")) {
        return { fs, output: "", error: "error: you must edit all merge conflicts and then mark them as resolved using git add" };
      }
    }

    const commit = readCommit(fs, root, state.current);
    if (!commit) {
      return { fs, output: "", error: `fatal: could not read commit ${state.current}` };
    }
    // Recompute the clean merge, then overlay the staged resolutions for conflict files.
    const { tree } = mergeCommitOnto(fs, root, commit, state.onto);
    for (const f of state.conflictFiles) {
      tree[f] = index.staged[f];
    }
    fs = commitReplayed(fs, root, state, commit, tree);
    fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));
  }

  return replayNext(fs, root, state);
}

export function gitRebaseAbort(fs: VirtualFS, root: string): { fs: VirtualFS; output: string; error?: string } {
  const state = readRebaseState(fs, root);
  if (!state) {
    return { fs, output: "", error: "fatal: no rebase in progress?" };
  }
  fs = writeRefOrFail(fs, `${root}/.git/refs/heads/${state.originalBranch}`, state.originalHead);
  fs = writeOrFail(fs, `${root}/.git/HEAD`, `ref: refs/heads/${state.originalBranch}`);
  const origTree = readCommit(fs, root, state.originalHead)?.tree ?? {};
  fs = writeTreeToWorkingDir(fs, root, origTree, trackedUnion(fs, root, state.originalHead, state.onto));
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));
  fs = clearRebaseState(fs, root);
  return { fs, output: "" };
}

// ── git merge ────────────────────────────────────────────────────────

/**
 * Refusal shared by every operation that would strand a conflicted merge. Real git
 * spells it MERGE_HEAD; the sim's equivalent is `.git/merge-state.json`.
 */
export const MERGE_IN_PROGRESS = "fatal: You have not concluded your merge (MERGE_HEAD exists).";

function writeMergeState(fs: VirtualFS, root: string, state: GitMergeState): VirtualFS {
  return writeOrFail(fs, `${root}/.git/merge-state.json`, JSON.stringify(state));
}

function clearMergeState(fs: VirtualFS, root: string): VirtualFS {
  const path = `${root}/.git/merge-state.json`;
  return fs.getNode(path) ? removeOrFail(fs, path) : fs;
}

/**
 * Three-way merge of two commit trees against their base. Unlike `mergeCommitOnto`
 * (which is rebase-shaped: "theirs" is always a replayed commit and its own parent is
 * the base), both sides here are arbitrary commits and the base is the merge base.
 * `theirsLabel` is the revision the player typed, so it lands in the `>>>>>>>` marker.
 */
function mergeTrees(
  fs: VirtualFS, root: string, baseHash: string | null, oursHash: string, theirsHash: string, theirsLabel: string,
): { tree: Record<string, string>; conflictFiles: string[] } {
  const baseTree = baseHash ? (readCommit(fs, root, baseHash)?.tree ?? {}) : {};
  const oursTree = readCommit(fs, root, oursHash)?.tree ?? {};
  const theirsTree = readCommit(fs, root, theirsHash)?.tree ?? {};

  const allPaths = [...new Set([...Object.keys(baseTree), ...Object.keys(oursTree), ...Object.keys(theirsTree)])].sort();
  const tree: Record<string, string> = {};
  const conflictFiles: string[] = [];
  for (const path of allPaths) {
    const m = threeWayMergeFile(baseTree[path], oursTree[path], theirsTree[path], theirsLabel);
    if (m.conflict) {
      conflictFiles.push(path);
      tree[path] = m.content as string;
    } else if (m.content !== undefined) {
      tree[path] = m.content;
    }
  }
  return { tree, conflictFiles };
}

/**
 * Paths with uncommitted work that landing `newTree` would clobber. Only paths the
 * merge actually changes relative to HEAD count — a dirty file the merge leaves alone
 * is none of its business, which is why `newTree[p] !== headTree[p]` gates the check.
 */
function overwriteCollisions(
  fs: VirtualFS, root: string, headTree: Record<string, string>, newTree: Record<string, string>,
): string[] {
  const status = gitStatus(fs, root);
  const dirty = new Set([
    ...status.staged.map((s) => s.path),
    ...status.unstaged.map((u) => u.path),
    ...status.untracked,
  ]);
  return [...dirty]
    .filter((p) => p in newTree && newTree[p] !== headTree[p] && newTree[p] !== fs.readFile(`${root}/${p}`).content)
    .sort();
}

function overwriteRefusal(collisions: string[]): string {
  return (
    `error: Your local changes to the following files would be overwritten by merge:\n` +
    `${collisions.map((p) => `\t${p}`).join("\n")}\n` +
    `Please commit your changes or stash them before you merge.`
  );
}

/** Point the current branch — or raw HEAD when detached — at `hash`. */
function moveHeadTo(fs: VirtualFS, root: string, hash: string): VirtualFS {
  const branch = getCurrentBranch(readHead(fs, root));
  return branch
    ? writeRefOrFail(fs, `${root}/.git/refs/heads/${branch}`, hash)
    : writeOrFail(fs, `${root}/.git/HEAD`, hash);
}

/** Story contract: one event per successful merge, keyed on the revision the player typed. */
function mergeEvents(targetLabel: string): { type: "command_executed"; detail: string }[] {
  return [{ type: "command_executed", detail: `git_merge_${targetLabel}` }];
}

/**
 * The message real git prepares for a merge commit. `git merge --continue` uses it
 * verbatim (we have no editor to open); `git commit -m` overrides it with the
 * player's own message, as real git does.
 */
function mergeMessageFor(fs: VirtualFS, root: string, target: string): string {
  if (fs.readFile(`${root}/.git/refs/heads/${target}`).content) return `Merge branch '${target}'`;
  if (target.includes("/") && fs.readFile(`${root}/.git/refs/remotes/${target}`).content) {
    return `Merge remote-tracking branch '${target}'`;
  }
  return `Merge commit '${target}'`;
}

export interface GitMergeResult {
  fs: VirtualFS;
  output: string;
  error?: string;
  /** Set when the merge stopped on conflicts — the caller exits 1 with `output` on stdout. */
  conflict?: boolean;
  triggerEvents?: { type: "command_executed"; detail: string }[];
}

/**
 * `git merge <rev>`. Fast-forwards when HEAD is an ancestor of the target, otherwise
 * builds a true merge commit with `parent2` set. Conflicts stop the merge and persist
 * `GitMergeState`; the player resolves, stages, and concludes with `git commit -m` or
 * `git merge --continue`, or backs out with `git merge --abort`.
 *
 * Detached HEAD is allowed: both the ff and the commit path move raw HEAD.
 */
export function gitMerge(
  fs: VirtualFS, root: string, target: string | undefined, author: string, timestamp: number,
): GitMergeResult {
  if (readRebaseState(fs, root)) {
    return { fs, output: "", error: 'fatal: It seems that there is already a rebase in progress.\nUse "git rebase (--continue | --abort)".' };
  }
  if (readMergeState(fs, root)) {
    return { fs, output: "", error: MERGE_IN_PROGRESS };
  }
  if (!target) {
    return { fs, output: "", error: "fatal: No commit specified and merge.defaultToUpstream not set." };
  }

  const headHash = resolveHead(fs, root);
  const headCommit = headHash ? readCommit(fs, root, headHash) : null;
  if (!headHash || !headCommit) {
    return { fs, output: "", error: `merge: ${target} - not something we can merge` };
  }

  const targetHash = resolveRef(fs, root, target);
  const targetCommit = targetHash ? readCommit(fs, root, targetHash) : null;
  if (!targetHash || !targetCommit) {
    return { fs, output: "", error: `merge: ${target} - not something we can merge` };
  }

  // Target already reachable from HEAD (including "merge the branch I'm on").
  if (targetHash === headHash || ancestorSet(fs, root, headHash).has(targetHash)) {
    return { fs, output: "Already up to date." };
  }

  const headTree = headCommit.tree;

  // Fast-forward: nothing of ours to preserve, so the target tree lands as-is.
  if (ancestorSet(fs, root, targetHash).has(headHash)) {
    const collisions = overwriteCollisions(fs, root, headTree, targetCommit.tree);
    if (collisions.length > 0) {
      return { fs, output: "", error: overwriteRefusal(collisions) };
    }
    fs = moveHeadTo(fs, root, targetHash);
    fs = writeMergeToWorkingDir(fs, root, headTree, targetCommit.tree);
    fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));
    return {
      fs,
      output: [
        `Updating ${headHash.slice(0, 7)}..${targetHash.slice(0, 7)}`,
        "Fast-forward",
        ...formatDiffStat(headTree, targetCommit.tree),
      ].join("\n"),
      triggerEvents: mergeEvents(target),
    };
  }

  const base = mergeBase(fs, root, headHash, targetHash);
  const { tree, conflictFiles } = mergeTrees(fs, root, base, headHash, targetHash, target);

  const collisions = overwriteCollisions(fs, root, headTree, tree);
  if (collisions.length > 0) {
    return { fs, output: "", error: overwriteRefusal(collisions) };
  }

  fs = writeMergeToWorkingDir(fs, root, headTree, tree);

  if (conflictFiles.length > 0) {
    fs = writeMergeState(fs, root, {
      targetHash,
      targetLabel: target,
      message: mergeMessageFor(fs, root, target),
      conflictFiles,
    });
    const lines: string[] = [];
    for (const f of conflictFiles) {
      lines.push(`Auto-merging ${f}`);
      lines.push(`CONFLICT (content): Merge conflict in ${f}`);
    }
    lines.push("Automatic merge failed; fix conflicts and then commit the result.");
    return { fs, output: lines.join("\n"), conflict: true };
  }

  const message = mergeMessageFor(fs, root, target);
  fs = writeMergeCommit(fs, root, { message, author, timestamp, parent: headHash, parent2: targetHash, tree });
  return {
    fs,
    output: ["Merge made by the 'ort' strategy.", ...formatDiffStat(headTree, tree)].join("\n"),
    triggerEvents: mergeEvents(target),
  };
}

/** Write a merge commit object, move HEAD onto it, and clear the index. */
function writeMergeCommit(
  fs: VirtualFS,
  root: string,
  c: { message: string; author: string; timestamp: number; parent: string; parent2: string; tree: Record<string, string> },
): VirtualFS {
  const hash = shortHash(c.message + c.timestamp + c.parent + c.parent2 + JSON.stringify(c.tree));
  const commit: GitCommit = {
    hash, parent: c.parent, parent2: c.parent2, message: c.message,
    author: c.author, timestamp: c.timestamp, tree: c.tree,
  };
  fs = writeOrFail(fs, `${root}/.git/objects/${hash}.json`, JSON.stringify(commit));
  fs = moveHeadTo(fs, root, hash);
  return writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));
}

/**
 * `git merge --continue`: same validation as the concluding `git commit`, but with the
 * message real git would have opened an editor on. Delegates so there is exactly one
 * place that turns merge state into a merge commit.
 */
export function gitMergeContinue(
  fs: VirtualFS, root: string, author: string, timestamp: number,
): { fs: VirtualFS; output: string; error?: string; triggerEvents?: { type: "command_executed"; detail: string }[] } {
  const state = readMergeState(fs, root);
  if (!state) {
    return { fs, output: "", error: "fatal: There is no merge in progress (MERGE_HEAD missing)." };
  }
  return gitCommit(fs, root, state.message, author, false, false, timestamp);
}

/** `git merge --abort`: restore HEAD's tree, drop the index and the merge state. */
export function gitMergeAbort(fs: VirtualFS, root: string): { fs: VirtualFS; output: string; error?: string } {
  const state = readMergeState(fs, root);
  if (!state) {
    return { fs, output: "", error: "fatal: There is no merge to abort (MERGE_HEAD missing)." };
  }
  const headHash = resolveHead(fs, root);
  const headTree = headHash ? (readCommit(fs, root, headHash)?.tree ?? {}) : {};
  fs = writeTreeToWorkingDir(fs, root, headTree, trackedUnion(fs, root, headHash ?? "", state.targetHash));
  fs = writeOrFail(fs, `${root}/.git/index.json`, JSON.stringify({ staged: {}, deleted: [] }));
  fs = clearMergeState(fs, root);
  return { fs, output: "" };
}

/**
 * Every conflict file must be staged and marker-free before a merge can be concluded
 * (the same bar `git rebase --continue` sets). Returns real git's refusal, or null.
 */
function unresolvedConflictError(fs: VirtualFS, root: string, state: GitMergeState, index: GitIndex): string | null {
  for (const f of state.conflictFiles) {
    const node = fs.getNode(`${root}/${f}`);
    const working = node && isFile(node) ? node.content : "";
    if (!(f in index.staged) || hasConflictMarkers(working) || hasConflictMarkers(index.staged[f] ?? "")) {
      return "error: you must edit all merge conflicts and then mark them as resolved using git add";
    }
  }
  return null;
}
