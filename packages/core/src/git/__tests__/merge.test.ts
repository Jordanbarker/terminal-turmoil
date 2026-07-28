import { describe, it, expect } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode, isFile } from "@tt/core/filesystem/types";
import {
  gitInit, gitAdd, gitCommit, gitCheckout, createBranch, deleteBranch,
  gitMerge, gitMergeContinue, gitMergeAbort,
  gitRebase, gitRebaseContinue, gitReset, gitStashSave, gitPull,
  getCommitLog, gitStatus, resolveHead, readCommit, readIndex,
  readMergeState, readRebaseState, hasConflictMarkers,
} from "../repo";
import { formatStatus } from "../output";

const AUTHOR = "player <player@test.local>";
const TS = new Date(2026, 1, 23, 8, 30, 0).getTime();
const ROOT = "/home/player";

function makeFs(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory", name: "/", permissions: "rwxr-xr-x", hidden: false,
    children: {
      home: {
        type: "directory", name: "home", permissions: "rwxr-xr-x", hidden: false,
        children: {
          player: { type: "directory", name: "player", permissions: "rwxr-xr-x", hidden: false, children: {} },
        },
      },
    },
  };
  return new VirtualFS(root, ROOT, ROOT);
}

function write(fs: VirtualFS, relPath: string, content: string): VirtualFS {
  const r = fs.writeFile(`${ROOT}/${relPath}`, content);
  if (!r.fs) throw new Error(r.error);
  return r.fs;
}

function read(fs: VirtualFS, relPath: string): string {
  const node = fs.getNode(`${ROOT}/${relPath}`);
  return node && isFile(node) ? node.content : "";
}

function commitFile(fs: VirtualFS, relPath: string, content: string, message: string): VirtualFS {
  fs = write(fs, relPath, content);
  fs = gitAdd(fs, ROOT, ROOT, [relPath], false).fs;
  const r = gitCommit(fs, ROOT, message, AUTHOR, false, false, TS);
  if (r.error) throw new Error(r.error);
  return r.fs;
}

function checkout(fs: VirtualFS, target: string, create = false): VirtualFS {
  const r = gitCheckout(fs, ROOT, target, create);
  if (r.error) throw new Error(r.error);
  return r.fs;
}

function merge(fs: VirtualFS, target: string | undefined) {
  return gitMerge(fs, ROOT, target, AUTHOR, TS);
}

const messages = (fs: VirtualFS) => getCommitLog(fs, ROOT).map((c) => c.message);
const head = (fs: VirtualFS) => resolveHead(fs, ROOT)!;
const branchTip = (fs: VirtualFS, name: string) => fs.readFile(`${ROOT}/.git/refs/heads/${name}`).content!.trim();

/** main: one commit. feature: branched off it, one extra commit touching a different file. */
function setupDiverged(): VirtualFS {
  let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
  fs = commitFile(fs, "base.txt", "base\n", "base");
  fs = createBranch(fs, ROOT, "feature").fs;
  fs = checkout(fs, "feature");
  fs = commitFile(fs, "feature.txt", "from feature\n", "add feature file");
  fs = checkout(fs, "main");
  fs = commitFile(fs, "main.txt", "from main", "add main file");
  return fs;
}

/** main and feature both edit the same line of config.txt off a shared base. */
function setupConflict(): VirtualFS {
  let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
  fs = commitFile(fs, "config.txt", "one\nbase\nthree\n", "base");
  fs = createBranch(fs, ROOT, "feature").fs;
  fs = checkout(fs, "feature");
  fs = commitFile(fs, "config.txt", "one\nfeature\nthree\n", "feature change");
  fs = checkout(fs, "main");
  fs = commitFile(fs, "config.txt", "one\nmain\nthree\n", "main change");
  return fs;
}

describe("git merge — already up to date", () => {
  it("refuses to merge the branch it is on", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    const res = merge(fs, "main");
    expect(res.error).toBeUndefined();
    expect(res.output).toBe("Already up to date.");
  });

  it("reports up to date when the target is an ancestor of HEAD", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    fs = createBranch(fs, ROOT, "old").fs;
    fs = commitFile(fs, "a.txt", "v2\n", "second");
    expect(merge(fs, "old").output).toBe("Already up to date.");
  });

  it("reports up to date for a branch already merged in (ancestorSet spans parent2)", () => {
    let fs = setupDiverged();
    fs = merge(fs, "feature").fs;
    expect(merge(fs, "feature").output).toBe("Already up to date.");
  });
});

describe("git merge — fast-forward", () => {
  it("moves the branch ref, updates the tree, and prints the ff block", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    const baseHash = head(fs);
    fs = createBranch(fs, ROOT, "feature").fs;
    fs = checkout(fs, "feature");
    fs = commitFile(fs, "a.txt", "v2\n", "advance");
    const featureHash = head(fs);
    fs = checkout(fs, "main");

    const res = merge(fs, "feature");
    fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(res.conflict).toBeUndefined();
    expect(res.output.split("\n").slice(0, 2)).toEqual([
      `Updating ${baseHash.slice(0, 7)}..${featureHash.slice(0, 7)}`,
      "Fast-forward",
    ]);
    expect(res.output).toContain("1 file changed");
    expect(branchTip(fs, "main")).toBe(featureHash);
    expect(read(fs, "a.txt")).toBe("v2\n");
    // A fast-forward adds no commit — it only relabels an existing one.
    expect(readCommit(fs, ROOT, featureHash)!.parent2).toBeUndefined();
    expect(res.triggerEvents).toEqual([{ type: "command_executed", detail: "git_merge_feature" }]);
  });

  it("deletes files the target dropped and clears the index", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "gone.txt", "bye\n", "base");
    fs = createBranch(fs, ROOT, "feature").fs;
    fs = checkout(fs, "feature");
    fs = fs.removeNode(`${ROOT}/gone.txt`).fs!;
    fs = gitAdd(fs, ROOT, ROOT, ["gone.txt"], false).fs;
    fs = gitCommit(fs, ROOT, "drop gone", AUTHOR, false, false, TS).fs;
    fs = checkout(fs, "main");

    fs = merge(fs, "feature").fs;
    expect(fs.getNode(`${ROOT}/gone.txt`)).toBeNull();
    expect(readIndex(fs, ROOT)).toEqual({ staged: {}, deleted: [] });
  });
});

describe("git merge — clean true merge", () => {
  it("creates a merge commit with both parents", () => {
    let fs = setupDiverged();
    const mainHash = head(fs);
    const featureHash = branchTip(fs, "feature");

    const res = merge(fs, "feature");
    fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(res.output.split("\n")[0]).toBe("Merge made by the 'ort' strategy.");
    expect(res.output).toContain("1 file changed");
    expect(res.triggerEvents).toEqual([{ type: "command_executed", detail: "git_merge_feature" }]);

    const mergeCommit = readCommit(fs, ROOT, head(fs))!;
    expect(mergeCommit.message).toBe("Merge branch 'feature'");
    expect(mergeCommit.parent).toBe(mainHash);
    expect(mergeCommit.parent2).toBe(featureHash);
    // Both sides' files are present in the tree and on disk.
    expect(Object.keys(mergeCommit.tree).sort()).toEqual(["base.txt", "feature.txt", "main.txt"]);
    expect(read(fs, "feature.txt")).toBe("from feature\n");
    expect(read(fs, "main.txt")).toBe("from main");
    expect(readIndex(fs, ROOT)).toEqual({ staged: {}, deleted: [] });
  });

  it("keeps git log first-parent, so the merged side is not interleaved", () => {
    let fs = setupDiverged();
    fs = merge(fs, "feature").fs;
    expect(messages(fs)).toEqual(["Merge branch 'feature'", "add main file", "base"]);
  });

  it("lets `git branch -d` drop the merged branch without -D", () => {
    let fs = setupDiverged();
    // Before the merge the branch has unique work, so -d must refuse.
    expect(deleteBranch(fs, ROOT, "feature", false).error).toContain("not fully merged");
    fs = merge(fs, "feature").fs;
    const res = deleteBranch(fs, ROOT, "feature", false);
    expect(res.error).toBeUndefined();
    expect(res.output).toContain("Deleted branch feature");
  });

  it("names a sha target a commit merge, and a remote-tracking ref a remote merge", () => {
    let fs = setupDiverged();
    const featureHash = branchTip(fs, "feature");
    const bySha = merge(fs, featureHash);
    expect(readCommit(bySha.fs, ROOT, head(bySha.fs))!.message).toBe(`Merge commit '${featureHash}'`);
    expect(bySha.triggerEvents).toEqual([{ type: "command_executed", detail: `git_merge_${featureHash}` }]);

    fs = fs.writeFile(`${ROOT}/.git/refs/remotes/origin/feature`, featureHash).fs!;
    const byRemote = merge(fs, "origin/feature");
    expect(readCommit(byRemote.fs, ROOT, head(byRemote.fs))!.message)
      .toBe("Merge remote-tracking branch 'origin/feature'");
  });

  it("merges into a detached HEAD by moving the raw HEAD ref", () => {
    let fs = setupDiverged();
    const mainHash = head(fs);
    fs = checkout(fs, mainHash);
    expect(gitStatus(fs, ROOT).branch).toBeNull();

    const res = merge(fs, "feature");
    fs = res.fs;
    expect(res.error).toBeUndefined();
    // HEAD holds the new merge commit directly; main stayed put.
    const mergeHash = fs.readFile(`${ROOT}/.git/HEAD`).content!.trim();
    expect(mergeHash).not.toBe(mainHash);
    expect(readCommit(fs, ROOT, mergeHash)!.parent2).toBe(branchTip(fs, "feature"));
    expect(branchTip(fs, "main")).toBe(mainHash);
  });
});

describe("git merge — conflicts", () => {
  it("writes markers, persists merge state, and exits with conflict set", () => {
    let fs = setupConflict();
    const res = merge(fs, "feature");
    fs = res.fs;

    expect(res.error).toBeUndefined();
    expect(res.conflict).toBe(true);
    expect(res.triggerEvents).toBeUndefined();
    expect(res.output).toBe(
      "Auto-merging config.txt\n" +
      "CONFLICT (content): Merge conflict in config.txt\n" +
      "Automatic merge failed; fix conflicts and then commit the result.",
    );

    const working = read(fs, "config.txt");
    expect(hasConflictMarkers(working)).toBe(true);
    // The marker names the revision the player typed, as real git does.
    expect(working).toContain(">>>>>>> feature");
    expect(working).toContain("<<<<<<< HEAD");

    const state = readMergeState(fs, ROOT)!;
    expect(state.targetLabel).toBe("feature");
    expect(state.targetHash).toBe(branchTip(fs, "feature"));
    expect(state.message).toBe("Merge branch 'feature'");
    expect(state.conflictFiles).toEqual(["config.txt"]);
    // HEAD does not move until the merge is concluded.
    expect(head(fs)).toBe(branchTip(fs, "main"));
  });

  it("reports unmerged paths in status without replacing the branch header", () => {
    const fs = merge(setupConflict(), "feature").fs;
    const status = gitStatus(fs, ROOT);
    expect(status.branch).toBe("main");
    expect(status.merge).toEqual({ target: "feature", unmerged: ["config.txt"] });
    expect(status.unstaged).toEqual([]);

    const rendered = formatStatus(status, false, true);
    expect(rendered).toContain("On branch main");
    expect(rendered).toContain("You have unmerged paths.");
    expect(rendered).toContain('  (use "git merge --abort" to abort the merge)');
    expect(rendered).toContain("Unmerged paths:");
    expect(rendered).toContain("\tboth modified:   config.txt");
    expect(rendered).not.toContain("working tree clean");
    expect(formatStatus(status, true, true)).toBe("UU config.txt");
  });

  it("switches the status hint once every conflict is staged", () => {
    let fs = merge(setupConflict(), "feature").fs;
    fs = write(fs, "config.txt", "one\nresolved\nthree\n");
    fs = gitAdd(fs, ROOT, ROOT, ["config.txt"], false).fs;

    const status = gitStatus(fs, ROOT);
    expect(status.merge).toEqual({ target: "feature", unmerged: [] });
    const rendered = formatStatus(status, false, true);
    expect(rendered).toContain("All conflicts fixed but you are still merging.");
    expect(rendered).toContain('  (use "git commit" to conclude merge)');
    expect(rendered).not.toContain("Unmerged paths:");
  });

  it("--abort restores HEAD's tree and clears the state", () => {
    const clean = setupConflict();
    let fs = merge(clean, "feature").fs;

    const res = gitMergeAbort(fs, ROOT);
    fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(res.output).toBe("");
    expect(readMergeState(fs, ROOT)).toBeNull();
    expect(read(fs, "config.txt")).toBe("one\nmain\nthree\n");
    expect(readIndex(fs, ROOT)).toEqual({ staged: {}, deleted: [] });
    expect(gitStatus(fs, ROOT).merge).toBeUndefined();
    expect(head(fs)).toBe(head(clean));
  });

  it("--abort without a merge in progress is an error", () => {
    expect(gitMergeAbort(setupConflict(), ROOT).error).toBe(
      "fatal: There is no merge to abort (MERGE_HEAD missing).",
    );
  });

  it("refuses to conclude while a conflict is unstaged or still marked up", () => {
    let fs = merge(setupConflict(), "feature").fs;
    const unstaged = "error: you must edit all merge conflicts and then mark them as resolved using git add";

    expect(gitCommit(fs, ROOT, "merge", AUTHOR, false, false, TS).error).toBe(unstaged);

    // Staging the file with its markers intact is not a resolution.
    fs = gitAdd(fs, ROOT, ROOT, ["config.txt"], false).fs;
    expect(gitCommit(fs, ROOT, "merge", AUTHOR, false, false, TS).error).toBe(unstaged);
  });

  it("concludes via `git commit -m`, keeping the clean side of the merge", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "config.txt", "one\nbase\nthree\n", "base");
    fs = createBranch(fs, ROOT, "feature").fs;
    fs = checkout(fs, "feature");
    fs = write(fs, "config.txt", "one\nfeature\nthree\n");
    fs = write(fs, "untouched.txt", "only feature added this\n");
    fs = gitAdd(fs, ROOT, ROOT, ["."], false).fs;
    fs = gitCommit(fs, ROOT, "feature change", AUTHOR, false, false, TS).fs;
    const featureHash = head(fs);
    fs = checkout(fs, "main");
    fs = commitFile(fs, "config.txt", "one\nmain\nthree\n", "main change");
    const mainHash = head(fs);

    fs = merge(fs, "feature").fs;
    fs = write(fs, "config.txt", "one\nresolved\nthree\n");
    fs = gitAdd(fs, ROOT, ROOT, ["config.txt"], false).fs;

    const res = gitCommit(fs, ROOT, "merge feature", AUTHOR, false, false, TS);
    fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(res.output).toBe(`[main ${head(fs)}] merge feature`);
    expect(res.triggerEvents).toEqual([{ type: "command_executed", detail: "git_merge_feature" }]);

    const commit = readCommit(fs, ROOT, head(fs))!;
    expect(commit.parent).toBe(mainHash);
    expect(commit.parent2).toBe(featureHash);
    expect(commit.tree["config.txt"]).toBe("one\nresolved\nthree\n");
    // The auto-merged file was never staged, so it can only come from the rebuilt tree.
    expect(commit.tree["untouched.txt"]).toBe("only feature added this\n");
    expect(readMergeState(fs, ROOT)).toBeNull();
    expect(gitStatus(fs, ROOT).merge).toBeUndefined();
  });

  it("stages a conflict resolved in favour of ours, even though it equals HEAD", () => {
    let fs = merge(setupConflict(), "feature").fs;
    // Discarding their change entirely leaves the file identical to HEAD; `git add`
    // must still record it, or the merge could never be concluded.
    fs = write(fs, "config.txt", "one\nmain\nthree\n");
    fs = gitAdd(fs, ROOT, ROOT, ["config.txt"], false).fs;
    expect(readIndex(fs, ROOT).staged["config.txt"]).toBe("one\nmain\nthree\n");
    expect(gitStatus(fs, ROOT).merge).toEqual({ target: "feature", unmerged: [] });

    const res = gitMergeContinue(fs, ROOT, AUTHOR, TS);
    expect(res.error).toBeUndefined();
    expect(readCommit(res.fs, ROOT, head(res.fs))!.tree["config.txt"]).toBe("one\nmain\nthree\n");
  });

  it("--continue concludes with the prepared merge message", () => {
    let fs = merge(setupConflict(), "feature").fs;
    fs = write(fs, "config.txt", "one\nresolved\nthree\n");
    fs = gitAdd(fs, ROOT, ROOT, ["config.txt"], false).fs;

    const res = gitMergeContinue(fs, ROOT, AUTHOR, TS);
    fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(messages(fs)[0]).toBe("Merge branch 'feature'");
    expect(readCommit(fs, ROOT, head(fs))!.parent2).toBe(branchTip(fs, "feature"));
    expect(res.triggerEvents).toEqual([{ type: "command_executed", detail: "git_merge_feature" }]);
    expect(readMergeState(fs, ROOT)).toBeNull();
  });

  it("--continue enforces the same resolution bar as commit", () => {
    const fs = merge(setupConflict(), "feature").fs;
    expect(gitMergeContinue(fs, ROOT, AUTHOR, TS).error).toContain("you must edit all merge conflicts");
    expect(gitMergeContinue(setupConflict(), ROOT, AUTHOR, TS).error).toBe(
      "fatal: There is no merge in progress (MERGE_HEAD missing).",
    );
  });

  it("aborts and redoes the same merge cleanly", () => {
    let fs = merge(setupConflict(), "feature").fs;
    fs = gitMergeAbort(fs, ROOT).fs;
    const redo = merge(fs, "feature");
    expect(redo.conflict).toBe(true);
    expect(readMergeState(redo.fs, ROOT)!.conflictFiles).toEqual(["config.txt"]);
  });
});

describe("git merge — refusals and guards", () => {
  it("rejects a revision it cannot resolve", () => {
    const fs = setupDiverged();
    expect(merge(fs, "nope").error).toBe("merge: nope - not something we can merge");
    expect(merge(fs, undefined).error).toBe(
      "fatal: No commit specified and merge.defaultToUpstream not set.",
    );
  });

  it("refuses when an incoming change would overwrite uncommitted work", () => {
    let fs = setupConflict();
    fs = write(fs, "config.txt", "one\nlocal scribble\nthree\n");
    const res = merge(fs, "feature");
    expect(res.error).toBe(
      "error: Your local changes to the following files would be overwritten by merge:\n" +
      "\tconfig.txt\n" +
      "Please commit your changes or stash them before you merge.",
    );
    expect(readMergeState(res.fs, ROOT)).toBeNull();
  });

  it("allows a merge when the dirty file is not one the merge touches, and keeps the edit", () => {
    let fs = setupDiverged();
    fs = write(fs, "scratch.txt", "untracked scratch\n");
    fs = write(fs, "main.txt", "locally edited");
    const res = merge(fs, "feature");
    expect(res.error).toBeUndefined();
    expect(read(res.fs, "main.txt")).toBe("locally edited");
    expect(read(res.fs, "scratch.txt")).toBe("untracked scratch\n");
  });

  it("keeps a staged edit to an untouched file in the working tree", () => {
    let fs = setupDiverged();
    fs = write(fs, "main.txt", "staged edit");
    fs = gitAdd(fs, ROOT, ROOT, ["main.txt"], false).fs;
    const res = merge(fs, "feature");
    expect(res.error).toBeUndefined();
    // The merge commit clears the index, so it survives as an unstaged change.
    expect(read(res.fs, "main.txt")).toBe("staged edit");
    expect(gitStatus(res.fs, ROOT).unstaged.map((u) => u.path)).toContain("main.txt");
  });

  it("preserves an uncommitted edit across a fast-forward that ignores the file", () => {
    let fs = gitInit(makeFs(), ROOT, AUTHOR).fs;
    fs = commitFile(fs, "a.txt", "v1\n", "base");
    fs = commitFile(fs, "keep.txt", "kept\n", "add keep");
    fs = createBranch(fs, ROOT, "feature").fs;
    fs = checkout(fs, "feature");
    fs = commitFile(fs, "a.txt", "v2\n", "advance");
    fs = checkout(fs, "main");
    fs = write(fs, "keep.txt", "locally edited\n");

    const res = merge(fs, "feature");
    expect(res.error).toBeUndefined();
    expect(read(res.fs, "keep.txt")).toBe("locally edited\n");
    expect(read(res.fs, "a.txt")).toBe("v2\n");
  });

  it("blocks a rebase while merging, and a merge while rebasing", () => {
    const merging = merge(setupConflict(), "feature").fs;
    const inProgress = "fatal: You have not concluded your merge (MERGE_HEAD exists).";
    expect(gitRebase(merging, ROOT, "feature").error).toBe(inProgress);
    expect(gitReset(merging, ROOT, ROOT, ["HEAD~1"], "hard").error).toBe(inProgress);
    expect(gitCheckout(merging, ROOT, "feature", false).error).toBe(inProgress);
    expect(gitStashSave(merging, ROOT).error).toBe(inProgress);
    expect(gitPull(merging, ROOT, "origin", "main", {}).error).toBe(inProgress);
    expect(gitCommit(merging, ROOT, "x", AUTHOR, true, false, TS).error).toBe(inProgress);

    // The reverse: a conflicted rebase blocks merge.
    let rebasing = checkout(setupConflict(), "feature");
    rebasing = gitRebase(rebasing, ROOT, "main").fs;
    expect(readRebaseState(rebasing, ROOT)).not.toBeNull();
    expect(gitMerge(rebasing, ROOT, "main", AUTHOR, TS).error).toContain("rebase in progress");
  });

  it("refuses a second merge while one is in progress", () => {
    const merging = merge(setupConflict(), "feature").fs;
    expect(merge(merging, "feature").error).toBe(
      "fatal: You have not concluded your merge (MERGE_HEAD exists).",
    );
  });

  it("leaves a rebase's conflict resolution unaffected by the merge path", () => {
    // Regression guard: `gitAdd`/`gitCommit` now branch on merge state, and a rebase
    // must still resolve through rebase state alone.
    let fs = checkout(setupConflict(), "feature");
    fs = gitRebase(fs, ROOT, "main").fs;
    fs = write(fs, "config.txt", "one\nrebased\nthree\n");
    fs = gitAdd(fs, ROOT, ROOT, ["config.txt"], false).fs;
    const res = gitRebaseContinue(fs, ROOT);
    fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(readRebaseState(fs, ROOT)).toBeNull();
    expect(read(fs, "config.txt")).toBe("one\nrebased\nthree\n");
    expect(readCommit(fs, ROOT, head(fs))!.parent2).toBeUndefined();
  });
});
