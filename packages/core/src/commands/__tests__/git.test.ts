import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import "../builtins";

const HOME = "/home/player";

function createContext(fs: VirtualFS): CommandContext {
  return {
    fs,
    cwd: HOME,
    homeDir: HOME,
    username: "player",
    activeComputer: "home",
    commandHistory: [],
    envVars: {},
    setEnvVars: () => {},
    aliases: {},
    setAliases: () => {},
  };
}

function git(ctx: CommandContext, rawArgs: string[]) {
  return execute("git", rawArgs, {}, { ...ctx, rawArgs });
}

function setupRepoWithStagedFile(): CommandContext {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "notes.txt": file("notes.txt", "alpha\n"),
      }),
    }),
  });
  let ctx = createContext(new VirtualFS(root, HOME, HOME));
  for (const args of [["init"], ["add", "notes.txt"]]) {
    const result = git(ctx, args);
    expect(result.newFs).toBeDefined();
    ctx = { ...ctx, fs: result.newFs! };
  }
  return ctx;
}

describe("git commit message errors", () => {
  it("errors like real git when -m is given with no value", () => {
    const result = git(setupRepoWithStagedFile(), ["commit", "-m"]);
    expect(result.stderr).toBe("error: switch `m' requires a value");
    expect(result.exitCode).toBe(129);
  });

  it("errors about the missing editor when -m is absent", () => {
    const result = git(setupRepoWithStagedFile(), ["commit"]);
    expect(result.stderr).toContain("Terminal is dumb, but EDITOR unset");
    expect(result.stderr).toContain("-m or -F");
    expect(result.output).toBe("");
    expect(result.exitCode).toBe(1);
  });

  it("aborts on an empty commit message", () => {
    const result = git(setupRepoWithStagedFile(), ["commit", "-m", ""]);
    expect(result.stderr).toBe("Aborting commit due to empty commit message.");
    expect(result.exitCode).toBe(1);
  });

  it("still commits with a non-empty message", () => {
    const result = git(setupRepoWithStagedFile(), ["commit", "-m", "a"]);
    expect(result.output).toContain("a");
    expect(result.newFs).toBeDefined();
    expect(result.exitCode).toBeUndefined();
  });
});

function setupCommittedRepo(): CommandContext {
  const ctx = setupRepoWithStagedFile();
  const result = git(ctx, ["commit", "-m", "init"]);
  expect(result.newFs).toBeDefined();
  return { ...ctx, fs: result.newFs! };
}

describe("git value-flag and exit-code fidelity", () => {
  it("checkout -b with no value errors instead of creating branch 'true'", () => {
    const result = git(setupCommittedRepo(), ["checkout", "-b"]);
    expect(result.stderr).toBe("error: switch `b' requires a value");
    expect(result.exitCode).toBe(129);
  });

  it("checkout -b '' rejects the empty branch name", () => {
    const result = git(setupCommittedRepo(), ["checkout", "-b", ""]);
    expect(result.stderr).toBe("fatal: '' is not a valid branch name");
    expect(result.exitCode).toBe(128);
  });

  it("checkout -b feature main creates 'feature', not 'main'", () => {
    const result = git(setupCommittedRepo(), ["checkout", "-b", "feature", "main"]);
    expect(result.output).toContain("feature");
    expect(result.newFs).toBeDefined();
  });

  it("switch -c with no value errors", () => {
    const result = git(setupCommittedRepo(), ["switch", "-c"]);
    expect(result.stderr).toBe("error: switch `c' requires a value");
    expect(result.exitCode).toBe(129);
  });

  it("clone -b with no value errors instead of being ignored", () => {
    const result = git(setupCommittedRepo(), ["clone", "-b"]);
    expect(result.exitCode).toBe(129);
  });

  it("usage errors report nonzero exit codes", () => {
    const ctx = setupCommittedRepo();
    expect(git(ctx, ["rm"]).exitCode).toBe(129);
    expect(git(ctx, ["add"]).exitCode).toBe(1);
    expect(git(ctx, ["branch", "-d"]).exitCode).toBe(128);
    expect(git(ctx, ["branch", "-d"]).stderr).toBe("fatal: branch name required");
    expect(git(ctx, ["checkout"]).exitCode).toBe(1);
    expect(git(ctx, ["stash", "bogus"]).exitCode).toBe(129);
  });
});

describe("git commit happy path", () => {
  it("commits with a non-empty message", () => {
    const result = git(setupRepoWithStagedFile(), ["commit", "-m", "a"]);
    expect(result.output).toContain("a");
    expect(result.newFs).toBeDefined();
    expect(result.exitCode).toBeUndefined();
  });
});

/** Runs a series of git subcommands, threading the FS, and returns the last result. */
function runAll(ctx: CommandContext, argSets: string[][]) {
  let last = git(ctx, argSets[0]);
  for (const args of argSets.slice(1)) {
    ctx = { ...ctx, fs: last.newFs ?? ctx.fs };
    last = git(ctx, args);
  }
  return { result: last, ctx: { ...ctx, fs: last.newFs ?? ctx.fs } };
}

/** Repo with three commits: a.txt then b.txt then a.txt edited. */
function setupHistory(): CommandContext {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", { "a.txt": file("a.txt", "one\n") }),
    }),
  });
  const start = createContext(new VirtualFS(root, HOME, HOME));
  let { ctx } = runAll(start, [["init"], ["add", "a.txt"], ["commit", "-m", "first"]]);
  ctx = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/b.txt`, "bee\n").fs! };
  ({ ctx } = runAll(ctx, [["add", "b.txt"], ["commit", "-m", "second"]]));
  ctx = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/a.txt`, "one\ntwo\n").fs! };
  ({ ctx } = runAll(ctx, [["add", "a.txt"], ["commit", "-m", "third"]]));
  return ctx;
}

describe("git log -n", () => {
  it("limits with -n N and the -N shorthand", () => {
    const ctx = setupHistory();
    expect(git(ctx, ["log", "--oneline", "-n", "2"]).output.split("\n")).toHaveLength(2);
    expect(git(ctx, ["log", "--oneline", "-1"]).output.split("\n")).toHaveLength(1);
    expect(git(ctx, ["log", "--oneline"]).output.split("\n")).toHaveLength(3);
  });

  it("errors on a valueless -n and a non-numeric one", () => {
    const ctx = setupHistory();
    const missing = git(ctx, ["log", "-n"]);
    expect(missing.stderr).toBe("error: switch `n' requires a value");
    expect(missing.exitCode).toBe(129);
    expect(git(ctx, ["log", "-n", "abc"]).exitCode).toBe(128);
  });

  it("rejects the numeric shorthand on subcommands that have no -n", () => {
    const result = git(setupHistory(), ["branch", "-5"]);
    expect(result.stderr).toBe("error: unknown switch `n'");
    expect(result.exitCode).toBe(129);
  });
});

describe("git log revisions and pathspecs", () => {
  it("starts the walk at an explicit revision", () => {
    const ctx = setupHistory();
    expect(git(ctx, ["log", "--oneline", "HEAD~1"]).output).toBe(
      git(ctx, ["log", "--oneline"]).output.split("\n").slice(1).join("\n"),
    );
  });

  it("filters to commits touching a path", () => {
    const ctx = setupHistory();
    expect(git(ctx, ["log", "--oneline", "--", "b.txt"]).output).toContain("second");
    expect(git(ctx, ["log", "--oneline", "--", "b.txt"]).output.split("\n")).toHaveLength(1);
    expect(git(ctx, ["log", "--oneline", "--", "a.txt"]).output.split("\n")).toHaveLength(2);
  });

  it("rejects an argument that is neither a revision nor a known path", () => {
    const result = git(setupHistory(), ["log", "nope"]);
    expect(result.stderr).toBe("fatal: ambiguous argument 'nope': unknown revision or path not in the working tree.");
    expect(result.exitCode).toBe(128);
  });
});

/** Committed repo with a staged edit under src/, an unstaged one at root, and two untracked files. */
function setupStatusTree(): CommandContext {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", { "root.txt": file("root.txt", "at root\n") }),
    }),
  });
  let ctx = createContext(new VirtualFS(root, HOME, HOME));
  ctx = { ...ctx, fs: ctx.fs.makeDirectory(`${HOME}/src`).fs! };
  ctx = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/src/tracked.txt`, "one\n").fs! };
  ({ ctx } = runAll(ctx, [["init"], ["add", "."], ["commit", "-m", "init"]]));
  ctx = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/src/tracked.txt`, "one\ntwo\n").fs! };
  ({ ctx } = runAll(ctx, [["add", "src/tracked.txt"]]));
  ctx = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/root.txt`, "at root, edited\n").fs! };
  ctx = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/src/fresh.txt`, "new\n").fs! };
  ctx = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/loose.txt`, "new\n").fs! };
  return ctx;
}

describe("git status pathspecs", () => {
  it("shows every change with no pathspec", () => {
    const out = git(setupStatusTree(), ["status", "-s"]).output;
    expect(out.split("\n").sort()).toEqual(
      ["M  src/tracked.txt", " M root.txt", "?? loose.txt", "?? src/fresh.txt"].sort(),
    );
  });

  it("narrows to a directory pathspec", () => {
    const out = git(setupStatusTree(), ["status", "-s", "src"]).output;
    expect(out).toContain("M  src/tracked.txt");
    expect(out).toContain("?? src/fresh.txt");
    expect(out).not.toContain("root.txt");
    expect(out).not.toContain("loose.txt");
  });

  it("narrows to a single file after the -- separator", () => {
    const out = git(setupStatusTree(), ["status", "-s", "--", "root.txt"]).output;
    expect(out).toBe(" M root.txt");
  });

  it("resolves a relative pathspec against the cwd", () => {
    const ctx = setupStatusTree();
    const out = git({ ...ctx, cwd: `${HOME}/src` }, ["status", "-s", "tracked.txt"]).output;
    expect(out).toBe("M  src/tracked.txt");
  });

  it("reports a clean tree, not an error, for an unmatched pathspec", () => {
    const result = git(setupStatusTree(), ["status", "nosuchdir"]);
    expect(result.exitCode).toBeUndefined();
    expect(result.stderr).toBeUndefined();
    expect(result.output).toContain("On branch");
    expect(result.output).toContain("nothing to commit, working tree clean");
  });

  it("keeps branch info while filtering the change sections", () => {
    const out = git(setupStatusTree(), ["status", "src"]).output;
    expect(out).toContain("On branch main");
    expect(out).toContain("Changes to be committed:");
    expect(out).toContain("Untracked files:");
    expect(out).not.toContain("Changes not staged for commit:");
  });
});

describe("git diff revisions and pathspecs", () => {
  it("diffs a commit against the working tree", () => {
    const ctx = setupHistory();
    const out = git(ctx, ["diff", "HEAD~1"]).output;
    expect(out).toContain("diff --git a/a.txt b/a.txt");
    expect(out).toContain("+two");
    expect(out).not.toContain("b.txt");
  });

  it("accepts both the range and two-positional spellings", () => {
    const ctx = setupHistory();
    const range = git(ctx, ["diff", "HEAD~2..HEAD"]).output;
    expect(range).toBe(git(ctx, ["diff", "HEAD~2", "HEAD"]).output);
    expect(range).toContain("a.txt");
    expect(range).toContain("b.txt");
  });

  it("narrows to a pathspec", () => {
    const out = git(setupHistory(), ["diff", "HEAD~2", "HEAD", "--", "b.txt"]).output;
    expect(out).toContain("b.txt");
    expect(out).not.toContain("a.txt");
  });

  it("--cached <rev> compares the index, not the working tree", () => {
    const ctx = setupHistory();
    // Stage one change, then leave a second, unstaged one behind it.
    let staged = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/a.txt`, "one\ntwo\nthree\n").fs! };
    ({ ctx: staged } = runAll(staged, [["add", "a.txt"]]));
    staged = { ...staged, fs: staged.fs.writeFile(`${HOME}/a.txt`, "one\ntwo\nthree\nfour\n").fs! };

    const cached = git(staged, ["diff", "--cached", "HEAD"]).output;
    expect(cached).toContain("+three");
    expect(cached).not.toContain("+four");
  });

  it("rejects an unknown revision", () => {
    const result = git(setupHistory(), ["diff", "nosuchref"]);
    expect(result.stderr).toContain("ambiguous argument 'nosuchref'");
    expect(result.exitCode).toBe(128);
  });

  it("exits 0 when only untracked files are present", () => {
    const ctx = setupHistory();
    const dirty = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/scratch.txt`, "junk\n").fs! };
    const result = git(dirty, ["diff"]);
    expect(result.output).toBe("");
    expect(result.exitCode).toBe(0);
  });
});

describe("git restore / checkout <file>", () => {
  it("--staged unstages without touching the working tree", () => {
    const ctx = setupHistory();
    const edited = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/a.txt`, "clobbered\n").fs! };
    const { result, ctx: after } = runAll(edited, [["add", "a.txt"], ["restore", "--staged", "a.txt"]]);
    expect(result.output).toBe("");
    expect(result.exitCode).toBeUndefined();
    expect(after.fs.readFile(`${HOME}/a.txt`).content).toBe("clobbered\n");
    expect(git(after, ["status", "-s"]).output).toBe(" M a.txt");
  });

  it("restores working-tree content from HEAD", () => {
    const ctx = setupHistory();
    const edited = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/a.txt`, "clobbered\n").fs! };
    const result = git(edited, ["restore", "a.txt"]);
    expect(result.newFs!.readFile(`${HOME}/a.txt`).content).toBe("one\ntwo\n");
  });

  it("restores from the index when the file is staged", () => {
    const ctx = setupHistory();
    let edited = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/a.txt`, "staged\n").fs! };
    ({ ctx: edited } = runAll(edited, [["add", "a.txt"]]));
    edited = { ...edited, fs: edited.fs.writeFile(`${HOME}/a.txt`, "then this\n").fs! };
    const result = git(edited, ["restore", "a.txt"]);
    expect(result.newFs!.readFile(`${HOME}/a.txt`).content).toBe("staged\n");
  });

  it("checkout -- <file> is the legacy spelling", () => {
    const ctx = setupHistory();
    const edited = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/a.txt`, "clobbered\n").fs! };
    const result = git(edited, ["checkout", "--", "a.txt"]);
    expect(result.newFs!.readFile(`${HOME}/a.txt`).content).toBe("one\ntwo\n");
  });

  it("refuses checkout <rev> -- <file> rather than restoring the wrong content", () => {
    const ctx = setupHistory();
    const edited = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/a.txt`, "clobbered\n").fs! };
    const result = git(edited, ["checkout", "HEAD~1", "--", "a.txt"]);
    expect(result.stderr).toContain("not supported");
    expect(result.exitCode).toBe(128);
    expect((result.newFs ?? edited.fs).readFile(`${HOME}/a.txt`).content).toBe("clobbered\n");
  });

  it("checkout <file> restores when no branch has that name", () => {
    const ctx = setupHistory();
    const edited = { ...ctx, fs: ctx.fs.writeFile(`${HOME}/a.txt`, "clobbered\n").fs! };
    const result = git(edited, ["checkout", "a.txt"]);
    expect(result.newFs!.readFile(`${HOME}/a.txt`).content).toBe("one\ntwo\n");
  });

  it("a branch of the same name still wins over a file", () => {
    const { ctx } = runAll(setupHistory(), [["branch", "a.txt"]]);
    const result = git(ctx, ["checkout", "a.txt"]);
    expect(result.output).toBe("Switched to branch 'a.txt'");
  });

  it("errors on an unknown pathspec and on no pathspec at all", () => {
    const ctx = setupHistory();
    const unknown = git(ctx, ["restore", "ghost.txt"]);
    expect(unknown.stderr).toBe("error: pathspec 'ghost.txt' did not match any file(s) known to git");
    expect(unknown.exitCode).toBe(1);
    const none = git(ctx, ["restore"]);
    expect(none.stderr).toBe("fatal: you must specify path(s) to restore");
    expect(none.exitCode).toBe(128);
  });

  it("rejects unknown restore flags", () => {
    expect(git(setupHistory(), ["restore", "--bogus", "a.txt"]).exitCode).toBe(129);
  });
});
