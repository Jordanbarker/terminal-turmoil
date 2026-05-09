# Terminal Turmoil

A narrative-driven browser game that teaches Linux/terminal through a workplace mystery. Prioritize narrative realism in all game content.

## Tech Stack

- **Framework**: Next.js (App Router, static export)
- **Language**: TypeScript
- **Terminal**: xterm.js (`@xterm/xterm`, `@xterm/addon-fit`)
- **State**: Zustand with localStorage persist
- **Styling**: Tailwind CSS
- **Testing**: Vitest
- **Python**: Pyodide (WebAssembly)
- **Deployment**: GitHub Pages via GitHub Actions

## Commands

```bash
npm run dev       # Local development server
npm run build     # Production build (static export to out/)
npm run lint      # ESLint
npm run typecheck # TypeScript checking
npm run test      # Vitest (or: npx vitest run)
npm run check     # Combined typecheck + test + build
```

### In-Game Commands

`ls`, `cd`, `cat`, `pwd`, `clear`, `help`, `nano`, `mail`, `piper`, `python`, `snow`, `dbt`, `chip`, `ssh`, `coder`, `exit`, `shutdown`, `save`, `load`, `newgame`, `grep`, `find`, `head`, `tail`, `diff`, `wc`, `echo`, `chmod`, `mkdir`, `rm`, `mv`, `cp`, `touch`, `history`, `whoami`, `hostname`, `file`, `tree`, `sort`, `uniq`, `date`, `which`, `command`, `type`, `man`, `df`, `pdftotext`, `sudo`, `apt`, `git`, `source`, `alias`, `unalias`, `export`, `printenv`, `env`

Pipe support (`|`), output redirection (`>`, `>>`), stdin passing between piped commands, and command chaining (`&&`, `||`, `;`) are all supported.

## Project Structure

```
src/
├── app/                    # Next.js App Router (single page game)
├── components/
│   ├── Terminal/           # TabManager (multi-tab), TabBar, xterm.js (dynamic import, ssr:false)
│   ├── Assistant/          # Chip's popup overlay
│   ├── HUD/               # ObjectiveTracker, StatusBar, Toast
│   └── Game/              # GameShell top-level layout
├── engine/
│   ├── filesystem/         # VirtualFS class, types, serialization, builders (__tests__/)
│   ├── commands/           # Parser, registry, builtin commands, applyResult, availability (__tests__/)
│   ├── chip/               # Chip interactive CLI (ChipSession, render, types)
│   ├── editor/             # Nano text editor (EditorSession, keymap, render) (__tests__/)
│   ├── ssh/                # SSH client session (SshSession, sshConfig)
│   ├── python/             # Python REPL via Pyodide
│   ├── snowflake/          # In-browser Snowflake SQL engine (lexer, parser, planner, executor, functions, formatter, session, bridge, seed, state) (__tests__/)
│   ├── dbt/                # Virtual dbt CLI (project discovery, runner, output, data) (__tests__/)
│   ├── git/                # Virtual git CLI (repo, output, remotes, types) (__tests__/)
│   ├── mail/               # In-game email system (delivery, dispatcher, Maildir layout) (__tests__/)
│   ├── piper/              # Piper messaging system (PiperSession, delivery, render, types) (__tests__/)
│   ├── prompt/             # Inline prompt system (numbered choices for email replies, narrative)
│   ├── session/            # Shared ISession interface and SessionResult types
│   ├── terminal/           # Key code constants (keyCodes.ts)
│   ├── suggestions/        # Zsh-style autosuggestions (ghost text from history, commands, paths) (__tests__/)
│   ├── narrative/          # Chapter/objective/trigger types, storyFlags engine, triggerMatcher (re-exports from story/)
│   ├── result.ts           # Generic Result<T> type for error handling
│   └── assistant/          # Chip message types
├── story/                      # Story content separated from engine logic
│   ├── player.ts               # PLAYER and COMPUTERS config
│   ├── chapters.ts             # CHAPTERS array (chapter/objective definitions)
│   ├── storyFlags.ts           # Story flag names, triggers (home + NexaCorp)
│   ├── commandGates.ts         # HOME_COMMANDS, NEXACORP_GATED, HOME_GATED, DEVCONTAINER_COMMANDS
│   ├── emails/
│   │   ├── home.ts             # Home PC email definitions
│   │   └── nexacorp.ts         # NexaCorp email definitions
│   ├── filesystem/
│   │   ├── home.ts             # Home PC filesystem builder
│   │   ├── nexacorp/           # NexaCorp filesystem builder (split into modules)
│   │   │   ├── index.ts        # createNexacorpFilesystem() composer + re-exports
│   │   │   ├── dbt.ts          # buildDbtProject() — full dbt project tree
│   │   │   ├── chip.ts         # buildOptDirectory() — /opt/chip/ THIN CLIENT (bin/chip stub, config, VERSION, README, cache)
│   │   │   ├── srv.ts          # buildSrvDirectory() — /srv/ marketing, operations, engineering, leadership
│   │   │   └── home.ts         # buildHomeDirectory() — user home dir
│   │   ├── chipinfra/          # Shared Chip platform workspace (`coder ssh chip`) — plugin runtime + RAG + inference data
│   │   │   ├── index.ts        # createChipinfraFilesystem() composer
│   │   │   ├── home.ts         # /home/{player}, /home/erik, /home/oscar (multi-user shared box)
│   │   │   ├── opt.ts          # /opt/chip/ plugin runtime (10 plugins + registry.json + SDK)
│   │   │   ├── srv.ts          # /srv/ai/rag/ (RAG corpus) + /srv/chip/ (embeddings, prompts, cache, logs)
│   │   │   └── tmp.ts          # /tmp/ with Erik's stale ssh agent socket (world-building only)
│   │   ├── devcontainer.ts     # Coder dev container filesystem builder (`coder ssh ai`, per-player)
│   │   └── paths.ts            # HOME_PATHS, NEXACORP_PATHS, CHIPINFRA_PATHS constants for story flag triggers
│   ├── chip/
│   │   └── menuItems.ts        # Chip menu items and responses
│   ├── piper/
│   │   ├── channels.ts         # Piper channel definitions
│   │   ├── messages.ts         # Piper message/delivery definitions (re-exports from messages/)
│   │   └── messages/           # Per-character message files (home, onboarding, oscar, dana, auri, sarah, cassie, jordan, maya, soham, edward, ambient)
│   └── data/
│       ├── dbt/                # Pre-generated dbt data (model results, test results, etc.)
│       └── snowflake/          # Pre-generated Snowflake seed data
├── state/                  # Zustand store (gameStore.ts), save system (saveManager, saveTypes)
├── hooks/                  # useTerminal, useSessionRouter, useCommandLine, useLoginSequence, useComputerTransitions
└── lib/                    # ANSI helpers (ansi.ts), ASCII art/display text (ascii.ts), path utilities, timing constants (__tests__/)
```

## Key Architectural Decisions

- **Immutable filesystem**: VirtualFS mutations return new instances (enables React re-renders, future undo/redo)
- **Minimal engine→state coupling**: Engine files may import type definitions from `state/types.ts` (e.g. `ComputerId`, `StoryFlags`), but never import Zustand stores or actions. Runtime dependencies flow via `CommandContext`
- **Decomposed terminal hooks**: `useTerminal` (orchestrator) → `useSessionRouter` (session lifecycle) + `useCommandLine` (input/history/suggestions)
- **Single-page app**: Chapter transitions are state changes, not route changes
- **Dynamic xterm import**: `ssr: false` required because xterm.js needs `window`
- **Static export**: `output: 'export'` in next.config.ts, deployed to GitHub Pages
- **Four computers**: Home PC (`"home"`), NexaCorp workstation (`"nexacorp"`), per-player Coder dev container (`"devcontainer"`, hostname `coder-ai`), and the shared Chip platform Coder workspace (`"chipinfra"`, hostname `coder-chip`). Separate filesystems are stored in `computerState` (Zustand). `ComputerId` type in `state/types.ts`; `PLAYER` and `COMPUTERS` config in `story/player.ts`. Both Coder workspaces are reached from NexaCorp via `coder ssh <name>` (`ai` or `chip`) and exited with `exit`. The `chip` workspace is gated behind the `unlock_chip_plugin_development` story flag (set after Edward's Chapter 3 plugin DM). First-time transitions trigger fullscreen animations; subsequent transitions open new tabs instantly.
- **Multi-terminal tabs**: Players can open multiple terminal tabs (max 5) on different computers simultaneously. `TabManager.tsx` orchestrates tab lifecycle. Each tab has its own xterm instance, cwd, and session state. Tab state (`tabs[]`, `activeTabId`) lives in Zustand; persisted as `tabs[]` + `activeTabIndex` in save format v5. Tabs are gated behind `tabs_unlocked` story flag (unlocked in Chapter 2). Tmux-style shortcuts: `Ctrl+B, C/X/N/P/1-5`. `Ctrl+B, X` checks `canClose()` on the active session — blocks with warning if unsaved (force-close on second attempt within 2s). "+" button shows computer selection dropdown when multiple computers are available. Per-computer command queue serializes FS mutations to prevent TOCTOU races.
- **Per-computer FS in store**: `computerState: Record<ComputerId, { fs: VirtualFS }>` holds per-computer filesystem state. There are no legacy `fs`, `cwd`, or `activeComputer` fields — these are derived from `computerState` and `tabs`. Pipeline execution reads fresh FS from `getState().computerState[computerId]`, accumulates in local `runningFs`, writes once at end via `setComputerFs()`. CWD is per-tab via `setTabCwd()`. Active computer is derived from the active tab's `computerId`. Hooks use `getState()` for global state (storyFlags, deliveredEmailIds, etc.) instead of synced refs. Computer transitions use `setTabComputer()` to repurpose the current tab instead of stash/swap.
- **Delivery extraction**: `processDeliveries()` in `engine/commands/processDeliveries.ts` is a pure function extracted from `computeEffects()`. Handles story flag triggers, email/piper deliveries, piper_delivered flag cascades, and filesystem effects from `STORY_FS_EFFECTS` (`story/fsEffects.ts`). Checkpoint loading in `gameStore.ts` also applies FS effects.
- **Command availability**: Home PC has `HOME_COMMANDS` available from the start; `HOME_GATED` commands (ssh, sudo, apt, pdftotext, tree) require story flags to unlock. NexaCorp has most commands available by default (including dbt, snow, python); `NEXACORP_GATED` commands are introduced gradually via colleague messages — search tools (grep/find/diff), inspection tools (head/tail/wc), processing tools (sort/uniq), coder, chip, and piper are each gated by story flags. Both Coder workspaces (`devcontainer` and `chipinfra`) share the `DEVCONTAINER_COMMANDS` whitelist (dbt/snow/python/chip always available). `availability.ts` gates command access by computer + flags; gate data lives in `story/commandGates.ts`. See the **narrative skill** for full gating details
- **Story/engine separation**: Story content (email definitions, Piper message definitions, filesystem builders, chapters, story flags, Chip menu items, seed data) lives in `src/story/`. Engine modules (`engine/narrative/`, `engine/mail/`, `engine/piper/`, `engine/commands/availability.ts`) re-export or import from `story/` for runtime logic

## Characters

See `docs/characters.md`.