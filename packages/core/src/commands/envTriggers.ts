/**
 * Environment-export trigger seam (core, story-agnostic).
 *
 * `export VAR=value` is a plain shell builtin, but a game may want a specific
 * assignment to advance its story (termoil: pasting Chip's API key, pointing
 * SSH_AUTH_SOCK at a forwarded agent socket). The engine owns the matching
 * mechanics — including resolving a relative value against the cwd, the way
 * connect(2) would — and the app supplies the table of what to watch for.
 * Absent => `export` emits no events, which is the default.
 *
 * The termoil app supplies its table from apps/termoil/src/story/envTriggers.ts.
 */
import type { GameEvent } from "@tt/core";
import { resolvePath } from "@tt/core/lib/pathUtils";

export interface EnvExportTrigger {
  /** Variable the assignment must target, e.g. "SSH_AUTH_SOCK". */
  key: string;
  /** Fires when the assigned value equals this literal. */
  value?: string;
  /** Fires when the assigned value *resolves* to this absolute path. */
  path?: string;
  /** `command_executed` detail emitted on a match. */
  detail: string;
}

let triggers: EnvExportTrigger[] = [];

export function setEnvExportTriggers(next: EnvExportTrigger[]): void {
  triggers = next;
}

/** Drop the registered table (used by tests for isolation). */
export function resetEnvExportTriggers(): void {
  triggers = [];
}

/** Events an `export KEY=VALUE` assignment should emit under the current table. */
export function matchEnvExportTriggers(
  key: string,
  value: string,
  cwd: string,
  homeDir: string,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const trigger of triggers) {
    if (trigger.key !== key) continue;
    const matches =
      (trigger.value !== undefined && trigger.value === value) ||
      (trigger.path !== undefined && trigger.path === resolvePath(value, cwd, homeDir));
    if (matches) events.push({ type: "command_executed", detail: trigger.detail });
  }
  return events;
}
