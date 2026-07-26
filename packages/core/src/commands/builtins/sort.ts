import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { splitLines } from "@tt/core/lib/textUtils";
import { readFileForCommand, READ_FAILURE_EXIT } from "../fsErrors";
import { HELP_TEXTS } from "./helpTexts";

const sort: CommandHandler = (args, flags, ctx) => {
  const reverse = flags["r"];
  const numeric = flags["n"];
  const unique = flags["u"];
  const fileArgs = args.filter((a) => !a.startsWith("-"));

  let lines: string[];
  // Collect-and-continue, like cat: an unreadable operand is reported but the
  // readable ones are still sorted.
  const errors: string[] = [];
  if (fileArgs.length === 0 && ctx.stdin !== undefined) {
    lines = splitLines(ctx.stdin);
  } else if (fileArgs.length > 0) {
    lines = [];
    for (const file of fileArgs) {
      const absPath = resolvePath(file, ctx.cwd, ctx.homeDir);
      const result = readFileForCommand("sort", absPath, ctx);
      if (result.error) {
        errors.push(result.error);
        continue;
      }
      lines.push(...splitLines(result.content ?? ""));
    }
  } else {
    return { output: "sort: missing file operand", exitCode: 2 };
  }

  /** Errors first (they are stderr in a real shell), then the sorted body. */
  const withErrors = (body: string) =>
    errors.length === 0 ? body : [...errors, ...(body ? [body] : [])].join("\n");
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
      output: withErrors(deduped.join("\n")),
      exitCode,
      // Only a real collapse counts as deduping — `sort -u` over already-unique
      // input must not fire the story trigger.
      ...(deduped.length < lines.length && {
        triggerEvents: [{ type: "command_executed" as const, detail: "data_deduped" }],
      }),
    };
  }

  return { output: withErrors(lines.join("\n")), exitCode };
};

register("sort", sort, "Sort lines of text", HELP_TEXTS.sort, true);
setKnownFlags("sort", { short: ["r", "n", "u"] });
