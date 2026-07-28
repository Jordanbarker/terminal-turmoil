/**
 * Script-interception seam (core, story-agnostic).
 *
 * A game may want one specific script to produce authored output instead of
 * really being interpreted (termoil's ~/scripts/auto_apply.py, which "applies
 * to jobs"). Every path that runs a script file — `python foo.py`, `bash
 * foo.py`, and bare `./foo.py` — asks the registered interceptor first;
 * returning null means "run it for real". Absent => nothing is intercepted,
 * which is the default and the case for any non-story game on this engine.
 *
 * The termoil app registers its interceptor from
 * src/engine/commands/scriptInterceptor.ts.
 */
import type { CommandContext, CommandResult } from "./types";

export type ScriptInterceptor = (
  /** Absolute, already-resolved path of the script about to run. */
  absPath: string,
  /** Positional args the script was invoked with (interpreter token excluded). */
  scriptArgs: string[],
  ctx: CommandContext,
) => CommandResult | null;

let interceptor: ScriptInterceptor | null = null;

export function setScriptInterceptor(fn: ScriptInterceptor | null): void {
  interceptor = fn;
}

/** Drop the registered interceptor (used by tests for isolation). */
export function resetScriptInterceptor(): void {
  interceptor = null;
}

/** Returns the authored result for `absPath`, or null to execute it normally. */
export function interceptScript(
  absPath: string,
  scriptArgs: string[],
  ctx: CommandContext,
): CommandResult | null {
  return interceptor?.(absPath, scriptArgs, ctx) ?? null;
}
