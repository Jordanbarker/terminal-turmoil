import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { splitLines } from "@tt/core/lib/textUtils";
import { readFileForCommand, errorResult, READ_FAILURE_EXIT } from "../fsErrors";
import { fileOperands } from "../operands";
import { HELP_TEXTS } from "./helpTexts";

const sort: CommandHandler = (args, flags, ctx) => {
  const reverse = flags["r"];
  const numeric = flags["n"];
  const unique = flags["u"];

  // `sort` / `sort -`: read stdin.
  const { files, readStdin } = fileOperands(args);

  let lines: string[];
  // Collect-and-continue, like cat: an unreadable operand is reported but the
  // readable ones are still sorted.
  const errors: string[] = [];
  if (readStdin && ctx.stdin !== undefined) {
    lines = splitLines(ctx.stdin);
  } else if (files.length > 0) {
    lines = [];
    for (const file of files) {
      const absPath = resolvePath(file, ctx.cwd, ctx.homeDir);
      const result = readFileForCommand("sort", absPath, ctx);
      if (result.error) {
        errors.push(result.error);
        continue;
      }
      lines.push(...splitLines(result.content ?? ""));
    }
  } else {
    return errorResult("sort: missing file operand", 2);
  }

  /** Unreadable operands are stderr; only the sorted body is stdout. */
  const stderrField = errors.length > 0 ? { stderr: errors.join("\n") } : {};
  const exitCode = errors.length > 0 ? READ_FAILURE_EXIT : 0;

  lines.sort((a, b) => {
    if (numeric) {
      const na = parseFloat(a) || 0;
      const nb = parseFloat(b) || 0;
      return na - nb;
    }
    return a.localeCompare(b);
  });

  if (reverse) lines.reverse();

  if (unique) {
    // GNU sort -u dedupes by sort key: with -n, numerically equal lines
    // (e.g. "1" and "1.0") collapse to the first occurrence.
    const keyOf = (line: string) => (numeric ? String(parseFloat(line) || 0) : line);
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const line of lines) {
      const key = keyOf(line);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(line);
      }
    }
    return {
      output: deduped.join("\n"),
      ...stderrField,
      exitCode,
      // Only a real collapse counts as deduping — `sort -u` over already-unique
      // input must not fire the story trigger.
      ...(deduped.length < lines.length && {
        triggerEvents: [{ type: "command_executed" as const, detail: "data_deduped" }],
      }),
    };
  }

  return { output: lines.join("\n"), ...stderrField, exitCode };
};

register("sort", sort, "Sort lines of text", HELP_TEXTS.sort, true);
setKnownFlags("sort", { short: ["r", "n", "u"] });
