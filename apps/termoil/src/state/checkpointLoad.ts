import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { Mounts } from "@tt/core/filesystem/mounts";
import { SnowflakeState } from "@tt/core/snowflake/state";
import { syncToVirtualFS } from "@tt/core/snowflake/bridge/fs_bridge";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import { buildFs } from "./saveManager";
import { INITIAL_STORY_FLAGS } from "./initialFlags";
import { ComputerId, StoryFlags } from "./types";
import { initEnvForComputer, initAliasesForComputer } from "../story/env";

export { INITIAL_STORY_FLAGS };

/** The checkpoint fields a load needs; structurally satisfied by `Checkpoint`. */
export interface CheckpointLoadInput {
  storyFlags: StoryFlags;
  deliveredEmailIds: string[];
  completedObjectives: string[];
  computers: ComputerId[];
  aliases?: Partial<Record<ComputerId, Record<string, string>>>;
  envVars?: Partial<Record<ComputerId, Record<string, string>>>;
}

export type CheckpointComputerState = Partial<
  Record<ComputerId, { fs: VirtualFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>
>;

export interface LoadedCheckpointState {
  storyFlags: StoryFlags;
  snowflakeState: SnowflakeState;
  computerState: CheckpointComputerState;
}

/**
 * Store-free half of a checkpoint load: the resolved flag bag, the Snowflake
 * state, and a fully-built `{fs, envVars, aliases, mounts}` entry per computer.
 *
 * `gameStore.loadCheckpointData` and the headless runner's `loadCheckpoint`
 * both go through here so the two entry points cannot drift — the runner used
 * to hand-mirror this and quietly missed fixes. Everything downstream of it
 * (windows, tmux session, notification resets) is store-shaped and stays with
 * each caller.
 *
 * Note `buildFs` owns the `dbt_project_cloned` → real `git clone` path (so a
 * checkpoint that has cloned the analytics repo gets a working `.git`) and the
 * mailbox replay (delivered mail filed read, answered reply prompts restored to
 * `sent/`), which is why `completedObjectives` is threaded through.
 */
export function buildCheckpointState(
  username: string,
  data: CheckpointLoadInput,
): LoadedCheckpointState {
  const storyFlags: StoryFlags = { ...INITIAL_STORY_FLAGS, ...data.storyFlags };
  const snowflakeState = createInitialSnowflakeState({ includeDay2: !!storyFlags.day1_shutdown });

  const computerState: CheckpointComputerState = {};
  for (const computerId of data.computers) {
    const built = buildFs(username, computerId, {
      storyFlags,
      deliveredEmailIds: data.deliveredEmailIds,
      completedObjectives: data.completedObjectives,
    });
    const fs = computerId === "nexacorp" ? syncToVirtualFS(snowflakeState, built) : built;
    computerState[computerId] = {
      fs,
      envVars: { ...initEnvForComputer(computerId, username, fs), ...(data.envVars?.[computerId] ?? {}) },
      aliases: { ...initAliasesForComputer(computerId, username, fs), ...(data.aliases?.[computerId] ?? {}) },
      mounts: {},
    };
  }

  return { storyFlags, snowflakeState, computerState };
}
