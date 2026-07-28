import { describe, it, expect } from "vitest";
import { getCommandList } from "@tt/core/commands/registry";
import { SUBCOMMAND_MAP, getSubcommandCompletions } from "@tt/core/suggestions/suggest";
import { getCompletions } from "@tt/core/suggestions/complete";
import { buildBaseFs } from "../lib/seed";
import { HOME_DIR } from "../lib/machine";
import "@tt/core/commands/builtins";

/**
 * term-crunch's entire command surface is whatever @tt/core registers. Story
 * commands that only make sense inside termoil's narrative must not be in it:
 * they were dead weight here, listed by `help` and offered by TAB completion
 * with nothing behind them. Anything story-shaped belongs in
 * apps/termoil/src/engine/commands/builtins/.
 */
const TERMOIL_ONLY = [
  "chip",
  "piper",
  "mail",
  "ssh",
  "ssh-add",
  "coder",
  "exit",
  "apt",
  "shutdown",
  "hostname",
  "save",
  "load",
  "newgame",
  "cheat",
];

/** Every primary command name core registers, with nothing app-side loaded. */
const names = new Set(getCommandList().map((c) => c.name));

/** Primaries plus aliases (`sh`/`zsh` for bash, `vi` for vim, ...). */
const namesWithAliases = new Set(
  getCommandList().flatMap((c) => [c.name, ...(c.aliases ?? [])]),
);

describe("core command surface", () => {
  it("registers no termoil story commands", () => {
    expect(TERMOIL_ONLY.filter((name) => names.has(name))).toEqual([]);
  });

  it("still registers the shared shell + tooling builtins", () => {
    for (const name of ["ls", "cd", "cat", "git", "tmux", "vim", "help", "man", "export"]) {
      expect(names).toContain(name);
    }
  });
});

/**
 * The registry is not the only place a command name reaches the player: TAB and
 * ghost text read the subcommand tables, which is how `sudo ` used to offer
 * `apt` here long after apt itself stopped existing. Every table core ships has
 * to name only commands core registers.
 */
describe("core completion tables", () => {
  it("offers no subcommand that core does not itself register", () => {
    for (const [parent, subs] of Object.entries(SUBCOMMAND_MAP)) {
      expect(namesWithAliases, `SUBCOMMAND_MAP key '${parent}'`).toContain(parent);
      for (const sub of subs) {
        // Flags and subcommand words are fine; a bare word that happens to be a
        // termoil command name is the bug we are guarding against.
        expect(TERMOIL_ONLY, `${parent} -> ${sub}`).not.toContain(sub);
      }
    }
  });

  it("does not complete `sudo ` to a command term-crunch lacks", () => {
    expect(getSubcommandCompletions("sudo")).toBeUndefined();

    const ctx = {
      commandHistory: [],
      commandNames: [...names],
      fs: buildBaseFs(),
      cwd: HOME_DIR,
      homeDir: HOME_DIR,
    };
    const result = getCompletions("sudo ", ctx);
    expect(result?.matches ?? []).not.toContain("apt");
  });
});
