import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { isDirectory } from "../../filesystem/types";
import { colorize, ansi } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

const ls: CommandHandler = (args, flags, ctx) => {
  const target = args[0] || ctx.cwd;
  const absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
  const result = ctx.fs.listDirectory(absolutePath);

  if (result.error) {
    return { output: result.error };
  }

  const showHidden = flags["a"] || flags["all"];
  const longFormat = flags["l"];

  let entries = result.entries;
  if (!showHidden) {
    entries = entries.filter((e) => !e.hidden);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  if (entries.length === 0) {
    return { output: "" };
  }

  if (longFormat) {
    const lines = entries.map((entry) => {
      const typeChar = isDirectory(entry) ? "d" : "-";
      const perms = entry.permissions;
      const name = isDirectory(entry)
        ? colorize(entry.name, ansi.bold, ansi.blue)
        : entry.name;
      return `${typeChar}${perms}  ${name}`;
    });
    return { output: lines.join("\n") };
  }

  const names = entries.map((entry) =>
    isDirectory(entry)
      ? colorize(entry.name, ansi.bold, ansi.blue)
      : entry.name
  );
  const separator = ctx.isPiped ? "\n" : "  ";
  return { output: names.join(separator) };
};

register("ls", ls, "List directory contents", HELP_TEXTS.ls);
