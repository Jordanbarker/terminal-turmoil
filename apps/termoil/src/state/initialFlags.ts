import { StoryFlags } from "./types";

/**
 * Flags every run starts with, whatever the entry point (new game, `cheat`, a
 * loaded save). Every one of those paths merges its own flags OVER these rather
 * than replacing them: a wholesale replace used to strip `tabs_unlocked` and
 * silently disable the entire tmux layer after `cheat 1`.
 *
 * A leaf module on purpose — `createInitialState` (gameStore),
 * `buildCheckpointState` (checkpointLoad) and `restoreGameState` (saveManager)
 * all need it, and saveManager cannot import checkpointLoad without a cycle.
 */
export const INITIAL_STORY_FLAGS: StoryFlags = {
  // Terminal tabs + copy mode are available from the start of a new game.
  tabs_unlocked: true,
};
