// Word expansion shared by the interactive shell (`runPipeline`) and the
// `bash` script runner: `$VAR` parameter expansion and zsh-style filename
// globbing.
//
// The order is alias -> parse -> variables -> globs (see the commands skill).
// Two rules make it predictable and keep it out of the way of quoting:
//
//   1. A single-quoted run is never expanded (neither vars nor globs).
//      A double-quoted run gets variables but never globs.
//   2. Glob metacharacters (and a leading `~`) that arrive *from* a variable's
//      value are literal.
//      `P='*.log'; ls $P` lists a file actually named `*.log`, it does not
//      re-glob. zsh behaves the same way (GLOB_SUBST is off by default), and
//      it means a value can never turn into a filesystem sweep behind the
//      player's back.
//
// A pattern that is a valid glob but an invalid JS character class (`[9-0]`)
// degrades to a literal component rather than throwing: an uncaught throw here
// takes the whole shell down.
//
// Deliberately NOT supported: `$(...)`/backticks (copied through untouched, so
// the interactive shell shows them literally and only `bash`'s own substitution
// pass acts on them), brace expansion, arithmetic, and process substitution.
import { VirtualFS } from "../filesystem/VirtualFS";
import { isDirectory } from "../filesystem/types";
import { normalizePath } from "../lib/pathUtils";
import { QuotedWord, tokenizeWords, wordText } from "./parser";

// ---------------------------------------------------------------------------
// Variable expansion
// ---------------------------------------------------------------------------

/** Resolve one variable name; `undefined` means "not set" (expands to empty). */
export type VariableLookup = (name: string) => string | undefined;

/** A run of expanded text, tagged with where it came from. */
export interface SubstitutedPart {
  text: string;
  /** True when the text is a variable's *value* (so its `*`/`?`/`[` are literal). */
  fromVariable: boolean;
}

/** Where the shell's variables come from, for `makeShellLookup`. */
export interface ShellVariableSources {
  envVars?: Record<string, string>;
  homeDir?: string;
  username?: string;
  cwd?: string;
  /** Exit status of the previous command, for `$?`. Omit to leave `$?` literal. */
  lastExitCode?: number;
}

/**
 * Build the lookup the interactive shell uses. `envVars` wins for anything it
 * actually holds; the rest are shell-maintained values that no app stores in
 * the env map (`PWD` and `$?` change per command, and term-crunch's env starts
 * empty so `$HOME`/`$USER` would otherwise be blank there).
 */
export function makeShellLookup(sources: ShellVariableSources): VariableLookup {
  return (name) => {
    if (name === "?") {
      return sources.lastExitCode === undefined ? undefined : String(sources.lastExitCode);
    }
    const env = sources.envVars;
    if (env && Object.prototype.hasOwnProperty.call(env, name)) return env[name];
    switch (name) {
      case "HOME": return sources.homeDir;
      case "USER":
      case "LOGNAME": return sources.username;
      case "PWD": return sources.cwd;
      default: return undefined;
    }
  };
}

/** Find the matching closing paren for a `$(` whose inner text starts at `start`. */
function findMatchingParen(text: string, start: number): number {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Core substitution pass. Handles `$VAR`, `${VAR}`, `${VAR:-default}`, `$1`..`$9`
 * (when `positionalArgs` is given) and `$?` (only when `lookup` answers for it,
 * so the bash runner — which has no `$?` — keeps printing it literally).
 * `$(...)` blocks are copied through verbatim.
 *
 * `respectSingleQuotes` is for callers holding raw text that still contains its
 * quote characters (the `bash` script runner). Callers that already tokenized
 * (the interactive shell) pass `false` and hand in one unquoted run at a time.
 */
function substitute(
  parts: SubstitutedPart[],
  text: string,
  lookup: VariableLookup,
  positionalArgs: string[] | undefined,
  respectSingleQuotes: boolean,
): void {
  const push = (s: string, fromVariable: boolean) => {
    if (!s) return;
    const last = parts[parts.length - 1];
    if (last && last.fromVariable === fromVariable) last.text += s;
    else parts.push({ text: s, fromVariable });
  };

  let inSingle = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (respectSingleQuotes && ch === "'") {
      inSingle = !inSingle;
      push(ch, false);
      i++;
      continue;
    }
    if (inSingle) {
      push(ch, false);
      i++;
      continue;
    }

    if (ch !== "$" || i + 1 >= text.length) {
      push(ch, false);
      i++;
      continue;
    }

    const next = text[i + 1];

    // `$(...)`: command substitution is not modelled here. Copy the whole
    // block through so it stays literal for the shell and intact for bash's
    // own substitution pass, which runs after this one.
    if (next === "(") {
      const close = findMatchingParen(text, i + 2);
      if (close === -1) {
        push(text.slice(i), false);
        break;
      }
      push(text.slice(i, close + 1), false);
      i = close + 1;
      continue;
    }

    if (next === "{") {
      const close = text.indexOf("}", i + 2);
      if (close === -1) {
        push(ch, false);
        i++;
        continue;
      }
      const inner = text.slice(i + 2, close);
      const withDefault = inner.match(/^(\w+):-(.*)$/);
      if (withDefault) {
        const value = lookup(withDefault[1]);
        push(value !== undefined ? value : withDefault[2], true);
      } else {
        push(lookup(inner) ?? "", true);
      }
      i = close + 1;
      continue;
    }

    if (positionalArgs && /[1-9]/.test(next)) {
      push(positionalArgs[parseInt(next, 10) - 1] ?? "", true);
      i += 2;
      continue;
    }

    if (next === "?") {
      const value = lookup("?");
      if (value !== undefined) {
        push(value, true);
        i += 2;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(next)) {
      const name = text.slice(i + 1).match(/^[A-Za-z_]\w*/)![0];
      push(lookup(name) ?? "", true);
      i += 1 + name.length;
      continue;
    }

    push(ch, false);
    i++;
  }
}

/**
 * Expand variables in raw text that still carries its quote characters,
 * skipping single-quoted runs and leaving every quote char in place. This is
 * the form the `bash` script runner needs (it re-parses the result).
 */
export function expandVariablesQuoteAware(
  text: string,
  lookup: VariableLookup,
  positionalArgs?: string[],
): string {
  const parts: SubstitutedPart[] = [];
  substitute(parts, text, lookup, positionalArgs, true);
  return parts.map((p) => p.text).join("");
}

// ---------------------------------------------------------------------------
// Glob expansion
// ---------------------------------------------------------------------------

/** One character of a word, with whether it may act as a glob metacharacter. */
interface PatternChar {
  ch: string;
  meta: boolean;
}

type PathPart =
  | { kind: "literal"; text: string }
  | { kind: "glob"; re: RegExp; matchesDotfiles: boolean }
  /** A bare `**` component: zero or more directory levels (zsh's `**​/`). */
  | { kind: "globstar" };

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Is this component exactly `**` typed unquoted (the recursive-descent operator)? */
function isGlobstar(chars: PatternChar[]): boolean {
  return chars.length === 2 && chars.every((c) => c.ch === "*" && c.meta);
}

/**
 * Compile one path component. Returns a literal part when the component holds
 * no *active* metacharacter — an unmatched `[` is a literal `[`, as in zsh.
 */
function compilePathPart(chars: PatternChar[]): PathPart {
  let source = "";
  let isGlob = false;
  let i = 0;

  while (i < chars.length) {
    const { ch, meta } = chars[i];

    if (meta && ch === "*") {
      source += "[^/]*";
      isGlob = true;
      i++;
      continue;
    }
    if (meta && ch === "?") {
      source += "[^/]";
      isGlob = true;
      i++;
      continue;
    }
    if (meta && ch === "[") {
      // A `]` in the first content position is a literal member, per POSIX.
      let scan = i + 1;
      if (scan < chars.length && (chars[scan].ch === "!" || chars[scan].ch === "^")) scan++;
      if (scan < chars.length && chars[scan].ch === "]") scan++;
      let close = -1;
      for (let j = scan; j < chars.length; j++) {
        if (chars[j].ch === "]" && chars[j].meta) { close = j; break; }
      }
      if (close !== -1) {
        const negated = chars[i + 1].ch === "!" || chars[i + 1].ch === "^";
        const body = chars
          .slice(i + 1 + (negated ? 1 : 0), close)
          .map(({ ch: c }) => (c === "-" ? c : c.replace(/[\]\\^]/g, "\\$&")))
          .join("");
        source += `[${negated ? "^" : ""}${body}]`;
        isGlob = true;
        i = close + 1;
        continue;
      }
    }

    source += escapeRegex(ch);
    i++;
  }

  const literal = (): PathPart => ({ kind: "literal", text: chars.map((c) => c.ch).join("") });
  if (!isGlob) return literal();

  let re: RegExp;
  try {
    re = new RegExp(`^${source}$`);
  } catch {
    // A bracket expression the player typed can be a valid glob token but an
    // invalid JS character class (`[9-0]`, `[z-a]`). Degrade to a literal
    // component — the same treatment an unmatched `[` gets — rather than
    // letting the throw escape into the pipeline and kill the shell.
    return literal();
  }
  return {
    kind: "glob",
    re,
    // Standard rule: a leading dot must be written out, so `*` never sweeps up
    // the dotfiles the story hides things in.
    matchesDotfiles: chars[0]?.ch === ".",
  };
}

export interface GlobContext {
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
}

/**
 * Expand one word's characters against the filesystem. Returns `null` when the
 * word holds no active metacharacter (it is a plain literal), and an empty
 * array when it is a pattern that matched nothing (zsh's `nomatch`).
 */
function globExpand(chars: PatternChar[], ctx: GlobContext): string[] | null {
  const components: PatternChar[][] = [[]];
  for (const pc of chars) {
    if (pc.ch === "/") components.push([]);
    else components[components.length - 1].push(pc);
  }

  let absolute = false;
  let baseDir = ctx.cwd;
  const basePrefix: string[] = [];

  if (components.length > 1 && components[0].length === 0) {
    absolute = true;
    baseDir = "/";
    components.shift();
  } else if (
    components.length > 1 && components[0].length === 1 &&
    components[0][0].ch === "~" && components[0][0].meta
  ) {
    // `meta` matters: a `~` that arrived from a variable is a literal filename
    // character, so `P='~'; ls $P` must not reach the home directory.
    // `~/...` — zsh expands the tilde before globbing, so results are absolute.
    absolute = true;
    baseDir = ctx.homeDir;
    basePrefix.push(...ctx.homeDir.split("/").filter(Boolean));
    components.shift();
  }

  // A trailing `/` restricts the match to directories and is kept on the result.
  let trailingSlash = false;
  if (components.length > 1 && components[components.length - 1].length === 0) {
    trailingSlash = true;
    components.pop();
  }

  const parts = components
    .filter((c) => c.length > 0)
    .map((c) => (isGlobstar(c) ? ({ kind: "globstar" } as PathPart) : compilePathPart(c)));
  if (!parts.some((p) => p.kind === "glob" || p.kind === "globstar")) return null;

  // A trailing `**` has no component after it to match, so it would render the
  // directories it descended through. `ls **` meaning "everything under here"
  // is what players expect, so it becomes `**/*`.
  if (parts[parts.length - 1]?.kind === "globstar") {
    parts.push({ kind: "glob", re: /^[^/]*$/, matchesDotfiles: false });
  }

  const results: string[] = [];
  const render = (segments: string[]) =>
    (absolute ? "/" : "") + segments.join("/") + (trailingSlash ? "/" : "");

  const walk = (index: number, absDir: string, segments: string[]): void => {
    if (index >= parts.length) {
      results.push(render(segments));
      return;
    }
    const part = parts[index];
    const isLast = index === parts.length - 1;

    if (part.kind === "globstar") {
      // Zero levels, then every visible subdirectory, recursively. VirtualFS is
      // a tree with no symlinks, so this always terminates.
      walk(index + 1, absDir, segments);
      const listing = ctx.fs.listDirectory(absDir);
      if (listing.error) return;
      for (const entry of listing.entries.map((e) => e.name).sort()) {
        if (entry.startsWith(".")) continue;
        const nextAbs = normalizePath(`${absDir}/${entry}`);
        const node = ctx.fs.getNode(nextAbs);
        if (!node || !isDirectory(node)) continue;
        walk(index, nextAbs, [...segments, entry]);
      }
      return;
    }

    if (part.kind === "literal") {
      const nextAbs = normalizePath(`${absDir}/${part.text}`);
      const node = ctx.fs.getNode(nextAbs);
      if (!node) return;
      if ((!isLast || trailingSlash) && !isDirectory(node)) return;
      walk(index + 1, nextAbs, [...segments, part.text]);
      return;
    }

    const { entries, error } = ctx.fs.listDirectory(absDir);
    if (error) return;
    const names = entries.map((e) => e.name).sort();
    for (const name of names) {
      if (name.startsWith(".") && !part.matchesDotfiles) continue;
      if (!part.re.test(name)) continue;
      const nextAbs = normalizePath(`${absDir}/${name}`);
      if (!isLast || trailingSlash) {
        const node = ctx.fs.getNode(nextAbs);
        if (!node || !isDirectory(node)) continue;
      }
      walk(index + 1, nextAbs, [...segments, name]);
    }
  };

  walk(0, baseDir, basePrefix);
  // `**` can reach the same path by more than one route, and its depth-first
  // order is not lexicographic; zsh hands back one sorted set either way.
  return [...new Set(results)].sort();
}

// ---------------------------------------------------------------------------
// The combined pass
// ---------------------------------------------------------------------------

export interface WordExpansionOptions extends GlobContext {
  lookup: VariableLookup;
  /** Disable filename globbing (variables still expand). Default: enabled. */
  glob?: boolean;
}

/**
 * Commands whose `NAME=VALUE` operands are assignments, not filenames. zsh runs
 * no filename generation on an assignment's right-hand side, so `export
 * FOO=*.log` stores the pattern instead of aborting the line with `nomatch`.
 */
const ASSIGNMENT_COMMANDS = new Set(["export", "alias"]);
const ASSIGNMENT_WORD = /^[A-Za-z_]\w*=/;

/**
 * Run the shell's word expansions over one command's raw text and return the
 * resulting argv. `error` is set for zsh's `nomatch` (`zsh: no matches found:`),
 * in which case the caller must not run the command at all.
 *
 * An unquoted word whose expansion is empty disappears (`echo $NOPE` runs
 * `echo` with no arguments), matching the tokenizer's existing treatment of
 * `echo ""`.
 */
export function expandWords(
  raw: string,
  opts: WordExpansionOptions,
): { tokens: string[]; error?: string } {
  const words = tokenizeWords(raw);
  if (words === null) return { tokens: [] };

  const tokens: string[] = [];
  let assignmentCommand = false;

  for (const word of words) {
    const chars = expandWordChars(word, opts.lookup);
    const text = chars.map((c) => c.ch).join("");

    const globbable =
      opts.glob !== false && !(assignmentCommand && ASSIGNMENT_WORD.test(text));
    if (globbable) {
      const matches = globExpand(chars, opts);
      if (matches !== null) {
        if (matches.length === 0) {
          return { tokens: [], error: `zsh: no matches found: ${wordText(word)}` };
        }
        tokens.push(...matches);
        continue;
      }
    }

    if (text) {
      if (tokens.length === 0) assignmentCommand = ASSIGNMENT_COMMANDS.has(text);
      tokens.push(text);
    }
  }

  return { tokens };
}

/**
 * Variable-expand one word into characters tagged with glob eligibility: only
 * text that was typed unquoted AND did not come out of a variable can act as a
 * pattern.
 */
function expandWordChars(word: QuotedWord, lookup: VariableLookup): PatternChar[] {
  const chars: PatternChar[] = [];
  const push = (text: string, meta: boolean) => {
    for (const ch of text) chars.push({ ch, meta });
  };

  for (const segment of word) {
    if (segment.quote === "single") {
      push(segment.text, false);
      continue;
    }
    const parts: SubstitutedPart[] = [];
    substitute(parts, segment.text, lookup, undefined, false);
    for (const part of parts) {
      push(part.text, segment.quote === "none" && !part.fromVariable);
    }
  }

  return chars;
}
