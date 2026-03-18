import { SerializedFS } from "../engine/filesystem/serialization";
import { GamePhase, ComputerId, StoryFlags } from "./types";

export const SAVE_FORMAT_VERSION = 5;

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
  /** v5: per-computer serialized filesystems */
  computerStates?: Record<string, { fs: SerializedFS }>;
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
