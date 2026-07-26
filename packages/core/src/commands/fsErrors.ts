import { CommandContext } from "@tt/core/commands/types";

/**
 * Re-labelling of raw `VirtualFS` errors for the builtin that triggered them.
 *
 * VirtualFS messages are written for its first callers (`cat:`, `mkdir:`, `rm:`
 * prefixes) or are bare (`Permission denied: <path>`, `Cannot write to
 * '<path>': ...`). Surfacing one verbatim from another command yields `cat: …`
 * out of `head`, or a permission error with no command name at all. Every
 * builtin routes its FS errors through here instead — read side and write side.
 *
 * Exit-code convention (coreutils): a read/write failure is **1**; **2** is
 * reserved for usage errors (missing operand, bad flag), which callers raise
 * themselves.
 */
export const READ_FAILURE_EXIT = 1;

const PERMISSION_PREFIX = "Permission denied: ";

/** Rewrite a raw VirtualFS error so it names `command` instead of its origin. */
export function labelFsError(command: string, error: string): string {
  if (error.startsWith(PERMISSION_PREFIX)) {
    return `${command}: ${error.slice(PERMISSION_PREFIX.length)}: Permission denied`;
  }
  // Strip an existing lowercase `<cmd>: ` prefix (cat:, mkdir:, rm:, chmod:).
  const existingPrefix = error.match(/^[a-z]+: /);
  if (existingPrefix) return `${command}: ${error.slice(existingPrefix[0].length)}`;
  return `${command}: ${error}`;
}

/** Read a file on behalf of a builtin, re-labelling any error with its name. */
export function readFileForCommand(
  command: string,
  absolutePath: string,
  ctx: CommandContext,
): { content?: string; error?: string } {
  const result = ctx.fs.readFile(absolutePath);
  if (result.error === undefined) return { content: result.content ?? "" };
  return { error: labelFsError(command, result.error) };
}
