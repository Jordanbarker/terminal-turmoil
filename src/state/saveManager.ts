import { serializeFS, deserializeFS } from "../engine/filesystem/serialization";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import {
  SaveData,
  SaveSlotId,
  SaveSlotMeta,
  SAVE_FORMAT_VERSION,
} from "./saveTypes";
import { GamePhase, ComputerId, StoryFlags } from "./types";

const SLOT_KEY_PREFIX = "terminal-turmoil-slot-";

function slotKey(slotId: SaveSlotId): string {
  return `${SLOT_KEY_PREFIX}${slotId}`;
}

export const ALL_SLOTS: SaveSlotId[] = ["auto", "slot-1", "slot-2", "slot-3"];

export interface SaveableState {
  fs: VirtualFS;
  cwd: string;
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  commandHistory: string[];
  activeComputer: ComputerId;
  storyFlags: StoryFlags;
}

export function createSaveData(state: SaveableState, label: string): SaveData {
  return {
    version: SAVE_FORMAT_VERSION,
    timestamp: Date.now(),
    label,
    username: state.username,
    gamePhase: state.gamePhase,
    currentChapter: state.currentChapter,
    completedObjectives: [...state.completedObjectives],
    deliveredEmailIds: [...state.deliveredEmailIds],
    commandHistory: state.commandHistory.slice(-500),
    cwd: state.cwd,
    fs: serializeFS(state.fs),
    activeComputer: state.activeComputer,
    storyFlags: { ...state.storyFlags },
  };
}

export function saveToSlot(slotId: SaveSlotId, data: SaveData): boolean {
  try {
    localStorage.setItem(slotKey(slotId), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadFromSlot(slotId: SaveSlotId): SaveData | null {
  try {
    const raw = localStorage.getItem(slotKey(slotId));
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return migrateSaveData(data);
  } catch {
    return null;
  }
}

export function deleteSlot(slotId: SaveSlotId): void {
  localStorage.removeItem(slotKey(slotId));
}

export function listSaveSlots(): SaveSlotMeta[] {
  return ALL_SLOTS.map((slotId) => {
    try {
      const raw = localStorage.getItem(slotKey(slotId));
      if (!raw) {
        return {
          slotId,
          label: "",
          timestamp: 0,
          username: "",
          currentChapter: "",
          empty: true,
        };
      }
      const data = JSON.parse(raw) as SaveData;
      return {
        slotId,
        label: data.label,
        timestamp: data.timestamp,
        username: data.username,
        currentChapter: data.currentChapter,
        empty: false,
      };
    } catch {
      return {
        slotId,
        label: "",
        timestamp: 0,
        username: "",
        currentChapter: "",
        empty: true,
      };
    }
  });
}

export function restoreFS(data: SaveData): VirtualFS {
  return deserializeFS(data.fs);
}

export function formatSlotName(slotId: SaveSlotId): string {
  if (slotId === "auto") return "Auto Save";
  return slotId.replace("slot-", "Slot ");
}

export function migrateSaveData(data: SaveData): SaveData {
  if (data.version < 2) {
    data = {
      ...data,
      version: 2,
      activeComputer: "nexacorp" as ComputerId,
      storyFlags: {},
    };
  }
  return data;
}
