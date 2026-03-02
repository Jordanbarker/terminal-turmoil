import { CommandHandler } from "../types";
import { register, getAvailableCommands } from "../registry";
import { colorize, ansi } from "../../../lib/ansi";

const META_COMMANDS = new Set(["save", "load", "newgame"]);

const help: CommandHandler = (_args, _flags, ctx) => {
  const commands = getAvailableCommands(ctx.activeComputer, ctx.storyFlags);
  const gameCommands = commands.filter((c) => !META_COMMANDS.has(c.name));
  const metaCommands = commands.filter((c) => META_COMMANDS.has(c.name));
  const maxLen = Math.max(...commands.map((c) => c.name.length));

  const commandsUnlocked = ctx.activeComputer !== "home" || ctx.storyFlags?.commands_unlocked;
  const footer = commandsUnlocked
    ? `Type a command to get started. Try ${colorize("ls", ansi.green)} to look around.`
    : `Open ${colorize("terminal_notes.txt", ansi.green)} with ${colorize("nano", ansi.green)} to learn more commands.`;

  const lines = [
    colorize("Available commands:", ansi.bold, ansi.yellow),
    "",
    ...gameCommands.map(
      (cmd) =>
        `  ${colorize(cmd.name.padEnd(maxLen + 2), ansi.green)}${cmd.description}`
    ),
    "",
    colorize("Game management:", ansi.bold, ansi.cyan),
    "",
    ...metaCommands.map(
      (cmd) =>
        `  ${colorize(cmd.name.padEnd(maxLen + 2), ansi.cyan)}${cmd.description}`
    ),
    "",
    footer,
  ];

  return { output: lines.join("\n") };
};

register("help", help, "Show available commands");
