/**
 * Operand handling shared by the read-a-file-or-stdin builtins
 * (`wc`, `sort`, `uniq`, `less`).
 */

/**
 * Split a command's operands into real file paths and coreutils' `-`
 * stdin marker.
 *
 * The parser cannot do this for us: `parseInput` only routes a token to
 * `flags` when it starts with `-` AND is longer than one character, so a bare
 * `-` lands in `args` looking exactly like a filename. Resolving it as one
 * produces `wc: /-: No such file or directory` for the very ordinary
 * `cat f | wc -`.
 *
 * `readStdin` is true when nothing was named to read from: no operands at all,
 * or nothing but `-`. Callers still have to check `ctx.stdin !== undefined`,
 * since a command with no pipe feeding it must report a missing operand rather
 * than hang.
 */
export function fileOperands(args: string[]): { files: string[]; readStdin: boolean } {
  const files = args.filter((arg) => arg !== "-");
  return { files, readStdin: files.length === 0 };
}
