import { create } from "zustand";
import { persist } from "zustand/middleware";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createNexacorpFilesystem } from "../engine/filesystem/initialFilesystem";
import { createHomeFilesystem } from "../engine/filesystem/homeFilesystem";
import { serializeFS, deserializeFS, SerializedFS } from "../engine/filesystem/serialization";
import { createSaveData, saveToSlot, loadFromSlot, restoreFS } from "./saveManager";
import { SaveSlotId } from "./saveTypes";
import { GamePhase, ComputerId, StoryFlags, PLAYER } from "./types";
import { SnowflakeState } from "../engine/snowflake/state";
import { createInitialSnowflakeState } from "../engine/snowflake/seed/initial_data";
import { serializeSnowflake, deserializeSnowflake, SerializedSnowflake } from "../engine/snowflake/serialization";
import { syncToVirtualFS } from "../engine/snowflake/bridge/fs_bridge";
import { seedDeliveredEmails } from "../engine/mail/delivery";

const MAX_HISTORY = 500;

export interface Toast {
  id: string;
  message: string;
}

interface GameStore {
  fs: VirtualFS;
  cwd: string;
  username: string;
  commandHistory: string[];
  historyIndex: number;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  gamePhase: GamePhase;
  snowflakeState: SnowflakeState;
  activeComputer: ComputerId;
  storyFlags: StoryFlags;
  hasSeenIntro: boolean;
  toasts: Toast[];

  // Actions
  setFs: (fs: VirtualFS) => void;
  setCwd: (cwd: string) => void;
  setUsername: (username: string) => void;
  pushHistory: (command: string) => void;
  setHistoryIndex: (index: number) => void;
  completeObjective: (id: string) => void;
  setGamePhase: (phase: GamePhase) => void;
  addDeliveredEmails: (ids: string[]) => void;
  setSnowflakeState: (state: SnowflakeState) => void;
  setActiveComputer: (id: ComputerId) => void;
  setCurrentChapter: (chapter: string) => void;
  setStoryFlag: (key: string, value: string | boolean) => void;
  setHasSeenIntro: () => void;
  addToast: (message: string) => void;
  removeToast: (id: string) => void;
  resetGame: () => void;
  saveGame: (slotId: SaveSlotId, label?: string) => boolean;
  loadGame: (slotId: SaveSlotId) => boolean;
}

function buildFs(
  username: string,
  computer: ComputerId,
  storyFlags: StoryFlags = {},
  deliveredEmailIds: string[] = []
) {
  const root = computer === "home"
    ? createHomeFilesystem(username)
    : createNexacorpFilesystem(username, storyFlags);
  let fs = new VirtualFS(
    root,
    `/home/${username}`,
    `/home/${username}`
  );

  if (deliveredEmailIds.length > 0) {
    fs = seedDeliveredEmails(fs, deliveredEmailIds, computer, username);
  }

  return fs;
}

function createInitialState(username = PLAYER.username) {
  const fs = buildFs(username, "home");
  return {
    fs,
    cwd: fs.cwd,
    username,
    commandHistory: [] as string[],
    historyIndex: -1,
    currentChapter: "chapter-1",
    completedObjectives: [] as string[],
    deliveredEmailIds: [] as string[],
    gamePhase: "playing" as GamePhase,
    snowflakeState: createInitialSnowflakeState(),
    activeComputer: "home" as ComputerId,
    storyFlags: {} as StoryFlags,
    hasSeenIntro: false,
    toasts: [] as Toast[],
  };
}

let toastId = 0;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      setFs: (fs) => set({ fs }),
      setCwd: (cwd) => set({ cwd }),
      setUsername: (username) => {
        const state = get();
        const fs = buildFs(username, state.activeComputer, state.storyFlags, state.deliveredEmailIds);
        let finalFs = fs;
        if (state.activeComputer === "nexacorp") {
          finalFs = syncToVirtualFS(state.snowflakeState, fs);
        }
        set({ username, fs: finalFs, cwd: finalFs.cwd });
      },
      pushHistory: (command) =>
        set((state) => ({
          commandHistory: [...state.commandHistory, command].slice(-MAX_HISTORY),
          historyIndex: -1,
        })),
      setHistoryIndex: (index) => set({ historyIndex: index }),
      completeObjective: (id) =>
        set((state) => ({
          completedObjectives: [...state.completedObjectives, id],
        })),
      setGamePhase: (phase) => set({ gamePhase: phase }),
      addDeliveredEmails: (ids) =>
        set((state) => ({
          deliveredEmailIds: [...state.deliveredEmailIds, ...ids],
        })),
      setSnowflakeState: (sfState) => set({ snowflakeState: sfState }),
      setActiveComputer: (id) => set({ activeComputer: id }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
      setStoryFlag: (key, value) =>
        set((state) => ({
          storyFlags: { ...state.storyFlags, [key]: value },
        })),
      setHasSeenIntro: () => set({ hasSeenIntro: true }),
      addToast: (message) =>
        set((state) => ({
          toasts: [...state.toasts, { id: String(++toastId), message }],
        })),
      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),
      resetGame: () => set(createInitialState()),

      saveGame: (slotId, label) => {
        const state = get();
        const data = createSaveData(state, label ?? `Save ${slotId}`);
        return saveToSlot(slotId, data);
      },

      loadGame: (slotId) => {
        const data = loadFromSlot(slotId);
        if (!data) return false;
        const fs = restoreFS(data);
        const cwd = fs.getNode(data.cwd) ? data.cwd : fs.cwd;
        set({
          fs,
          cwd,
          username: data.username,
          gamePhase: data.gamePhase,
          currentChapter: data.currentChapter,
          completedObjectives: data.completedObjectives,
          deliveredEmailIds: data.deliveredEmailIds,
          commandHistory: data.commandHistory,
          historyIndex: -1,
          activeComputer: data.activeComputer ?? "nexacorp",
          storyFlags: data.storyFlags ?? {},
        });
        return true;
      },
    }),
    {
      name: "terminal-turmoil-save",
      partialize: (state) => ({
        username: state.username,
        commandHistory: state.commandHistory.slice(-MAX_HISTORY),
        currentChapter: state.currentChapter,
        completedObjectives: state.completedObjectives,
        deliveredEmailIds: state.deliveredEmailIds,
        gamePhase: state.gamePhase,
        cwd: state.cwd,
        activeComputer: state.activeComputer,
        storyFlags: state.storyFlags,
        hasSeenIntro: state.hasSeenIntro,
        serializedFs: serializeFS(state.fs),
        serializedSnowflake: serializeSnowflake(state.snowflakeState),
      }),
      merge: (persisted, currentState) => {
        const p = persisted as Record<string, unknown> | null;
        if (!p) return currentState;

        const username = (p.username as string) ?? currentState.username;
        const activeComputer = (p.activeComputer as ComputerId) ?? currentState.activeComputer;
        const storyFlags = (p.storyFlags as StoryFlags) ?? currentState.storyFlags;
        const deliveredEmailIds = (p.deliveredEmailIds as string[]) ?? [];

        // Backward compat: existing saves with hasSeenIntro should have commands_unlocked
        if ((p.hasSeenIntro as boolean) && !storyFlags.commands_unlocked) {
          storyFlags.commands_unlocked = true;
        }

        // Reconstruct VirtualFS from serialized data
        let fs: VirtualFS;
        const serializedFs = p.serializedFs as SerializedFS | undefined;
        try {
          if (serializedFs?.root) {
            fs = deserializeFS(serializedFs);
            if (!fs.getNode(fs.homeDir)) {
              fs = buildFs(username, activeComputer, storyFlags, deliveredEmailIds);
            }
          } else {
            fs = buildFs(username, activeComputer, storyFlags, deliveredEmailIds);
          }
        } catch {
          fs = buildFs(username, activeComputer, storyFlags, deliveredEmailIds);
        }

        // Reconstruct SnowflakeState
        let sfState: SnowflakeState;
        const serializedSf = p.serializedSnowflake as SerializedSnowflake | undefined;
        try {
          if (serializedSf?.databases) {
            sfState = deserializeSnowflake(serializedSf);
          } else {
            sfState = createInitialSnowflakeState();
          }
        } catch {
          sfState = createInitialSnowflakeState();
        }

        // Sync snowflake metadata to VirtualFS (only relevant for nexacorp)
        if (activeComputer === "nexacorp") {
          fs = syncToVirtualFS(sfState, fs);
        }

        // Validate cwd exists in the filesystem
        const persistedCwd = p.cwd as string | undefined;
        const cwd = (persistedCwd && fs.getNode(persistedCwd)) ? persistedCwd : fs.cwd;

        return {
          ...currentState,
          username,
          commandHistory: (p.commandHistory as string[]) ?? currentState.commandHistory,
          currentChapter: (p.currentChapter as string) ?? currentState.currentChapter,
          completedObjectives: (p.completedObjectives as string[]) ?? currentState.completedObjectives,
          deliveredEmailIds: (p.deliveredEmailIds as string[]) ?? currentState.deliveredEmailIds,
          gamePhase: (p.gamePhase as GamePhase) ?? currentState.gamePhase,
          activeComputer,
          storyFlags,
          hasSeenIntro: (p.hasSeenIntro as boolean) ?? currentState.hasSeenIntro,
          fs,
          cwd,
          snowflakeState: sfState,
        };
      },
    }
  )
);
