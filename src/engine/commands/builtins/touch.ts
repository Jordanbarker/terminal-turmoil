import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";
import { VirtualFS } from "../../filesystem/VirtualFS";

const touch: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "touch: missing file operand" };
  }

  let currentFs: VirtualFS = ctx.fs;

  for (const arg of args) {
    const absPath = resolvePath(arg, ctx.cwd, ctx.homeDir);
    const existing = currentFs.getNode(absPath);

    if (!existing) {
      const result = currentFs.writeFile(absPath, "");
      if (result.error) {
        return { output: result.error.replace("Cannot write", "touch: cannot create") };
      }
      currentFs = result.fs!;
    }
    // If exists, no-op (real touch updates timestamps, but we don't track them)
  }

  return { output: "", newFs: currentFs };
};

register("touch", touch, "Create empty files", HELP_TEXTS.touch);
