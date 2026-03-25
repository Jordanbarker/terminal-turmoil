import { serializeFS, deserializeFS, SerializedFS } from "../engine/filesystem/serialization";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import {
  SaveData,
  SavedTabState,
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

export interface TabLike {
  computerId: ComputerId;
  cwd: string;
}

export interface SaveableState {
  username: string;
  gamePhase: GamePhase;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  computerState: Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string> }>>;
  tabs: TabLike[];
  activeTabIndex: number;
}

export function createSaveData(state: SaveableState, label: string): SaveData {
  // Serialize all computer FS entries (including per-computer history)
  const computerStates: Record<string, { fs: SerializedFS; commandHistory: string[]; envVars: Record<string, string> }> = {};
  for (const [id, cs] of Object.entries(state.computerState)) {
    if (cs) computerStates[id] = { fs: serializeFS(cs.fs), commandHistory: cs.commandHistory.slice(-500), envVars: cs.envVars };
  }

  // Derive active computer and FS from tabs (for backward compat with older save readers)
  const activeTab = state.tabs[state.activeTabIndex] ?? state.tabs[0];
  const activeComputer: ComputerId = activeTab?.computerId ?? "home";
  const activeSerializedFs = computerStates[activeComputer]?.fs
    ?? Object.values(computerStates)[0]?.fs;

  return {
    version: SAVE_FORMAT_VERSION,
    timestamp: Date.now(),
    label,
    username: state.username,
    gamePhase: state.gamePhase,
    currentChapter: state.currentChapter,
    completedObjectives: [...state.completedObjectives],
    deliveredEmailIds: [...state.deliveredEmailIds],
    deliveredPiperIds: [...state.deliveredPiperIds],
    commandHistory: Object.values(state.computerState).flatMap((cs) => cs?.commandHistory ?? []).slice(-500),
    cwd: activeTab?.cwd ?? `/home/${state.username}`,
    fs: activeSerializedFs!,
    activeComputer,
    storyFlags: { ...state.storyFlags },
    computerStates,
    tabs: state.tabs.map((t) => ({ computerId: t.computerId, cwd: t.cwd })),
    activeTabIndex: state.activeTabIndex >= 0 ? state.activeTabIndex : 0,
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
  if (data.version < 3) {
    data = {
      ...data,
      version: 3,
    };
  }
  if (data.version < 4) {
    data = {
      ...data,
      version: 4,
      deliveredPiperIds: [],
    };
  }
  if (data.version < 5) {
    // Infer computerStates from legacy fs + stashedFs fields
    const computerStates: Record<string, { fs: SerializedFS }> = {};
    const active = data.activeComputer ?? "nexacorp";
    computerStates[active] = { fs: data.fs };
    if (data.stashedFs) {
      if (active === "devcontainer") {
        computerStates.nexacorp = { fs: data.stashedFs };
      } else if (active === "nexacorp") {
        computerStates.devcontainer = { fs: data.stashedFs };
      }
    }
    data = {
      ...data,
      version: 5,
      computerStates,
      tabs: [{ computerId: active, cwd: data.cwd }],
      activeTabIndex: 0,
    };
  }
  if (data.version < 6) {
    // Migrate per-computer commandHistory into computerStates
    if (data.computerStates) {
      const active = data.activeComputer ?? "nexacorp";
      for (const [id, cs] of Object.entries(data.computerStates)) {
        if (!cs.commandHistory) {
          cs.commandHistory = id === active ? (data.commandHistory ?? []) : [];
        }
      }
    }
    data = { ...data, version: 6 };
  }
  if (data.version < 7) {
    // v7 adds envVars to computerStates — initialized from defaults on load if missing
    data = { ...data, version: 7 };
  }
  return data;
}
