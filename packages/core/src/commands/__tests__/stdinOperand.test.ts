import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { parseInput } from "../parser";
import { fileOperands } from "../operands";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

import "../builtins";

/**
 * A bare `-` operand means "read stdin" (coreutils). It reaches the handler as
 * a positional arg, because `parseInput` only routes a token to flags when it
 * is longer than one character. Resolving it as a path yields
 * `wc: /-: No such file or directory`, which is what a naive cleanup produces.
 */

const root: DirectoryNode = {
  type: "directory",
  name: "/",
  permissions: "rwxr-xr-x",
  hidden: false,
  children: {
    "nums.txt": {
      type: "file",
      name: "nums.txt",
      permissions: "rw-r--r--",
      hidden: false,
      content: "3\n1\n2\n",
    },
  },
};

function run(line: string, stdin?: string) {
  const parsed = parseInput(line);
  const ctx: CommandContext = {
    fs: new VirtualFS(root, "/", "/"),
    cwd: "/",
    homeDir: "/",
    username: "ren",
    activeComputer: "home",
    storyFlags: {},
    stdin,
    rawArgs: parsed.rawArgs,
  };
  return execute(parsed.command, parsed.args, parsed.flags, ctx);
}

describe("fileOperands", () => {
  it("treats a bare - as 'no file named, read stdin'", () => {
    expect(fileOperands(["-"])).toEqual({ files: [], readStdin: true });
    expect(fileOperands([])).toEqual({ files: [], readStdin: true });
  });

  it("keeps real paths and does not confuse them with the marker", () => {
    expect(fileOperands(["a.txt", "-"])).toEqual({ files: ["a.txt"], readStdin: false });
    expect(fileOperands(["-a"])).toEqual({ files: ["-a"], readStdin: false });
  });
});

describe("bare - operand reads stdin", () => {
  it("wc -", () => {
    const result = run("wc -", "one two\nthree");
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.output).not.toContain("No such file");
    expect(result.output).toBe(run("wc", "one two\nthree").output);
  });

  it("wc -l -", () => {
    const result = run("wc -l -", "a\nb\nc");
    expect(result.output.trim()).toBe("3");
  });

  it("sort -", () => {
    const result = run("sort -", "b\na\nc");
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.output).toBe("a\nb\nc");
  });

  it("uniq -", () => {
    const result = run("uniq -", "a\na\nb");
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.output).toBe("a\nb");
  });

  it("less -", () => {
    const result = run("less -", "a\nb");
    expect(result.lessSession?.content).toBe("a\nb");
  });

  it("still reports a missing operand when nothing is piped in", () => {
    expect(run("wc -").output).toBe("wc: missing file operand");
    expect(run("sort -").output).toBe("sort: missing file operand");
  });

  it("still reads a named file when one is given", () => {
    expect(run("sort nums.txt").output).toBe("1\n2\n3");
  });
});
