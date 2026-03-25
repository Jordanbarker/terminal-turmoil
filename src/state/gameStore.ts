import { create } from "zustand";
import { persist } from "zustand/middleware";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createNexacorpFilesystem } from "../story/filesystem/nexacorp";
import { createHomeFilesystem } from "../story/filesystem/home";
import { createDevcontainerFilesystem } from "../story/filesystem/devcontainer";
import { serializeFS, deserializeFS, SerializedFS } from "../engine/filesystem/serialization";
import { createSaveData, saveToSlot, loadFromSlot, restoreFS } from "./saveManager";
import { SaveSlotId } from "./saveTypes";
import { GamePhase, ComputerId, StoryFlags, PLAYER } from "./types";
import { SnowflakeState } from "../engine/snowflake/state";
import { createInitialSnowflakeState } from "../engine/snowflake/seed/initial_data";
import { serializeSnowflake, deserializeSnowflake, SerializedSnowflake } from "../engine/snowflake/serialization";
import { syncToVirtualFS } from "../engine/snowflake/bridge/fs_bridge";
import { seedDeliveredEmails } from "../engine/mail/delivery";
import { getDefaultEnv, initEnvForComputer } from "../story/env";

const MAX_HISTORY = 500;

export interface Toast {
  id: string;
  message: string;
}

export interface TabState {
  id: string;
  computerId: ComputerId;
  cwd: string;
}

interface GameStore {
  username: string;
  currentChapter: string;
  completedObjectives: string[];
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  gamePhase: GamePhase;
  snowflakeState: SnowflakeState;
  storyFlags: StoryFlags;
  hasSeenIntro: boolean;
  toasts: Toast[];
  computerState: Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string> }>>;
  tabs: TabState[];
  activeTabId: string;
  activeSnowSession: string | null;

  // Actions
  setUsername: (username: string) => void;
  pushHistory: (computerId: ComputerId, command: string) => void;
  completeObjective: (id: string) => void;
  setGamePhase: (phase: GamePhase) => void;
  addDeliveredEmails: (ids: string[]) => void;
  addDeliveredPiperMessages: (ids: string[]) => void;
  setSnowflakeState: (state: SnowflakeState) => void;
  setCurrentChapter: (chapter: string) => void;
  setStoryFlag: (key: string, value: string | boolean) => void;
  setHasSeenIntro: () => void;
  addToast: (message: string) => void;
  removeToast: (id: string) => void;
  resetGame: () => void;
  saveGame: (slotId: SaveSlotId, label?: string) => boolean;
  loadGame: (slotId: SaveSlotId) => boolean;
  setComputerFs: (computer: ComputerId, fs: VirtualFS) => void;
  initComputer: (computer: ComputerId, fs: VirtualFS) => void;
  addTab: (computerId: ComputerId, cwd: string) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setTabCwd: (tabId: string, cwd: string) => void;
  setActiveSnowSession: (tabId: string | null) => void;
  setTabComputer: (tabId: string, computerId: ComputerId, cwd: string) => void;
  setComputerEnv: (computer: ComputerId, envVars: Record<string, string>) => void;
  removeComputer: (computer: ComputerId) => void;
}

export function buildFs(
  username: string,
  computer: ComputerId,
  storyFlags: StoryFlags = {},
  deliveredEmailIds: string[] = []
) {
  const root = computer === "home"
    ? createHomeFilesystem(username)
    : computer === "devcontainer"
      ? createDevcontainerFilesystem(username, storyFlags)
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

const MAX_TABS = 5;
let tabCounter = 0;
function nextTabId(): string {
  return `tab-${++tabCounter}`;
}

function createInitialState(username = PLAYER.username) {
  const fs = buildFs(username, "home");
  const initialTabId = nextTabId();
  return {
    username,
    currentChapter: "chapter-1",
    completedObjectives: [] as string[],
    deliveredEmailIds: [] as string[],
    deliveredPiperIds: [] as string[],
    gamePhase: "playing" as GamePhase,
    snowflakeState: createInitialSnowflakeState(),
    storyFlags: {} as StoryFlags,
    hasSeenIntro: false,
    toasts: [] as Toast[],
    computerState: { home: { fs, commandHistory: ["nano terminal_notes.txt"], envVars: initEnvForComputer("home", username, fs) } } as Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string> }>>,
    tabs: [{ id: initialTabId, computerId: "home" as ComputerId, cwd: fs.cwd }] as TabState[],
    activeTabId: initialTabId,
    activeSnowSession: null as string | null,
  };
}

let toastId = 0;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      setUsername: (username) => {
        const state = get();
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
        const computerId = activeTab?.computerId ?? "home";
        const fs = buildFs(username, computerId, state.storyFlags, state.deliveredEmailIds);
        let finalFs = fs;
        if (computerId === "nexacorp") {
          finalFs = syncToVirtualFS(state.snowflakeState, fs);
        }
        set({
          username,
          computerState: { ...state.computerState, [computerId]: { ...state.computerState[computerId], fs: finalFs } },
        });
      },
      pushHistory: (computerId, command) =>
        set((state) => {
          const cs = state.computerState[computerId];
          if (!cs) return {};
          return {
            computerState: {
              ...state.computerState,
              [computerId]: { ...cs, commandHistory: [...cs.commandHistory, command].slice(-MAX_HISTORY) },
            },
          };
        }),
      completeObjective: (id) =>
        set((state) => ({
          completedObjectives: [...state.completedObjectives, id],
        })),
      setGamePhase: (phase) => set({ gamePhase: phase }),
      addDeliveredEmails: (ids) =>
        set((state) => ({
          deliveredEmailIds: [...state.deliveredEmailIds, ...ids],
        })),
      addDeliveredPiperMessages: (ids) =>
        set((state) => {
          const seenPrefixes = ids
            .filter((id) => id.startsWith("seen:"))
            .map((id) => id.slice(0, id.lastIndexOf(":") + 1));
          const filtered =
            seenPrefixes.length > 0
              ? state.deliveredPiperIds.filter(
                  (id) => !seenPrefixes.some((prefix) => id.startsWith(prefix))
                )
              : state.deliveredPiperIds;
          return { deliveredPiperIds: [...filtered, ...ids] };
        }),
      setSnowflakeState: (sfState) => set({ snowflakeState: sfState }),
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
      setComputerFs: (computer, fs) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { ...state.computerState[computer], fs, commandHistory: state.computerState[computer]?.commandHistory ?? [], envVars: state.computerState[computer]?.envVars ?? getDefaultEnv(computer, state.username) } },
        })),
      initComputer: (computer, fs) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { fs, commandHistory: state.computerState[computer]?.commandHistory ?? [], envVars: initEnvForComputer(computer, state.username, fs) } },
        })),
      addTab: (computerId, cwd) => {
        const state = get();
        if (state.tabs.length >= MAX_TABS) return state.activeTabId;
        const id = nextTabId();
        set({
          tabs: [...state.tabs, { id, computerId, cwd }],
          activeTabId: id,
        });
        return id;
      },
      removeTab: (tabId) =>
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== tabId);
          if (newTabs.length === 0) return {}; // Can't remove last tab
          const updates: Partial<typeof state> = { tabs: newTabs };
          if (state.activeSnowSession === tabId) {
            updates.activeSnowSession = null;
          }
          if (state.activeTabId === tabId) {
            const idx = state.tabs.findIndex((t) => t.id === tabId);
            const newActive = newTabs[Math.min(idx, newTabs.length - 1)];
            updates.activeTabId = newActive.id;
          }
          return updates;
        }),
      setActiveTab: (tabId) =>
        set((state) => {
          const tab = state.tabs.find((t) => t.id === tabId);
          if (!tab) return {};
          return { activeTabId: tabId };
        }),
      setTabCwd: (tabId, cwd) =>
        set((state) => ({
          tabs: state.tabs.map((t) => t.id === tabId ? { ...t, cwd } : t),
        })),
      setActiveSnowSession: (tabId) => set({ activeSnowSession: tabId }),
      setTabComputer: (tabId, computerId, cwd) =>
        set((state) => ({
          tabs: state.tabs.map((t) => t.id === tabId ? { ...t, computerId, cwd } : t),
        })),
      setComputerEnv: (computer, envVars) =>
        set((state) => ({
          computerState: { ...state.computerState, [computer]: { ...state.computerState[computer]!, envVars } },
        })),
      removeComputer: (computer) =>
        set((state) => {
          const { [computer]: _, ...rest } = state.computerState;
          return { computerState: rest };
        }),
      resetGame: () => {
        tabCounter = 0;
        set(createInitialState());
      },

      saveGame: (slotId, label) => {
        const state = get();
        const activeTabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const saveable = { ...state, activeTabIndex: activeTabIndex >= 0 ? activeTabIndex : 0 };
        const data = createSaveData(saveable, label ?? `Save ${slotId}`);
        return saveToSlot(slotId, data);
      },

      loadGame: (slotId) => {
        const data = loadFromSlot(slotId);
        if (!data) return false;
        const fs = restoreFS(data);
        const cwd = fs.getNode(data.cwd) ? data.cwd : fs.cwd;
        let stashedFs: VirtualFS | null = null;
        if (data.stashedFs) {
          try { stashedFs = deserializeFS(data.stashedFs); } catch { stashedFs = null; }
        }
        const activeComp = data.activeComputer ?? "nexacorp";

        // Build computerState from v5 computerStates or infer from legacy fields
        const loadedComputerState: Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string> }>> = {};
        if (data.computerStates) {
          for (const [id, cs] of Object.entries(data.computerStates)) {
            try {
              const loadedFs = deserializeFS(cs.fs);
              loadedComputerState[id as ComputerId] = {
                fs: loadedFs,
                commandHistory: cs.commandHistory ?? [],
                envVars: cs.envVars ?? initEnvForComputer(id as ComputerId, data.username, loadedFs),
              };
            } catch { /* skip corrupted entries */ }
          }
          // Legacy v5 saves without per-computer history: assign flat commandHistory to active computer
          if (data.version < 6 && data.commandHistory?.length) {
            const target = loadedComputerState[activeComp];
            if (target && target.commandHistory.length === 0) {
              target.commandHistory = data.commandHistory;
            }
          }
        } else {
          loadedComputerState[activeComp] = { fs, commandHistory: data.commandHistory ?? [], envVars: initEnvForComputer(activeComp, data.username, fs) };
          if (stashedFs) {
            if (activeComp === "devcontainer") {
              loadedComputerState.nexacorp = { fs: stashedFs, commandHistory: [], envVars: initEnvForComputer("nexacorp", data.username, stashedFs) };
            } else if (activeComp === "nexacorp") {
              loadedComputerState.devcontainer = { fs: stashedFs, commandHistory: [], envVars: initEnvForComputer("devcontainer", data.username, stashedFs) };
            }
          }
        }

        // Restore tabs from v5 or create single tab from legacy fields
        tabCounter = 0;
        let tabs: TabState[];
        let activeTabId: string;
        if (data.tabs && data.tabs.length > 0) {
          tabs = data.tabs.map((t) => ({
            id: nextTabId(),
            computerId: t.computerId,
            cwd: t.cwd,
          }));
          const activeIdx = Math.min(data.activeTabIndex ?? 0, tabs.length - 1);
          activeTabId = tabs[activeIdx].id;
        } else {
          const id = nextTabId();
          tabs = [{ id, computerId: activeComp, cwd }];
          activeTabId = id;
        }

        set({
          username: data.username,
          gamePhase: data.gamePhase,
          currentChapter: data.currentChapter,
          completedObjectives: data.completedObjectives,
          deliveredEmailIds: data.deliveredEmailIds,
          deliveredPiperIds: data.deliveredPiperIds ?? [],
          storyFlags: data.storyFlags ?? {},
          computerState: loadedComputerState,
          tabs,
          activeTabId,
          activeSnowSession: null,
        });
        return true;
      },
    }),
    {
      name: "terminal-turmoil-save",
      partialize: (state) => {
        // Serialize all computer FS entries (including per-computer history)
        const serializedComputerState: Record<string, { fs: SerializedFS; commandHistory: string[]; envVars: Record<string, string> }> = {};
        for (const [id, cs] of Object.entries(state.computerState)) {
          if (cs) serializedComputerState[id] = { fs: serializeFS(cs.fs), commandHistory: cs.commandHistory.slice(-MAX_HISTORY), envVars: cs.envVars };
        }
        // Persist tab layout
        const activeTabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
        return {
          username: state.username,
          currentChapter: state.currentChapter,
          completedObjectives: state.completedObjectives,
          deliveredEmailIds: state.deliveredEmailIds,
          deliveredPiperIds: state.deliveredPiperIds,
          gamePhase: state.gamePhase,
          storyFlags: state.storyFlags,
          hasSeenIntro: state.hasSeenIntro,
          serializedSnowflake: serializeSnowflake(state.snowflakeState),
          serializedComputerState,
          persistedTabs: state.tabs.map((t) => ({ computerId: t.computerId, cwd: t.cwd })),
          persistedActiveTabIndex: activeTabIndex >= 0 ? activeTabIndex : 0,
        };
      },
      merge: (persisted, currentState) => {
        const p = persisted as Record<string, unknown> | null;
        if (!p) return currentState;

        const username = (p.username as string) ?? currentState.username;
        const storyFlags = (p.storyFlags as StoryFlags) ?? currentState.storyFlags;
        const deliveredEmailIds = (p.deliveredEmailIds as string[]) ?? [];

        // Backward compat: existing saves with hasSeenIntro should have commands_unlocked
        if ((p.hasSeenIntro as boolean) && !storyFlags.commands_unlocked) {
          storyFlags.commands_unlocked = true;
        }

        // Reconstruct SnowflakeState
        let sfState: SnowflakeState;
        const serializedSf = p.serializedSnowflake as SerializedSnowflake | undefined;
        try {
          if (serializedSf?.databases) {
            sfState = deserializeSnowflake(serializedSf);
          } else {
            sfState = createInitialSnowflakeState({ includeDay2: !!storyFlags.day1_shutdown });
          }
        } catch {
          sfState = createInitialSnowflakeState({ includeDay2: !!storyFlags.day1_shutdown });
        }

        // Build computerState from persisted data or infer from legacy fields
        const computerState: Partial<Record<ComputerId, { fs: VirtualFS; commandHistory: string[]; envVars: Record<string, string> }>> = {};
        const serializedCS = p.serializedComputerState as Record<string, { fs: SerializedFS; commandHistory?: string[]; envVars?: Record<string, string> }> | undefined;
        const legacyCommandHistory = (p.commandHistory as string[]) ?? [];
        if (serializedCS) {
          for (const [id, cs] of Object.entries(serializedCS)) {
            try {
              const restoredFs = deserializeFS(cs.fs);
              computerState[id as ComputerId] = {
                fs: restoredFs,
                commandHistory: cs.commandHistory ?? [],
                envVars: cs.envVars ?? initEnvForComputer(id as ComputerId, username, restoredFs),
              };
            } catch { /* skip corrupted entries */ }
          }
          // Legacy: if no per-computer history found, assign flat history to first computer
          if (legacyCommandHistory.length > 0 && Object.values(computerState).every((cs) => cs!.commandHistory.length === 0)) {
            const firstKey = Object.keys(computerState)[0] as ComputerId | undefined;
            if (firstKey && computerState[firstKey]) {
              computerState[firstKey]!.commandHistory = legacyCommandHistory;
            }
          }
          // Sync snowflake to nexacorp if present
          if (computerState.nexacorp) {
            computerState.nexacorp = { ...computerState.nexacorp, fs: syncToVirtualFS(sfState, computerState.nexacorp.fs) };
          }
        } else {
          // Legacy save — build computerState from serializedFs + stashed FS
          const legacyComputer = (p.activeComputer as ComputerId) ?? "home";
          let legacyFs: VirtualFS;
          const serializedFs = p.serializedFs as SerializedFS | undefined;
          try {
            if (serializedFs?.root) {
              legacyFs = deserializeFS(serializedFs);
              if (!legacyFs.getNode(legacyFs.homeDir)) {
                legacyFs = buildFs(username, legacyComputer, storyFlags, deliveredEmailIds);
              }
            } else {
              legacyFs = buildFs(username, legacyComputer, storyFlags, deliveredEmailIds);
            }
          } catch {
            legacyFs = buildFs(username, legacyComputer, storyFlags, deliveredEmailIds);
          }
          if (legacyComputer === "nexacorp") {
            legacyFs = syncToVirtualFS(sfState, legacyFs);
          }
          computerState[legacyComputer] = { fs: legacyFs, commandHistory: legacyCommandHistory, envVars: initEnvForComputer(legacyComputer, username, legacyFs) };

          // Reconstruct stashed FS if present
          const serializedStashedFs = p.serializedStashedFs as SerializedFS | undefined;
          try {
            if (serializedStashedFs?.root) {
              const stashedFs = deserializeFS(serializedStashedFs);
              if (legacyComputer === "devcontainer") {
                computerState.nexacorp = { fs: stashedFs, commandHistory: [], envVars: initEnvForComputer("nexacorp", username, stashedFs) };
              } else if (legacyComputer === "nexacorp") {
                computerState.devcontainer = { fs: stashedFs, commandHistory: [], envVars: initEnvForComputer("devcontainer", username, stashedFs) };
              }
            }
          } catch { /* skip corrupted stashed fs */ }
        }

        // Restore tabs from persisted data or create a single tab from legacy fields
        tabCounter = 0;
        const persistedTabs = p.persistedTabs as Array<{ computerId: ComputerId; cwd: string }> | undefined;
        const persistedActiveTabIndex = (p.persistedActiveTabIndex as number) ?? 0;
        let tabs: TabState[];
        let restoredActiveTabId: string;
        if (persistedTabs && persistedTabs.length > 0) {
          tabs = persistedTabs.map((t) => ({
            id: nextTabId(),
            computerId: t.computerId,
            cwd: t.cwd,
          }));
          const activeIdx = Math.min(persistedActiveTabIndex, tabs.length - 1);
          restoredActiveTabId = tabs[activeIdx].id;
        } else {
          const legacyComputer = (p.activeComputer as ComputerId) ?? "home";
          const legacyCwd = (p.cwd as string) ?? `/home/${username}`;
          const legacyFs = computerState[legacyComputer]?.fs;
          const cwd = (legacyCwd && legacyFs?.getNode(legacyCwd)) ? legacyCwd : (legacyFs?.cwd ?? `/home/${username}`);
          const id = nextTabId();
          tabs = [{ id, computerId: legacyComputer, cwd }];
          restoredActiveTabId = id;
        }

        return {
          ...currentState,
          username,
          currentChapter: (p.currentChapter as string) ?? currentState.currentChapter,
          completedObjectives: (p.completedObjectives as string[]) ?? currentState.completedObjectives,
          deliveredEmailIds: (p.deliveredEmailIds as string[]) ?? currentState.deliveredEmailIds,
          deliveredPiperIds: (p.deliveredPiperIds as string[]) ?? currentState.deliveredPiperIds,
          gamePhase: (p.gamePhase as GamePhase) ?? currentState.gamePhase,
          storyFlags,
          hasSeenIntro: (p.hasSeenIntro as boolean) ?? currentState.hasSeenIntro,
          snowflakeState: sfState,
          computerState,
          tabs,
          activeTabId: restoredActiveTabId,
        };
      },
    }
  )
);
