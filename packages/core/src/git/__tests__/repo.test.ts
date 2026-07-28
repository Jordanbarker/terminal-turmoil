import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import {
  findRepoRoot, shortHash, collectFiles,
  gitInit, gitAdd, gitCommit, gitStatus, getCommitLog,
  listBranches, createBranch, deleteBranch, gitCheckout, gitRestore, gitDiffFiles,
  gitStashSave, gitStashPop, gitStashApply, gitStashDrop, gitStashList, readStash,
  gitRm, gitClone, gitPush, gitPull, gitReset, gitMerge, resolveRef,
  resolveHead, readIndex, readCommit, splitRevsAndPaths,
} from "../repo";
import { formatStatus, formatLog } from "../output";
import { buildSimpleRemote, REMOTE_REPOS } from "../remotes";

const AUTHOR = "player <player@test.local>";
const TEST_TS = new Date(2026, 1, 23, 8, 30, 0).getTime();

function emptyRoot(): DirectoryNode {
  return {
    type: "directory", name: "/", permissions: "rwxr-xr-x", hidden: false,
    children: {
      home: {
        type: "directory", name: "home", permissions: "rwxr-xr-x", hidden: false,
        children: {
          player: {
            type: "directory", name: "player", permissions: "rwxr-xr-x", hidden: false,
            children: {},
          },
        },
      },
    },
  };
}

function makeFs(): VirtualFS {
  return new VirtualFS(emptyRoot(), "/home/player", "/home/player");
}

function initRepo(fs: VirtualFS, cwd = "/home/player"): VirtualFS {
  return gitInit(fs, cwd, AUTHOR).fs;
}

function addAndCommit(fs: VirtualFS, root: string, message: string): VirtualFS {
  const addResult = gitAdd(fs, root, root, ["."], false);
  fs = addResult.fs;
  const commitResult = gitCommit(fs, root, message, AUTHOR, false, false, TEST_TS);
  return commitResult.fs;
}

// ── findRepoRoot ─────────────────────────────────────────────────────

describe("findRepoRoot", () => {
  it("finds repo in current directory", () => {
    const fs = initRepo(makeFs());
    expect(findRepoRoot(fs, "/home/player")).toBe("/home/player");
  });

  it("finds repo in parent directory", () => {
    let fs = initRepo(makeFs());
    fs = fs.makeDirectory("/home/player/subdir").fs!;
    expect(findRepoRoot(fs, "/home/player/subdir")).toBe("/home/player");
  });

  it("returns null when no repo exists", () => {
    expect(findRepoRoot(makeFs(), "/home/player")).toBeNull();
  });
});

// ── shortHash ────────────────────────────────────────────────────────

describe("shortHash", () => {
  it("returns 7-char hex string", () => {
    const h = shortHash("test input");
    expect(h).toMatch(/^[0-9a-f]{7}$/);
  });

  it("is deterministic", () => {
    expect(shortHash("hello")).toBe(shortHash("hello"));
  });

  it("differs for different inputs", () => {
    expect(shortHash("a")).not.toBe(shortHash("b"));
  });
});

// ── git init ─────────────────────────────────────────────────────────

describe("git init", () => {
  it("creates .git directory structure", () => {
    const fs = initRepo(makeFs());
    expect(fs.getNode("/home/player/.git")).toBeTruthy();
    expect(fs.getNode("/home/player/.git/HEAD")).toBeTruthy();
    expect(fs.getNode("/home/player/.git/refs/heads")).toBeTruthy();
    expect(fs.getNode("/home/player/.git/objects")).toBeTruthy();
  });

  it("sets HEAD to main", () => {
    const fs = initRepo(makeFs());
    expect(fs.readFile("/home/player/.git/HEAD").content).toBe("ref: refs/heads/main");
  });

  it("reports reinit for existing repo", () => {
    const fs = initRepo(makeFs());
    const result = gitInit(fs, "/home/player", AUTHOR);
    expect(result.alreadyExisted).toBe(true);
    expect(result.output).toContain("Reinitialized");
  });
});

// ── git add + commit ─────────────────────────────────────────────────

describe("git add and commit", () => {
  it("stages and commits a file", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/hello.txt", "hello world").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["hello.txt"], false).fs;
    const result = gitCommit(fs, "/home/player", "first commit", AUTHOR, false, false, TEST_TS);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("first commit");
    expect(result.output).toContain("1 file changed");
  });

  it("reports exact insertion/deletion counts and mode lines", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/keep.txt", "one\ntwo\nthree\n").fs!;
    fs = fs.writeFile("/home/player/gone.txt", "bye\n").fs!;
    const first = gitCommit(gitAdd(fs, "/home/player", "/home/player", ["."], false).fs,
      "/home/player", "first", AUTHOR, false, false, TEST_TS);
    expect(first.output.split("\n").slice(1)).toEqual([
      " 2 files changed, 4 insertions(+)",
      " create mode 100644 gone.txt",
      " create mode 100644 keep.txt",
    ]);
    fs = first.fs;

    // Replace one line, drop another, add a file, delete a file.
    fs = fs.writeFile("/home/player/keep.txt", "one\nTWO\n").fs!;
    fs = fs.writeFile("/home/player/new.txt", "hi\n").fs!;
    fs = fs.removeNode("/home/player/gone.txt").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", [], true).fs;
    const second = gitCommit(fs, "/home/player", "second", AUTHOR, false, false, TEST_TS);
    expect(second.output.split("\n").slice(1)).toEqual([
      " 3 files changed, 2 insertions(+), 3 deletions(-)",
      " delete mode 100644 gone.txt",
      " create mode 100644 new.txt",
    ]);
  });

  it("counts an emptied file's lines without inventing a phantom one", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "").fs!;
    const first = gitCommit(gitAdd(fs, "/home/player", "/home/player", ["."], false).fs,
      "/home/player", "first", AUTHOR, false, false, TEST_TS);
    expect(first.output).toContain(" 1 file changed");
    expect(first.output).not.toContain("insertion");
    fs = first.fs;

    fs = fs.writeFile("/home/player/a.txt", "now has content\n").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    const second = gitCommit(fs, "/home/player", "second", AUTHOR, false, false, TEST_TS);
    expect(second.output).toContain(" 1 file changed, 1 insertion(+)");
  });

  it("measures --amend against the parent, not the commit it replaces", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "one\n").fs!;
    fs = addAndCommit(fs, "/home/player", "base");
    fs = fs.writeFile("/home/player/a.txt", "one\ntwo\n").fs!;
    fs = addAndCommit(fs, "/home/player", "typo");
    fs = fs.writeFile("/home/player/a.txt", "one\ntwo\nthree\n").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    const amended = gitCommit(fs, "/home/player", "fixed", AUTHOR, true, false, TEST_TS);
    // Two lines added since `base`, not one since `typo`.
    expect(amended.output).toContain(" 1 file changed, 2 insertions(+)");
  });

  it("reports nothing to commit when clean", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "content").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");
    const result = gitCommit(fs, "/home/player", "empty", AUTHOR, false, false, TEST_TS);
    expect(result.output).toContain("nothing to commit");
  });

  it("stages all with git add .", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "aaa").fs!;
    fs = fs.writeFile("/home/player/b.txt", "bbb").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["."], false).fs;
    const result = gitCommit(fs, "/home/player", "two files", AUTHOR, false, false, TEST_TS);
    expect(result.output).toContain("2 files changed");
  });

  it("returns error for nonexistent file", () => {
    const fs = initRepo(makeFs());
    const result = gitAdd(fs, "/home/player", "/home/player", ["missing.txt"], false);
    expect(result.error).toContain("pathspec 'missing.txt' did not match any files");
  });

  it("git add . is scoped to the current directory, not the whole repo", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/root.txt", "at root").fs!;
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/nested.txt", "in sub").fs!;
    // Run `git add .` from within sub/ — only sub/nested.txt should stage.
    fs = gitAdd(fs, "/home/player", "/home/player/sub", ["."], false).fs;
    const index = readIndex(fs, "/home/player");
    expect(index.staged["sub/nested.txt"]).toBe("in sub");
    expect(index.staged["root.txt"]).toBeUndefined();
  });

  it("-A stages the whole repo regardless of cwd", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/root.txt", "at root").fs!;
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/nested.txt", "in sub").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player/sub", [], true).fs;
    const index = readIndex(fs, "/home/player");
    expect(index.staged["sub/nested.txt"]).toBe("in sub");
    expect(index.staged["root.txt"]).toBe("at root");
  });

  it("relative pathspecs resolve against cwd", () => {
    let fs = initRepo(makeFs());
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/nested.txt", "in sub").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player/sub", ["nested.txt"], false).fs;
    const index = readIndex(fs, "/home/player");
    expect(index.staged["sub/nested.txt"]).toBe("in sub");
  });

  it("git add . detects deletions within the current directory only", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/root.txt", "at root").fs!;
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/nested.txt", "in sub").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");
    // Delete both files, then `git add .` from sub/.
    fs = fs.removeNode("/home/player/root.txt").fs!;
    fs = fs.removeNode("/home/player/sub/nested.txt").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player/sub", ["."], false).fs;
    const index = readIndex(fs, "/home/player");
    expect(index.deleted).toContain("sub/nested.txt");
    expect(index.deleted).not.toContain("root.txt");
  });

  it("only stages modified files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "original").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    // Add without modifying
    fs = gitAdd(fs, "/home/player", "/home/player", ["."], false).fs;
    const result = gitCommit(fs, "/home/player", "no changes", AUTHOR, false, false, TEST_TS);
    expect(result.output).toContain("nothing to commit");
  });

  it("commit -a auto-stages modified files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    const result = gitCommit(fs, "/home/player", "auto staged", AUTHOR, false, true, TEST_TS);
    expect(result.output).toContain("auto staged");
    expect(result.error).toBeUndefined();
  });

  it("commit --amend replaces HEAD commit", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "original message");
    // Amend
    const result = gitCommit(fs, "/home/player", "amended message", AUTHOR, true, false, TEST_TS);
    expect(result.output).toContain("amended message");
    fs = result.fs;
    const log = getCommitLog(fs, "/home/player");
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe("amended message");
  });
});

// ── git status ───────────────────────────────────────────────────────

describe("git status", () => {
  it("shows untracked files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/new.txt", "content").fs!;
    const status = gitStatus(fs, "/home/player");
    expect(status.untracked).toContain("new.txt");
  });

  it("shows staged files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "content").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    const status = gitStatus(fs, "/home/player");
    expect(status.staged).toHaveLength(1);
    expect(status.staged[0].status).toBe("new file");
  });

  it("shows modified unstaged files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    const status = gitStatus(fs, "/home/player");
    expect(status.unstaged).toHaveLength(1);
    expect(status.unstaged[0].status).toBe("modified");
  });

  it("shows clean repo", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const status = gitStatus(fs, "/home/player");
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged).toHaveLength(0);
    expect(status.untracked).toHaveLength(0);
  });
});

// ── git log ──────────────────────────────────────────────────────────

describe("git log", () => {
  it("returns commits in reverse chronological order", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "second");
    const log = getCommitLog(fs, "/home/player");
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe("second");
    expect(log[1].message).toBe("first");
  });

  it("returns empty log for new repo", () => {
    const fs = initRepo(makeFs());
    expect(getCommitLog(fs, "/home/player")).toHaveLength(0);
  });
});

// ── git branch ───────────────────────────────────────────────────────

describe("git branch", () => {
  it("lists branches with current marked", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const { branches, current } = listBranches(fs, "/home/player");
    expect(branches).toContain("main");
    expect(current).toBe("main");
  });

  it("deletes a branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = gitCheckout(fs, "/home/player", "main", false).fs;
    const result = deleteBranch(fs, "/home/player", "feature", true);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Deleted branch feature");
  });

  it("refuses to delete current branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = deleteBranch(fs, "/home/player", "main", false);
    expect(result.error).toContain("Cannot delete");
  });

  it("creates a branch silently at HEAD", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = createBranch(fs, "/home/player", "hi");
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("");
    const { branches, current } = listBranches(result.fs, "/home/player");
    expect(branches).toContain("hi");
    expect(current).toBe("main"); // didn't switch
    // ref points to current HEAD hash
    const headHash = resolveHead(result.fs, "/home/player");
    const ref = result.fs.readFile("/home/player/.git/refs/heads/hi").content?.trim();
    expect(ref).toBe(headHash);
  });

  it("emits git_checkout_b trigger so `git branch <name>` counts as branching for story flags", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = createBranch(fs, "/home/player", "feature");
    expect(result.triggerEvents).toEqual([{ type: "command_executed", detail: "git_checkout_b" }]);
  });

  it("errors when creating a branch that already exists", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = createBranch(fs, "/home/player", "main");
    expect(result.error).toContain("already exists");
  });

  it("errors when creating a branch in an empty repo", () => {
    const fs = initRepo(makeFs());
    const result = createBranch(fs, "/home/player", "hi");
    expect(result.error).toContain("Not a valid object name");
  });

  it("returns empty remotes by default (mode='local')", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const { branches, remotes } = listBranches(fs, "/home/player");
    expect(branches).toContain("main");
    expect(remotes).toEqual([]);
  });
});

// ── git branch -a / -r (remote-tracking branches) ────────────────────

describe("git branch -a / -r", () => {
  const TEST_URL = "__test__/branch-a-remote";

  beforeEach(() => {
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "README.md": "# Test" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "init" },
    );
  });

  afterEach(() => {
    delete REMOTE_REPOS[TEST_URL];
  });

  it("mode='all' includes both local heads and remotes/origin/<branch>", () => {
    const fs = makeFs();
    const cloneResult = gitClone(fs, "/home/player", TEST_URL, AUTHOR);
    const root = "/home/player/branch-a-remote";
    const { branches, remotes, current } = listBranches(cloneResult.fs, root, "all");
    expect(branches).toContain("main");
    expect(remotes).toContain("remotes/origin/main");
    expect(current).toBe("main");
  });

  it("mode='remotes' returns only remote-tracking branches, no locals", () => {
    const fs = makeFs();
    const cloneResult = gitClone(fs, "/home/player", TEST_URL, AUTHOR);
    const root = "/home/player/branch-a-remote";
    const { branches, remotes } = listBranches(cloneResult.fs, root, "remotes");
    expect(branches).toEqual([]);
    expect(remotes).toContain("remotes/origin/main");
  });

  it("remotes are sorted", () => {
    const fs = makeFs();
    const cloneResult = gitClone(fs, "/home/player", TEST_URL, AUTHOR);
    const root = "/home/player/branch-a-remote";
    // Manually add a second remote ref to verify sort order
    const withExtra = cloneResult.fs.writeFile(
      `${root}/.git/refs/remotes/origin/develop`,
      resolveHead(cloneResult.fs, root) ?? "",
    ).fs!;
    const { remotes } = listBranches(withExtra, root, "all");
    expect(remotes).toEqual(["remotes/origin/develop", "remotes/origin/main"]);
  });
});

// ── nested branch names (refs/heads/feature/x) ───────────────────────

describe("nested branch names", () => {
  it("createBranch creates and lists a nested branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = createBranch(fs, "/home/player", "feature/x");
    expect(result.error).toBeUndefined();
    const { branches } = listBranches(result.fs, "/home/player");
    expect(branches).toContain("feature/x");
    expect(branches).toContain("main");
  });

  it("gitCheckout -b creates a nested branch and switches to it", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "fix/bug-123", true);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Switched to a new branch 'fix/bug-123'");
    const { current } = listBranches(result.fs, "/home/player");
    expect(current).toBe("fix/bug-123");
  });

  it("listBranches returns the full nested name, not just the leaf", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = createBranch(fs, "/home/player", "feature/a").fs;
    fs = createBranch(fs, "/home/player", "feature/b").fs;
    fs = createBranch(fs, "/home/player", "release/2026-q2").fs;
    const { branches } = listBranches(fs, "/home/player");
    expect(branches).toEqual(["feature/a", "feature/b", "main", "release/2026-q2"]);
  });

  it("deleteBranch removes a nested branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = createBranch(fs, "/home/player", "feature/x").fs;
    const result = deleteBranch(fs, "/home/player", "feature/x", true);
    expect(result.error).toBeUndefined();
    const { branches } = listBranches(result.fs, "/home/player");
    expect(branches).not.toContain("feature/x");
  });

  it("commit on nested branch updates the nested ref", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = gitCheckout(fs, "/home/player", "feature/x", true).fs;
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "on feature");
    const ref = fs.readFile("/home/player/.git/refs/heads/feature/x").content?.trim();
    expect(ref).toBe(resolveHead(fs, "/home/player"));
  });

  it("rejects ref names with FS-unsafe segments", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    for (const bad of ["/leading", "trailing/", "a//b", "a/./b", "a/../b", ""]) {
      const result = createBranch(fs, "/home/player", bad);
      expect(result.error, `expected '${bad}' to be rejected`).toContain("not a valid branch name");
    }
  });

  it("checkout -b also rejects FS-unsafe names", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "a/../b", true);
    expect(result.error).toContain("not a valid branch name");
  });
});

// ── git checkout ─────────────────────────────────────────────────────

describe("git checkout", () => {
  it("creates a new branch with -b", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "feature", true);
    expect(result.output).toContain("Switched to a new branch 'feature'");
    const { current } = listBranches(result.fs, "/home/player");
    expect(current).toBe("feature");
  });

  it("errors on duplicate branch name with -b", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "main", true);
    expect(result.error).toContain("already exists");
  });

  it("switches branches and restores files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "main content").fs!;
    fs = addAndCommit(fs, "/home/player", "main commit");
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = fs.writeFile("/home/player/a.txt", "feature content").fs!;
    fs = addAndCommit(fs, "/home/player", "feature commit");
    // Switch back to main
    fs = gitCheckout(fs, "/home/player", "main", false).fs;
    expect(fs.readFile("/home/player/a.txt").content).toBe("main content");
  });

  it("errors on nonexistent branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitCheckout(fs, "/home/player", "nonexistent", false);
    expect(result.error).toContain("did not match");
  });
});

// ── git diff ─────────────────────────────────────────────────────────

describe("git diff", () => {
  it("shows working tree changes vs HEAD", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "line1\nline2\n").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "line1\nmodified\n").fs!;
    const diffs = gitDiffFiles(fs, "/home/player");
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("a.txt");
  });

  it("shows staged changes with --staged", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    const diffs = gitDiffFiles(fs, "/home/player", { staged: true });
    expect(diffs).toHaveLength(1);
  });

  it("returns empty for clean repo", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    expect(gitDiffFiles(fs, "/home/player")).toHaveLength(0);
  });

  it("hides a staged change from unstaged diff (working tree vs index, not HEAD)", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;

    expect(gitDiffFiles(fs, "/home/player")).toHaveLength(0);
    expect(gitDiffFiles(fs, "/home/player", { staged: true })).toHaveLength(1);
  });

  it("shows index→working diff when a staged file is edited again", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    fs = fs.writeFile("/home/player/a.txt", "v3").fs!;

    const diffs = gitDiffFiles(fs, "/home/player");
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("a.txt");
    expect(diffs[0].oldContent).toBe("v2");
    expect(diffs[0].newContent).toBe("v3");
  });

  it("does not show a newly staged file (not in HEAD) in unstaged diff", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/new.txt", "hello").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["new.txt"], false).fs;

    expect(gitDiffFiles(fs, "/home/player")).toHaveLength(0);
  });

  it("shows only post-stage edits for a newly staged file", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/new.txt", "hello").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["new.txt"], false).fs;
    fs = fs.writeFile("/home/player/new.txt", "hello world").fs!;

    const diffs = gitDiffFiles(fs, "/home/player");
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("new.txt");
    expect(diffs[0].oldContent).toBe("hello");
    expect(diffs[0].newContent).toBe("hello world");
  });

  it("ignores a staged-deleted file still on disk (it is untracked now)", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    // Simulate `git rm --cached a.txt`: index marks it deleted, file stays on disk.
    fs = fs.writeFile(
      "/home/player/.git/index.json",
      JSON.stringify({ staged: {}, deleted: ["a.txt"] }),
    ).fs!;

    expect(gitDiffFiles(fs, "/home/player")).toHaveLength(0);
  });

  it("never reports untracked files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/tracked.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/scratch.txt", "brand new").fs!;

    expect(gitDiffFiles(fs, "/home/player")).toHaveLength(0);
  });

  it("labels adds, modifications and deletions", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/keep.txt", "v1\n").fs!;
    fs = fs.writeFile("/home/player/gone.txt", "bye\n").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/keep.txt", "v2\n").fs!;
    fs = fs.writeFile("/home/player/added.txt", "hi\n").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["keep.txt", "added.txt"], false).fs;
    fs = gitRm(fs, "/home/player", ["gone.txt"], false).fs;

    const byPath = Object.fromEntries(
      gitDiffFiles(fs, "/home/player", { staged: true }).map((d) => [d.path, d.status]),
    );
    expect(byPath).toEqual({ "keep.txt": "modified", "added.txt": "added", "gone.txt": "deleted" });
  });
});

// ── git rm ───────────────────────────────────────────────────────────

describe("git rm", () => {
  it("removes a file and marks deleted", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "content").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitRm(fs, "/home/player", ["a.txt"], false);
    expect(result.error).toBeUndefined();
    expect(result.fs.getNode("/home/player/a.txt")).toBeNull();
  });

  it("errors on nonexistent file", () => {
    const fs = initRepo(makeFs());
    const result = gitRm(fs, "/home/player", ["missing.txt"], false);
    expect(result.error).toContain("pathspec 'missing.txt' did not match");
  });

  it("errors on directory without -r", () => {
    let fs = initRepo(makeFs());
    fs = fs.makeDirectory("/home/player/dir").fs!;
    fs = fs.writeFile("/home/player/dir/file.txt", "content").fs!;
    const result = gitRm(fs, "/home/player", ["dir"], false);
    expect(result.error).toContain("without -r");
  });
});

// ── git stash ────────────────────────────────────────────────────────

describe("git stash", () => {
  it("saves and restores changes", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    // Stash
    const stashResult = gitStashSave(fs, "/home/player");
    expect(stashResult.output).toContain("Saved working directory");
    fs = stashResult.fs;
    expect(fs.readFile("/home/player/a.txt").content).toBe("v1");
    // Pop
    const popResult = gitStashPop(fs, "/home/player");
    fs = popResult.fs;
    expect(fs.readFile("/home/player/a.txt").content).toBe("v2");
  });

  it("errors on pop with empty stash", () => {
    const fs = initRepo(makeFs());
    const result = gitStashPop(fs, "/home/player");
    expect(result.error).toContain("No stash entries found");
  });

  it("errors on stash with no changes", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitStashSave(fs, "/home/player");
    expect(result.output).toContain("No local changes to save");
  });

  it("lists stash entries", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitStashSave(fs, "/home/player").fs;
    const list = gitStashList(fs, "/home/player");
    expect(list).toContain("stash@{0}");
    expect(list).toContain("WIP on main");
  });

  it("apply restores the changes and keeps the entry", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitStashSave(fs, "/home/player").fs;

    const result = gitStashApply(fs, "/home/player");
    expect(result.error).toBeUndefined();
    expect(result.fs.readFile("/home/player/a.txt").content).toBe("v2");
    expect(readStash(result.fs, "/home/player")).toHaveLength(1);
  });

  it("drop removes the entry without restoring", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitStashSave(fs, "/home/player").fs;

    const result = gitStashDrop(fs, "/home/player");
    expect(result.output).toContain("Dropped refs/stash@{0} (WIP on main");
    expect(result.fs.readFile("/home/player/a.txt").content).toBe("v1");
    expect(readStash(result.fs, "/home/player")).toHaveLength(0);
  });

  it("errors on apply/drop with empty stash", () => {
    const fs = initRepo(makeFs());
    expect(gitStashApply(fs, "/home/player").error).toContain("No stash entries found");
    expect(gitStashDrop(fs, "/home/player").error).toContain("No stash entries found");
  });

  /** main@v1 stashing v2, then switching to a branch whose commit made the file v3. */
  function seedCrossBranchStash(): VirtualFS {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = gitCheckout(fs, "/home/player", "hotfix", true).fs;
    fs = fs.writeFile("/home/player/a.txt", "v3").fs!;
    fs = addAndCommit(fs, "/home/player", "hotfix");
    fs = gitCheckout(fs, "/home/player", "main", false).fs;
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitStashSave(fs, "/home/player").fs;
    return gitCheckout(fs, "/home/player", "hotfix", false).fs;
  }

  it("refuses to pop onto a branch whose content differs, keeping stash and tree", () => {
    const fs = seedCrossBranchStash();
    const result = gitStashPop(fs, "/home/player");
    expect(result.error).toContain("would be overwritten by merge");
    expect(result.error).toContain("a.txt");
    expect(result.error).toContain("The stash entry is kept");
    expect(result.fs.readFile("/home/player/a.txt").content).toBe("v3");
    expect(readStash(result.fs, "/home/player")).toHaveLength(1);
  });

  it("apply refuses on the same cross-branch conflict", () => {
    const fs = seedCrossBranchStash();
    const result = gitStashApply(fs, "/home/player");
    expect(result.error).toContain("would be overwritten by merge");
    expect(readStash(result.fs, "/home/player")).toHaveLength(1);
  });

  it("pop still succeeds after returning to the original branch", () => {
    let fs = seedCrossBranchStash();
    expect(gitStashPop(fs, "/home/player").error).toBeDefined();
    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    const result = gitStashPop(fs, "/home/player");
    expect(result.error).toBeUndefined();
    expect(result.fs.readFile("/home/player/a.txt").content).toBe("v2");
    expect(readStash(result.fs, "/home/player")).toHaveLength(0);
  });

  it("pop restores untracked files stashed with -u", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/scratch.txt", "notes").fs!;
    fs = gitStashSave(fs, "/home/player", true).fs;
    expect(fs.getNode("/home/player/scratch.txt")).toBeNull();

    const result = gitStashPop(fs, "/home/player");
    expect(result.error).toBeUndefined();
    expect(result.fs.readFile("/home/player/scratch.txt").content).toBe("notes");
  });
});

// ── branch tracking (ahead/behind) ───────────────────────────────────

/** Build a detached commit object (parent + tree), returning it for object/ref writes. */
function mkCommit(parent: string | null, message: string, ts: number, tree: Record<string, string>) {
  const hash = shortHash(message + ts + (parent ?? "") + JSON.stringify(tree));
  return { hash, parent, message, author: AUTHOR, timestamp: ts, tree };
}

/** Seed two upstream-ahead commits + refs/remotes/origin/main, leaving refs/heads/main behind. */
function seedBehindByTwo(fs: VirtualFS, root = "/home/player"): VirtualFS {
  fs = initRepo(fs, root);
  fs = fs.writeFile(`${root}/a.txt`, "v1").fs!;
  fs = addAndCommit(fs, root, "first");
  const c0 = resolveHead(fs, root)!;
  const c1 = mkCommit(c0, "u1", 2, { "a.txt": "v1", "b.txt": "b" });
  const c2 = mkCommit(c1.hash, "u2", 3, { ...c1.tree, "c.txt": "c" });
  fs = fs.writeFile(`${root}/.git/objects/${c1.hash}.json`, JSON.stringify(c1)).fs!;
  fs = fs.writeFile(`${root}/.git/objects/${c2.hash}.json`, JSON.stringify(c2)).fs!;
  fs = fs.writeFile(`${root}/.git/refs/remotes/origin/main`, c2.hash).fs!;
  return fs;
}

describe("git status branch tracking", () => {
  it("reports behind + fast-forwardable when origin is ahead", () => {
    const fs = seedBehindByTwo(makeFs());
    const status = gitStatus(fs, "/home/player");
    expect(status.tracking).toEqual({ remoteRef: "origin/main", ahead: 0, behind: 2 });
    const out = formatStatus(status, false, true);
    expect(out).toContain("Your branch is behind 'origin/main' by 2 commits, and can be fast-forwarded.");
    expect(out).toContain('(use "git pull" to update your local branch)');
  });

  it("omits tracking (and the line) entirely when there is no remote-tracking ref", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const status = gitStatus(fs, "/home/player");
    expect(status.tracking).toBeUndefined();
    // byte-for-byte identical to the pre-change output (no tracking line injected)
    expect(formatStatus(status, false, true)).toBe("On branch main\nnothing to commit, working tree clean");
  });
});

// ── git stash --include-untracked ────────────────────────────────────

describe("git stash --include-untracked", () => {
  function dirtyRepo(): VirtualFS {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;       // modified tracked
    fs = fs.writeFile("/home/player/new.txt", "fresh").fs!;  // untracked
    return fs;
  }

  it("without -u, untracked files are left in the working tree", () => {
    const fs = gitStashSave(dirtyRepo(), "/home/player", false).fs;
    expect(fs.getNode("/home/player/new.txt")).not.toBeNull();
    expect(gitStatus(fs, "/home/player").untracked).toContain("new.txt");
  });

  it("with -u, untracked files are stashed and restored on pop", () => {
    let fs = gitStashSave(dirtyRepo(), "/home/player", true).fs;
    expect(fs.getNode("/home/player/new.txt")).toBeNull();      // tucked away
    expect(fs.readFile("/home/player/a.txt").content).toBe("v1"); // reverted to HEAD
    fs = gitStashPop(fs, "/home/player").fs;
    expect(fs.readFile("/home/player/new.txt").content).toBe("fresh"); // back
    expect(fs.readFile("/home/player/a.txt").content).toBe("v2");
  });
});

// ── git pull fast-forward to a pre-seeded tracking ref ────────────────

describe("git pull (fast-forward to remote-tracking ref)", () => {
  const CONFIG = '[remote "origin"]\n  url = test-remote';

  it("fast-forwards local + working tree when strictly behind", () => {
    let fs = seedBehindByTwo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    const upTip = fs.readFile("/home/player/.git/refs/remotes/origin/main").content!.trim();

    const pull = gitPull(fs, "/home/player", undefined, undefined, {});
    expect(pull.error).toBeUndefined();
    expect(pull.output).toContain("Fast-forward");
    fs = pull.fs;
    expect(fs.readFile("/home/player/.git/refs/heads/main").content!.trim()).toBe(upTip);
    expect(fs.readFile("/home/player/b.txt").content).toBe("b"); // working tree advanced
    expect(fs.readFile("/home/player/c.txt").content).toBe("c");
    expect(gitStatus(fs, "/home/player").tracking).toEqual({ remoteRef: "origin/main", ahead: 0, behind: 0 });
  });

  it("refuses to overwrite a conflicting local change", () => {
    let fs = seedBehindByTwo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    fs = fs.writeFile("/home/player/a.txt", "local edit").fs!; // collides with incoming a.txt
    const pull = gitPull(fs, "/home/player", undefined, undefined, {});
    expect(pull.error).toContain("would be overwritten");
  });

  it("reports up to date when the tracking ref equals local on an unregistered remote", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const c0 = resolveHead(fs, "/home/player")!;
    fs = fs.writeFile("/home/player/.git/refs/remotes/origin/main", c0).fs!; // equal → not behind
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    const pull = gitPull(fs, "/home/player", undefined, undefined, {});
    expect(pull.error).toBeUndefined();
    expect(pull.output).toBe("Already up to date.");
  });

  it("a second --ff-only pull after catching up is a no-op, not an error", () => {
    let fs = seedBehindByTwo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    const first = gitPull(fs, "/home/player", undefined, undefined, {}, { ffOnly: true });
    expect(first.output).toContain("Fast-forward");
    const second = gitPull(first.fs, "/home/player", undefined, undefined, {}, { ffOnly: true });
    expect(second.error).toBeUndefined();
    expect(second.output).toBe("Already up to date.");
  });

  it("--ff-only still fast-forwards when strictly behind", () => {
    let fs = seedBehindByTwo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    const pull = gitPull(fs, "/home/player", undefined, undefined, {}, { ffOnly: true });
    expect(pull.error).toBeUndefined();
    expect(pull.output).toContain("Fast-forward");
  });

  it("--ff-only refuses when branches have diverged", () => {
    let fs = seedBehindByTwo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    // Diverge: add a local commit on top of c0 while origin/main sits at c2.
    fs = fs.writeFile("/home/player/local.txt", "mine").fs!;
    fs = addAndCommit(fs, "/home/player", "local work");
    const localTip = resolveHead(fs, "/home/player")!;

    const pull = gitPull(fs, "/home/player", undefined, undefined, {}, { ffOnly: true });
    expect(pull.error).toBe("fatal: Not possible to fast-forward, aborting.");
    // Refs and working tree untouched.
    expect(pull.fs.readFile("/home/player/.git/refs/heads/main").content!.trim()).toBe(localTip);
    expect(pull.fs.getNode("/home/player/b.txt")).toBeNull();
  });

  it("reports real diff counts in the --stat block, not net line deltas", () => {
    // A same-line-count rewrite used to be faked as a flat 1 insertion / 1 deletion.
    const TEST_URL = "__test__/pull-stat-counts";
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "notes.txt": "alpha\nbeta\ngamma\ndelta\n" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "initial" },
    );
    REMOTE_REPOS[TEST_URL].getUpdates = (_flags, headHash) => {
      const tree = { "notes.txt": "alpha\nBETA\nGAMMA\ndelta\n", "todo.txt": "one\n" };
      return [{
        hash: shortHash("stat-update" + (headHash ?? "")),
        parent: headHash, message: "remote update", author: AUTHOR, timestamp: 1, tree,
      }];
    };

    try {
      let fs = makeFs();
      fs = gitClone(fs, "/home/player", TEST_URL, AUTHOR).fs;
      const pull = gitPull(fs, "/home/player/pull-stat-counts", undefined, undefined, {});
      expect(pull.error).toBeUndefined();
      expect(pull.output.split("\n").slice(3)).toEqual([
        " notes.txt |   4 ++--",
        " todo.txt  |   1 +",
        " 2 files changed, 3 insertions(+), 2 deletions(-)",
      ]);
    } finally {
      delete REMOTE_REPOS[TEST_URL];
    }
  });

  it("--rebase fast-forwards when strictly behind", () => {
    let fs = seedBehindByTwo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    const upTip = fs.readFile("/home/player/.git/refs/remotes/origin/main").content!.trim();

    const pull = gitPull(fs, "/home/player", undefined, undefined, {}, { rebase: true });
    expect(pull.error).toBeUndefined();
    expect(pull.output).toContain("Fast-forward");
    expect(pull.fs.readFile("/home/player/.git/refs/heads/main").content!.trim()).toBe(upTip);
  });

  it("--rebase replays local commits on top of the tracking tip when diverged", () => {
    let fs = seedBehindByTwo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    const upTip = fs.readFile("/home/player/.git/refs/remotes/origin/main").content!.trim();
    fs = fs.writeFile("/home/player/local.txt", "mine").fs!;
    fs = addAndCommit(fs, "/home/player", "local work");

    const pull = gitPull(fs, "/home/player", undefined, undefined, {}, { rebase: true });
    expect(pull.error).toBeUndefined();
    fs = pull.fs;
    // Linear history: the local commit now sits on top of the two upstream ones.
    expect(getCommitLog(fs, "/home/player").map((c) => c.message)).toEqual(["local work", "u2", "u1", "first"]);
    const tip = fs.readFile("/home/player/.git/refs/heads/main").content!.trim();
    expect(tip).not.toBe(upTip);
    expect(readCommit(fs, "/home/player", tip)!.parent).toBe(upTip);
    expect(gitStatus(fs, "/home/player").tracking).toEqual({ remoteRef: "origin/main", ahead: 1, behind: 0 });
    expect(pull.triggerEvents).toEqual([{ type: "command_executed", detail: "git_pull_origin_main" }]);
  });

  it("without --ff-only a diverged branch falls through unchanged", () => {
    let fs = seedBehindByTwo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", CONFIG).fs!;
    fs = fs.writeFile("/home/player/local.txt", "mine").fs!;
    fs = addAndCommit(fs, "/home/player", "local work");
    const pull = gitPull(fs, "/home/player", undefined, undefined, {});
    expect(pull.error).toContain("repository 'test-remote' not found");
  });
});

// ── git push ─────────────────────────────────────────────────────────

describe("git push", () => {
  it("errors with no remote configured", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitPush(fs, "/home/player", undefined, undefined, false, false);
    expect(result.error).toContain("No configured push destination");
  });

  it("pushes with configured remote", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote\n[branch "main"]\n  remote = origin\n  merge = refs/heads/main\n').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitPush(fs, "/home/player", "origin", "main", false, false);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("main -> main");
    expect(result.triggerEvents).toBeDefined();
  });

  it("pushes the named branch, not whatever HEAD points at", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    // Commit on `feature`, then go back to main and commit again there.
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = fs.writeFile("/home/player/b.txt", "feature work").fs!;
    fs = addAndCommit(fs, "/home/player", "feature commit");
    const featureTip = fs.readFile("/home/player/.git/refs/heads/feature").content!.trim();
    fs = gitCheckout(fs, "/home/player", "main", false).fs;
    fs = fs.writeFile("/home/player/c.txt", "main work").fs!;
    fs = addAndCommit(fs, "/home/player", "main commit");
    const mainTip = resolveHead(fs, "/home/player")!;
    expect(featureTip).not.toBe(mainTip);

    const result = gitPush(fs, "/home/player", "origin", "feature", false, false);
    expect(result.error).toBeUndefined();
    const pushed = result.fs.readFile("/home/player/.git/refs/remotes/origin/feature").content!.trim();
    expect(pushed).toBe(featureTip);
    expect(pushed).not.toBe(mainTip);
    expect(result.output).toContain("[new branch]      feature -> feature");
  });

  it("rejects a branch that does not exist locally", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitPush(fs, "/home/player", "origin", "nosuch", false, false);
    expect(result.error).toContain("error: src refspec nosuch does not match any");
    expect(result.triggerEvents).toBeUndefined();
    expect(result.fs.getNode("/home/player/.git/refs/remotes/origin/nosuch")).toBeNull();
  });

  it("sets upstream with -u flag", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const result = gitPush(fs, "/home/player", "origin", "main", true, false);
    expect(result.output).toContain("set up to track");
    fs = result.fs;
    const config = fs.readFile("/home/player/.git/config").content!;
    expect(config).toContain('[branch "main"]');
    expect(config).toContain("remote = origin");
    expect(config).toContain("merge = refs/heads/main");
  });

  it("refuses a bare push when the branch has no upstream", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    // Even `-u` needs a destination to record.
    const result = gitPush(fs, "/home/player", undefined, undefined, true, false);
    expect(result.error).toBe(
      "fatal: The current branch main has no upstream branch.\n" +
      "To push the current branch and set the remote as upstream, use\n\n" +
      "    git push --set-upstream origin main\n",
    );
    expect(result.triggerEvents).toBeUndefined();
    expect(result.fs.getNode("/home/player/.git/refs/remotes/origin/main")).toBeNull();
  });

  it("prints [new branch] on the first push and old..new afterwards", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    const firstTip = resolveHead(fs, "/home/player")!;

    const first = gitPush(fs, "/home/player", "origin", "main", true, false);
    expect(first.output).toContain(" * [new branch]      main -> main");
    expect(first.output).not.toContain("0000000");
    fs = first.fs;

    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "second");
    const secondTip = resolveHead(fs, "/home/player")!;
    const second = gitPush(fs, "/home/player", undefined, undefined, false, false);
    expect(second.output).toContain(`${firstTip.slice(0, 7)}..${secondTip.slice(0, 7)}  main -> main`);
  });

  it("re-emits push events on a no-op re-push", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = gitPush(fs, "/home/player", "origin", "main", true, false).fs;

    const again = gitPush(fs, "/home/player", undefined, undefined, false, false);
    expect(again.output).toBe("Everything up-to-date");
    expect(again.triggerEvents).toEqual([
      { type: "command_executed", detail: "git_push_origin_main" },
      { type: "command_executed", detail: "git_push" },
    ]);
  });
});

// ── git restore ──────────────────────────────────────────────────────

describe("git restore", () => {
  /** Repo with a.txt committed as "v1\n" and sub/b.txt as "sub\n". */
  function restoreRepo(): VirtualFS {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1\n").fs!;
    fs = fs.makeDirectory("/home/player/sub").fs!;
    fs = fs.writeFile("/home/player/sub/b.txt", "sub\n").fs!;
    return addAndCommit(fs, "/home/player", "first");
  }

  it("restores a modified file from HEAD, silently", () => {
    let fs = restoreRepo();
    fs = fs.writeFile("/home/player/a.txt", "dirty\n").fs!;
    const result = gitRestore(fs, "/home/player", "/home/player", ["a.txt"], false);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("");
    expect(result.fs.readFile("/home/player/a.txt").content).toBe("v1\n");
  });

  it("recreates a deleted tracked file", () => {
    let fs = restoreRepo();
    fs = fs.removeNode("/home/player/sub/b.txt").fs!;
    const result = gitRestore(fs, "/home/player", "/home/player", ["sub/b.txt"], false);
    expect(result.fs.readFile("/home/player/sub/b.txt").content).toBe("sub\n");
  });

  it("prefers the index over HEAD when the file is staged", () => {
    let fs = restoreRepo();
    fs = fs.writeFile("/home/player/a.txt", "staged\n").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    fs = fs.writeFile("/home/player/a.txt", "then this\n").fs!;
    const result = gitRestore(fs, "/home/player", "/home/player", ["a.txt"], false);
    expect(result.fs.readFile("/home/player/a.txt").content).toBe("staged\n");
  });

  it("takes a directory pathspec and resolves it against cwd", () => {
    let fs = restoreRepo();
    fs = fs.writeFile("/home/player/sub/b.txt", "dirty\n").fs!;
    // From inside sub/, `git restore .` restores that subtree only.
    const result = gitRestore(fs, "/home/player", "/home/player/sub", ["."], false);
    expect(result.fs.readFile("/home/player/sub/b.txt").content).toBe("sub\n");
  });

  it("--staged unstages but leaves the working tree alone", () => {
    let fs = restoreRepo();
    fs = fs.writeFile("/home/player/a.txt", "dirty\n").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;
    const result = gitRestore(fs, "/home/player", "/home/player", ["a.txt"], true);
    expect(result.error).toBeUndefined();
    expect(readIndex(result.fs, "/home/player").staged).toEqual({});
    expect(result.fs.readFile("/home/player/a.txt").content).toBe("dirty\n");
  });

  it("errors on a pathspec git knows nothing about", () => {
    const result = gitRestore(restoreRepo(), "/home/player", "/home/player", ["ghost.txt"], false);
    expect(result.error).toBe("error: pathspec 'ghost.txt' did not match any file(s) known to git");
  });
});

// ── collectFiles ─────────────────────────────────────────────────────

describe("collectFiles", () => {
  it("collects files skipping .git", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "aaa").fs!;
    fs = fs.writeFile("/home/player/b.txt", "bbb").fs!;
    const files = collectFiles(fs, "/home/player", "/home/player");
    expect(Object.keys(files)).toContain("a.txt");
    expect(Object.keys(files)).toContain("b.txt");
    // Should not include any .git files
    for (const key of Object.keys(files)) {
      expect(key).not.toContain(".git");
    }
  });

  it("handles nested directories", () => {
    let fs = initRepo(makeFs());
    fs = fs.makeDirectory("/home/player/src").fs!;
    fs = fs.writeFile("/home/player/src/main.ts", "code").fs!;
    const files = collectFiles(fs, "/home/player", "/home/player");
    expect(files["src/main.ts"]).toBe("code");
  });
});

// ── Integration: full workflow ───────────────────────────────────────

describe("git workflow integration", () => {
  it("init → add → commit → branch → checkout → modify → commit → switch back", () => {
    let fs = initRepo(makeFs());

    // Create and commit a file on main
    fs = fs.writeFile("/home/player/readme.md", "# Project").fs!;
    fs = addAndCommit(fs, "/home/player", "initial commit");

    // Create feature branch
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;

    // Modify on feature branch
    fs = fs.writeFile("/home/player/readme.md", "# Project\n\nNew feature").fs!;
    fs = fs.writeFile("/home/player/feature.ts", "export const x = 1;").fs!;
    fs = addAndCommit(fs, "/home/player", "add feature");

    // Verify feature state
    expect(fs.readFile("/home/player/feature.ts").content).toBe("export const x = 1;");

    // Switch back to main
    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    // Feature file should be gone, readme should be original
    expect(fs.getNode("/home/player/feature.ts")).toBeNull();
    expect(fs.readFile("/home/player/readme.md").content).toBe("# Project");

    // Verify log on main has only 1 commit
    const mainLog = getCommitLog(fs, "/home/player");
    expect(mainLog).toHaveLength(1);

    // Switch to feature, verify 2 commits
    fs = gitCheckout(fs, "/home/player", "feature", false).fs;
    const featureLog = getCommitLog(fs, "/home/player");
    expect(featureLog).toHaveLength(2);
  });

  it("handles deleted files across branches", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "aaa").fs!;
    fs = fs.writeFile("/home/player/b.txt", "bbb").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");

    // Create branch, delete a file
    fs = gitCheckout(fs, "/home/player", "cleanup", true).fs;
    fs = gitRm(fs, "/home/player", ["b.txt"], false).fs;
    fs = gitCommit(fs, "/home/player", "remove b", AUTHOR, false, false, TEST_TS).fs;

    // Switch back to main — b.txt should be back
    fs = gitCheckout(fs, "/home/player", "main", false).fs;
    expect(fs.readFile("/home/player/b.txt").content).toBe("bbb");

    // Switch to cleanup — b.txt should be gone
    fs = gitCheckout(fs, "/home/player", "cleanup", false).fs;
    expect(fs.getNode("/home/player/b.txt")).toBeNull();
  });
});

// ── git clone --depth (accepted no-op) ──────────────────────────────

describe("git clone --depth", () => {
  const TEST_URL = "__test__/depth-remote";

  beforeEach(() => {
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "README.md": "# Depth Test", "src/index.ts": "export default 1;" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "init" },
    );
  });

  afterEach(() => {
    delete REMOTE_REPOS[TEST_URL];
  });

  it("clones with depth param, output shows Cloning, files populated", () => {
    const fs = makeFs();
    const result = gitClone(fs, "/home/player", TEST_URL, AUTHOR, undefined, 1);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Cloning into 'depth-remote'...");
    expect(result.fs.readFile("/home/player/depth-remote/README.md").content).toBe("# Depth Test");
    expect(result.fs.readFile("/home/player/depth-remote/src/index.ts").content).toBe("export default 1;");
  });
});

// ── git clone -b <branch> ───────────────────────────────────────────

describe("git clone -b", () => {
  const TEST_URL = "__test__/branch-remote";

  beforeEach(() => {
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "app.ts": "hello" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "initial" },
    );
  });

  afterEach(() => {
    delete REMOTE_REPOS[TEST_URL];
  });

  it("clones into specified branch, HEAD points to that branch", () => {
    const fs = makeFs();
    const result = gitClone(fs, "/home/player", TEST_URL, AUTHOR, "develop");
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Cloning into");
    const head = result.fs.readFile("/home/player/branch-remote/.git/HEAD").content;
    expect(head).toBe("ref: refs/heads/develop");
    // Working tree populated
    expect(result.fs.readFile("/home/player/branch-remote/app.ts").content).toBe("hello");
  });
});

// ── git status -s (short format) ────────────────────────────────────

describe("git status -s", () => {
  it("outputs short format: staged, unstaged, untracked", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/tracked.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Stage a new file
    fs = fs.writeFile("/home/player/new.txt", "new content").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["new.txt"], false).fs;
    // Modify tracked file (unstaged)
    fs = fs.writeFile("/home/player/tracked.txt", "v2").fs!;
    // Create untracked file
    fs = fs.writeFile("/home/player/untracked.txt", "stuff").fs!;

    const status = gitStatus(fs, "/home/player");
    const short = formatStatus(status, true, false);

    expect(short).toContain("A  new.txt");
    expect(short).toContain(" M tracked.txt");
    expect(short).toContain("?? untracked.txt");
    // No "On branch" header
    expect(short).not.toContain("On branch");
  });
});

// ── git add -A (stage all) ──────────────────────────────────────────

describe("git add -A", () => {
  it("stages new, modified, and deleted files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "original").fs!;
    fs = fs.writeFile("/home/player/b.txt", "to-delete").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");

    // Modify a.txt
    fs = fs.writeFile("/home/player/a.txt", "modified").fs!;
    // Add new file
    fs = fs.writeFile("/home/player/c.txt", "brand new").fs!;
    // Delete b.txt from filesystem
    fs = fs.removeNode("/home/player/b.txt").fs!;

    // Stage all with allFlag=true
    const addResult = gitAdd(fs, "/home/player", "/home/player", [], true);
    fs = addResult.fs;

    const index = readIndex(fs, "/home/player");
    expect(index.staged["a.txt"]).toBe("modified");
    expect(index.staged["c.txt"]).toBe("brand new");
    expect(index.deleted).toContain("b.txt");
  });
});

// ── git commit --amend (focused tests) ──────────────────────────────

describe("git commit --amend (focused)", () => {
  it("preserves parent of original commit", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/b.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "second");

    const beforeLog = getCommitLog(fs, "/home/player");
    const originalParent = beforeLog[0].parent;

    const result = gitCommit(fs, "/home/player", "amended second", AUTHOR, true, false, TEST_TS);
    fs = result.fs;

    const afterLog = getCommitLog(fs, "/home/player");
    expect(afterLog).toHaveLength(2);
    expect(afterLog[0].message).toBe("amended second");
    expect(afterLog[0].parent).toBe(originalParent);
  });

  it("errors when no commits exist", () => {
    const fs = initRepo(makeFs());
    const result = gitCommit(fs, "/home/player", "amend nothing", AUTHOR, true, false, TEST_TS);
    expect(result.error).toContain("nothing to amend");
  });
});

// ── git commit -a (auto-stage focused) ──────────────────────────────

describe("git commit -a (focused)", () => {
  it("does NOT stage new untracked files", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/tracked.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Modify tracked file and add an untracked file
    fs = fs.writeFile("/home/player/tracked.txt", "v2").fs!;
    fs = fs.writeFile("/home/player/untracked.txt", "new file").fs!;

    const result = gitCommit(fs, "/home/player", "auto commit", AUTHOR, false, true, TEST_TS);
    fs = result.fs;
    expect(result.error).toBeUndefined();

    // The commit should include tracked.txt change
    const log = getCommitLog(fs, "/home/player");
    expect(log[0].tree["tracked.txt"]).toBe("v2");
    // But NOT the untracked file
    expect(log[0].tree["untracked.txt"]).toBeUndefined();
  });
});

// ── git branch -d (safe delete) ─────────────────────────────────────

describe("git branch -d (safe delete)", () => {
  it("errors on branch with divergent commit", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Create feature branch with a divergent commit
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = fs.writeFile("/home/player/b.txt", "feature work").fs!;
    fs = addAndCommit(fs, "/home/player", "feature commit");

    // Switch back to main
    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    // Safe delete should fail — feature has unmerged commit
    const result = deleteBranch(fs, "/home/player", "feature", false);
    expect(result.error).toContain("not fully merged");
  });

  it("succeeds on branch at same HEAD", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Create branch at same point (no divergent commits)
    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    const result = deleteBranch(fs, "/home/player", "feature", false);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Deleted branch feature");
  });
});

// ── git branch -D (force delete) ────────────────────────────────────

describe("git branch -D (force delete)", () => {
  it("force deletes branch with divergent commit", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    fs = gitCheckout(fs, "/home/player", "feature", true).fs;
    fs = fs.writeFile("/home/player/b.txt", "divergent").fs!;
    fs = addAndCommit(fs, "/home/player", "divergent commit");

    fs = gitCheckout(fs, "/home/player", "main", false).fs;

    const result = deleteBranch(fs, "/home/player", "feature", true);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Deleted branch feature");
  });

  it("still errors when deleting current branch", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    const result = deleteBranch(fs, "/home/player", "main", true);
    expect(result.error).toContain("Cannot delete");
  });
});

// ── git push -u (set upstream) ──────────────────────────────────────

describe("git push -u (set upstream)", () => {
  it("writes a per-branch upstream section to config", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    const result = gitPush(fs, "/home/player", "origin", "main", true, false);
    expect(result.error).toBeUndefined();
    fs = result.fs;

    const config = fs.readFile("/home/player/.git/config").content!;
    expect(config).toContain('[branch "main"]');
    expect(config).toContain("remote = origin");
    expect(config).toContain("merge = refs/heads/main");
  });

  it("scopes upstream per-branch — pushing -u on one branch doesn't steer another", () => {
    // Reproduces the bug where pull/push upstream was stored as global
    // merge-remote/merge-branch, so `git push -u origin feature` rewrote
    // main's upstream and a subsequent `git pull` on main wrote to
    // refs/heads/feature instead of refs/heads/main.
    const TEST_URL = "__test__/per-branch-upstream";
    REMOTE_REPOS[TEST_URL] = buildSimpleRemote(
      { "README.md": "v0" },
      { author: AUTHOR, defaultBranch: "main", commitMessage: "initial" },
    );
    // Add a getUpdates fn so the second pull on main has something to fast-forward to.
    REMOTE_REPOS[TEST_URL].getUpdates = (_flags, headHash) => {
      const tree = { "README.md": "v0", "new.txt": "from remote" };
      const hash = shortHash("remote-update" + (headHash ?? ""));
      return [{ hash, parent: headHash, message: "remote update", author: AUTHOR, timestamp: 1, tree }];
    };

    try {
      let fs = makeFs();
      fs = gitClone(fs, "/home/player", TEST_URL, AUTHOR).fs;
      const root = "/home/player/per-branch-upstream";

      // Branch off main, push -u on feature.
      fs = gitCheckout(fs, root, "feature", true).fs;
      fs = fs.writeFile(`${root}/feat.txt`, "feature work").fs!;
      fs = gitAdd(fs, root, root, ["feat.txt"], false).fs;
      fs = gitCommit(fs, root, "feat", AUTHOR, false, false, TEST_TS).fs;
      fs = gitPush(fs, root, "origin", "feature", true, false).fs;

      // Switch back to main and pull. Pull must advance refs/heads/main, not refs/heads/feature.
      fs = gitCheckout(fs, root, "main", false).fs;
      const featureRefBefore = fs.readFile(`${root}/.git/refs/heads/feature`).content!.trim();
      const mainRefBefore = fs.readFile(`${root}/.git/refs/heads/main`).content!.trim();

      const pullResult = gitPull(fs, root, undefined, undefined, {});
      expect(pullResult.error).toBeUndefined();
      fs = pullResult.fs;

      const featureRefAfter = fs.readFile(`${root}/.git/refs/heads/feature`).content!.trim();
      const mainRefAfter = fs.readFile(`${root}/.git/refs/heads/main`).content!.trim();

      expect(featureRefAfter).toBe(featureRefBefore); // feature untouched
      expect(mainRefAfter).not.toBe(mainRefBefore);   // main moved forward
      expect(pullResult.output).toContain("main -> origin/main");
    } finally {
      delete REMOTE_REPOS[TEST_URL];
    }
  });
});

// ── git push -f (force push) ────────────────────────────────────────

describe("git push -f (force push)", () => {
  it("rejects non-force push when remote is ahead", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Push to establish remote ref
    const pushResult = gitPush(fs, "/home/player", "origin", "main", false, false);
    fs = pushResult.fs;

    // Simulate remote being ahead: write a different hash to remote ref
    fs = fs.writeFile("/home/player/.git/refs/remotes/origin/main", "aaaaaaa").fs!;

    // Non-force push should fail
    const reject = gitPush(fs, "/home/player", "origin", "main", false, false);
    expect(reject.error).toContain("rejected");
  });

  it("succeeds with force flag when remote is ahead", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/.git/config", '[remote "origin"]\n  url = test-remote').fs!;
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    const pushResult = gitPush(fs, "/home/player", "origin", "main", false, false);
    fs = pushResult.fs;

    // Simulate remote ahead
    fs = fs.writeFile("/home/player/.git/refs/remotes/origin/main", "aaaaaaa").fs!;

    // Force push should succeed
    const force = gitPush(fs, "/home/player", "origin", "main", false, true);
    expect(force.error).toBeUndefined();
    expect(force.output).toContain("(forced update)");
  });
});

// ── git log --oneline ───────────────────────────────────────────────

describe("git log --oneline", () => {
  it("outputs compact format: hash + message per line, no author/date", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first commit");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "second commit");

    const commits = getCommitLog(fs, "/home/player");
    const output = formatLog(commits, true, false, true);
    const lines = output.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^[0-9a-f]{7} second commit$/);
    expect(lines[1]).toMatch(/^[0-9a-f]{7} first commit$/);
    // No author or date
    expect(output).not.toContain("Author:");
    expect(output).not.toContain("Date:");
  });
});

// ── git log --graph ─────────────────────────────────────────────────

describe("git log --graph", () => {
  it("prefixes commit lines with *", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "initial");

    const commits = getCommitLog(fs, "/home/player");
    const output = formatLog(commits, false, true, true);

    expect(output).toContain("* commit ");
  });

  it("graph + oneline shows * prefix on each line", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = addAndCommit(fs, "/home/player", "second");

    const commits = getCommitLog(fs, "/home/player");
    const output = formatLog(commits, true, true, true);
    const lines = output.split("\n");

    for (const line of lines) {
      expect(line).toMatch(/^\* /);
    }
  });
});

// ── git diff --staged (focused) ─────────────────────────────────────

describe("git diff --staged (focused)", () => {
  it("shows full content as additions for new staged file", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "existing").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Stage a brand new file
    fs = fs.writeFile("/home/player/new.txt", "line1\nline2\n").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["new.txt"], false).fs;

    const diffs = gitDiffFiles(fs, "/home/player", { staged: true });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("new.txt");
    expect(diffs[0].oldContent).toBe("");
    expect(diffs[0].newContent).toBe("line1\nline2\n");
  });

  it("does NOT show unstaged changes", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, "/home/player", "first");

    // Stage a change to a.txt
    fs = fs.writeFile("/home/player/a.txt", "v2").fs!;
    fs = gitAdd(fs, "/home/player", "/home/player", ["a.txt"], false).fs;

    // Make an additional unstaged change to a.txt
    fs = fs.writeFile("/home/player/a.txt", "v3").fs!;

    const diffs = gitDiffFiles(fs, "/home/player", { staged: true });
    expect(diffs).toHaveLength(1);
    // Should show v1→v2 (staged), NOT v1→v3 (working tree)
    expect(diffs[0].oldContent).toBe("v1");
    expect(diffs[0].newContent).toBe("v2");
  });
});

// ── git reset ────────────────────────────────────────────────────────

describe("resolveRef", () => {
  const root = "/home/player";

  it("resolves HEAD, branch names, hashes, and ~N suffixes", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile(`${root}/a.txt`, "v1").fs!;
    fs = addAndCommit(fs, root, "first");
    const first = resolveHead(fs, root)!;
    fs = fs.writeFile(`${root}/a.txt`, "v2").fs!;
    fs = addAndCommit(fs, root, "second");
    const second = resolveHead(fs, root)!;

    expect(resolveRef(fs, root, "HEAD")).toBe(second);
    expect(resolveRef(fs, root, "main")).toBe(second);
    expect(resolveRef(fs, root, first)).toBe(first);
    expect(resolveRef(fs, root, "HEAD~")).toBe(first);
    expect(resolveRef(fs, root, "HEAD~1")).toBe(first);
    expect(resolveRef(fs, root, "main~1")).toBe(first);
    expect(resolveRef(fs, root, "HEAD~0")).toBe(second);
  });

  it("returns null for unknown refs and walks past root", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile("/home/player/a.txt", "v1").fs!;
    fs = addAndCommit(fs, root, "first");
    expect(resolveRef(fs, root, "nope")).toBeNull();
    expect(resolveRef(fs, root, "HEAD~99")).toBeNull();
  });
});

describe("git reset", () => {
  const root = "/home/player";

  function twoCommits(): { fs: VirtualFS; first: string; second: string } {
    let fs = initRepo(makeFs());
    fs = fs.writeFile(`${root}/a.txt`, "v1").fs!;
    fs = addAndCommit(fs, root, "first");
    const first = resolveHead(fs, root)!;
    fs = fs.writeFile(`${root}/a.txt`, "v2").fs!;
    fs = fs.writeFile(`${root}/b.txt`, "new").fs!;
    fs = addAndCommit(fs, root, "second");
    const second = resolveHead(fs, root)!;
    return { fs, first, second };
  }

  it("unstages everything with no args", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/a.txt`, "v3").fs!;
    fs = gitAdd(fs, root, root, ["a.txt"], false).fs;
    const result = gitReset(fs, root, root, [], null);
    expect(result.error).toBeUndefined();
    expect(readIndex(result.fs, root).staged).toEqual({});
    // Working tree untouched
    expect(result.fs.readFile(`${root}/a.txt`).content).toBe("v3");
  });

  it("unstages a single path, leaving other entries staged", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/a.txt`, "v3").fs!;
    fs = fs.writeFile(`${root}/b.txt`, "changed").fs!;
    fs = gitAdd(fs, root, root, ["a.txt", "b.txt"], false).fs;
    const result = gitReset(fs, root, root, ["a.txt"], null);
    expect(result.error).toBeUndefined();
    const index = readIndex(result.fs, root);
    expect(index.staged["a.txt"]).toBeUndefined();
    expect(index.staged["b.txt"]).toBe("changed");
  });

  it("unstages via 'git reset HEAD <path>'", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/a.txt`, "v3").fs!;
    fs = gitAdd(fs, root, root, ["a.txt"], false).fs;
    const result = gitReset(fs, root, root, ["HEAD", "a.txt"], null);
    expect(result.error).toBeUndefined();
    expect(readIndex(result.fs, root).staged).toEqual({});
  });

  it("clears a staged deletion for the given path", () => {
    let { fs } = twoCommits();
    fs = fs.removeNode(`${root}/b.txt`).fs!;
    fs = gitAdd(fs, root, root, ["b.txt"], false).fs;
    expect(readIndex(fs, root).deleted).toContain("b.txt");
    const result = gitReset(fs, root, root, ["b.txt"], null);
    expect(readIndex(result.fs, root).deleted).toEqual([]);
  });

  it("errors on a pathspec matching nothing", () => {
    const { fs } = twoCommits();
    const result = gitReset(fs, root, root, ["missing.txt"], null);
    expect(result.error).toContain("did not match any files");
  });

  it("unstages everything for '.' at the repo root", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/a.txt`, "v3").fs!;
    fs = fs.makeDirectory(`${root}/sub`).fs!;
    fs = fs.writeFile(`${root}/sub/c.txt`, "deep").fs!;
    fs = fs.removeNode(`${root}/b.txt`).fs!;
    fs = gitAdd(fs, root, root, ["."], false).fs;
    const result = gitReset(fs, root, root, ["."], null);
    expect(result.error).toBeUndefined();
    const index = readIndex(result.fs, root);
    expect(index.staged).toEqual({});
    expect(index.deleted).toEqual([]);
    // Working tree untouched
    expect(result.fs.readFile(`${root}/a.txt`).content).toBe("v3");
  });

  it("'git restore --staged .' at the repo root unstages everything", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/a.txt`, "v3").fs!;
    fs = fs.makeDirectory(`${root}/sub`).fs!;
    fs = fs.writeFile(`${root}/sub/c.txt`, "deep").fs!;
    fs = gitAdd(fs, root, root, ["."], false).fs;
    const result = gitRestore(fs, root, root, ["."], true);
    expect(result.error).toBeUndefined();
    expect(readIndex(result.fs, root).staged).toEqual({});
    expect(result.fs.readFile(`${root}/a.txt`).content).toBe("v3");
  });

  it("'.' from a subdirectory only unstages that subtree", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/a.txt`, "v3").fs!;
    fs = fs.makeDirectory(`${root}/sub`).fs!;
    fs = fs.writeFile(`${root}/sub/c.txt`, "deep").fs!;
    fs = gitAdd(fs, root, root, ["."], false).fs;
    const result = gitReset(fs, root, `${root}/sub`, ["."], null);
    expect(result.error).toBeUndefined();
    const index = readIndex(result.fs, root);
    expect(index.staged["sub/c.txt"]).toBeUndefined();
    expect(index.staged["a.txt"]).toBe("v3");
  });

  it("'.' at the repo root succeeds silently with an empty index", () => {
    const { fs } = twoCommits();
    const result = gitReset(fs, root, root, ["."], null);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("");
  });

  it("treats '--' as the rev/pathspec separator", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/.env`, "SECRET=1").fs!;
    fs = gitAdd(fs, root, root, [".env"], false).fs;
    const result = gitReset(fs, root, root, ["--", ".env"], null);
    expect(result.error).toBeUndefined();
    expect(readIndex(result.fs, root).staged[".env"]).toBeUndefined();
  });

  it("accepts an explicit revision before '--'", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/.env`, "SECRET=1").fs!;
    fs = gitAdd(fs, root, root, [".env"], false).fs;
    const result = gitReset(fs, root, root, ["HEAD", "--", ".env"], null);
    expect(result.error).toBeUndefined();
    expect(readIndex(result.fs, root).staged[".env"]).toBeUndefined();
  });

  it("errors on an unknown revision before '--'", () => {
    const { fs } = twoCommits();
    const result = gitReset(fs, root, root, ["nope", "--", "a.txt"], null);
    expect(result.error).toContain("ambiguous argument 'nope'");
  });

  it("rejects a mode flag combined with pathspecs after '--'", () => {
    const { fs } = twoCommits();
    const result = gitReset(fs, root, root, ["--", "a.txt"], "hard");
    expect(result.error).toBe("fatal: Cannot do hard reset with paths.");
  });

  it("--soft moves the branch but keeps index and working tree", () => {
    const two = twoCommits();
    const { first } = two;
    let fs = two.fs;
    fs = fs.writeFile(`${root}/a.txt`, "v3").fs!;
    fs = gitAdd(fs, root, root, ["a.txt"], false).fs;
    const result = gitReset(fs, root, root, ["HEAD~1"], "soft");
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("");
    expect(resolveHead(result.fs, root)).toBe(first);
    expect(readIndex(result.fs, root).staged["a.txt"]).toBe("v3");
    expect(result.fs.readFile(`${root}/a.txt`).content).toBe("v3");
  });

  it("mixed (default) moves the branch and clears the index, keeping the working tree", () => {
    const two = twoCommits();
    const { first } = two;
    let fs = two.fs;
    fs = fs.writeFile(`${root}/a.txt`, "v3").fs!;
    fs = gitAdd(fs, root, root, ["a.txt"], false).fs;
    const result = gitReset(fs, root, root, ["HEAD~1"], null);
    expect(result.error).toBeUndefined();
    expect(resolveHead(result.fs, root)).toBe(first);
    expect(readIndex(result.fs, root).staged).toEqual({});
    expect(result.fs.readFile(`${root}/a.txt`).content).toBe("v3");
    expect(result.output).toContain("Unstaged changes after reset:");
    expect(result.output).toContain("M\ta.txt");
  });

  it("--hard restores the working tree and removes files from undone commits", () => {
    const two = twoCommits();
    const { first } = two;
    let fs = two.fs;
    fs = fs.writeFile(`${root}/untracked.txt`, "keep me").fs!;
    const result = gitReset(fs, root, root, ["HEAD~1"], "hard");
    expect(result.error).toBeUndefined();
    expect(result.output).toBe(`HEAD is now at ${first.slice(0, 7)} first`);
    expect(resolveHead(result.fs, root)).toBe(first);
    expect(result.fs.readFile(`${root}/a.txt`).content).toBe("v1");
    // b.txt was added by the undone commit
    expect(result.fs.getNode(`${root}/b.txt`)).toBeNull();
    // untracked survives
    expect(result.fs.readFile(`${root}/untracked.txt`).content).toBe("keep me");
    expect(readIndex(result.fs, root).staged).toEqual({});
  });

  it("--hard removes staged-new files", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/staged-new.txt`, "x").fs!;
    fs = gitAdd(fs, root, root, ["staged-new.txt"], false).fs;
    const result = gitReset(fs, root, root, ["HEAD"], "hard");
    expect(result.fs.getNode(`${root}/staged-new.txt`)).toBeNull();
  });

  it("resets to a raw commit hash and to a branch name", () => {
    const { fs, first } = twoCommits();
    const byHash = gitReset(fs, root, root, [first], "hard");
    expect(resolveHead(byHash.fs, root)).toBe(first);
    const byBranch = gitReset(fs, root, root, ["main"], "hard");
    expect(byBranch.error).toBeUndefined();
  });

  it("errors on unknown revision", () => {
    const { fs } = twoCommits();
    const result = gitReset(fs, root, root, ["deadbee"], "hard");
    expect(result.error).toContain("ambiguous argument 'deadbee'");
  });

  it("rejects mode flags combined with paths", () => {
    const { fs } = twoCommits();
    const result = gitReset(fs, root, root, ["HEAD", "a.txt"], "hard");
    expect(result.error).toContain("Cannot do hard reset with paths");
  });

  it("refuses to reset during a rebase", () => {
    let { fs } = twoCommits();
    fs = fs.writeFile(`${root}/.git/rebase-state.json`, JSON.stringify({
      onto: "x", originalBranch: "main", originalHead: "y", todo: [], current: null, conflictFiles: [],
    })).fs!;
    const result = gitReset(fs, root, root, [], "hard");
    expect(result.error).toContain("rebase");
  });
});

// ── revision syntax: ^ / ~N chains, prefixes, remote refs ───────────

describe("resolveRef — parent selectors and abbreviations", () => {
  const root = "/home/player";

  /** main: c1 → c2 → merge(c2, feature@c3). Gives both a linear chain and a merge commit. */
  function repoWithMerge() {
    let fs = initRepo(makeFs());
    fs = fs.writeFile(`${root}/a.txt`, "v1").fs!;
    fs = addAndCommit(fs, root, "first");
    const c1 = resolveHead(fs, root)!;
    fs = createBranch(fs, root, "feature").fs;
    fs = fs.writeFile(`${root}/a.txt`, "v2").fs!;
    fs = addAndCommit(fs, root, "second");
    const c2 = resolveHead(fs, root)!;

    fs = gitCheckout(fs, root, "feature", false).fs;
    fs = fs.writeFile(`${root}/b.txt`, "feature").fs!;
    fs = addAndCommit(fs, root, "feature work");
    const c3 = resolveHead(fs, root)!;
    fs = gitCheckout(fs, root, "main", false).fs;
    const res = gitMerge(fs, root, "feature", AUTHOR, TEST_TS);
    fs = res.fs;
    return { fs, c1, c2, c3, mergeHash: resolveHead(fs, root)! };
  }

  it("walks ^ / ^1 as the first parent and ^2 as the merged side", () => {
    const { fs, c2, c3, mergeHash } = repoWithMerge();
    expect(resolveRef(fs, root, "HEAD")).toBe(mergeHash);
    expect(resolveRef(fs, root, "HEAD^")).toBe(c2);
    expect(resolveRef(fs, root, "HEAD^1")).toBe(c2);
    expect(resolveRef(fs, root, "HEAD^2")).toBe(c3);
    expect(resolveRef(fs, root, "HEAD^0")).toBe(mergeHash);
  });

  it("chains steps left to right", () => {
    const { fs, c1, c2, c3 } = repoWithMerge();
    expect(resolveRef(fs, root, "HEAD~1")).toBe(c2);
    expect(resolveRef(fs, root, "HEAD~2")).toBe(c1);
    expect(resolveRef(fs, root, "HEAD^^")).toBe(c1);
    expect(resolveRef(fs, root, "HEAD^1~1")).toBe(c1);
    // c3's first parent is c1 (feature branched before "second").
    expect(resolveRef(fs, root, "HEAD^2~1")).toBe(c1);
    expect(resolveRef(fs, root, `${c3}~1`)).toBe(c1);
    expect(resolveRef(fs, root, "main~1^")).toBe(c1);
  });

  it("returns null past the root commit, for ^2 on a plain commit, and for ^N beyond the parents", () => {
    const { fs, c1 } = repoWithMerge();
    expect(resolveRef(fs, root, "HEAD~3")).toBeNull();
    expect(resolveRef(fs, root, "HEAD~2^")).toBeNull();
    expect(resolveRef(fs, root, `${c1}^`)).toBeNull();
    expect(resolveRef(fs, root, "HEAD^^2")).toBeNull();
    expect(resolveRef(fs, root, "HEAD^3")).toBeNull();
    expect(resolveRef(fs, root, "nope^2")).toBeNull();
  });

  it("resolves a unique abbreviated hash but not an ambiguous or too-short one", () => {
    const { fs, mergeHash } = repoWithMerge();
    expect(resolveRef(fs, root, mergeHash.slice(0, 5))).toBe(mergeHash);
    expect(resolveRef(fs, root, mergeHash.slice(0, 5), { allowPrefix: false })).toBeNull();
    // 3 chars is below git's 4-char minimum, so it is not even attempted.
    expect(resolveRef(fs, root, mergeHash.slice(0, 3))).toBeNull();
    // Two objects share this prefix, so it is ambiguous rather than a pick.
    const ambiguous = fs.writeFile(`${root}/.git/objects/${mergeHash.slice(0, 4)}dead.json`, "{}").fs!;
    expect(resolveRef(ambiguous, root, mergeHash.slice(0, 4))).toBeNull();
  });

  it("resolves remote-tracking refs by their slashed name", () => {
    let fs = initRepo(makeFs());
    fs = fs.writeFile(`${root}/a.txt`, "v1").fs!;
    fs = addAndCommit(fs, root, "first");
    const first = resolveHead(fs, root)!;
    fs = fs.writeFile(`${root}/.git/refs/remotes/origin/main`, first).fs!;
    expect(resolveRef(fs, root, "origin/main")).toBe(first);
    expect(resolveRef(fs, root, "origin/nope")).toBeNull();
  });
});

// ── log / diff / reset pick up the new syntax ───────────────────────

describe("revision syntax through log, diff, and reset", () => {
  const root = "/home/player";

  function threeCommits() {
    let fs = initRepo(makeFs());
    fs = fs.writeFile(`${root}/a.txt`, "v1\n").fs!;
    fs = addAndCommit(fs, root, "first");
    fs = fs.writeFile(`${root}/a.txt`, "v2\n").fs!;
    fs = addAndCommit(fs, root, "second");
    fs = fs.writeFile(`${root}/a.txt`, "v3\n").fs!;
    fs = addAndCommit(fs, root, "third");
    return fs;
  }

  it("git log <rev> accepts ^ and ~N", () => {
    const fs = threeCommits();
    const at = (rev: string) =>
      getCommitLog(fs, root, splitRevsAndPaths(fs, root, root, [rev]).revs[0]!.from).map((c) => c.message);
    expect(at("HEAD^")).toEqual(["second", "first"]);
    expect(at("HEAD~2")).toEqual(["first"]);
  });

  it("git diff HEAD~2..HEAD spans the range", () => {
    const fs = threeCommits();
    const split = splitRevsAndPaths(fs, root, root, ["HEAD~2..HEAD"]);
    expect(split.error).toBeUndefined();
    const diffs = gitDiffFiles(fs, root, { from: split.revs[0].from, to: split.revs[0].to });
    expect(diffs).toEqual([{ path: "a.txt", oldContent: "v1\n", newContent: "v3\n", status: "modified" }]);
  });

  it("git reset --hard HEAD^ rewinds one commit", () => {
    let fs = threeCommits();
    const res = gitReset(fs, root, root, ["HEAD^"], "hard");
    fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(res.output).toContain("second");
    expect(getCommitLog(fs, root).map((c) => c.message)).toEqual(["second", "first"]);
    expect(fs.readFile(`${root}/a.txt`).content).toBe("v2\n");
  });

  it("prefers a file over an abbreviated hash that happens to match it", () => {
    let fs = threeCommits();
    const prefix = resolveHead(fs, root)!.slice(0, 4);
    // A tracked file whose *name* is a valid abbreviation of a real commit.
    fs = fs.writeFile(`${root}/${prefix}`, "not a revision\n").fs!;
    fs = addAndCommit(fs, root, "add lookalike");
    const split = splitRevsAndPaths(fs, root, root, [prefix]);
    expect(split.error).toBeUndefined();
    expect(split.revs).toEqual([]);
    expect(split.paths).toEqual([prefix]);
  });
});

// ── detached HEAD ───────────────────────────────────────────────────

describe("git checkout <commit> (detached HEAD)", () => {
  const root = "/home/player";

  function twoCommits() {
    let fs = initRepo(makeFs());
    fs = fs.writeFile(`${root}/a.txt`, "v1\n").fs!;
    fs = addAndCommit(fs, root, "first");
    const first = resolveHead(fs, root)!;
    fs = fs.writeFile(`${root}/a.txt`, "v2\n").fs!;
    fs = addAndCommit(fs, root, "second");
    return { fs, first, second: resolveHead(fs, root)! };
  }

  it("detaches onto a full hash, restoring that tree", () => {
    const { fs: start, first, second } = twoCommits();
    const res = gitCheckout(start, root, first, false);
    const fs = res.fs;
    expect(res.error).toBeUndefined();
    expect(res.output).toBe(`Note: switching to '${first}'.\n\nHEAD is now at ${first.slice(0, 7)} first`);
    expect(res.triggerEvents).toEqual([{ type: "command_executed", detail: "git_checkout_detached" }]);
    expect(fs.readFile(`${root}/.git/HEAD`).content).toBe(first);
    expect(resolveHead(fs, root)).toBe(first);
    expect(fs.readFile(`${root}/a.txt`).content).toBe("v1\n");
    // main is untouched.
    expect(fs.readFile(`${root}/.git/refs/heads/main`).content!.trim()).toBe(second);
  });

  it("treats `git checkout HEAD` as a no-op instead of detaching", () => {
    const { fs, second } = twoCommits();
    const res = gitCheckout(fs, root, "HEAD", false);
    expect(res.error).toBeUndefined();
    expect(res.fs.readFile(`${root}/.git/HEAD`).content).toBe("ref: refs/heads/main");
    expect(gitStatus(res.fs, root).detachedAt).toBeUndefined();
    expect(resolveHead(res.fs, root)).toBe(second);
  });

  it("detaches onto an abbreviated hash and onto a rev expression", () => {
    const { fs, first } = twoCommits();
    expect(resolveHead(gitCheckout(fs, root, first.slice(0, 5), false).fs, root)).toBe(first);
    expect(resolveHead(gitCheckout(fs, root, "HEAD~1", false).fs, root)).toBe(first);
  });

  it("reports the detached commit in status", () => {
    const { fs, first } = twoCommits();
    const detached = gitCheckout(fs, root, first, false).fs;
    const status = gitStatus(detached, root);
    expect(status.branch).toBeNull();
    expect(status.detachedAt).toBe(first);
    expect(formatStatus(status, false, true)).toContain(`HEAD detached at ${first.slice(0, 7)}`);
  });

  it("commits onto the raw HEAD, leaving the branch behind", () => {
    const { fs: start, first, second } = twoCommits();
    let fs = gitCheckout(start, root, first, false).fs;
    fs = fs.writeFile(`${root}/c.txt`, "detached work\n").fs!;
    fs = gitAdd(fs, root, root, ["c.txt"], false).fs;
    const res = gitCommit(fs, root, "work while detached", AUTHOR, false, false, TEST_TS);
    fs = res.fs;

    const newHash = resolveHead(fs, root)!;
    expect(res.output.split("\n")[0]).toBe(`[detached HEAD ${newHash}] work while detached`);
    expect(fs.readFile(`${root}/.git/HEAD`).content).toBe(newHash);
    expect(newHash).not.toBe(first);
    expect(fs.readFile(`${root}/.git/refs/heads/main`).content!.trim()).toBe(second);
    expect(getCommitLog(fs, root).map((c) => c.message)).toEqual(["work while detached", "first"]);
  });

  it("re-attaches by checking out a branch again", () => {
    const { fs: start, first, second } = twoCommits();
    let fs = gitCheckout(start, root, first, false).fs;
    const res = gitCheckout(fs, root, "main", false);
    fs = res.fs;
    expect(res.output).toBe("Switched to branch 'main'");
    expect(gitStatus(fs, root).branch).toBe("main");
    expect(gitStatus(fs, root).detachedAt).toBeUndefined();
    expect(resolveHead(fs, root)).toBe(second);
    expect(fs.readFile(`${root}/a.txt`).content).toBe("v2\n");
  });

  it("branches off a detached HEAD with -b", () => {
    const { fs: start, first } = twoCommits();
    let fs = gitCheckout(start, root, first, false).fs;
    const res = gitCheckout(fs, root, "salvage", true);
    fs = res.fs;
    expect(res.output).toBe("Switched to a new branch 'salvage'");
    expect(res.triggerEvents).toEqual([{ type: "command_executed", detail: "git_checkout_b" }]);
    expect(fs.readFile(`${root}/.git/refs/heads/salvage`).content!.trim()).toBe(first);
    expect(gitStatus(fs, root).branch).toBe("salvage");
  });

  it("still refuses a target that is neither a branch nor a revision", () => {
    const { fs } = twoCommits();
    expect(gitCheckout(fs, root, "nope", false).error)
      .toBe("error: pathspec 'nope' did not match any file(s) known to git");
  });

  it("refuses to detach without an explicit opt-in (git switch)", () => {
    const { fs, first } = twoCommits();
    expect(gitCheckout(fs, root, first, false, false).error)
      .toBe(`fatal: a branch is expected, got commit '${first}'`);
    // A branch name is still fine with detaching disallowed.
    expect(gitCheckout(fs, root, "main", false, false).error).toBeUndefined();
  });
});
