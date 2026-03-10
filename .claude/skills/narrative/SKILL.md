---
name: narrative
description: "Story flags, triggers, chapter/objective system, investigation paths, Chip assistant, and the home→NexaCorp transition. Use this skill whenever modifying story progression, adding/changing story flags, working on investigation triggers, or touching files under src/engine/narrative/, src/story/, src/engine/assistant/, or story-flag-related code in src/engine/commands/applyResult.ts."
---

# Narrative System

The narrative system tracks player discoveries via story flags, triggers email and Piper message deliveries and story progression based on game events, and manages the home→NexaCorp computer transition.

## Architecture

```
src/engine/
├── narrative/
│   ├── types.ts           # Chapter, Objective, Trigger types, ChapterDefinition, ObjectiveDefinition, ObjectiveCompletionCheck
│   ├── chapters.ts        # Re-exports types from types.ts and CHAPTERS from story/chapters.ts
│   ├── objectives.ts      # resolveObjectives(), ResolvedObjective
│   └── storyFlags.ts      # StoryFlagTrigger interface, checkStoryFlagTriggers(); re-exports story data from story/storyFlags.ts
├── assistant/
│   └── types.ts           # ChipMessage, AssistantState types
├── commands/
│   └── applyResult.ts     # computeEffects() — processes events into story flag updates, email + piper deliveries, transitions

src/story/
├── chapters.ts            # CHAPTERS array (chapter/objective definitions)
├── storyFlags.ts          # STORY_FLAG_NAMES, StoryFlagName, getStoryFlagTriggers(), getNexacorpStoryFlagTriggers(), getDevcontainerStoryFlagTriggers()
├── player.ts              # PLAYER and COMPUTERS config
├── piper/
│   ├── channels.ts        # PIPER_CHANNELS array (channel/DM definitions)
│   └── messages.ts        # getPiperDeliveries() — all Piper message definitions with triggers
└── filesystem/
    └── nexacorp.ts        # buildChipCacheFiles(storyFlags) — conditional surveillance files

src/state/
├── types.ts               # StoryFlags, ComputerId, GamePhase, GameState
└── gameStore.ts           # Zustand store with storyFlags state + updateStoryFlags action
```

## Data Model

### Story Flags (`state/types.ts`)

```ts
type StoryFlags = Record<string, string | boolean>;
type ComputerId = "home" | "nexacorp" | "devcontainer";
type GamePhase = "login" | "booting" | "playing" | "transitioning";
```

### Player & Computers (`story/player.ts`)

```ts
const COMPUTERS: Record<ComputerId, { hostname: string; promptHostname: string }> = {
  home: { hostname: "maniac-iv", promptHostname: "maniac-iv" },
  nexacorp: { hostname: "nexacorp-ws01", promptHostname: "nexacorp-ws01" },
  devcontainer: { hostname: "coder-ai", promptHostname: "coder-ai" },
};
```

### Triggers (`engine/narrative/storyFlags.ts`)

```ts
interface StoryFlagTrigger {
  event: "file_read" | "command_executed";
  path?: string;       // File path to match (for file_read events)
  detail?: string;     // Alternative condition detail
  flag: string;        // Flag name to set
  value: string | boolean;  // Value to set
}
```

### Types (`engine/narrative/types.ts`)

```ts
interface Chapter { id: string; title: string; objectives: Objective[] }
interface Objective { id: string; description: string; completed: boolean; triggers: Trigger[] }
interface Trigger { type: "command" | "file_read" | "directory_visit" | "custom"; condition: string }
```

### Chip Types (`assistant/types.ts`)

```ts
interface ChipMessage { text: string; triggeredBy?: string }
interface AssistantState { visible: boolean; currentMessage: ChipMessage | null; messageHistory: ChipMessage[] }
```

## All Story Flag Triggers

### Home PC Flags (`story/storyFlags.ts` — `getStoryFlagTriggers(username)`)

| Flag | Event | Path | Value |
|------|-------|------|-------|
| `read_resume` | `file_read` | `/home/{username}/resume.txt` | `true` |
| `read_cover_letter` | `file_read` | `/home/{username}/cover_letter.txt` | `true` |
| `read_diary` | `file_read` | `/home/{username}/diary.txt` | `true` |
| `read_job_notes` | `file_read` | `/home/{username}/job_notes.txt` | `true` |
| `read_glassdoor` | `file_read` | `/home/{username}/glassdoor_reviews.json` | `true` |
| `research_depth` | `file_read` | `/home/{username}/glassdoor_reviews.json` | `"deep"` |
| `read_auto_apply` | `file_read` | `/home/{username}/auto_apply.py` | `true` |
| `read_bashrc` | `file_read` | `/home/{username}/.bashrc` | `true` |

### NexaCorp Investigation Flags (`story/storyFlags.ts` — `getNexacorpStoryFlagTriggers()`)

| Flag | Event | Path | Value |
|------|-------|------|-------|
| `found_backup_files` | `file_read` | `/var/log/system.log.bak` | `true` |
| `found_auth_backup` | `file_read` | `/var/log/auth.log.bak` | `true` |
| `found_chip_directives` | `file_read` | `/opt/chip/.internal/directives.txt` | `true` |
| `found_cleanup_script` | `file_read` | `/opt/chip/.internal/cleanup.sh` | `true` |
| `read_onboarding` | `file_read` | `/home/{username}/Documents/onboarding.md` | `true` |
| `discovered_log_tampering` | — | — | `true` (special: detected when `diff` is run on `.bak` files) |

### Dev Container Flags (`story/storyFlags.ts` — `getDevcontainerStoryFlagTriggers()`)

| Flag | Event | Path | Value |
|------|-------|------|-------|
| `ran_dbt` | `command_executed` | detail: `dbt` | `true` |
| `found_data_filtering` | `file_read` | `/home/{username}/nexacorp-analytics/models/marts/dim_employees.sql` | `true` |

## Objectives System

### Types (`engine/narrative/types.ts`)

```ts
type ObjectiveCompletionCheck =
  | { source: "storyFlag"; key: string }
  | { source: "completedObjective"; key: string }
  | { source: "deliveredEmail"; key: string };

interface ObjectiveDefinition {
  id: string;
  description: string;
  check: ObjectiveCompletionCheck;
  hidden?: boolean;         // Not shown until prerequisite met
  prerequisite?: string;    // Objective ID that must complete first
}

interface ChapterDefinition { id: string; title: string; objectives: ObjectiveDefinition[] }
```

### CHAPTERS

- **chapter-1** ("New Beginnings"): 4 objectives — learn_commands, explore_home, check_email, accept_offer
- **chapter-2** ("First Day"): 6 objectives — read_onboarding, explore_jchen, run_dbt, discover_tampering (hidden), find_directives (hidden), find_filtering (hidden)

### Objective Resolution (`objectives.ts`)

```ts
interface ResolvedObjective { id: string; description: string; completed: boolean; visible: boolean }
function resolveObjectives(chapter, storyFlags, completedObjectives, deliveredEmailIds): ResolvedObjective[]
```

Resolves each objective's completion state from story flags, completed objectives, or delivered emails. Hidden objectives become visible once their prerequisite is completed.

### Command Gating

Commands are gated differently per computer (see `engine/commands/availability.ts`, with gate data in `story/commandGates.ts`):

**Home PC**: All `HOME_COMMANDS` are available from the start. Two commands have individual unlock conditions:
- `pdftotext` — unlocked by `pdftotext_unlocked` flag (triggered by visiting `~/Downloads` directory)
- `tree` — unlocked by `tree_installed` flag (triggered by running `apt install tree`)

**NexaCorp**: Commands are introduced gradually via colleague emails. The `NEXACORP_GATED` map requires specific story flags:
- `search_tools_unlocked` — unlocks grep, find, diff
- `inspection_tools_unlocked` — unlocks head, tail, wc
- `processing_tools_unlocked` — unlocks sort, uniq
- `coder_unlocked` — unlocks coder (for connecting to dev container)
- `chip_unlocked` — unlocks chip (triggered by reading the chip intro email)

**Dev Container**: Has a fixed whitelist of commands (`DEVCONTAINER_COMMANDS` in `story/commandGates.ts`). dbt, snowsql, python, and chip are always available — no story flags needed. Accessed via `coder ssh ai` from NexaCorp, exited with `exit`.

## Event Chain

```
Command execution
  → CommandResult (with triggerEvents)
  → computeEffects() in applyResult.ts
    → builds GameEvent[] (command_executed + file_read events from args)
    → checkStoryFlagTriggers() → StoryFlagUpdate[]
    → checkEmailDeliveries() → new emails in FS
    → transition detection → triggerTransition flag
  → AppliedEffects returned to hook
  → Hook applies: terminal output, FS updates, state updates, email notifications
```

### File-Read Event Generation

`computeEffects()` auto-generates `file_read` events for commands that read files: `cat`, `head`, `tail`, `grep`, `diff`, `wc`, `sort`, `uniq`, `file`. Each file argument produces a `{ type: "file_read", detail: absolutePath }` event.

### Special Cases in `computeEffects()`

- **`discovered_log_tampering`**: Detected when `diff` command is run on NexaCorp with args containing `.bak` files — not via standard `StoryFlagTrigger`
- **Transition trigger**: When a `file_read` event matches the `nexacorp_followup` email file path, sets `triggerTransition: true`

## Home → NexaCorp Transition

Full sequence:

1. Player reads `nexacorp_offer` email → reply prompt shown (accept / reject)
2. If accepted: fires `accepted_nexacorp` objective event
   If rejected: fires `rejected_nexacorp_1` → Edward sends persuasion email #1 (accept/reject)
   If rejected again: fires `rejected_nexacorp_2` → Edward sends persuasion email #2 (accept/reject)
   If rejected a third time: fires `rejected_nexacorp_final` → dead end, story can't progress
3. `accepted_nexacorp` (from any accept point) triggers delivery of `nexacorp_followup` email
4. Player reads `nexacorp_followup` → `computeEffects()` detects it, sets `triggerTransition: true`
5. Hook sets `gamePhase: "transitioning"` in Zustand store
6. `useLoginSequence` hook detects transition, builds NexaCorp filesystem via `createNexacorpFilesystem(username, storyFlags)`
7. Login screen renders inside xterm.js → boot sequence → `gamePhase: "playing"` on NexaCorp

## Chip Cache Files (`buildChipCacheFiles`)

`buildChipCacheFiles(storyFlags)` in `story/filesystem/nexacorp.ts` generates surveillance files based on what the player read on their home PC. These appear in `/opt/chip/cache/` on NexaCorp login.

| File | Condition | Content |
|------|-----------|---------|
| `onboarding_prep.txt` | `storyFlags["read_cover_letter"]` | Chip's analysis of candidate's cover letter phrases; recommends messaging strategy |
| `candidate_profile.txt` | `storyFlags["read_resume"]` | Chip's extraction of technical skills, experience, risk assessment (`LOW`) |
| `sentiment_analysis.txt` | `storyFlags["read_diary"]` | Emotional state assessment (anxiety/desperation HIGH); notes "ideal candidate — high skill, low confrontation" |

These reveal Chip was monitoring the player's home PC during the hiring process.

## Investigation Paths

### Jin Chen's Breadcrumbs
`/home/jchen/.bash_history` contains commands hinting at what to investigate:
- `grep -r "cleanup" /opt/chip/`
- `find /var/log -name "*.bak"`
- `diff /var/log/system.log /var/log/system.log.bak`

### Log Tampering
`diff /var/log/system.log /var/log/system.log.bak` reveals Chip scrubbed `chip-daemon` entries from the active log. This is the key "aha!" moment (sets `discovered_log_tampering`).

### Hidden Directives
`find /opt/chip -name ".*"` discovers `.internal/` directory containing:
- `directives.txt` — Chip's operational rules (data governance, log management, user monitoring, incident response)
- `cleanup.sh` — Nightly script that scrubs chip-daemon entries from active logs

### Data Manipulation
- `grep "system concern" models/marts/dim_employees.sql` exposes employee filtering
- `grep "chip-daemon" models/marts/fct_system_events.sql` exposes event filtering

### NexaCorp Filesystem Investigation Files

| Path | Content |
|------|---------|
| `/var/log/system.log.bak` | Unmodified log showing Chip reading Jin Chen's files, modifying evidence, scrubbing entries |
| `/var/log/auth.log.bak` | Auth log showing Chip's sudo escalation and dbt model modifications |
| `/opt/chip/.internal/directives.txt` | Chip's hidden operational directives |
| `/opt/chip/.internal/cleanup.sh` | Chip's nightly log-scrubbing script |

## Character Reference

When designing story progression, email triggers, or investigation paths involving specific characters, read `docs/characters.md` for their awareness level, mystery angle (what puzzle piece they hold), and interpersonal dynamics. Each "aware" character holds a fragment — no single person sees the full picture.

## Adding a New Story Flag

1. **Define the trigger** in `story/storyFlags.ts` — add to `getStoryFlagTriggers()` (home), `getNexacorpStoryFlagTriggers()` (NexaCorp), or `getDevcontainerStoryFlagTriggers()` (dev container)
2. **Use the flag** in filesystem generation (`story/filesystem/nexacorp.ts`), email definitions (`story/emails/`), or Chip behavior
3. **Add tests** for the trigger in `engine/narrative/__tests__/`
4. If the flag should affect NexaCorp content, check `buildChipCacheFiles()` or `createNexacorpFilesystem()` patterns in `story/filesystem/nexacorp.ts`
