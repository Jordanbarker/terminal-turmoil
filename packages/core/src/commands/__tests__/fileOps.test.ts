import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, binaryFile, dir } from "../../filesystem/builders";
import { isFile } from "../../filesystem/types";
import "../builtins";

const HOME = "/home/player";

function createTestFS(): VirtualFS {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "notes.txt": file("notes.txt", "alpha\nbeta\ngamma\n"),
        "keep.txt": file("keep.txt", "keep me\n"),
        "run.sh": file("run.sh", "echo hi\n", "rwxr-xr-x"),
        "report.pdf": binaryFile("report.pdf", "%PDF-1.4 garbled", "quarterly numbers"),
        "plain.txt": file("plain.txt", "just words\n"),
        docs: dir("docs", { "readme.md": file("readme.md", "readme\n") }),
      }),
    }),
  });
  return new VirtualFS(root, HOME, HOME);
}

function ctx(fs?: VirtualFS, overrides?: Partial<CommandContext>): CommandContext {
  const f = fs ?? createTestFS();
  return {
    fs: f,
    cwd: f.cwd,
    homeDir: f.homeDir,
    username: "player",
    activeComputer: "home",
    ...overrides,
  };
}

describe("cp/mv preserve file attributes", () => {
  it("cp of a binary file keeps metadata.binary and textContent", () => {
    const result = execute("cp", ["report.pdf", "copy.pdf"], {}, ctx());
    const node = result.newFs!.getNode(`${HOME}/copy.pdf`)!;
    expect(isFile(node) && node.metadata).toEqual({ binary: true, textContent: "quarterly numbers" });
  });

  it("mv keeps the executable bit on a script", () => {
    const result = execute("mv", ["run.sh", "scripts.sh"], {}, ctx());
    expect(result.newFs!.getNode(`${HOME}/scripts.sh`)!.permissions).toBe("rwxr-xr-x");
    expect(result.newFs!.getNode(`${HOME}/run.sh`)).toBeNull();
  });

  it("mv of a directory names the moved node after its new basename", () => {
    const result = execute("mv", ["docs", "archive"], {}, ctx());
    expect(result.newFs!.getNode(`${HOME}/archive`)!.name).toBe("archive");
  });

  it("redirecting into a chmod-protected file is refused and the content survives", () => {
    const locked = createTestFS().setPermissions(`${HOME}/keep.txt`, "r--r--r--").fs!;
    const write = locked.writeFile(`${HOME}/keep.txt`, "clobbered");
    expect(write.fs).toBeUndefined();
    expect(locked.readFile(`${HOME}/keep.txt`).content).toBe("keep me\n");
  });

  it("mv of a plain file over a binary one clears the stale binary metadata", () => {
    const result = execute("mv", ["plain.txt", "report.pdf"], {}, ctx());
    const node = result.newFs!.getNode(`${HOME}/report.pdf`)!;
    expect(isFile(node) && node.metadata).toBeUndefined();
    expect(isFile(node) && node.content).toBe("just words\n");
  });

  it("cp of a plain file over a binary one clears the stale binary metadata", () => {
    const result = execute("cp", ["plain.txt", "report.pdf"], {}, ctx());
    const node = result.newFs!.getNode(`${HOME}/report.pdf`)!;
    expect(isFile(node) && node.metadata).toBeUndefined();
  });

  it("write-side errors carry the calling command's prefix", () => {
    const locked = createTestFS().setPermissions(`${HOME}/keep.txt`, "r--r--r--").fs!;
    const cpResult = execute("cp", ["notes.txt", "keep.txt"], {}, ctx(locked));
    expect(cpResult.output).toBe(`cp: ${HOME}/keep.txt: Permission denied`);
    expect(cpResult.exitCode).toBe(1);

    const mvResult = execute("mv", ["notes.txt", "keep.txt"], {}, ctx(locked));
    expect(mvResult.output).toBe(`mv: ${HOME}/keep.txt: Permission denied`);
    expect(mvResult.exitCode).toBe(1);
  });
});

describe("cp -r keeps the copies it already made", () => {
  it("reports the unwritable child but commits the rest of the tree", () => {
    let fs = createTestFS();
    // `cp -r docs backup` retargets into an existing dir, so the collision is
    // at backup/docs/readme.md.
    fs = fs.makeDirectory(`${HOME}/backup`).fs!;
    fs = fs.makeDirectory(`${HOME}/backup/docs`).fs!;
    fs = fs.writeFile(`${HOME}/backup/docs/readme.md`, "old").fs!;
    fs = fs.setPermissions(`${HOME}/backup/docs/readme.md`, "r--r--r--").fs!;
    fs = fs.writeFile(`${HOME}/docs/extra.txt`, "extra").fs!;

    const result = execute("cp", ["docs", "backup"], { r: true }, ctx(fs));
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe(`cp: ${HOME}/backup/docs/readme.md: Permission denied`);
    // The sibling that could be copied is still there, not rolled back.
    expect(result.newFs!.readFile(`${HOME}/backup/docs/extra.txt`).content).toBe("extra");
    expect(result.newFs!.readFile(`${HOME}/backup/docs/readme.md`).content).toBe("old");
  });
});

describe("chmod -R traversal guarding", () => {
  function lockedFS(): VirtualFS {
    let fs = createTestFS();
    fs = fs.makeDirectory(`${HOME}/vault`).fs!;
    fs = fs.writeFile(`${HOME}/vault/secret.txt`, "shh").fs!;
    fs = fs.setPermissions(`${HOME}/vault`, "rwx------").fs!;
    return fs;
  }

  it("skips a subtree the walk cannot descend into, and says so", () => {
    const result = execute("chmod", ["700", "."], { R: true }, ctx(lockedFS()));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(`chmod: cannot read directory '${HOME}/vault': Permission denied`);
    // vault itself is reachable and re-moded; its contents are untouched.
    expect(result.newFs!.getNode(`${HOME}/vault`)!.permissions).toBe("rwx------");
    expect(result.newFs!.getNode(`${HOME}/vault/secret.txt`)!.permissions).toBe("rw-r--r--");
    // Reachable siblings are still processed.
    expect(result.newFs!.getNode(`${HOME}/notes.txt`)!.permissions).toBe("rwx------");
  });

  it("descends when the same chmod opens the directory up", () => {
    const result = execute("chmod", ["777", "."], { R: true }, ctx(lockedFS()));
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.newFs!.getNode(`${HOME}/vault/secret.txt`)!.permissions).toBe("rwxrwxrwx");
  });

  it("naming the locked directory directly still works (it is the walk's own open)", () => {
    const result = execute("chmod", ["750", "vault"], { R: true }, ctx(lockedFS()));
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.newFs!.getNode(`${HOME}/vault/secret.txt`)!.permissions).toBe("rwxr-x---");
  });

  it("nested chmod -R that tightens as it goes still reaches every level", () => {
    let fs = createTestFS();
    fs = fs.makeDirectory(`${HOME}/docs/deep`).fs!;
    fs = fs.writeFile(`${HOME}/docs/deep/leaf.txt`, "leaf").fs!;
    const result = execute("chmod", ["700", "docs"], { R: true }, ctx(fs));
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.newFs!.getNode(`${HOME}/docs/deep/leaf.txt`)!.permissions).toBe("rwx------");
  });
});

describe("grep filename prefixes survive a failed operand", () => {
  it("still prefixes matches when one of two operands is missing", () => {
    const result = execute("grep", ["alpha", "nope.txt", "notes.txt"], {}, ctx());
    expect(result.output).toContain("nope.txt: No such file or directory");
    expect(result.output.replace(/\x1b\[[0-9;]*m/g, "")).toContain(`${HOME}/notes.txt:alpha`);
  });

  it("single-operand output stays unprefixed", () => {
    const result = execute("grep", ["alpha", "notes.txt"], {}, ctx());
    expect(result.output.replace(/\x1b\[[0-9;]*m/g, "")).toBe("alpha");
  });
});

describe("rm keeps completed deletions when a later operand fails", () => {
  it("reports the bad operand but still removes the good one", () => {
    const result = execute("rm", ["notes.txt", "missing.txt"], {}, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("missing.txt");
    expect(result.newFs).toBeDefined();
    expect(result.newFs!.getNode(`${HOME}/notes.txt`)).toBeNull();
    expect(result.newFs!.getNode(`${HOME}/keep.txt`)).not.toBeNull();
  });

  it("a directory operand without -r does not abort the remaining operands", () => {
    const result = execute("rm", ["docs", "notes.txt"], {}, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Is a directory");
    expect(result.newFs!.getNode(`${HOME}/docs`)).not.toBeNull();
    expect(result.newFs!.getNode(`${HOME}/notes.txt`)).toBeNull();
  });

  it("emits file_removed events only for the operands that succeeded", () => {
    const result = execute("rm", ["notes.txt", "missing.txt"], {}, ctx());
    expect(result.triggerEvents).toEqual([{ type: "file_removed", detail: `${HOME}/notes.txt` }]);
  });
});

describe("missing-file exit codes and error prefixes", () => {
  const run = (cmd: string, args: string[]) =>
    execute(cmd, args, {}, ctx(undefined, { rawArgs: args }));

  it.each(["cat", "head", "tail", "wc", "sort", "uniq", "grep"])(
    "%s exits 1 on a missing file",
    (cmd) => {
      const args = cmd === "grep" ? ["pattern", "nope.txt"] : ["nope.txt"];
      const result = run(cmd, args);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`${cmd}:`);
      expect(result.output).toContain("No such file or directory");
    },
  );

  it("permission errors carry the calling command's prefix", () => {
    const locked = createTestFS().setPermissions(`${HOME}/notes.txt`, "rw-------").fs!;
    const result = execute("head", ["notes.txt"], {}, ctx(locked, { rawArgs: ["notes.txt"] }));
    expect(result.output).toBe(`head: ${HOME}/notes.txt: Permission denied`);
    expect(result.exitCode).toBe(1);
  });

  it("missing operands stay usage errors (exit 2) for head/tail/wc/sort/uniq", () => {
    for (const cmd of ["head", "tail", "wc", "sort", "uniq"]) {
      const result = execute(cmd, [], {}, ctx(undefined, { rawArgs: [] }));
      expect(result.exitCode, cmd).toBe(2);
    }
  });

  it("sort reports the bad operand and still sorts the readable one", () => {
    const result = execute("sort", ["nope.txt", "notes.txt"], {}, ctx());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("sort: ");
    expect(result.output).toContain("alpha");
  });
});
