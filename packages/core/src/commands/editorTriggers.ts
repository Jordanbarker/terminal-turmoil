/**
 * Editor-open trigger seam (core, story-agnostic).
 *
 * Opening a file in `nano`/`vim` is a plain shell action, but a game may want
 * editing one particular file to advance its story ("fix the broken script").
 * The engine owns the mechanics — matching the opened path, requiring the
 * reader to scroll, requiring a save, and testing the saved buffer — and the
 * app supplies the table of what to watch for. Absent => editors fire no story
 * events, which is the default.
 *
 * `contentPredicate` is the part that makes such an objective honest: without
 * it, any save at all completes "fix the typo", including a save that changed
 * nothing. The predicate runs on the last-saved buffer, so the app decides what
 * "fixed" means without core knowing a thing about the file.
 *
 * The termoil app supplies its table from apps/termoil/src/story/editorTriggers.ts.
 */
import type { GameEvent } from "@tt/core";

export interface EditorOpenTrigger {
  /** Machine the file must be open on (`CommandContext.activeComputer`); any if absent. */
  computer?: string;
  /** Absolute path of the opened file must equal this. */
  path?: string;
  /** ...or end with this, for per-player home paths. */
  pathSuffix?: string;
  /** Row the reader must have scrolled to before the events fire (default 0). */
  triggerRow?: number;
  /** Require the player to have saved at least once. */
  requireSave?: boolean;
  /** Saved buffer must satisfy this. Implies `requireSave`. */
  contentPredicate?: (content: string) => boolean;
  /** Events emitted on exit once every condition above holds. */
  events: GameEvent[];
}

let triggers: EditorOpenTrigger[] = [];

export function setEditorOpenTriggers(next: EditorOpenTrigger[]): void {
  triggers = next;
}

/** Drop the registered table (used by tests for isolation). */
export function resetEditorOpenTriggers(): void {
  triggers = [];
}

/** The trigger, if any, that an editor opening `absolutePath` should carry. */
export function matchEditorOpenTrigger(
  absolutePath: string,
  activeComputer: string | undefined,
): EditorOpenTrigger | undefined {
  return triggers.find((t) => {
    if (t.computer !== undefined && t.computer !== activeComputer) return false;
    if (t.path !== undefined && t.path !== absolutePath) return false;
    if (t.pathSuffix !== undefined && !absolutePath.endsWith(t.pathSuffix)) return false;
    return t.path !== undefined || t.pathSuffix !== undefined;
  });
}
