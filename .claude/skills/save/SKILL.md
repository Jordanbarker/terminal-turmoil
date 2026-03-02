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
  version: number;        // SAVE_FORMAT_VERSION (currently 2) for migrations
  timestamp: number;      // Date.now() at save time
  label: string;          // Display label
  username, gamePhase, currentChapter, completedObjectives,
  deliveredEmailIds, commandHistory, cwd: string;
  fs: SerializedFS;       // Full filesystem tree
  activeComputer: ComputerId;  // "home" | "nexacorp"
  storyFlags: StoryFlags;      // Record<string, string | boolean>
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

| Field | What it tracks |
|-------|---------------|
| `fs` (serialized) | Full filesystem tree — file edits, new files/dirs, email read/unread state |
| `cwd` | Player's current working directory |
| `username` | Player's chosen username |
| `gamePhase` | `"login" \| "booting" \| "playing"` |
| `currentChapter` | Current narrative chapter ID |
| `completedObjectives` | Array of completed objective IDs |
| `deliveredEmailIds` | Which emails have been triggered (prevents re-delivery) |
| `commandHistory` | Terminal history for up-arrow recall (capped at 500) |

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
  if (data.version < 2) { data = migrateV1toV2(data); }
  if (data.version < 3) { data = migrateV2toV3(data); }
  return data;
}
```

## Design Patterns

- **Pure functions**: `serializeFS`, `deserializeFS`, `createSaveData` are all pure
- **Immutable FS**: Deserialization creates a new VirtualFS instance
- **GameAction side-channel**: Commands return `gameAction` on `CommandResult`, handled by `useTerminal`
- **Version migrations**: `SAVE_FORMAT_VERSION` + `migrateSaveData()` for forward compatibility
- **Auto-persist**: Zustand `partialize` includes serialized FS — filesystem survives page reload
