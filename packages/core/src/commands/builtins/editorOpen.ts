import { CommandContext, CommandResult } from "@tt/core/commands/types";
import type { EditorId } from "@tt/core/session/editorRegistry";
import { resolvePath, parentPath } from "@tt/core/lib/pathUtils";
import { isFile, isDirectory } from "@tt/core/filesystem/types";
import { matchEditorOpenTrigger } from "../editorTriggers";

/**
 * Shared open/validation logic for the editor builtins (nano, vim): directory
 * and permission checks, readOnly detection, new-file parent check, and the
 * app-supplied story trigger for this path (see ../editorTriggers). `editor`
 * selects which session class the app routers instantiate (see editorRegistry).
 */
export function openFileForEditing(
  target: string | undefined,
  ctx: CommandContext,
  editor: EditorId
): CommandResult {
  if (!target) {
    return { output: "", stderr: `Usage: ${editor} <filename>` };
  }

  const absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absolutePath);

  if (node && isDirectory(node)) {
    return { output: "", stderr: `${editor}: "${target}": Is a directory` };
  }

  if (node && isFile(node)) {
    const traversalError = ctx.fs.checkTraversal(absolutePath);
    if (traversalError) {
      return { output: "", stderr: `${editor}: "${target}": Permission denied` };
    }
    const readOnly = !node.permissions.startsWith("rw");
    const story = matchEditorOpenTrigger(absolutePath, ctx.activeComputer);
    return {
      output: "",
      editorSession: {
        filePath: absolutePath,
        content: node.content,
        readOnly,
        isNewFile: false,
        editor,
        ...(story && {
          triggerRow: story.triggerRow ?? 0,
          triggerEvents: story.events,
          requireSave: story.requireSave || !!story.contentPredicate,
          ...(story.contentPredicate && { contentPredicate: story.contentPredicate }),
        }),
      },
    };
  }

  // New file: check parent directory exists and permissions
  const parent = parentPath(absolutePath);
  const parentNode = ctx.fs.getNode(parent);
  if (!parentNode || !isDirectory(parentNode)) {
    return { output: "", stderr: `${editor}: "${target}": No such file or directory` };
  }
  const traversalError = ctx.fs.checkTraversal(absolutePath);
  if (traversalError) {
    return { output: "", stderr: `${editor}: "${target}": Permission denied` };
  }

  return {
    output: "",
    editorSession: {
      filePath: absolutePath,
      content: "",
      readOnly: false,
      isNewFile: true,
      editor,
    },
  };
}
