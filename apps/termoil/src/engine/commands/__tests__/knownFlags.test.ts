import { describe, it, expect } from "vitest";
import { execute, getAliasesFor, getCommandList } from "@tt/core/commands/registry";
import { getKnownFlags, shouldValidateFlags } from "@tt/core/commands/flagValidation";
import { parseInput } from "@tt/core/commands/parser";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

import "../builtins";

const root: DirectoryNode = {
  type: "directory",
  name: "/",
  permissions: "rwxr-xr-x",
  hidden: false,
  children: {
    "notes.txt": {
      type: "file",
      name: "notes.txt",
      permissions: "rw-r--r--",
      hidden: false,
      content: "alpha\nbeta\ngamma\n",
    },
  },
};

function ctx(overrides?: Partial<CommandContext>): CommandContext {
  return {
    fs: new VirtualFS(root, "/", "/"),
    cwd: "/",
    homeDir: "/",
    username: "ren",
    activeComputer: "home",
    storyFlags: { apt_unlocked: true },
    ...overrides,
  };
}

/**
 * Run a whole command line the way the shell does: parse it, then dispatch with
 * the parsed args/flags AND `rawArgs`. Passing rawArgs matters for `sudo`,
 * which has to re-split the line around the command name it elevates.
 */
function run(line: string, overrides?: Partial<CommandContext>) {
  const parsed = parseInput(line);
  return execute(parsed.command, parsed.args, parsed.flags, ctx({ rawArgs: parsed.rawArgs, ...overrides }));
}

describe("known-flag declarations", () => {
  it("every registered command declares its flags or opts out", () => {
    const names = new Set<string>();
    for (const { name } of getCommandList()) {
      names.add(name);
      for (const alias of getAliasesFor(name)) names.add(alias);
    }

    const undeclared = [...names]
      .filter((name) => shouldValidateFlags(name) && getKnownFlags(name) === undefined)
      .sort();

    // An undeclared command silently rejects every flag. Declare `{}` when a
    // command genuinely takes none, so the omission stays a real signal.
    expect(undeclared).toEqual([]);
  });

  it("less -N numbers the lines instead of erroring", () => {
    const result = run("less -N notes.txt");
    expect(result.exitCode).toBeUndefined();
    expect(result.lessSession?.content).toBe("      1 alpha\n      2 beta\n      3 gamma");
  });

  it("less without -N passes the content through untouched", () => {
    expect(run("less notes.txt").lessSession?.content).toBe("alpha\nbeta\ngamma\n");
  });

  it("less -N shows the same lines as less, never one more or fewer", () => {
    // LessSession splits on \n and drops the element a final newline leaves
    // behind. numberLines has to use that same rule (splitLines), or the
    // numbered view gains a phantom trailing line.
    const pagerLines = (content: string) => {
      const lines = content === "" ? [] : content.split("\n");
      if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      return lines;
    };
    for (const content of ["alpha\nbeta\ngamma\n", "a", "a\n\n", "x\ny", "\n"]) {
      const numbered = run("less -N", { stdin: content }).lessSession!.content;
      expect(pagerLines(numbered).length).toBe(pagerLines(content).length);
    }
  });

  it("sudo -i does not read as an invalid option", () => {
    const result = run("sudo -i");
    expect(result.output).toBe("usage: sudo command [arg ...]");
    expect(result.exitCode).toBeUndefined();
  });

  it("sudo -i still runs the command that follows it, elevated", () => {
    const result = run("sudo -i apt update");
    expect(result.output).toContain("Reading package lists");
  });

  it("sudo still rejects a flag of its own that it does not know", () => {
    const result = run("sudo -Z apt update");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("sudo: invalid option -- 'Z'");
  });

  // The route a player actually types: sudo must not claim `-y` as its own.
  it("sudo apt install -y tree installs rather than erroring", () => {
    const result = run("sudo apt install -y tree");
    expect(result.output).toContain("Setting up tree");
    expect(result.triggerEvents).toEqual([{ type: "command_executed", detail: "apt_install_tree" }]);
  });

  it("sudo forwards a long flag to the command it elevates", () => {
    const result = run("sudo apt list --upgradable");
    expect(result.output).not.toContain("invalid option");
    expect(result.output).not.toContain("unrecognized option");
  });

  it("sudo hands the sub-command its own rawArgs, not sudo's", () => {
    // `tree` re-parses ctx.rawArgs; it must not see "tree" as an operand.
    const result = run("sudo tree -L 1", { storyFlags: { tree_installed: true } });
    expect(result.output).not.toContain("tree: ");
  });

  it("still rejects a flag no command declares", () => {
    const result = run("less -Z notes.txt");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("less: invalid option -- 'Z'");
  });
});
