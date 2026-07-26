import { CHAPTERS } from "../engine/narrative/chapters";
import { resolveObjectives } from "../engine/narrative/objectives";
import { useGameStore } from "./gameStore";

/**
 * Objective promotion: objectives that *resolve* as complete (from story flags,
 * delivered emails, or an `allVisibleChildren` group whose children are all
 * done) are written back into `completedObjectives`, so downstream
 * `completedObjective` checks (`visibleWhen`, group parents, chapter gates) see
 * them.
 *
 * This is a store concern, not a HUD concern: it used to live in an effect
 * inside `ObjectiveTracker`, which stops running whenever the HUD unmounts
 * (every `gamePhase !== "playing"` transition), so flags flipped mid-transition
 * were only promoted once the player landed back in "playing".
 */

/**
 * Safety cap. Completion cascades (a group parent completes once its visible
 * children do), but the tree is at most two levels deep, so a few passes is
 * always enough. The cap only exists so a future content bug can't spin here.
 */
const MAX_CASCADE_PASSES = 8;

/** Guards against re-entry: each `completeObjective` write notifies subscribers. */
let promoting = false;

/** Promote every objective that currently resolves as completed. Idempotent. */
export function promoteResolvedObjectives(): void {
  if (promoting) return;
  promoting = true;
  try {
    for (let pass = 0; pass < MAX_CASCADE_PASSES; pass++) {
      const state = useGameStore.getState();
      const chapter = CHAPTERS.find((c) => c.id === state.currentChapter);
      if (!chapter) return;
      const done = new Set(state.completedObjectives);
      const newly = resolveObjectives(
        chapter,
        state.storyFlags,
        state.completedObjectives,
        state.deliveredEmailIds,
      ).filter((o) => o.completed && !done.has(o.id));
      if (newly.length === 0) return;
      for (const obj of newly) state.completeObjective(obj.id);
    }
    console.warn(
      `[objectives] promotion did not converge in ${MAX_CASCADE_PASSES} passes; objective tree may be half-promoted`,
    );
  } finally {
    promoting = false;
  }
}

/**
 * Subscribe promotion to the store for the lifetime of the app. Returns the
 * unsubscribe function. Re-resolves only when one of the four inputs
 * `resolveObjectives` reads changes identity, so the common store write (an FS
 * or pane update) costs four reference comparisons.
 */
export function startObjectivePromotion(): () => void {
  let prev = useGameStore.getState();
  promoteResolvedObjectives();
  return useGameStore.subscribe((state) => {
    const changed =
      state.currentChapter !== prev.currentChapter ||
      state.storyFlags !== prev.storyFlags ||
      state.completedObjectives !== prev.completedObjectives ||
      state.deliveredEmailIds !== prev.deliveredEmailIds;
    prev = state;
    if (changed) promoteResolvedObjectives();
  });
}
