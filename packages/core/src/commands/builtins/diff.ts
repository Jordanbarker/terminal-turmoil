import { CommandHandler, CommandContext, CommandResult } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { computeDiff, DiffEntry } from "@tt/core/lib/diff";
import { isDirectory, FSNode } from "@tt/core/filesystem/types";
import { getDiffTriggerEvents } from "../diffTriggers";
import { HELP_TEXTS } from "./helpTexts";
import { errorResult, readFileForCommand } from "../fsErrors";

interface Hunk {
  oldStart: number;
  oldLen: number;
  newStart: number;
  newLen: number;
  lines: DiffEntry[];
}

const UNIFIED_CONTEXT = 3;

function buildHunks(entries: DiffEntry[]): Hunk[] {
  // Find indices of all non-context (changed) entries; expand each by ±UNIFIED_CONTEXT
  // (clamped to [0, entries.length)) and merge overlapping ranges → each merged range
  // is one hunk.
  const ranges: Array<[number, number]> = [];
  for (let k = 0; k < entries.length; k++) {
    if (entries[k].type === "context") continue;
    const lo = Math.max(0, k - UNIFIED_CONTEXT);
    const hi = Math.min(entries.length - 1, k + UNIFIED_CONTEXT);
    if (ranges.length > 0 && lo <= ranges[ranges.length - 1][1] + 1) {
      ranges[ranges.length - 1][1] = Math.max(ranges[ranges.length - 1][1], hi);
    } else {
      ranges.push([lo, hi]);
    }
  }

  // Walk entries once, tracking old/new line numbers, slicing each range into a hunk
  const hunks: Hunk[] = [];
  let oldLine = 1;
  let newLine = 1;
  let rIdx = 0;
  let rangeOldStart = 1;
  let rangeNewStart = 1;
  for (let k = 0; k < entries.length; k++) {
    if (rIdx < ranges.length && k === ranges[rIdx][0]) {
      rangeOldStart = oldLine;
      rangeNewStart = newLine;
    }
    const e = entries[k];
    if (e.type !== "added") oldLine++;
    if (e.type !== "removed") newLine++;
    if (rIdx < ranges.length && k === ranges[rIdx][1]) {
      const [lo, hi] = ranges[rIdx];
      const slice = entries.slice(lo, hi + 1);
      const oldLen = slice.filter((x) => x.type !== "added").length;
      const newLen = slice.filter((x) => x.type !== "removed").length;
      hunks.push({
        oldStart: oldLen === 0 ? rangeOldStart - 1 : rangeOldStart,
        oldLen,
        newStart: newLen === 0 ? rangeNewStart - 1 : rangeNewStart,
        newLen,
        lines: slice,
      });
      rIdx++;
    }
  }
  return hunks;
}

function formatUnified(label1: string, label2: string, entries: DiffEntry[]): string {
  const hunks = buildHunks(entries);
  const out: string[] = [
    colorize(`--- ${label1}`, ansi.bold),
    colorize(`+++ ${label2}`, ansi.bold),
  ];
  for (const h of hunks) {
    out.push(colorize(`@@ -${h.oldStart},${h.oldLen} +${h.newStart},${h.newLen} @@`, ansi.cyan));
    for (const e of h.lines) {
      switch (e.type) {
        case "removed":
          out.push(colorize(`-${e.line}`, ansi.red));
          break;
        case "added":
          out.push(colorize(`+${e.line}`, ansi.green));
          break;
        case "context":
          out.push(` ${e.line}`);
          break;
      }
    }
  }
  return out.join("\n");
}

function formatContextStyle(label1: string, label2: string, entries: DiffEntry[]): string {
  const lines: string[] = [
    colorize(`--- ${label1}`, ansi.bold),
    colorize(`+++ ${label2}`, ansi.bold),
  ];
  for (const entry of entries) {
    switch (entry.type) {
      case "removed":
        lines.push(colorize(`-${entry.line}`, ansi.red));
        break;
      case "added":
        lines.push(colorize(`+${entry.line}`, ansi.green));
        break;
      case "context":
        lines.push(` ${entry.line}`);
        break;
    }
  }
  return lines.join("\n");
}

function diffPair(
  ctx: CommandContext,
  path1: string,
  path2: string,
  label1: string,
  label2: string,
  unified: boolean,
): { output: string; exitCode: number; error?: boolean } {
  const file1 = readFileForCommand("diff", path1, ctx);
  if (file1.error) {
    return { output: file1.error, exitCode: 2, error: true };
  }
  const file2 = readFileForCommand("diff", path2, ctx);
  if (file2.error) {
    return { output: file2.error, exitCode: 2, error: true };
  }

  const content1 = file1.content ?? "";
  const content2 = file2.content ?? "";
  if (content1 === content2) {
    return { output: "", exitCode: 0 };
  }

  const entries = computeDiff(content1.split("\n"), content2.split("\n"));
  const formatted = unified
    ? formatUnified(label1, label2, entries)
    : formatContextStyle(label1, label2, entries);
  return { output: formatted, exitCode: 1 };
}

function listDirNames(fs: CommandContext["fs"], dirPath: string): { dirs: string[]; files: string[] } {
  const { entries, error } = fs.listDirectory(dirPath);
  if (error || !entries) return { dirs: [], files: [] };
  const dirs: string[] = [];
  const files: string[] = [];
  for (const e of entries as FSNode[]) {
    if (isDirectory(e)) dirs.push(e.name);
    else files.push(e.name);
  }
  return { dirs: dirs.sort(), files: files.sort() };
}

function recursiveDiff(
  ctx: CommandContext,
  abs1: string,
  abs2: string,
  display1: string,
  display2: string,
  unified: boolean,
): { output: string[]; stderr: string[]; exitCode: number } {
  const out: string[] = [];
  const errs: string[] = [];
  let exitCode = 0;
  const left = listDirNames(ctx.fs, abs1);
  const right = listDirNames(ctx.fs, abs2);

  const allFiles = new Set([...left.files, ...right.files]);
  for (const name of Array.from(allFiles).sort()) {
    const inLeft = left.files.includes(name);
    const inRight = right.files.includes(name);
    if (inLeft && !inRight) {
      out.push(`Only in ${display1}: ${name}`);
      exitCode = Math.max(exitCode, 1);
    } else if (!inLeft && inRight) {
      out.push(`Only in ${display2}: ${name}`);
      exitCode = Math.max(exitCode, 1);
    } else {
      const childAbs1 = `${abs1}/${name}`;
      const childAbs2 = `${abs2}/${name}`;
      const childDisp1 = `${display1}/${name}`;
      const childDisp2 = `${display2}/${name}`;
      const r = diffPair(ctx, childAbs1, childAbs2, childDisp1, childDisp2, unified);
      // An unreadable child is a diagnostic, not part of the report: it must
      // not ride the pipe or land in a `diff -r a b > out.diff` target.
      if (r.error) {
        errs.push(r.output);
      } else if (r.output) {
        out.push(`diff -r ${childDisp1} ${childDisp2}`);
        out.push(r.output);
      }
      exitCode = Math.max(exitCode, r.exitCode);
    }
  }

  const allDirs = new Set([...left.dirs, ...right.dirs]);
  for (const name of Array.from(allDirs).sort()) {
    const inLeft = left.dirs.includes(name);
    const inRight = right.dirs.includes(name);
    if (inLeft && !inRight) {
      out.push(`Only in ${display1}: ${name}`);
      exitCode = Math.max(exitCode, 1);
    } else if (!inLeft && inRight) {
      out.push(`Only in ${display2}: ${name}`);
      exitCode = Math.max(exitCode, 1);
    } else {
      const sub = recursiveDiff(
        ctx,
        `${abs1}/${name}`,
        `${abs2}/${name}`,
        `${display1}/${name}`,
        `${display2}/${name}`,
        unified,
      );
      out.push(...sub.output);
      errs.push(...sub.stderr);
      exitCode = Math.max(exitCode, sub.exitCode);
    }
  }

  return { output: out, stderr: errs, exitCode };
}

const diff: CommandHandler = (args, flags, ctx) => {
  if (args.length < 2) {
    return errorResult("diff: missing operand\nUsage: diff FILE1 FILE2", 2);
  }

  const unified = !!flags["u"];
  const recursive = !!flags["r"];
  const path1 = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const path2 = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  if (recursive) {
    const node1 = ctx.fs.getNode(path1);
    const node2 = ctx.fs.getNode(path2);
    if (!node1) return errorResult(`diff: ${args[0]}: No such file or directory`, 2);
    if (!node2) return errorResult(`diff: ${args[1]}: No such file or directory`, 2);
    if (isDirectory(node1) && isDirectory(node2)) {
      const r = recursiveDiff(ctx, path1, path2, args[0], args[1], unified);
      return {
        output: r.output.join("\n"),
        ...(r.stderr.length > 0 && { stderr: r.stderr.join("\n") }),
        exitCode: r.exitCode,
      };
    }
    // Fall through to single-file diff if neither is a directory
  }

  const r = diffPair(ctx, path1, path2, args[0], args[1], unified);
  // `r.error` marks an unreadable operand (stderr). A plain exit-1 diff is a
  // real report on stdout, so it must keep piping and redirecting.
  const result: CommandResult = r.error
    ? errorResult(r.output, r.exitCode)
    : { output: r.output, exitCode: r.exitCode };

  const triggerEvents = getDiffTriggerEvents(args);
  if (triggerEvents.length > 0) {
    result.triggerEvents = triggerEvents;
  }

  return result;
};

register("diff", diff, "Compare two files line by line", HELP_TEXTS.diff, true);
setKnownFlags("diff", { short: ["u", "r"] });
