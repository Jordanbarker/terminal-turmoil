import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath, parentPath } from "../../../lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";
import { VirtualFS } from "../../filesystem/VirtualFS";

const mkdir: CommandHandler = (args, flags, ctx) => {
  if (args.length === 0) {
    return { output: "mkdir: missing operand" };
  }

  const createParents = flags["p"];
  let currentFs: VirtualFS = ctx.fs;

  for (const arg of args) {
    const absPath = resolvePath(arg, ctx.cwd, ctx.homeDir);

    if (createParents) {
      // Create all parent directories as needed
      const parts = absPath.split("/").filter(Boolean);
      let currentPath = "";
      for (const part of parts) {
        currentPath += "/" + part;
        if (!currentFs.getNode(currentPath)) {
          const result = currentFs.makeDirectory(currentPath);
          if (result.error) {
            return { output: result.error };
          }
          currentFs = result.fs!;
        }
      }
    } else {
      // Check parent exists
      const parent = parentPath(absPath);
      if (!currentFs.getNode(parent)) {
        return { output: `mkdir: cannot create directory '${arg}': No such file or directory` };
      }
      const result = currentFs.makeDirectory(absPath);
      if (result.error) {
        return { output: result.error };
      }
      currentFs = result.fs!;
    }
  }

  return { output: "", newFs: currentFs };
};

register("mkdir", mkdir, "Create directories", HELP_TEXTS.mkdir);
