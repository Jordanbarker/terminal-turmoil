# Terminal Turmoil

A narrative-driven browser game that teaches Linux/terminal through a workplace mystery. See `rules/story.md` for narrative details (premise, characters, emails, data mystery). Prioritize narrative realism in all game content. Do not add unrealistic scenarios. When unsure about realism, ask rather than guess.

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

`ls`, `cd`, `cat`, `pwd`, `clear`, `help`, `nano`, `mail`, `piper`, `python`, `snowsql`, `dbt`, `chip`, `ssh`, `coder`, `exit`, `save`, `load`, `newgame`, `grep`, `find`, `head`, `tail`, `diff`, `wc`, `echo`, `chmod`, `mkdir`, `rm`, `mv`, `cp`, `touch`, `history`, `whoami`, `hostname`, `uname`, `file`, `tree`, `sort`, `uniq`, `date`, `which`, `man`, `pdftotext`, `sudo`, `apt`

Pipe support (`|`), output redirection (`>`, `>>`), and stdin passing between piped commands are all supported.

## Project Structure

```
src/
├── app/                    # Next.js App Router (single page game)
├── components/
│   ├── Terminal/           # xterm.js wrapper (dynamic import, ssr:false)
│   ├── Assistant/          # Chip's popup overlay
│   ├── HUD/               # ObjectiveTracker, StatusBar, Toast
│   └── Game/              # GameShell top-level layout
├── engine/
│   ├── filesystem/         # VirtualFS class, types, serialization (__tests__/)
│   ├── commands/           # Parser, registry, builtin commands, applyResult, availability (__tests__/)
│   ├── chip/               # Chip interactive CLI (ChipSession, render, types)
│   ├── editor/             # Nano text editor (EditorSession, keymap, render) (__tests__/)
│   ├── ssh/                # SSH client session (SshSession, sshConfig)
│   ├── python/             # Python REPL via Pyodide
│   ├── snowflake/          # In-browser Snowflake SQL engine (lexer, parser, planner, executor, functions, formatter, session, bridge, seed, state) (__tests__/)
│   ├── dbt/                # Virtual dbt CLI (project discovery, runner, output, data) (__tests__/)
│   ├── mail/               # In-game email system (delivery, dispatcher, Maildir layout) (__tests__/)
│   ├── piper/              # Piper messaging system (PiperSession, delivery, render, types) (__tests__/)
│   ├── prompt/             # Inline prompt system (numbered choices for email replies, narrative)
│   ├── session/            # Shared ISession interface and SessionResult types
│   ├── terminal/           # Key code constants (keyCodes.ts)
│   ├── suggestions/        # Zsh-style autosuggestions (ghost text from history, commands, paths) (__tests__/)
│   ├── narrative/          # Chapter/objective/trigger types, storyFlags engine (re-exports from story/)
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
│   │   ├── nexacorp.ts         # NexaCorp filesystem builder (initialFilesystem)
│   │   └── devcontainer.ts     # Coder dev container filesystem builder
│   ├── chip/
│   │   └── menuItems.ts        # Chip menu items and responses
│   ├── piper/
│   │   ├── channels.ts         # Piper channel definitions
│   │   └── messages.ts         # Piper message/delivery definitions
│   └── data/
│       ├── dbt/                # Pre-generated dbt data (model results, test results, etc.)
│       └── snowflake/          # Pre-generated Snowflake seed data
├── state/                  # Zustand store (gameStore.ts), save system (saveManager, saveTypes)
├── hooks/                  # useTerminal, useSessionRouter, useCommandLine, useLoginSequence
└── lib/                    # ANSI helpers (ansi.ts), ASCII art/display text (ascii.ts), path utilities, timing constants (__tests__/)
```

## Key Architectural Decisions

- **Immutable filesystem**: VirtualFS mutations return new instances (enables React re-renders, future undo/redo)
- **No engine→state imports**: Engine layer never imports from `state/` (Zustand). Dependencies flow via `CommandContext`
- **Decomposed terminal hooks**: `useTerminal` (orchestrator) → `useSessionRouter` (session lifecycle) + `useCommandLine` (input/history/suggestions)
- **Single-page app**: Chapter transitions are state changes, not route changes
- **Dynamic xterm import**: `ssr: false` required because xterm.js needs `window`
- **Static export**: `output: 'export'` in next.config.ts, deployed to GitHub Pages
- **Three computers**: Home PC (`"home"`), NexaCorp workstation (`"nexacorp"`), and Coder dev container (`"devcontainer"`) with separate filesystems. `ComputerId` type in `state/types.ts`; `PLAYER` and `COMPUTERS` config in `story/player.ts`. The dev container is accessed from NexaCorp via `coder ssh ai` and exited with `exit`. Filesystem state is preserved across transitions using a stashed FS swap pattern in `useTerminal.ts`
- **Command availability**: Home PC has all commands available from the start, with only `pdftotext` (gated by visiting `~/Downloads`) and `tree` (gated by `apt install tree`) requiring unlock. NexaCorp introduces commands gradually via colleague messages — search tools (grep/find/diff), inspection tools (head/tail/wc), processing tools (sort/uniq), coder (gated by `coder_unlocked`), chip, and piper (gated by `piper_unlocked`) are each gated by story flags. The dev container has a fixed whitelist (`DEVCONTAINER_COMMANDS`) with dbt/snowsql/python/chip always available. `availability.ts` gates command access by computer + flags; gate data lives in `story/commandGates.ts`
- **Story/engine separation**: Story content (email definitions, Piper message definitions, filesystem builders, chapters, story flags, Chip menu items, seed data) lives in `src/story/`. Engine modules (`engine/narrative/`, `engine/mail/`, `engine/piper/`, `engine/commands/availability.ts`) re-export or import from `story/` for runtime logic
- **Game phases**: `login → booting → playing` (also `transitioning` during home→work switch) — persisted in Zustand; login screen runs inside xterm.js for seamless UX

For command system details (parser, registry, pipeline, effects), see the **commands skill**. For email delivery, see the **email skill**. For Piper messaging, see the **piper skill**. For story flags and triggers, see the **narrative skill**. For save system, see the **save skill**. For SQL engine, see the **snowflake skill**.
