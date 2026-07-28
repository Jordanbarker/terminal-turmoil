import { describe, it, expect } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { dir, file } from "@tt/core/filesystem/builders";
import { execute } from "@tt/core/commands/registry";
import { parseInput } from "@tt/core/commands/parser";
import type { CommandContext } from "@tt/core/commands/types";
import "../../../engine/commands/builtins";
import { ALL_ITEMS } from "../menuItems";

/**
 * Chip is the game's git tutor, so anything it prints as a command has to be a
 * command this engine actually implements (real git's `restore` is not). Every
 * `git ...` line in a chip response is executed here against a real repo; only
 * the "no such subcommand / no such flag" class of failure is a test failure,
 * since examples like `git push` legitimately fail for lack of a remote.
 */

const USERNAME = "testplayer";

function emptyFs(): VirtualFS {
  const home = dir(USERNAME, { "app.py": file("app.py", "print('hi')\n") });
  const root = dir("/", { home: dir("home", { [USERNAME]: home }) });
  return new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
}

/** A repo with one commit on `main`, so branch/switch/log examples have a base. */
function makeRepo(): VirtualFS {
  let fs = emptyFs();
  for (const cmd of ["git init", "git add app.py", 'git commit -m "init"']) {
    fs = run(fs, cmd).newFs ?? fs;
  }
  return fs;
}

function run(fs: VirtualFS, line: string) {
  const parsed = parseInput(line);
  const ctx: CommandContext = {
    fs,
    cwd: fs.cwd,
    homeDir: fs.homeDir,
    username: USERNAME,
    activeComputer: "devcontainer",
    rawArgs: parsed.rawArgs,
    gitAuthor: `Ren <${USERNAME}@nexacorp.com>`,
  };
  return execute(parsed.command, parsed.args, parsed.flags, ctx);
}

/**
 * Every `git ...` example line across chip's static responses.
 *
 * Chip formats examples two ways: with a trailing `# comment` and with an
 * aligned prose description (`git commit -m "x"   Commit with a message`).
 * Both are separated from the command by a run of 2+ spaces, which a real
 * command line never contains, so that run is the cut point. Cutting on `#`
 * alone left the prose glued on, and git accepts stray positionals, so those
 * examples used to pass without ever being tested.
 */
function gitExamples(): { itemId: string; command: string }[] {
  const out: { itemId: string; command: string }[] = [];
  for (const item of ALL_ITEMS) {
    if (typeof item.response !== "string") continue;
    for (const raw of item.response.split("\n")) {
      const match = raw.match(/^\s+(git .+)$/);
      if (!match) continue;
      const command = match[1].split(/ {2,}/)[0].trim();
      // Placeholders (`git add <file>`) aren't runnable as written.
      if (command.includes("<")) continue;
      out.push({ itemId: item.id, command });
    }
  }
  return out;
}

/**
 * Errors that mean "chip taught a command this engine does not have".
 * `unknown switch` is the short-flag half of git-style flag rejection
 * (`flagValidation.ts`); omitting it would green-light an invented `-z`.
 */
const NONEXISTENT = /is not a git command|unknown switch|unknown option|error: switch|usage: git/;

describe("chip git tips are runnable in this engine", () => {
  const examples = gitExamples();

  it("finds the examples to check, with comments and prose stripped", () => {
    expect(examples.length).toBeGreaterThan(10);
    expect(examples.some((e) => e.itemId === "git_help")).toBe(true);
    for (const { command } of examples) {
      expect(command).not.toContain("#");
      expect(command).not.toMatch(/ {2,}/);
    }
  });

  it("the failure regex catches a bad short flag, not just a bad subcommand", () => {
    // Guards the guard: `-z` is rejected as `error: unknown switch \`z'`,
    // which an alternation missing "unknown switch" would let through.
    const bogus = run(makeRepo(), "git status -z");
    expect(`${bogus.output}${bogus.stderr ?? ""}`).toMatch(NONEXISTENT);
  });

  it.each(examples)("$itemId: $command", ({ command }) => {
    // `git clone` is the one example that must run outside a repo.
    const fs = command.startsWith("git clone") ? emptyFs() : makeRepo();
    const result = run(fs, command);
    expect(`${result.output}${result.stderr ?? ""}`).not.toMatch(NONEXISTENT);
  });

  it("never advertises `git merge` (the engine has no such subcommand)", () => {
    const gitHelp = ALL_ITEMS.find((i) => i.id === "git_help")!.response as string;
    expect(gitHelp).not.toContain("git merge");
    const merge = run(makeRepo(), "git merge main");
    expect(`${merge.output}${merge.stderr ?? ""}`).toMatch(NONEXISTENT);
  });

  it("separates every labelled section with a blank line", () => {
    const gitHelp = ALL_ITEMS.find((i) => i.id === "git_help")!.response as string;
    for (const heading of ["Stage changes", "Commit changes", "Browse history", "Branching", "See what changed"]) {
      expect(gitHelp).toContain(`\n\n${heading}\n`);
    }
  });
});
