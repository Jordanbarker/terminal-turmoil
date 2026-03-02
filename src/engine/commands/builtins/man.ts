import { CommandHandler } from "../types";
import { register } from "../registry";
import { isCommandAvailable } from "../availability";
import { colorize, ansi } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

const man: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "What manual page do you want?\nUsage: man COMMAND" };
  }

  const cmd = args[0];

  if (!isCommandAvailable(cmd, ctx.activeComputer)) {
    return { output: `No manual entry for ${cmd}` };
  }

  const helpText = HELP_TEXTS[cmd];

  if (!helpText) {
    return { output: `No manual entry for ${cmd}` };
  }

  const lines = [
    colorize(`${cmd.toUpperCase()}(1)`, ansi.bold) + "                  User Commands                  " + colorize(`${cmd.toUpperCase()}(1)`, ansi.bold),
    "",
    colorize("NAME", ansi.bold),
    `       ${cmd} - ${getCommandDescription(cmd)}`,
    "",
    colorize("SYNOPSIS", ansi.bold),
    ...helpText.split("\n").filter((l) => l.startsWith("Usage:")).map((l) => `       ${l.replace("Usage: ", "")}`),
    "",
    colorize("DESCRIPTION", ansi.bold),
    ...helpText.split("\n").filter((l) => !l.startsWith("Usage:") && l.trim()).map((l) => `       ${l}`),
    "",
  ];

  return { output: lines.join("\n") };
};

function getCommandDescription(cmd: string): string {
  const descriptions: Record<string, string> = {
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
    uname: "print system information",
    hostname: "show or set the system's host name",
    whoami: "print effective userid",
    history: "display command history",
    nano: "a small and friendly text editor",
    mail: "send and receive email",
    clear: "clear the terminal screen",
  };
  return descriptions[cmd] ?? cmd;
}

register("man", man, "Display manual pages", HELP_TEXTS.man);
