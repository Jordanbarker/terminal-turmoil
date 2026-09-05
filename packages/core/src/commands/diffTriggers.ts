/**
 * diff trigger seam (core, story-agnostic).
 *
 * `diff` is a plain comparison tool, but a game may want a specific comparison
 * to advance its story (termoil: diffing a tampered log against its .bak copy).
 * The app supplies a matcher over the raw operand args; absent => diff emits
 * no events, which is the default.
 *
 * The termoil app supplies its matcher from apps/termoil/src/story/diffTriggers.ts.
 */
import type { GameEvent } from "@tt/core";

export type DiffTrigger = (args: string[]) => GameEvent[] | null;

let trigger: DiffTrigger | null = null;

export function setDiffTrigger(next: DiffTrigger | null): void {
  trigger = next;
}

/** Drop the registered matcher (used by tests for isolation). */
export function resetDiffTrigger(): void {
  trigger = null;
}

/** Events a `diff ARGS...` invocation should emit under the current matcher. */
export function getDiffTriggerEvents(args: string[]): GameEvent[] {
  return trigger?.(args) ?? [];
}
