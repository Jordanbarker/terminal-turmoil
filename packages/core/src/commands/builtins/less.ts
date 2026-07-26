import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { isBinaryFile } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import { splitLines } from "@tt/core/lib/textUtils";
import { fileOperands } from "../operands";
import { HELP_TEXTS } from "./helpTexts";

/**
 * `-N`: prefix every line with its number, real less's 7-column right-aligned
 * gutter. Done here rather than in the pager so search, truncation and the
 * status line all see the same lines the player does.
 *
 * Must split the way `LessSession`'s constructor does, or the numbered view
 * would show a different number of lines than the plain one. `splitLines` is
 * that rule (drop the empty element a final newline leaves behind); a bare
 * `content.split("\n")` would number a phantom trailing line.
 */
function numberLines(content: string): string {
  return splitLines(content)
    .map((line, i) => `${String(i + 1).padStart(7)} ${line}`)
    .join("\n");
}

const less: CommandHandler = (args, flags, ctx) => {
  const withNumbers = (content: string) => (flags["N"] ? numberLines(content) : content);

  // `less` / `less -`: page stdin.
  const { files, readStdin } = fileOperands(args);

  if (readStdin) {
    if (ctx.stdin !== undefined) {
      if (ctx.stdin === "") {
        return { output: "" };
      }
      return {
        output: "",
        lessSession: { filename: null, content: withNumbers(ctx.stdin) },
      };
    }
    return { output: "less: missing file operand", exitCode: 1 };
  }

  const fileArg = files[0];
  const absolutePath = resolvePath(fileArg, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absolutePath);

  if (node && isDirectory(node)) {
    return { output: `less: "${fileArg}": Is a directory`, exitCode: 1 };
  }

  if (isBinaryFile(node)) {
    const hint = fileArg.endsWith(".pdf")
      ? " — use 'pdftotext' for PDFs or 'file' to inspect"
      : " — use 'file' to inspect";
    return { output: `less: ${fileArg}: binary file${hint}`, exitCode: 1 };
  }

  const result = ctx.fs.readFile(absolutePath);
  if (result.error) {
    return { output: result.error.replace("cat:", "less:"), exitCode: 1 };
  }

  return {
    output: "",
    lessSession: { filename: fileArg, content: withNumbers(result.content ?? "") },
  };
};

register("less", less, "View file contents with paging", HELP_TEXTS.less, true);
setKnownFlags("less", { short: ["N"] });
