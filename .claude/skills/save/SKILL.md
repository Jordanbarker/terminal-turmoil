---
name: save
description: "How the save/load/newgame system works — localStorage slots, SaveData snapshots, FS serialization, version migrations, and the save/load/newgame commands. Use this skill whenever modifying save slots, adding new persisted state fields, working on save/load/newgame commands, bumping SAVE_FORMAT_VERSION, or touching files like src/state/saveManager.ts, src/state/saveTypes.ts, or src/engine/filesystem/serialization.ts."
---

# Save System

Save/load/restart functionality via terminal commands, using localStorage save slots.

## Architecture

```
src/engine/filesystem/serialization.ts   # VirtualFS <-> JSON serialization
src/state/saveTypes.ts                   # SaveData, SaveSlotMeta, SaveSlotId types
src/state/saveManager.ts                 # localStorage CRUD (pure utilities, no React)
src/engine/commands/builtins/save.ts     # save command
src/engine/commands/builtins/load.ts     # load command
src/engine/commands/builtins/newgame.ts  # newgame command
src/state/gameStore.ts                   # saveGame/loadGame actions, FS auto-persist
src/hooks/useTerminal.ts                 # gameAction handler (save/load/listSaves/newGame)
```

## Data Model

### `SerializedFS` (`serialization.ts`)
```ts
{ root: DirectoryNode; cwd: string; homeDir: string }
```

### `SaveData` (`saveTypes.ts`)
Full snapshot of all game state:
```ts
{
  version: number;        // SAVE_FORMAT_VERSION (currently 5) for migrations
  timestamp: number;      // Date.now() at save time
  label: string;          // Display label
  username, gamePhase, currentChapter, completedObjectives,
  deliveredEmailIds, deliveredPiperIds, commandHistory, cwd: string;
  fs: SerializedFS;       // Full filesystem tree (legacy, kept for backward compat)
  activeComputer: ComputerId;  // "home" | "nexacorp" | "devcontainer"
  storyFlags: StoryFlags;      // Record<string, string | boolean>
  stashedFs?: SerializedFS;    // Legacy stashed FS (v3+, superseded by computerStates)
  stashedCwd?: string;         // Legacy stashed cwd (v3+, superseded by tabs)
  computerStates?: Record<string, { fs: SerializedFS }>;  // Per-computer FS (v5+)
  tabs?: SavedTabState[];      // Tab layout: {computerId, cwd}[] (v5+)
  activeTabIndex?: number;     // Index of active tab in tabs[] (v5+)
}
```

### `SaveSlotMeta` (`saveTypes.ts`)
Lightweight metadata for listing slots (no FS blob):
```ts
{ slotId, label, timestamp, username, currentChapter, empty: boolean }
```

### `GameAction` (`commands/types.ts`)
Side-channel on `CommandResult` for save/load/newgame commands:
```ts
type GameAction =
  | { type: "save"; slotId: string }
  | { type: "load"; slotId: string }
  | { type: "listSaves" }
  | { type: "newGame" };
```

## Save Slots

- **auto**: Zustand auto-persist (rebuilt on every state change via `partialize`)
- **slot-1, slot-2, slot-3**: Manual save slots

localStorage keys: `terminal-turmoil-slot-{slotId}`
Zustand auto-save key: `terminal-turmoil-save`

## Key Functions

### `serialization.ts`
| Function | Purpose |
|----------|---------|
| `serializeFS(fs)` | VirtualFS -> plain JSON |
| `deserializeFS(data)` | Plain JSON -> VirtualFS instance |

### `saveManager.ts`
| Function | Purpose |
|----------|---------|
| `createSaveData(state, label)` | Build SaveData snapshot from current store state |
| `saveToSlot(slotId, data)` | Write SaveData to localStorage |
| `loadFromSlot(slotId)` | Read + migrate SaveData from localStorage |
| `deleteSlot(slotId)` | Remove a save slot |
| `listSaveSlots()` | Get SaveSlotMeta[] for all 4 slots |
| `restoreFS(data)` | Deserialize the FS from SaveData |
| `migrateSaveData(data)` | Version migration pipeline |

### `gameStore.ts` actions
| Action | Purpose |
|--------|---------|
| `saveGame(slotId, label?)` | Snapshot current state to a slot |
| `loadGame(slotId)` | Restore full state from a slot |

## Terminal Commands

| Command | Action |
|---------|--------|
| `save` | List all save slots |
| `save 1\|2\|3` | Save to manual slot |
| `load` | List all save slots |
| `load 1\|2\|3\|auto` | Load from slot |
| `newgame` | Reset all state, reload page |

## What Gets Saved

### Store state (auto-persisted via Zustand `partialize`)
| Field | What it tracks |
|-------|---------------|
| `serializedComputerState` | Per-computer serialized filesystems |
| `persistedTabs` / `persistedActiveTabIndex` | Tab layout and active tab position |
| `username` | Player's chosen username |
| `gamePhase` | `"login" \| "booting" \| "playing" \| "transitioning"` |
| `currentChapter` | Current narrative chapter ID |
| `completedObjectives` | Array of completed objective IDs |
| `deliveredEmailIds` | Which emails have been triggered (prevents re-delivery) |
| `deliveredPiperIds` | Which Piper messages have been delivered (v4+) |
| `commandHistory` | Terminal history for up-arrow recall (capped at 500) |
| `storyFlags` | Narrative progression flags |

Note: Legacy fields `fs`, `cwd`, `activeComputer` are NOT in the store — they were removed in favor of `computerState` + tabs. `createSaveData()` derives them for backward-compatible `SaveData` output.

### SaveData (manual saves via save command)
Includes all auto-persisted fields plus backward-compat fields (`fs`, `cwd`, `activeComputer`) derived from `computerStates` and `tabs`.

## Updating for Narrative Progression

### Adding new Zustand state fields
1. Add to `SaveData` interface in `saveTypes.ts`
2. Add to `createSaveData()` in `saveManager.ts`
3. Add to `loadGame()` in `gameStore.ts`
4. Bump `SAVE_FORMAT_VERSION` and add a migration in `migrateSaveData()`

### Adding new chapters/objectives
No save changes needed — `currentChapter` and `completedObjectives` already capture any chapter/objective ID strings.

### Adding new email triggers
No save changes needed — `deliveredEmailIds` already tracks any email ID strings.

### Adding new filesystem content
No save changes needed — filesystem is serialized in full. New files only appear in fresh games (not existing saves). If new content must appear in existing saves, add a version migration.

### Adding Chip/assistant state
When `AssistantState` is added to the store, add it to `SaveData` and bump `SAVE_FORMAT_VERSION`.

### Version migration pattern
Each version bump gets a transformer in `migrateSaveData()`:
```ts
function migrateSaveData(data: SaveData): SaveData {
  if (data.version < 2) { /* add activeComputer, storyFlags */ }
  if (data.version < 3) { /* no-op structural bump */ }
  if (data.version < 4) { /* add deliveredPiperIds */ }
  if (data.version < 5) { /* infer computerStates from fs+stashedFs, create tabs from activeComputer+cwd */ }
  return data;
}
```

## Design Patterns

- **Pure functions**: `serializeFS`, `deserializeFS`, `createSaveData` are all pure
- **Immutable FS**: Deserialization creates a new VirtualFS instance
- **GameAction side-channel**: Commands return `gameAction` on `CommandResult`, handled by `useTerminal`
- **Version migrations**: `SAVE_FORMAT_VERSION` + `migrateSaveData()` for forward compatibility
- **Auto-persist**: Zustand `partialize` serializes `computerState` (per-computer FS) and tab layout — filesystem survives page reload. Legacy `fs`/`cwd`/`activeComputer` fields are NOT auto-persisted; they exist only in `SaveData` for backward compatibility with older save formats
- **Tab-derived state**: The store has no `fs`, `cwd`, or `activeComputer` fields. These are derived from `computerState[tab.computerId].fs` and `tabs[activeTabId].cwd`/`.computerId` at point of use
