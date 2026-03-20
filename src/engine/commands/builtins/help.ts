import { CommandHandler } from "../types";
import { register, getAvailableCommands } from "../registry";
import { colorize, ansi } from "../../../lib/ansi";

const META_COMMANDS = new Set(["save", "load", "newgame"]);
const HIDDEN_COMMANDS = new Set(["help"]);

const help: CommandHandler = (_args, _flags, ctx) => {
  const commands = getAvailableCommands(ctx.activeComputer, ctx.storyFlags);
  const gameCommands = commands
    .filter((c) => !META_COMMANDS.has(c.name) && !HIDDEN_COMMANDS.has(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const metaCommands = commands.filter((c) => META_COMMANDS.has(c.name));
  const maxLen = Math.max(...commands.map((c) => c.name.length));

  const lines = [
    colorize("Available commands:", ansi.bold, ansi.yellow),
    "",
    ...gameCommands.map(
      (cmd) =>
        `  ${colorize(cmd.name.padEnd(maxLen + 2), ansi.green)}${cmd.description}`
    ),
    ...metaCommands.map(
      (cmd) =>
        `  ${colorize(cmd.name.padEnd(maxLen + 2), ansi.cyan)}${cmd.description}`
    ),
    "",
    `Use ${colorize("man <command>", ansi.green)} for detailed usage.`,
  ];

  if (ctx.storyFlags?.tabs_unlocked) {
    lines.push(
      "",
      colorize("Terminal tabs:", ansi.bold, ansi.yellow),
      `  ${colorize("Ctrl+B, C", ansi.green)}  Create new tab`,
      `  ${colorize("Ctrl+B, X", ansi.green)}  Close current tab`,
      `  ${colorize("Ctrl+B, N/P", ansi.green)}  Next/previous tab`,
      `  ${colorize("Ctrl+B, 1-5", ansi.green)}  Jump to tab`,
    );
  }

  return { output: lines.join("\n") };
};

register("help", help, "Show available commands");
