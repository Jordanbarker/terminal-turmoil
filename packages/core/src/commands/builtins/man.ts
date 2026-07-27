import { CommandHandler } from "@tt/core/commands/types";
import { register, getPrimaryName, getAliasesFor, getHelpText } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { isCommandAvailable } from "../availability";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { HELP_TEXTS } from "./helpTexts";
import { errorResult } from "../fsErrors";

const man: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return errorResult("What manual page do you want?\nUsage: man COMMAND", 2);
  }

  const cmd = args[0];
  const primaryName = getPrimaryName(cmd);
  const isAlias = cmd !== primaryName;

  if (!isCommandAvailable(cmd, ctx.activeComputer, ctx.storyFlags)) {
    return errorResult(`No manual entry for ${cmd}`, 2);
  }

  // Read from the registry, not core's HELP_TEXTS map: app-registered builtins
  // supply their own help text at registration and still deserve a man page.
  const helpText = getHelpText(primaryName);

  if (!helpText) {
    return errorResult(`No manual entry for ${cmd}`, 2);
  }

  const cmdAliases = getAliasesFor(primaryName);
  const aliasNote = cmdAliases.length > 0
    ? ` (also: ${cmdAliases.join(", ")})`
    : "";

  const lines = [
    ...(isAlias ? [colorize(`\`${cmd}\` is an alias for \`${primaryName}\``, ansi.dim), ""] : []),
    colorize(`${primaryName.toUpperCase()}(1)`, ansi.bold) + "                  User Commands                  " + colorize(`${primaryName.toUpperCase()}(1)`, ansi.bold),
    "",
    colorize("NAME", ansi.bold),
    `       ${primaryName}${aliasNote} - ${getCommandDescription(primaryName)}`,
    "",
    colorize("SYNOPSIS", ansi.bold),
    ...helpText.split("\n").filter((l) => l.startsWith("Usage:")).map((l) => `       ${l.replace(/^Usage:\s*/, "")}`),
    "",
    colorize("DESCRIPTION", ansi.bold),
    ...helpText.split("\n").filter((l) => !l.startsWith("Usage:") && l.trim()).map((l) => `       ${l}`),
    "",
  ];

  return { output: lines.join("\n") };
};

/**
 * man-page NAME summaries: the terse coreutils-style line, which reads better
 * than the `help` listing text. Core seeds only its own commands; an app adds
 * summaries for the builtins it registers via `registerManSummaries` (termoil
 * does, from its builtins index). Anything unlisted falls back to the bare
 * command name, exactly as a real man page with no NAME whatis entry would.
 */
const MAN_SUMMARIES: Record<string, string> = {
  grep: "print lines that match patterns",
  find: "search for files in a directory hierarchy",
  head: "output the first part of files",
  tail: "output the last part of files",
  diff: "compare files line by line",
  wc: "print newline, word, and byte counts",
  echo: "display a line of text",
  chmod: "change file mode bits",
  mkdir: "make directories",
  rm: "remove files or directories",
  mv: "move (rename) files",
  cp: "copy files and directories",
  touch: "change file timestamps",
  ls: "list directory contents",
  cd: "change the working directory",
  cat: "concatenate files and print on the standard output",
  pwd: "print name of current/working directory",
  sort: "sort lines of text files",
  uniq: "report or omit repeated lines",
  tree: "list contents of directories in a tree-like format",
  file: "determine file type",
  pdftotext: "convert PDF files to plain text",
  date: "print or set the system date and time",
  which: "locate a command",
  whoami: "print effective userid",
  history: "display command history",
  nano: "a small and friendly text editor",
  vim: "Vi IMproved, a programmer's text editor",
  clear: "clear the terminal screen",
  help: "list available commands",
  sudo: "execute a command as another user",
  snow: "Snowflake command-line client",
  source: "execute commands from a file in the current shell",
  python: "run Python scripts or start an interactive REPL",
  bash: "execute shell scripts",
  dbt: "data build tool",
  git: "the stupid content tracker",
  man: "an interface to the system reference manuals",
};

/** Register man NAME summaries for app-registered builtins. */
export function registerManSummaries(summaries: Record<string, string>): void {
  Object.assign(MAN_SUMMARIES, summaries);
}

function getCommandDescription(cmd: string): string {
  return MAN_SUMMARIES[cmd] ?? cmd;
}

register("man", man, "Display a command's manual page: man <command>", HELP_TEXTS.man);
setKnownFlags("man", {});
