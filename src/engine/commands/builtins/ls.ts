import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { isDirectory, isFile, FSNode } from "../../filesystem/types";
import { colorize, ansi } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

function formatEntry(entry: FSNode, longFormat: boolean): string {
  if (longFormat) {
    const typeChar = isDirectory(entry) ? "d" : "-";
    const perms = entry.permissions;
    const name = isDirectory(entry)
      ? colorize(entry.name, ansi.bold, ansi.blue)
      : entry.name;
    return `${typeChar}${perms}  ${name}`;
  }
  return isDirectory(entry)
    ? colorize(entry.name, ansi.bold, ansi.blue)
    : entry.name;
}

const ls: CommandHandler = (args, flags, ctx) => {
  const targets = args.length > 0 ? args : [ctx.cwd];
  const showHidden = flags["a"] || flags["all"];
  const longFormat = flags["l"];
  const showHeaders = targets.length > 1;

  const errors: string[] = [];
  const fileEntries: FSNode[] = [];
  const dirs: { label: string; entries: FSNode[] }[] = [];

  for (const target of targets) {
    const absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
    const node = ctx.fs.getNode(absolutePath);

    if (!node) {
      errors.push(`ls: cannot access '${target}': No such file or directory`);
    } else if (isFile(node)) {
      fileEntries.push(node);
    } else {
      const result = ctx.fs.listDirectory(absolutePath);
      if (result.error) {
        errors.push(`ls: cannot open directory '${target}': Permission denied`);
        continue;
      }
      let entries = result.entries;
      if (!showHidden) {
        entries = entries.filter((e) => !e.hidden);
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      dirs.push({ label: target, entries });
    }
  }

  const sections: string[] = [];

  if (errors.length > 0) {
    sections.push(errors.join("\n"));
  }

  if (fileEntries.length > 0) {
    const formatted = fileEntries.map((e) => formatEntry(e, longFormat));
    const separator = longFormat || ctx.isPiped ? "\n" : "  ";
    sections.push(formatted.join(separator));
  }

  for (const dir of dirs) {
    const lines: string[] = [];
    if (showHeaders) {
      lines.push(`${dir.label}:`);
    }
    if (dir.entries.length > 0) {
      const formatted = dir.entries.map((e) => formatEntry(e, longFormat));
      const separator = longFormat || ctx.isPiped ? "\n" : "  ";
      lines.push(formatted.join(separator));
    }
    sections.push(lines.join("\n"));
  }

  return { output: sections.join("\n\n") };
};

register("ls", ls, "List directory contents", HELP_TEXTS.ls);
