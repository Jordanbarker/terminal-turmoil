import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { isFile, isDirectory } from "../../filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

const cp: CommandHandler = (args, _flags, ctx) => {
  if (args.length < 2) {
    return { output: "cp: missing operand\nUsage: cp SOURCE DEST" };
  }

  const srcPath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  let destPath = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  const srcNode = ctx.fs.getNode(srcPath);
  if (!srcNode) {
    return { output: `cp: cannot stat '${args[0]}': No such file or directory` };
  }

  if (!isFile(srcNode)) {
    return { output: `cp: omitting directory '${args[0]}'` };
  }

  // If dest is a directory, copy source into it
  const destNode = ctx.fs.getNode(destPath);
  if (destNode && isDirectory(destNode)) {
    destPath = destPath + "/" + srcNode.name;
  }

  const writeResult = ctx.fs.writeFile(destPath, srcNode.content);
  if (writeResult.error) {
    return { output: writeResult.error };
  }

  return { output: "", newFs: writeResult.fs };
};

register("cp", cp, "Copy files", HELP_TEXTS.cp);
