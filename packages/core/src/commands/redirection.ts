import { CommandResult } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { MachineId } from "@tt/core/machine";
import { SecurityPolicy } from "@tt/core/commands/security";
import { stripAnsi } from "@tt/core/lib/ansi";
import { scanQuoted } from "@tt/core/commands/parser";

export interface RedirectTarget {
  file: string;
  append: boolean;
}

/**
 * What a segment does with its stderr.
 * - `default`: print it on the terminal (never piped, never redirected).
 * - `discard`: `2>/dev/null` / `2>>/dev/null` — drop it entirely.
 * - `merge`: `2>&1` — fold it into the segment's stdout, so it pipes and
 *   redirects along with `output`.
 */
export type StderrMode = "default" | "discard" | "merge";

export interface ExtractedStderrRedirect {
  /** The segment with its `2>…` tokens removed. */
  command: string;
  mode: StderrMode;
  /** Set for an unsupported `2>` form (only /dev/null and &1 are modelled). */
  parseError?: string;
}

export interface ExtractedRedirect {
  /** Pipeline segment with all `2>…` and `>`/`>>` tokens removed. */
  command: string;
  /** All stdout redirect targets, in order (zsh multios: output goes to every one). */
  redirects: RedirectTarget[];
  /** What the segment does with stderr (see `extractStderrRedirect`). */
  stderrMode: StderrMode;
  /** Set when a `>` has no target token (`echo hi >`) or a `2>` form is unsupported. */
  parseError?: string;
}

/** Skip spaces from `from`, then take the redirect target token. */
function scanRedirectTarget(raw: string, from: number): { target: string; end: number } {
  let j = from;
  while (j < raw.length && raw[j] === " ") j++;
  let target = "";
  while (j < raw.length && raw[j] !== " " && raw[j] !== "'" && raw[j] !== '"' &&
         raw[j] !== "|" && raw[j] !== "&" && raw[j] !== ";") {
    target += raw[j];
    j++;
  }
  return { target, end: j };
}

/**
 * Quote-aware extraction of the two stderr redirect forms the engine models.
 *
 * The tokens are always stripped (leaving them in would make `2>/dev/null` a
 * *file operand*), and exactly `2>/dev/null`, `2>>/dev/null` and `2>&1` are
 * honoured. Any other `2>target` is rejected rather than silently ignored:
 * writing stderr to an arbitrary file has no representation in `CommandResult`,
 * and pretending it worked would drop the diagnostic on the floor.
 *
 * Callers apply the returned `mode` to the **whole chain segment** (see
 * `runPipeline`), not to the individual command the token was typed on.
 */
export function extractStderrRedirect(raw: string): ExtractedStderrRedirect {
  let stripped = "";
  let mode: StderrMode = "default";
  let parseError: string | undefined;

  scanQuoted(raw, (ch, i, state, isQuote) => {
    if (isQuote) { stripped += ch; return; }

    if (!state.inSingle && !state.inDouble && ch === "2" && raw[i + 1] === ">") {
      if (raw.slice(i, i + 4) === "2>&1") {
        mode = "merge";
        return 3;
      }
      const isAppend = raw[i + 2] === ">";
      const { target, end } = scanRedirectTarget(raw, i + (isAppend ? 3 : 2));
      if (target === "/dev/null") {
        mode = "discard";
      } else {
        parseError = `zsh: ${target === "" ? "2>" : `2>${target}`}: only 2>/dev/null and 2>&1 are supported in this terminal`;
      }
      return end - i - 1;
    }

    stripped += ch;
  });

  return {
    command: stripped.trim(),
    mode,
    ...(parseError !== undefined && { parseError }),
  };
}

/**
 * Quote-aware extraction of redirection from a raw command segment: stderr
 * first (via `extractStderrRedirect`, so a `2>` never reads as a stdout `>`),
 * then every *unquoted* `>>`/`>` stdout target (zsh has multios on by default,
 * so output is written to all of them). Returns the segment with all of those
 * tokens removed. Callers that only need the stderr half of a non-final
 * pipeline stage can call `extractStderrRedirect` directly.
 */
export function extractStdoutRedirect(input: string): ExtractedRedirect {
  const stderrPass = extractStderrRedirect(input);
  const raw = stderrPass.command;
  let stripped = "";
  const redirects: RedirectTarget[] = [];
  let parseError: string | undefined = stderrPass.parseError;

  const scanTarget = (from: number) => scanRedirectTarget(raw, from);

  scanQuoted(raw, (ch, i, state, isQuote) => {
    if (isQuote) { stripped += ch; return; }

    if (!state.inSingle && !state.inDouble) {
      // Stdout redirect
      if (ch === ">") {
        const isAppend = raw[i + 1] === ">";
        const { target, end } = scanTarget(i + (isAppend ? 2 : 1));
        if (target === "") {
          parseError ??= "zsh: parse error near `\\n'";
        } else {
          redirects.push({ file: target, append: isAppend });
        }
        return end - i - 1;
      }
    }

    stripped += ch;
  });

  return {
    command: stripped.trim(),
    redirects,
    stderrMode: stderrPass.mode,
    ...(parseError !== undefined && { parseError }),
  };
}

/** Map a raw VirtualFS write error onto zsh's redirect wording. */
function zshRedirectError(error: string, file: string): string {
  if (error.includes("Is a directory")) return `zsh: is a directory: ${file}`;
  if (error.includes("Permission denied")) return `zsh: permission denied: ${file}`;
  return `zsh: no such file or directory: ${file}`;
}

/**
 * Validate redirect targets before the command runs (zsh opens redirect files
 * before exec, so a bad target means the command never executes — no output, no
 * events, no FS change). Delegates to `VirtualFS.canWriteFile` so the precheck
 * and the later write can never disagree: a `chmod 444` target is rejected here
 * rather than after the command has already run and emitted its events.
 * Returns a zsh-style error message for the first failing target, or null.
 */
export function precheckRedirects(
  redirects: RedirectTarget[],
  currentCwd: string,
  homeDir: string,
  fs: VirtualFS,
): string | null {
  for (const redirect of redirects) {
    const absPath = resolvePath(redirect.file, currentCwd, homeDir);
    if (absPath === "/dev/null") continue;

    const error = fs.canWriteFile(absPath);
    if (error) return zshRedirectError(error, redirect.file);
  }
  return null;
}

/**
 * Apply output redirection: write the command's **stdout** to every target file
 * (multios) and return the updated FS + result.
 *
 * Only `result.output` is written. `result.stderr` rides through untouched so
 * the caller still shows it on the terminal: in zsh a plain `>` redirects fd 1
 * only, so `lss x > notes.txt` truncates notes.txt, writes nothing into it, and
 * prints `zsh: command not found: lss`. A failing command therefore leaves an
 * empty target rather than a target full of error text.
 */
export function applyRedirection(
  redirects: RedirectTarget[],
  lastResult: CommandResult,
  currentCwd: string,
  homeDir: string,
  currentFs: VirtualFS,
  computerId: MachineId,
  security?: SecurityPolicy,
): { result: CommandResult; fs: VirtualFS; writeError?: string } {
  let fs = currentFs;
  const mergedEvents = [...(lastResult.triggerEvents ?? [])];
  let securityViolation = lastResult.securityViolation;

  for (const redirect of redirects) {
    const absPath = resolvePath(redirect.file, currentCwd, homeDir);

    // /dev/null: suppress output without writing
    if (absPath === "/dev/null") continue;

    const existedBefore = !!fs.getNode(absPath);

    // Files hold plain text: strip the SGR sequences colorized output carries,
    // exactly as the pipe path does before handing stdout to the next command.
    let content = stripAnsi(lastResult.output);
    if (redirect.append) {
      const existing = fs.readFile(absPath);
      if (existing.content !== undefined && existing.content !== "") {
        content = existing.content.endsWith("\n")
          ? existing.content + content
          : existing.content + "\n" + content;
      }
    }

    const writeResult = fs.writeFile(absPath, content);
    if (!writeResult.fs) {
      // Target became unwritable mid-pipeline (precheck normally catches this).
      const message = zshRedirectError(writeResult.error ?? "", redirect.file);
      return {
        result: {
          ...lastResult,
          output: "",
          stderr: [lastResult.stderr, message].filter(Boolean).join("\n"),
          exitCode: 1,
          triggerEvents: mergedEvents,
          securityViolation,
        },
        fs,
        // Also handed back on its own: callers that accumulate stderr in a
        // side channel (bash.ts's ScriptState) need the redirect's *new*
        // message without having to unpick it from the merged string.
        writeError: message,
      };
    }
    fs = writeResult.fs;

    mergedEvents.push(
      existedBefore
        ? { type: "file_modified" as const, detail: absPath }
        : { type: "file_created" as const, detail: absPath },
    );

    securityViolation =
      securityViolation ??
      (security?.isLogTamperPath(absPath, computerId)
        ? {
            kind: "log_tampering" as const,
            path: absPath,
            command: `${redirect.append ? ">>" : ">"} ${redirect.file}`,
            descendantCount: 1,
          }
        : undefined);
  }

  return {
    result: { ...lastResult, output: "", triggerEvents: mergedEvents, securityViolation },
    fs,
  };
}
