import { CommandHandler } from "@tt/core/commands/types";
import { register, getAvailableCommands } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { HELP_TEXTS } from "./helpTexts";
import type { StoryFlags } from "@tt/core";

const META_COMMANDS = new Set(["save", "load", "newgame", "cheat", "shortcuts"]);

/**
 * Mark app-registered builtins as game-control "meta" commands: help lists them
 * after the in-world commands, in cyan. Core pre-seeds `shortcuts` plus termoil's
 * save-system names (save/load/newgame/cheat);
 * other apps add theirs at registration time (e.g. term-crunch's challenge nav).
 */
export function registerMetaCommands(...names: string[]): void {
  for (const n of names) META_COMMANDS.add(n);
}
const HIDDEN_COMMANDS = new Set(["help", "true", "false"]);

type HelpVisibilityFilter = (name: string, storyFlags?: StoryFlags) => boolean;

let visibilityFilter: HelpVisibilityFilter | null = null;

/**
 * App-injected visibility filter: return false to hide a command from help
 * output under app-specific conditions (e.g. termoil hides `shutdown` once
 * its story flag is set). Absent => every available command is listed.
 */
export function setHelpVisibilityFilter(fn: HelpVisibilityFilter | null): void {
  visibilityFilter = fn;
}

export function resetHelpVisibilityFilter(): void {
  visibilityFilter = null;
}

const help: CommandHandler = (_args, _flags, ctx) => {
  const commands = getAvailableCommands(ctx.activeComputer, ctx.storyFlags);
  const gameCommands = commands
    .filter(
      (c) =>
        !META_COMMANDS.has(c.name) &&
        !HIDDEN_COMMANDS.has(c.name) &&
        (visibilityFilter?.(c.name, ctx.storyFlags) ?? true)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const metaCommands = commands.filter((c) => META_COMMANDS.has(c.name));
  const formatName = (cmd: { name: string; aliases?: string[] }) =>
    cmd.aliases?.length ? `${cmd.name} (${cmd.aliases.join(", ")})` : cmd.name;
  const maxLen = Math.max(...commands.map((c) => formatName(c).length));

  const lines = [
    "",
    colorize("Available commands:", ansi.bold, ansi.yellow),
    "",
    ...gameCommands.map(
      (cmd) =>
        `  ${colorize(formatName(cmd).padEnd(maxLen + 2), ansi.green)}${cmd.description}`
    ),
    ...metaCommands.map(
      (cmd) =>
        `  ${colorize(formatName(cmd).padEnd(maxLen + 2), ansi.cyan)}${cmd.description}`
    ),
    "",
  ];

  return { output: lines.join("\n") };
};

register("help", help, "Show available commands", HELP_TEXTS.help);
setKnownFlags("help", {});
