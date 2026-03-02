# Terminal Turmoil

A narrative-driven browser game that teaches Linux/terminal through a workplace mystery. See `rules/story.md` for narrative details (premise, characters, emails, data mystery).

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
npm run dev      # Local development server
npm run build    # Production build (static export to out/)
npm run lint     # ESLint
```

### In-Game Commands

`ls`, `cd`, `cat`, `pwd`, `clear`, `help`, `nano`, `mail`, `python`, `snowsql`, `dbt`, `save`, `load`, `newgame`, `grep`, `find`, `head`, `tail`, `diff`, `wc`, `echo`, `chmod`, `mkdir`, `rm`, `mv`, `cp`, `touch`, `history`, `whoami`, `hostname`, `uname`, `file`, `tree`, `sort`, `uniq`, `date`, `which`, `man`

Pipe support (`|`), output redirection (`>`, `>>`), and stdin passing between piped commands are all supported.

## Project Structure

```
src/
├── app/                    # Next.js App Router (single page game)
├── components/
│   ├── Terminal/           # xterm.js wrapper (dynamic import, ssr:false)
│   ├── Assistant/          # Chip's popup overlay
│   ├── HUD/               # ObjectiveTracker, StatusBar
│   └── Game/              # GameShell top-level layout
├── engine/
│   ├── filesystem/         # VirtualFS class, types, homeFilesystem, initialFilesystem (__tests__/)
│   ├── commands/           # Parser, registry, builtin commands, applyResult (__tests__/)
│   ├── editor/             # Nano text editor (EditorSession, keymap, render) (__tests__/)
│   ├── python/             # Python REPL via Pyodide
│   ├── snowflake/          # In-browser Snowflake SQL engine (lexer, parser, planner, executor, functions, formatter, session, bridge, seed, state) (__tests__/)
│   ├── dbt/                # Virtual dbt CLI (project discovery, runner, output, data) (__tests__/)
│   ├── mail/               # In-game email system (delivery, templates, Maildir layout) (__tests__/)
│   ├── prompt/             # Inline prompt system (numbered choices for email replies, narrative)
│   ├── session/            # Shared ISession interface and SessionResult types
│   ├── terminal/           # Key code constants (keyCodes.ts)
│   ├── suggestions/        # Zsh-style autosuggestions (ghost text from history, commands, paths) (__tests__/)
│   ├── narrative/          # Chapter/objective/trigger types, storyFlags engine
│   ├── result.ts           # Generic Result<T> type for error handling
│   └── assistant/          # Chip message types
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
- **Dual computer**: Home PC (`"home"`) and NexaCorp workstation (`"nexacorp"`) with separate filesystems, emails, and prompts. `ComputerId`, `StoryFlags`, and `COMPUTERS` config in `state/types.ts`
- **Game phases**: `login → booting → playing` (also `transitioning` during home→work switch) — persisted in Zustand; login screen runs inside xterm.js for seamless UX

For command system details (parser, registry, pipeline, effects), see the **commands skill**. For email delivery, see the **email skill**. For story flags and triggers, see the **narrative skill**. For save system, see the **save skill**. For SQL engine, see the **snowflake skill**.
