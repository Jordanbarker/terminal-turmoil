import { VirtualFS } from "../filesystem/VirtualFS";
import { isDirectory } from "../filesystem/types";
import { resolvePath, basename } from "../../lib/pathUtils";

export interface SuggestionContext {
  commandHistory: string[];
  commandNames: string[];
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
}

/**
 * Compute a zsh-style autosuggestion for the current input.
 * Returns the full suggested string, or null if no suggestion.
 */
export function getSuggestion(
  input: string,
  ctx: SuggestionContext
): string | null {
  if (!input) return null;

  // Strategy 1: History match (scan reverse, first entry starting with input)
  for (let i = ctx.commandHistory.length - 1; i >= 0; i--) {
    const entry = ctx.commandHistory[i];
    if (entry.startsWith(input) && entry.length > input.length) {
      return entry;
    }
  }

  // Strategy 2: Command name completion (no spaces = still typing command)
  if (!input.includes(" ")) {
    const match = ctx.commandNames
      .slice()
      .sort()
      .find((name) => name.startsWith(input) && name.length > input.length);
    if (match) return match;
  }

  // Strategy 3: Path argument completion (for cd, ls, cat)
  const spaceIdx = input.indexOf(" ");
  if (spaceIdx !== -1) {
    const cmd = input.slice(0, spaceIdx);
    const pathCommands = ["cd", "ls", "cat", "nano", "head", "tail", "grep", "diff", "wc", "file", "sort", "uniq", "chmod", "rm", "cp", "mv", "touch", "find", "tree"];
    if (pathCommands.includes(cmd)) {
      const partial = input.slice(spaceIdx + 1);
      const completed = completePath(partial, ctx, cmd === "cd");
      if (completed !== null) {
        return cmd + " " + completed;
      }
    }

    // Strategy 3b: Subcommand completion for dbt
    if (cmd === "dbt") {
      const partial = input.slice(spaceIdx + 1);
      const subs = ["run", "test", "build", "ls", "list", "debug", "compile", "show", "--version"];
      const match = subs.find((s) => s.startsWith(partial) && s.length > partial.length);
      if (match) return cmd + " " + match;
    }
  }

  return null;
}

/**
 * Complete a partial path against the virtual filesystem.
 * Returns the completed path string, or null if no match.
 */
function completePath(
  partial: string,
  ctx: SuggestionContext,
  directoriesOnly: boolean
): string | null {
  if (!partial) return null;

  // Determine the parent directory and prefix to match
  const lastSlash = partial.lastIndexOf("/");
  let parentInput: string;
  let prefix: string;

  if (lastSlash === -1) {
    // No slash — resolve relative to cwd
    parentInput = ctx.cwd;
    prefix = partial;
  } else {
    // Has slash — resolve the directory part
    parentInput = resolvePath(
      partial.slice(0, lastSlash + 1),
      ctx.cwd,
      ctx.homeDir
    );
    prefix = partial.slice(lastSlash + 1);
  }

  if (!prefix) return null;

  const { entries } = ctx.fs.listDirectory(parentInput);
  if (!entries.length) return null;

  // Sort entries alphabetically and find first match
  const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    if (!entry.name.startsWith(prefix)) continue;
    if (entry.name.length <= prefix.length) continue;
    if (directoriesOnly && !isDirectory(entry)) continue;

    // Build the completed path preserving the user's original prefix structure
    const completedName =
      entry.name + (isDirectory(entry) ? "/" : "");
    if (lastSlash === -1) {
      return completedName;
    } else {
      return partial.slice(0, lastSlash + 1) + completedName;
    }
  }

  return null;
}
