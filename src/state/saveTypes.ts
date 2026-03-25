import { SerializedFS } from "../engine/filesystem/serialization";
import { GamePhase, ComputerId, StoryFlags } from "./types";

export const SAVE_FORMAT_VERSION = 7;

export type SaveSlotId = "auto" | "slot-1" | "slot-2" | "slot-3";

export interface SavedTabState {
  computerId: ComputerId;
  cwd: string;
}

export interface SaveData {
  version: number;
  timestamp: number;
  label: string;
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  commandHistory: string[];
  cwd: string;
  fs: SerializedFS;
  activeComputer: ComputerId;
  storyFlags: StoryFlags;
  stashedFs?: SerializedFS;
  stashedCwd?: string;
  /** v5+: per-computer serialized filesystems (v6 adds commandHistory, v7 adds envVars) */
  computerStates?: Record<string, { fs: SerializedFS; commandHistory?: string[]; envVars?: Record<string, string> }>;
  /** v5: saved tab layout */
  tabs?: SavedTabState[];
  /** v5: index of the active tab in tabs[] */
  activeTabIndex?: number;
}

export interface SaveSlotMeta {
  slotId: SaveSlotId;
  label: string;
  timestamp: number;
  username: string;
  currentChapter: string;
  empty: boolean;
}
