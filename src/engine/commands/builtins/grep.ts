import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { isDirectory, isFile, FSNode } from "../../filesystem/types";
import { colorize, ansi } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

function walkFiles(
  fs: { getNode: (p: string) => FSNode | null; listDirectory: (p: string) => { entries: FSNode[]; error?: string } },
  dirPath: string,
): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = [];
  const { entries } = fs.listDirectory(dirPath);
  for (const entry of entries) {
    const childPath = dirPath === "/" ? `/${entry.name}` : `${dirPath}/${entry.name}`;
    if (isFile(entry)) {
      results.push({ path: childPath, content: entry.content });
    } else if (isDirectory(entry)) {
      results.push(...walkFiles(fs, childPath));
    }
  }
  return results;
}

const grep: CommandHandler = (args, flags, ctx) => {
  if (args.length === 0) {
    return { output: "grep: missing pattern", exitCode: 2 };
  }

  const pattern = args[0];
  const fileArgs = args.slice(1);
  const ignoreCase = flags["i"];
  const showLineNumbers = flags["n"];
  const filesOnly = flags["l"];
  const countOnly = flags["c"];
  const invertMatch = flags["v"];
  const recursive = flags["r"] || flags["R"];

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, ignoreCase ? "i" : "");
  } catch {
    // Fall back to literal string matching
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ignoreCase ? "i" : "");
  }

  // Collect files to search
  const filesToSearch: { path: string; content: string }[] = [];

  if (fileArgs.length === 0 && ctx.stdin !== undefined) {
    // Read from stdin
    filesToSearch.push({ path: "", content: ctx.stdin });
  } else if (fileArgs.length === 0 && recursive) {
    // Recursive from cwd
    filesToSearch.push(...walkFiles(ctx.fs, ctx.cwd));
  } else if (fileArgs.length === 0) {
    return { output: "grep: no input files", exitCode: 2 };
  } else {
    for (const fileArg of fileArgs) {
      const absPath = resolvePath(fileArg, ctx.cwd, ctx.homeDir);
      const node = ctx.fs.getNode(absPath);
      if (!node) {
        return { output: `grep: ${fileArg}: No such file or directory`, exitCode: 2 };
      }
      if (isDirectory(node)) {
        if (recursive) {
          filesToSearch.push(...walkFiles(ctx.fs, absPath));
        } else {
          return { output: `grep: ${fileArg}: Is a directory`, exitCode: 2 };
        }
      } else if (isFile(node)) {
        filesToSearch.push({ path: absPath, content: node.content });
      }
    }
  }

  const multiFile = filesToSearch.length > 1;
  const outputLines: string[] = [];
  let totalMatches = 0;

  for (const { path, content } of filesToSearch) {
    const lines = content.split("\n");
    let fileMatches = 0;
    const displayPath = path;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = regex.test(line);
      const isMatch = invertMatch ? !matches : matches;

      if (isMatch) {
        fileMatches++;
        totalMatches++;

        if (!filesOnly && !countOnly) {
          // Highlight match in the line
          let displayLine = line;
          if (!invertMatch) {
            displayLine = line.replace(regex, (m) => colorize(m, ansi.red, ansi.bold));
          }

          const parts: string[] = [];
          if (multiFile && displayPath) {
            parts.push(colorize(displayPath, ansi.magenta) + ":");
          }
          if (showLineNumbers) {
            parts.push(colorize(String(i + 1), ansi.cyan) + ":");
          }
          parts.push(displayLine);
          outputLines.push(parts.join(""));
        }
      }
    }

    if (filesOnly && fileMatches > 0) {
      outputLines.push(displayPath);
    }
    if (countOnly) {
      if (multiFile && displayPath) {
        outputLines.push(`${displayPath}:${fileMatches}`);
      } else {
        outputLines.push(String(fileMatches));
      }
    }
  }

  return {
    output: outputLines.join("\n"),
    exitCode: totalMatches > 0 ? 0 : 1,
  };
};

register("grep", grep, "Search file contents for patterns", HELP_TEXTS.grep);
