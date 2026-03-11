import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { colorizeCsv } from "../../../lib/ansi";
import { highlightSql } from "../../../lib/sqlHighlight";
import { HELP_TEXTS } from "./helpTexts";

const cat: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0 && ctx.stdin !== undefined) {
    return { output: ctx.stdin };
  }
  if (args.length === 0) {
    return { output: "cat: missing file operand" };
  }

  const outputs: string[] = [];

  for (const arg of args) {
    const absolutePath = resolvePath(arg, ctx.cwd, ctx.homeDir);
    const node = ctx.fs.getNode(absolutePath);

    if (node && node.type === "file" && node.metadata?.binary) {
      const hint = arg.endsWith(".pdf") ? " — use 'pdftotext' for PDFs or 'file' to inspect" : " — use 'file' to inspect";
      outputs.push(`cat: ${arg}: binary file${hint}`);
      continue;
    }

    const result = ctx.fs.readFile(absolutePath);

    if (result.error) {
      outputs.push(result.error);
    } else if (result.content !== undefined) {
      const content = arg.endsWith(".csv")
        ? colorizeCsv(result.content)
        : arg.endsWith(".sql")
          ? highlightSql(result.content)
          : result.content;
      outputs.push(content);
    }
  }

  return { output: outputs.join("\n") };
};

register("cat", cat, "Display file contents", HELP_TEXTS.cat);
