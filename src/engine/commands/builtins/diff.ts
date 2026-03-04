import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { colorize, ansi } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

/**
 * Simple LCS-based line diff. Files are small (<100 lines) so O(n*m) is fine.
 */
function computeDiff(aLines: string[], bLines: string[]): { type: "context" | "removed" | "added"; line: string }[] {
  const n = aLines.length;
  const m = bLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (aLines[i - 1] === bLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: { type: "context" | "removed" | "added"; line: string }[] = [];
  let i = n, j = m;
  const stack: { type: "context" | "removed" | "added"; line: string }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      stack.push({ type: "context", line: aLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", line: bLines[j - 1] });
      j--;
    } else {
      stack.push({ type: "removed", line: aLines[i - 1] });
      i--;
    }
  }

  stack.reverse();
  result.push(...stack);
  return result;
}

const diff: CommandHandler = (args, _flags, ctx) => {
  if (args.length < 2) {
    return { output: "diff: missing operand\nUsage: diff FILE1 FILE2", exitCode: 2 };
  }

  const path1 = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const path2 = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  const file1 = ctx.fs.readFile(path1);
  if (file1.error) {
    return { output: file1.error.replace("cat:", "diff:"), exitCode: 2 };
  }

  const file2 = ctx.fs.readFile(path2);
  if (file2.error) {
    return { output: file2.error.replace("cat:", "diff:"), exitCode: 2 };
  }

  const content1 = file1.content ?? "";
  const content2 = file2.content ?? "";

  if (content1 === content2) {
    return { output: "", exitCode: 0 };
  }

  const aLines = content1.split("\n");
  const bLines = content2.split("\n");
  const diffResult = computeDiff(aLines, bLines);

  const outputLines: string[] = [
    colorize(`--- ${args[0]}`, ansi.bold),
    colorize(`+++ ${args[1]}`, ansi.bold),
  ];

  for (const entry of diffResult) {
    switch (entry.type) {
      case "removed":
        outputLines.push(colorize(`-${entry.line}`, ansi.red));
        break;
      case "added":
        outputLines.push(colorize(`+${entry.line}`, ansi.green));
        break;
      case "context":
        outputLines.push(` ${entry.line}`);
        break;
    }
  }

  const result: import("../types").CommandResult = { output: outputLines.join("\n"), exitCode: 1 };

  // Emit trigger event when comparing .bak and current log files
  const nonFlagArgs = args.filter((a) => !a.startsWith("-"));
  const hasBak = nonFlagArgs.some((a) => a.includes(".bak"));
  const hasLog = nonFlagArgs.some((a) => a.includes("system.log") && !a.includes(".bak"));
  if (hasBak && hasLog) {
    result.triggerEvents = [{ type: "file_read", detail: "discovered_log_tampering" }];
  }

  return result;
};

register("diff", diff, "Compare two files line by line", HELP_TEXTS.diff);
