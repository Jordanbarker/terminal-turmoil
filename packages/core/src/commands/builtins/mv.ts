import { CommandHandler } from "@tt/core/commands/types";
import { GameEvent } from "@tt/core";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { FSNode, isFile, isDirectory } from "@tt/core/filesystem/types";
import { labelFsError, errorResult } from "../fsErrors";
import { HELP_TEXTS } from "./helpTexts";

function buildMoveEvents(srcNode: FSNode, srcPath: string, destPath: string): GameEvent[] {
  const events: GameEvent[] = [];
  const walk = (node: FSNode, oldPath: string, newPath: string) => {
    if (isDirectory(node)) {
      events.push({ type: "directory_created", detail: newPath });
      events.push({ type: "directory_removed", detail: oldPath });
      for (const child of Object.values(node.children)) {
        walk(child, oldPath + "/" + child.name, newPath + "/" + child.name);
      }
    } else {
      events.push({ type: "file_created", detail: newPath });
      events.push({ type: "file_removed", detail: oldPath });
    }
  };
  walk(srcNode, srcPath, destPath);
  return events;
}

const mv: CommandHandler = (args, _flags, ctx) => {
  if (args.length < 2) {
    return errorResult("mv: missing operand\nUsage: mv SOURCE DEST");
  }

  const srcPath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  let destPath = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  const srcNode = ctx.fs.getNode(srcPath);
  if (!srcNode) {
    return errorResult(`mv: cannot stat '${args[0]}': No such file or directory`);
  }

  // Reject same-path self-moves before any retargeting (e.g. `mv b b`).
  if (srcPath === destPath) {
    return errorResult(`mv: '${args[0]}' and '${args[1]}' are the same file`);
  }

  // If dest exists and is a directory, move source inside it
  const destNode = ctx.fs.getNode(destPath);
  if (destNode && isDirectory(destNode)) {
    destPath = destPath + "/" + srcNode.name;
  }

  if (srcPath === destPath) {
    return errorResult(`mv: '${args[0]}' and '${args[1]}' are the same file`);
  }

  // Refuse to move a directory into itself or a descendant
  if (isDirectory(srcNode) && (destPath === srcPath || destPath.startsWith(srcPath + "/"))) {
    return errorResult(`mv: cannot move '${args[0]}' to a subdirectory of itself, '${args[1]}'`);
  }

  // If dest already exists at the final retargeted path, decide if overwrite is legal
  const finalDestNode = ctx.fs.getNode(destPath);
  if (finalDestNode) {
    if (isDirectory(srcNode) && isFile(finalDestNode)) {
      return errorResult(`mv: cannot overwrite non-directory '${args[1]}' with directory '${args[0]}'`);
    }
    if (isDirectory(srcNode) && isDirectory(finalDestNode)) {
      return errorResult(`mv: cannot move '${args[0]}' to '${args[1]}': Directory not empty or already exists`);
    }
    if (isFile(srcNode) && isDirectory(finalDestNode)) {
      // Shouldn't reach: if dest was a dir, we already retargeted into it.
      return errorResult(`mv: cannot overwrite directory '${args[1]}' with non-directory '${args[0]}'`);
    }
  }

  const securityViolation = ctx.security?.checkPathOp(ctx.fs, srcPath, "mv", {
    computerId: ctx.activeComputer,
    homeDir: ctx.homeDir,
    destPath,
    command: `mv ${args[0]} ${args[1]}`,
  }) ?? undefined;

  // --- File branch ---
  if (isFile(srcNode)) {
    const existedBefore = !!finalDestNode;
    // Pass the source node as the template so a fresh destination inherits its
    // mode (the x bit on scripts) and metadata instead of a default 644 file.
    const writeResult = ctx.fs.writeFile(destPath, srcNode.content, srcNode);
    if (writeResult.error) {
      return errorResult(labelFsError("mv", writeResult.error));
    }
    const removeResult = writeResult.fs!.removeNode(srcPath);
    if (removeResult.error) {
      return errorResult(labelFsError("mv", removeResult.error));
    }
    return {
      output: "",
      newFs: removeResult.fs,
      triggerEvents: [
        { type: existedBefore ? "file_modified" : "file_created", detail: destPath },
        { type: "file_removed", detail: srcPath },
      ],
      securityViolation,
    };
  }

  // --- Directory branch ---
  // insertNode renames the subtree root to the destination basename itself.
  const insertResult = ctx.fs.insertNode(destPath, srcNode);
  if (insertResult.error) {
    return errorResult(labelFsError("mv", insertResult.error));
  }
  const removeResult = insertResult.fs!.removeNode(srcPath);
  if (removeResult.error) {
    return errorResult(labelFsError("mv", removeResult.error));
  }
  return {
    output: "",
    newFs: removeResult.fs,
    triggerEvents: buildMoveEvents(srcNode, srcPath, destPath),
    securityViolation,
  };
};

register("mv", mv, "Move or rename files and directories", HELP_TEXTS.mv);
setKnownFlags("mv", {});
