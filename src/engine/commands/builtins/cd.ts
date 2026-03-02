import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";

const cd: CommandHandler = (args, _flags, ctx) => {
  const target = args[0] || "~";
  const absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
  const result = ctx.fs.changeCwd(absolutePath);

  if (result.error) {
    return { output: result.error };
  }

  return { output: "", newCwd: absolutePath };
};

register("cd", cd, "Change the current directory", HELP_TEXTS.cd);
