import { CommandHandler } from "../types";
import { register, getAvailableCommands } from "../registry";
import { colorize, ansi } from "../../../lib/ansi";

const META_COMMANDS = new Set(["save", "load", "newgame"]);
const HIDDEN_COMMANDS = new Set(["help"]);

const help: CommandHandler = (_args, _flags, ctx) => {
  const commands = getAvailableCommands(ctx.activeComputer, ctx.storyFlags);
  const gameCommands = commands.filter((c) => !META_COMMANDS.has(c.name) && !HIDDEN_COMMANDS.has(c.name));
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

  return { output: lines.join("\n") };
};

register("help", help, "Show available commands");
