import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath, parentPath } from "../../../lib/pathUtils";
import { isFile, isDirectory } from "../../filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

const nano: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "Usage: nano <filename>" };
  }

  const target = args[0];
  const absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absolutePath);

  if (node && isDirectory(node)) {
    return { output: `nano: "${target}": Is a directory` };
  }

  if (node && isFile(node)) {
    // Existing file
    const readOnly = !node.permissions.startsWith("rw");
    return {
      output: "",
      editorSession: {
        filePath: absolutePath,
        content: node.content,
        readOnly,
        isNewFile: false,
      },
    };
  }

  // New file — check parent directory exists
  const parent = parentPath(absolutePath);
  const parentNode = ctx.fs.getNode(parent);
  if (!parentNode || !isDirectory(parentNode)) {
    return { output: `nano: "${target}": No such file or directory` };
  }

  return {
    output: "",
    editorSession: {
      filePath: absolutePath,
      content: "",
      readOnly: false,
      isNewFile: true,
    },
  };
};

register("nano", nano, "Edit files with a simple text editor", HELP_TEXTS.nano);
