import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
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
    const result = ctx.fs.readFile(absolutePath);

    if (result.error) {
      outputs.push(result.error);
    } else if (result.content !== undefined) {
      outputs.push(result.content);
    }
  }

  return { output: outputs.join("\n") };
};

register("cat", cat, "Display file contents", HELP_TEXTS.cat);
