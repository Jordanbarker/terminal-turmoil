import { SerializedFS } from "../engine/filesystem/serialization";
import { GamePhase, ComputerId, StoryFlags } from "./types";

export const SAVE_FORMAT_VERSION = 2;

export type SaveSlotId = "auto" | "slot-1" | "slot-2" | "slot-3";

export interface SaveData {
  version: number;
  timestamp: number;
  label: string;
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  commandHistory: string[];
  cwd: string;
  fs: SerializedFS;
  activeComputer: ComputerId;
  storyFlags: StoryFlags;
}

export interface SaveSlotMeta {
  slotId: SaveSlotId;
  label: string;
  timestamp: number;
  username: string;
  currentChapter: string;
  empty: boolean;
}
