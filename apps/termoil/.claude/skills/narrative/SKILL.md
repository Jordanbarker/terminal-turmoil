---
name: narrative
description: "Story flags, triggers, chapter/objective system, investigation paths, Chip assistant, and the home→NexaCorp transition. Use this skill whenever modifying story progression, adding/changing story flags, working on investigation triggers, or touching files under src/engine/narrative/, src/story/, src/engine/chip/, or story-flag-related code in src/engine/commands/applyResult.ts."
---

# Narrative System

Tracks player discoveries via story flags, fires email/Piper deliveries and story progression off game events, and manages the home→NexaCorp→devcontainer/chipinfra→erik-pc computer transitions.

Code map: `src/engine/narrative/` (types, `objectives.ts`, `storyFlags.ts` trigger engine, `triggerMatcher.ts`), `src/story/` (the content: `chapters.ts`, `storyFlags.ts`, `commandGates.ts`, `player.ts`, `piper/`, `filesystem/`), and `src/engine/commands/{applyResult,processDeliveries}.ts` (events → flag updates + deliveries). All types live in `engine/narrative/types.ts` and `state/types.ts` — read them there.

## Chip is an LLM tool, not a character

Write Chip the way you'd write ChatGPT or Claude — a tool employees prompt through the `chip` CLI. It is **not autonomous and not sentient**: no goals, feelings, or initiative. Every "scheduled Chip task" is a systemd timer or webhook handler authored by a human that invokes Chip with a specific prompt. Both boxes use **systemd timers, not cron** (`/etc/systemd/system/` on NexaCorp, `~/.config/systemd/user/` on the Home PC).

When the mystery surfaces something suspicious "Chip did", the agency is human: Edward's prompts/plugin configs, timer services running under `chip_service_account`, or plugins Edward quietly modified.

- ✅ "ask Chip, it's good at explaining git" / "Edward added a filter to scrub `chip_service_account` entries"
- ❌ "Chip notices its own heap pressure" / "Chip cleans up after itself" / "Chip is doing things outside its spec" (say instead: "Chip's responses don't match the spec — likely a plugin or prompt change")

First-person voice is fine ("I'm Chip") — that's how LLMs talk. The line is between *describing what Chip does when invoked* (fine) and *claiming unprompted initiative* (not fine). The "Chip going autonomous" content in `/srv/` is Edward's *intent*, plot-relevant, and stays. Chip's character constitution is `/srv/chip/config/chip-soul.md`; the operational prompt is `system_prompt:` in `/srv/chip/config/prompts.yml`.

## Prose style: avoid em-dash crutches

Player-facing copy (emails, Piper, seeded files, objectives, engine strings) should not lean on em dashes — they flatten every speaker into one voice. Prefer a period, a colon, a comma/`;`, or parens. Em dashes are fine in signoffs (`— Sarah`), the rare earned dramatic pause, and code comments.

## Story flags — source of truth

**Don't maintain a hand-curated flag table here — it rots.** `STORY_FLAG_NAMES` in `src/story/storyFlags.ts` (grouped by arc under comment headers) is authoritative; `src/story/__tests__/storyIntegrity.test.ts` fails any reference to an undefined flag. The trigger interface (`StoryFlagTrigger`) and the per-computer trigger functions (dispatched by `getTriggersForComputer`) are in that file.

### Flag-name typing: `StoryFlagName` / `TermoilStoryFlags`

Most surfaces that *name* a flag are typed against `STORY_FLAG_NAMES`, so a typo is a build error rather than a trigger that silently never fires: `StoryFlagTrigger.flag`/`requiredFlags`, `checkStoryFlagTriggers`' return + `PiperCascadeResult.flagUpdates`, `setStoryFlag(key)`, `Checkpoint.storyFlags`, `PiperReplyOption.visibleWhen`/`hiddenWhen`, `PiperTrigger.after_story_flag`/`excludedFlags`, `ChipMenuItem.condition` (the last four via `TermoilStoryFlags`), and `ObjectiveCompletionCheck.key` (recursively through nested `source: "all"`). One seam stays untyped by necessity: `AppliedEffects.storyFlagUpdates` coming back from `@tt/core` — it is narrowed once, in `applyStoryFlagUpdates` in `useTerminal.ts`; don't scatter that cast.

Trigger matching notes: `pathPrefix` fires for any file under a dir; `pathSuffix` brackets a player-chosen middle segment (both must match when both set); `detailPrefix`/`detailNot` are the same match on a non-path `command_executed` detail; `requiredFlags` gates on prior flags (positive AND, checked before event matching). Non-obvious flag groups: **termination detail flags** (`termination_*`) are set by `runTerminationTransition` and read by termination email bodies; **accusation carrier flags** (`accused_*`, `accusation_made`) persist past Chapter 3 for a planned Chapter 4 branch.

Two special triggers live in `applyResult.ts`, not the trigger tables: `discovered_log_tampering` (`diff` on NexaCorp with `.bak` args) and the transition trigger (reading the `nexacorp_followup` email sets `triggerTransition`).

### Result-oriented `command_executed` details — validate results, not keystrokes

Founding principle: `find the hidden file` should accept `ls -a`, `find . -name ".*"`, or any valid approach — triggers fire on the *outcome*, not the literal command. Several builtins emit a synthetic `command_executed` event with a result-shaped `detail` (`text_filtered`, `data_deduped`, `files_searched`, …) so multiple commands credit the same flag. Filesystem outcomes use dedicated event types instead (`directory_created`, `directory_removed` — rm forces `-r` for directories, so that event alone proves a recursive delete). Prefer these over a command-name `detail` for new outcomes.

**A trigger must fire on the thing the objective asks for.** The recurring bug shape is an event that merely *correlates* with the step (a `file_read` crediting "append to the log"; any editor save completing "fix the backup script" until the editor-trigger table gained `contentPredicate`; an errored `snow` query crediting the investigation it failed to make). When loosening a trigger, loosen the *route*, never the *evidence*.

**Tutorial carve-out — strict on purpose:** a few flags match the command name because the objective text names the tool (`used_mv_home`, `used_wc_at_home`, `used_echo_pipe`). Loosening them defeats the teaching moment. Document any future strict trigger here so it doesn't get "fixed".

### Cascade / cross-arc / branching patterns

Non-obvious trigger-wiring idioms; the code examples live in `storyFlags.ts` and the hook files.

- **Read-pair cascade** — "compare two files" is credited by two triggers, one per file, each gated on the other having been read via `requiredFlags`. Order-independent; the `currentFlags[flag] !== trigger.value` check in `checkStoryFlagTriggers` prevents double-count and also permits a state flag toggling back (`coder_workspace_stopped` is the one `value: false` trigger).
- **Cross-arc cascade (two-flag gate, no `flag_set` event)** — the system fires on game events, not flag-sets, so "open when BOTH flags true" needs both directions wired: the event-set flag uses a trigger with `requiredFlags: [other]`; the programmatically-set flag checks the partner inline and fires the cascade itself, same toast. Canonical case: "Pulling at a Loose Thread", split across `storyFlags.ts` and `useComputerTransitions.ts` — keep the branches in lockstep.
- **Result cascade** — a second trigger whose `flag` is an upstream milestone but whose event is a downstream proof (a green `dbt build` proves the diagnosis). **Always gate cascades with `requiredFlags`.** Note `git_checkout_b` is emitted by `checkout -b`, `switch -c`, AND `branch <name>`.
- **Per-reply Piper branching** — `after_piper_reply` doesn't distinguish which option was picked; attach distinct `triggerEvents` to each `PiperReplyOption` and gate the next delivery off the resulting flag (`processDeliveries()` runs flag triggers before piper deliveries in the same batch).
- **Negative-flag gates (`excludedFlags`)** — `after_file_read`/`after_story_flag` accept `excludedFlags`; any truthy one suppresses the trigger. Use to stop a delivery resurfacing once downstream state is reached. Pairs with `requiredFlags` (AND) and `requireDelivered`.

## Objectives, chapters, gating

- **Objectives/chapters** — `src/story/chapters.ts` is the source of truth (three chapters); types in `engine/narrative/types.ts` + `objectives.ts`. Don't mirror the objective tree here; read `chapters.ts` and `apps/termoil/docs/storyboard/chapter-{1,2,3}.md`. Resolution is three-pass (completion → visibility → `allVisibleChildren`). Groups: parent with `check: allVisibleChildren`, children with `group: "parent_id"`; groups can't nest and must be same-chapter (validated by `storyIntegrity.test.ts`).
- **Objective promotion** — `resolveObjectives` is pure; writing resolved objectives back into `completedObjectives` is `startObjectivePromotion()` in `state/objectivePromotion.ts`, a store subscription installed once by `GameShell`. It deliberately does **not** live in `ObjectiveTracker` (the HUD unmounts on every non-playing `gamePhase`, which used to stall promotion mid-cinematic). `completeObjective` de-dupes, so promotion is idempotent. Non-obvious quest behaviors are documented in comments at their definitions.
- **Command gating** — source of truth `src/story/commandGates.ts` (`HOME_COMMANDS`, `HOME_GATED`, `NEXACORP_GATED`, `NEXACORP_ONLY`, `HOME_ONLY`, `DEVCONTAINER_COMMANDS`, `DEVCONTAINER_ONLY`); read the maps there. Traps: `man` is **never** gated (the discovery command; self-limits to available commands); `shutdown` is ungated everywhere and consequence-free except two scripted home beats (their triggers carry `requiredFlags: ["returned_home_day1"]` so a cosmetic reboot can't advance the day); a mid-shift nexacorp `exit` is a **soft disconnect** — only an `isEndOfDayExit()` exit tears down the workday. `coder_workspace_stopped` is a state flag, not an unlock. Block devices gate via `BLOCK_DEVICES` in `src/story/blockDevices.ts`; `mount` emits `mounted_usb_drive` only for `/dev/sdb1` at `/mnt/usb`.

## Event chain

`Command → CommandResult(triggerEvents) → computeEffects() (applyResult.ts) → processDeliveries() → { checkStoryFlagTriggers, checkEmailDeliveries, checkPiperDeliveries } + transition detection → AppliedEffects → hook applies output/FS/state/notifications.` `computeEffects()` auto-generates `file_read` events for commands registered `readsFiles: true` (see the commands skill).

## Chip assistant specifics

- **Menu items** (`src/engine/chip/types.ts`, content in `src/story/chip/menuItems.ts`). `notifyOnUnlock: true` gives a one-time "New Chip topic available" toast the first time an item's `condition` passes (deduped by `notifiedChipTopicIds`). Use for meaningful branches, not evergreen topics.
- **`applyFs`** — a menu item can carry `applyFs?: (fs) => VirtualFS`; applies to the live FS via `SessionResult.newFs` on exit. Write it **idempotent** (items can be re-selected).
- **`response` can be dynamic** — `string | ((fs) => string)`, resolved at render time against the live FS, so Chip's claims can match the terminal (parity locked by `accessLogSummary.test.ts`).
- **Transcripts** — `ChipSession` flushes each session to `~/.chip/sessions/YYYY-MM-DD-HHMMSS.log` on exit via `newFs` (NexaCorp only). Timestamps anchor to the **game clock** (`gameNowFor(...)`), not wall-clock. Format in `src/engine/chip/transcript.ts`.

## Investigation paths (the mystery)

Jin Chen's `~/.zsh_history` breadcrumbs point at the log tampering: `diff /var/log/system.log /var/log/system.log.bak` reveals `chip-daemon` entries scrubbed by a systemd-timer cleanup script running as `chip_service_account` — the key "aha" (`discovered_log_tampering`). Other threads: hidden `/opt/chip/.internal/` found via `find`; dbt-model data manipulation (see the dbt skill); the `.bak` logs showing `chip_service_account` reading Jin's files. Read `apps/termoil/docs/characters.md` for who knows what.

Two paths carry a **terminal-vs-Chip-shortcut** structure worth preserving:
- **Oscar's access-log review** — reading `/var/log/access.log` fires `oscar_access_followup` (both replies); the Chip `review_access_log` item fires a parallel `oscar_access_chip_summary` with **only** the "Mostly normal" reply, suppressed by its `excludedFlags` — preserving "investigate to earn the truth". Both prompts stay answerable (`getPendingReplies` is delivery-ordered, oldest first).
- **Day 2 pipeline quest** — the `fix_campaign_model` Chip item applies the COALESCE fix via `applyFs` but does **not** advance the quest (no `triggerEvents`); the player still runs `dbt build` and branches/commits/pushes for real.

## Transitions

- **Home → NexaCorp** — reading `nexacorp_offer` → accept/reject reply chain (three persuasion rounds; third rejection is a dead end); accepting delivers `nexacorp_followup`; reading it sets `triggerTransition` → `gamePhase: "transitioning"` → `useLoginSequence` builds NexaCorp FS → boot → `playing`.
- **Chipinfra → Erik's PC (SSH-agent-forwarding pivot)** — the shared chipinfra workspace seeds Erik's live agent socket (`/tmp/ssh-mZ4xPq/`). Player path: read `.user-erik` marker → `export SSH_AUTH_SOCK=...` → `ssh-add -l` (key comment reveals `nexacorp-lt05`) → `ssh erik@nexacorp-lt05`. Auth is narrative (VirtualFS has no ownership): `ssh.ts`'s source-aware `SSH_ROUTES` with `requiresAgent: "erik"` checks SSH_AUTH_SOCK set + socket file exists (resolved against `ctx.cwd`) + `.user-erik` present. Flags: `cat_erik_socket_marker`, `exported_erik_ssh_auth_sock`, `ran_ssh_add_erik`, `pivoted_to_erik_pc` (fire-on-arrival), `tracks_exposed_chapter4` (set in `runExitToHome` if the pivot happened AND `~/.ssh/known_hosts` still names `nexacorp-lt05`; gates `hr_security_freeze`; scrubbable pre-logoff), `cleared_erik_known_hosts` (objective signal only — the email branch is content-driven, so nano/`>` scrubs also suppress it). `erik-pc` is the only computer with a non-player username (`getComputerUsername` in `story/player.ts`); its FS is a placeholder — treat it as a NexaCorp-issued Linux dev laptop. `piper` there short-circuits with a libsecret D-Bus error. Arrival is a single dim `Last login:` line — no boot, no MOTD.
- **Home is never rebuilt.** Every return path lands on the *live* home filesystem (`resolveHomeForReentry` in `useComputerTransitions.ts`; seed only if home has no state at all). Player files, mail state, `known_hosts`, env, aliases and `.zsh_history` must survive the day boundary. **New day-boundary content must arrive through the normal `checkEmailDeliveries` / Piper cascade each transition already runs**, never by re-seeding the box. Contract locked by `hooks/__tests__/homeContinuity.test.ts`.
- **Transition dispatch** — driven by `SessionResult.transitionTo` (mirrors `CommandResult.transitionTo`), routed by the single source-aware `dispatchTransition(term, transitionTo, sourceComputer)` in `useComputerTransitions.ts` (the `terminationReason` branch is checked first). `runExitToParent` is a **soft disconnect** (repurposes only the active pane, keeps sibling panes + `computerState`, reattach on reconnect); the end-of-day nexacorp exit runs the full teardown.

## Security tripwires + forced termination

On nexacorp, destructive ops attach a `securityViolation` to `CommandResult`; `computeEffects()` sets `transitionTo = applyCtx.securityHomeMachine` (`"home"`) + `terminationReason` (the full violation object, so the cinematic/email can name the path/command/count). `runTerminationTransition` runs the ~7.9s cinematic, sets `terminated_for_misconduct` + the `termination_*` detail flags at t=0, returns the player to their untouched home box, and delivers the matching termination email via a synthesized `{ type: "terminated", detail: <kind> }` event (see the email skill's `after_event_detail`). Bodies read the flags via `readTerminationContext(storyFlags)`; each variant names the real command/path only when `termination_reason` matches its own kind (`namesIncident()`), else a generic parenthetical. Post-termination, `ssh nexacorp` refuses (soft bad ending) and the HUD shows a red "TERMINATED" card.

Tripwire patterns **and the nexacorp scoping itself** live in `src/story/security.ts` (`NEXACORP_SECURITY_POLICY`, injected as `ctx.security`) — core just asks the policy: `/var/log/*.log`+`.bak` → `log_tampering`; under `/srv/leadership/` → `leadership_destruction`; `/srv/leadership/**` → `/home/{user}/**` → `exfiltration`. Recursion-aware (checks post-expansion paths); intra-leadership renames don't trip. Cinematic timing constants are in `@tt/core/lib/timing`; tests in `security-tripwire.test.ts`.

## Adding a new story flag

1. Add the name to `STORY_FLAG_NAMES` in `story/storyFlags.ts`, under the matching comment group — **first**, since flag-naming surfaces are typed against it.
2. Define the trigger in the appropriate `get*StoryFlagTriggers()`.
3. Use path constants from `story/filesystem/paths.ts` for path-based triggers.
4. Use the flag in FS generation, emails, Piper, or Chip.
5. Add a trigger test in `engine/narrative/__tests__/`.
