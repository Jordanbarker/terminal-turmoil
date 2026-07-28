import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { scanQuoted, splitOnChainOperators } from "@tt/core/commands/parser";

const HISTORY_SCAN_DEPTH = 100;

export interface SuggestionContext {
  commandHistory: string[];
  commandNames: string[];
  aliasNames?: string[];
  aliases?: Record<string, string>;
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
}

/** Commands that accept path arguments */
export const PATH_COMMANDS = [
  "cd", "ls", "cat", "less", "nano", "vim", "vi", "head", "tail", "grep", "diff", "wc", "file",
  "sort", "uniq", "chmod", "rm", "cp", "mv", "touch", "find", "tree",
  "pdftotext", "bash", "sh", "source", ".", "python", "python3", "mkdir",
];

/** Path commands that complete directories only (not files) */
export const DIRECTORY_ONLY_COMMANDS = ["cd", "mkdir"];

/**
 * Subcommand lists keyed by parent command, for core's own commands only.
 * A game that registers its own builtins registers their subcommands through
 * `addSubcommandCompletions` — otherwise TAB/ghost-text offers words that
 * resolve to "command not found" in any app that lacks the command.
 */
export const SUBCOMMAND_MAP: Record<string, string[]> = {
  dbt: ["run", "test", "build", "ls", "list", "debug", "compile", "show", "--version"],
  snow: ["sql"],
  bash: ["-c"],
  sh: ["-c"],
  git: ["init", "clone", "add", "rm", "commit", "status", "log", "branch", "checkout", "restore", "switch", "rebase", "reset", "diff", "stash", "push", "pull", "help"],
};

/** App-registered subcommand lists, merged on top of SUBCOMMAND_MAP. */
let extraSubcommands: Record<string, string[]> = {};

/**
 * Register subcommand completions for app-owned commands (termoil does this
 * from its builtins index for `apt`, and for the `apt` it adds under `sudo`).
 * Additions merge with core's entries rather than replacing them, so an app can
 * extend a core command's list; repeated values are ignored.
 */
export function addSubcommandCompletions(additions: Record<string, string[]>): void {
  for (const [command, subs] of Object.entries(additions)) {
    const existing = extraSubcommands[command] ?? [];
    extraSubcommands = {
      ...extraSubcommands,
      [command]: [...existing, ...subs.filter((s) => !existing.includes(s))],
    };
  }
}

/** Drop all app-registered subcommands (used by tests for isolation). */
export function resetSubcommandCompletions(): void {
  extraSubcommands = {};
}

/** Every subcommand offered for `command`, core's plus the app's. Undefined = none. */
export function getSubcommandCompletions(command: string): string[] | undefined {
  const base = SUBCOMMAND_MAP[command];
  const extra = extraSubcommands[command];
  if (!base) return extra;
  if (!extra) return base;
  return [...base, ...extra.filter((s) => !base.includes(s))];
}

/**
 * List entries in a directory matching a prefix (case-insensitively, as zsh's
 * completion does by default).
 * Returns matching entries with their display names (name + "/" for dirs).
 */
export function listMatchingEntries(
  parentDir: string,
  prefix: string,
  ctx: SuggestionContext,
  directoriesOnly: boolean,
): { name: string; displayName: string }[] {
  const { entries } = ctx.fs.listDirectory(parentDir);
  if (!entries.length) return [];

  const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
  const results: { name: string; displayName: string }[] = [];

  for (const entry of sorted) {
    if (directoriesOnly && !isDirectory(entry)) continue;
    // zsh (and ls) only surface dotfiles once the prefix asks for them; an
    // empty or plain prefix must not leak hidden entries into completion.
    if (entry.hidden && !prefix.startsWith(".")) continue;

    if (!entry.name.toLowerCase().startsWith(prefix.toLowerCase())) continue;

    const displayName = entry.name + (isDirectory(entry) ? "/" : "");
    results.push({ name: entry.name, displayName });
  }

  return results;
}

/**
 * Split a partial path into the resolved parent directory, the entry-name
 * prefix to match, and the literal text before the name (for reconstruction).
 */
export function splitPartialPath(
  partial: string,
  ctx: SuggestionContext,
): { parentDir: string; prefix: string; pathPrefix: string } {
  const lastSlash = partial.lastIndexOf("/");
  if (lastSlash === -1) {
    return { parentDir: ctx.cwd, prefix: partial, pathPrefix: "" };
  }
  const pathPrefix = partial.slice(0, lastSlash + 1);
  return {
    parentDir: resolvePath(pathPrefix, ctx.cwd, ctx.homeDir),
    prefix: partial.slice(lastSlash + 1),
    pathPrefix,
  };
}

/**
 * Find the last unquoted single pipe `|` (not `||`) in input.
 * Returns the index, or -1 if none found.
 */
export function findLastUnquotedPipe(input: string): number {
  let lastPipe = -1;

  scanQuoted(input, (char, i, state, isQuote) => {
    if (isQuote || state.inSingle || state.inDouble) return;
    // Check it's not part of ||
    if (char === "|" && input[i - 1] !== "|" && input[i + 1] !== "|") {
      lastPipe = i;
    }
  });

  return lastPipe;
}

/**
 * Check if input contains an unquoted redirect operator (> or >>).
 */
export function hasUnquotedRedirect(input: string): boolean {
  let found = false;

  scanQuoted(input, (char, _i, state, isQuote) => {
    if (!isQuote && char === ">" && !state.inSingle && !state.inDouble) found = true;
  });

  return found;
}

/**
 * Resolve an alias to its underlying command name.
 */
export function resolveAlias(cmd: string, aliases?: Record<string, string>): string {
  if (aliases?.[cmd]) {
    return aliases[cmd].split(/\s+/)[0];
  }
  return cmd;
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

  // Strategy 1: History match against FULL input (scan reverse, first entry starting with input)
  for (let i = ctx.commandHistory.length - 1; i >= Math.max(0, ctx.commandHistory.length - HISTORY_SCAN_DEPTH); i--) {
    const entry = ctx.commandHistory[i];
    if (entry.startsWith(input) && entry.length > input.length) {
      return entry;
    }
  }

  // For chain operators (&&, ||, ;): extract the last segment for completion
  const chainSegments = splitOnChainOperators(input);
  if (chainSegments.length > 1) {
    const lastSeg = chainSegments[chainSegments.length - 1];
    const lastText = lastSeg.text.trimStart();
    // If last segment is empty/whitespace, no suggestion
    if (!lastText) return null;
    // Compute suggestion for just the last segment
    const segSuggestion = getSuggestion(lastText, ctx);
    if (segSuggestion === null) return null;
    // Reconstruct: use original input up to the last segment, then append suggestion
    const lastSegStart = input.length - lastSeg.text.length;
    const leadingSpace = lastSeg.text.length - lastSeg.text.trimStart().length;
    const prefix = input.slice(0, lastSegStart + leadingSpace);
    return prefix + segSuggestion;
  }

  // Pipe support: extract last pipe segment
  const lastPipeIdx = findLastUnquotedPipe(input);
  if (lastPipeIdx >= 0) {
    const pipeText = input.slice(lastPipeIdx + 1);
    const trimmed = pipeText.trimStart();
    if (!trimmed) return null;
    const offset = lastPipeIdx + 1 + (pipeText.length - trimmed.length);
    const segSuggestion = getSuggestion(trimmed, ctx);
    if (segSuggestion === null) return null;
    return input.slice(0, offset) + segSuggestion;
  }

  // Strategy 2: Command name completion (no spaces = still typing command)
  if (!input.includes(" ")) {
    const allNames = [...ctx.commandNames, ...(ctx.aliasNames ?? [])];
    const match = allNames
      .slice()
      .sort()
      .find((name) => name.toLowerCase().startsWith(input.toLowerCase()) && name.length > input.length);
    if (match) return match;
  }

  // Strategy 3: Path argument completion (for cd, ls, cat)
  const spaceIdx = input.indexOf(" ");
  if (spaceIdx !== -1) {
    const cmd = input.slice(0, spaceIdx);
    const resolvedCmd = resolveAlias(cmd, ctx.aliases);

    if (PATH_COMMANDS.includes(resolvedCmd)) {
      const rest = input.slice(spaceIdx + 1);
      const lastSpaceInRest = rest.lastIndexOf(" ");
      const partial = lastSpaceInRest === -1 ? rest : rest.slice(lastSpaceInRest + 1);
      const prefix = lastSpaceInRest === -1 ? "" : rest.slice(0, lastSpaceInRest + 1);
      const completed = completePath(partial, ctx, DIRECTORY_ONLY_COMMANDS.includes(resolvedCmd));
      if (completed !== null) {
        return cmd + " " + prefix + completed;
      }
    }

    // Strategy 3b: Subcommand completion
    const subs = getSubcommandCompletions(resolvedCmd);
    if (subs) {
      const partial = input.slice(spaceIdx + 1);
      const match = subs.find((s) => s.toLowerCase().startsWith(partial.toLowerCase()) && s.length > partial.length);
      if (match) return cmd + " " + match;
    }
  }

  return null;
}

/**
 * Complete a partial path against the virtual filesystem.
 * Returns the completed path string, or null if no match.
 * Used for ghost-text suggestions (returns first match only, no empty prefix).
 */
function completePath(
  partial: string,
  ctx: SuggestionContext,
  directoriesOnly: boolean
): string | null {
  if (!partial) return null;

  const { parentDir, prefix, pathPrefix } = splitPartialPath(partial, ctx);
  if (!prefix) return null;

  const matches = listMatchingEntries(parentDir, prefix, ctx, directoriesOnly);
  if (matches.length === 0) return null;

  // Return first match (for ghost text, just show the top suggestion)
  return pathPrefix + matches[0].displayName;
}
