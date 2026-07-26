---
name: save
description: "How the save/load/newgame system works — localStorage slots, SaveData snapshots, FS serialization, and the save/load/newgame commands. Use this skill whenever modifying save slots, adding new persisted state fields, working on save/load/newgame commands, bumping SAVE_FORMAT_VERSION, or touching files like src/state/saveManager.ts, src/state/saveTypes.ts, or src/engine/filesystem/serialization.ts."
---

# Save System

Save/load/restart via terminal commands, using localStorage slots.

Code map: `engine/filesystem/serialization.ts` (`serializeFS`/`deserializeFS`, pure), `state/saveTypes.ts` (`SavePayload`/`SaveData`/`SaveSlotMeta`/`SaveSlotId`, `SAVE_FORMAT_VERSION`), `state/saveManager.ts` (the single snapshot writer/reader `serializeGameState`/`restoreGameState`, plus the cheap `pickSaveableState`, `buildFs`, localStorage CRUD `createSaveData`/`saveToSlot`/`loadFromSlot`/`deleteSlot`/`listSaveSlots`; pure/no-React), `state/debouncedStorage.ts` (the persist storage adapter), `commands/builtins/{save,load,newgame}.ts`, `state/gameStore.ts` (`saveGame`/`loadGame` actions + persist `partialize`/`merge`, both thin wrappers over saveManager), `useTerminal.ts` (`gameAction` handler). `GameAction` union is in `commands/types.ts`. Read the type definitions there.

## Slots

- **auto-persist** — Zustand auto-persist through `createDebouncedStorage(1000)`. Key `termoil-save`. Not a loadable slot — it rehydrates on page load via `merge`.

  **Contract: `partialize` must stay cheap.** zustand runs it on *every* `set()`, so it is only the field pick `pickSaveableState`. The expensive snapshot (`serializeGameState`: full multi-FS + Snowflake) is handed to the storage adapter as its `serialize` transform and runs once per debounce window, alongside `JSON.stringify` + the localStorage write. Adding work to `partialize` puts it on the hot path of every keystroke-driven store write. `pickSaveableState` must list every field `serializeGameState` reads (locked by a test in `saveManager.test.ts`).
- **slot-1/2/3** — manual. Keys `termoil-slot-{slotId}`.

Terminal commands: `save`/`load` list slots; `save 1|2|3` saves; `load 1|2|3` loads; `newgame` resets all state + reloads the page.

## What gets saved

**Both paths share ONE snapshot shape and one writer/reader**: `SavePayload` (`saveTypes.ts`) produced by `serializeGameState()` and consumed by `restoreGameState()` (`saveManager.ts`). Auto-persist uses them via the storage adapter's `serialize`/`merge`; manual slots via `createSaveData` (= payload + `timestamp`/`label` metadata) and `loadGame`. Both loaders discard any blob whose `version !== SAVE_FORMAT_VERSION` (no migrations, pre-release).

**The canonical field list is `SavePayload` in `saveTypes.ts` — check it there, not a table.** Non-obvious fields:
- `computerStates` — per-computer serialized FS (incl. the `.zsh_history` file), env vars, aliases, mounts.
- `zshHistory` — durable per-computer `.zsh_history` mirror that **survives `removeComputer`/FS rebuilds**, so shell history (the single source of truth — the `.zsh_history` file) continues across day/computer transitions even for boxes that get torn down and rebuilt.
- `serializedSnowflake` — via `serializeSnowflake()`; on restore, a deserialize failure falls back to `createInitialSnowflakeState()` rather than crashing the load; the nexacorp FS is re-bridged via `syncToVirtualFS`.
- `windows`/`activeWindowIndex` — window/pane tree + active window (panes rebuilt with fresh ids via `rebuildWindow`; see the tmux skill). `restoreGameState` also rebuilds an FS (via `buildFs`, which lives in saveManager and is re-exported from gameStore) for any pane whose computer entry failed to deserialize.
- `tmuxAttachedSession`/`tmuxDetachedSessions` — tmux session lifecycle (attached `{name, createdAt}` or null when the save was made on the bare shell; detached sessions as `TmuxSessionSnapshot[]`, already serialization-shaped). `pendingMuxNotice` is transient (restored as null). See the tmux skill.
- `notifiedChipTopicIds`, `copyModeHelpHidden` — dedup + UI preference.

Plus plain narrative/identity fields (`username`, `currentChapter`, `completedObjectives`, `deliveredEmailIds`, `deliveredPiperIds`, `storyFlags`, `hasSeenIntro`).

**`gamePhase` is deliberately not persisted.** `"booting"`/`"transitioning"` are transient phases owned by a running timer, so a reload mid-animation would restore a phase nothing ever advances and leave the terminal input-disabled. `restoreGameState()` always returns `"playing"`. Don't add it back to `SavePayload`.

## Updating for narrative progression

Adding a new Zustand field: (1) add to `SavePayload` in `saveTypes.ts`, (2) add to `serializeGameState()` + `restoreGameState()` + `pickSaveableState()` (and `SaveableState`/`RestoredGameState`) in `saveManager.ts`, (3) bump `SAVE_FORMAT_VERSION`. Nothing to touch in `gameStore.ts`.

No save changes needed for: new chapters/objectives (`currentChapter`/`completedObjectives` already capture ID strings), new email triggers (`deliveredEmailIds` tracks ID strings), or new filesystem content (FS serialized in full — new files appear only in fresh games, not existing saves). This is a pre-release game — skip save-migration scaffolding when the `SaveData` shape changes; just bump the version.
