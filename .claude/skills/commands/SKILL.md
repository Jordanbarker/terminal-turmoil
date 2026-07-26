---
name: commands
description: "Command parser, registry, pipeline execution, and how to add new commands. This is a SHARED @tt/core engine skill — the generic parser/registry/pipeline lives in packages/core/src/commands and is consumed by both apps/termoil and apps/term-crunch. Use this skill whenever adding a new terminal command, modifying the command parser or pipeline, working on applyResult.ts/computeEffects(), or touching files under the commands engine (resolve bare src/engine/commands/... paths as packages/core/src/commands or apps/termoil/src/engine/commands), except dbt.ts, mail.ts, snow.ts which have their own skills."
---

# Command System

Parses terminal input, dispatches to registered handlers, chains pipelines, and computes side effects — all as pure functions. **Shared `@tt/core` engine** (`packages/core/src/commands`), consumed by both apps.

Code map: `commands/{types,registry,parser,runPipeline,applyResult,flagValidation,redirection,security,devices,scriptInterceptors,envTriggers}.ts` + `builtins/` (one file per command, plus `helpTexts.ts`; `git.ts`/`dbt.ts`/`snow.ts` are core builtins).

**Core registers only story-agnostic commands.** Termoil's own builtins live in `apps/termoil/src/engine/commands/builtins/` and self-register into the same registry from that dir's `index.ts` (which imports core's first): `mail`, `ssh`, `ssh-add`, `coder`, `exit`, `apt`, `chip`, `piper`, `shutdown`, `hostname`, `cheat`, `save`/`load`/`newgame`. Their help text is `apps/termoil/.../builtins/helpTexts.ts`, which re-exports core's map merged with termoil's own entries. `apps/term-crunch/src/__tests__/coreSurface.test.ts` fails if a story command reappears in core. Interactive modes: `session/types.ts` (`ISession`/`SessionResult`), `pager/` (less). Orchestration: the store-agnostic chain/pipe loop is core `runPipeline.ts`; the app hooks are thin wrappers around it — `useTerminal.ts` (context building/effects application), `useCommandLine.ts` (input buffer/history/suggestions), `useComputerTransitions.ts`. Read the type definitions in `commands/types.ts` and `applyResult.ts` directly — they are not mirrored here.

## Parser (`parser.ts`)

`parseInput` (tokenize respecting quotes), `parsePipeline` (split on unquoted `|`), `parseChainedPipeline` (split on `&&`/`||`/`;` first, then each segment's pipeline), plus `splitOnPipe`/`splitOnChainOperators`. Flag parsing: `-x` → `{x:true}`, `-xyz` → three flags, `--flag` → `{flag:true}`. `splitOnPipe` keeps empty segments so `parsePipeline` can reject them as `` parse error near `|' `` (same treatment the chain operators get) rather than silently dropping a stage.

All quote-aware scanning (tokenize, pipe/chain splitting, alias expansion, continuation detection) goes through the private `scanQuoted` visitor helper at the top of `parser.ts` — use it rather than hand-rolling another quote loop. Rules: `'`/`"` toggle unless the other is active, no backslash escaping.

`analyzeIncompleteInput(input)` detects zsh secondary-prompt continuation (unterminated quote, trailing `\`/`|`/`&&`/`||`); `null` = submittable. It has no opinion on trailing `&`/`;` (not continuation in zsh). Consumed by `@tt/core/terminal/lineEditor`'s `LineEditor`, which accumulates physical lines into `pendingLines` and defers submission until the joined input parses clean.

## Suggestions / TAB completion (`@tt/core/suggestions/{suggest,complete}`)

Both the ghost-text suggester and TAB completion resolve filesystem candidates through the single `listMatchingEntries` helper in `suggest.ts`. It applies the visibility rule ls and real zsh use: **hidden entries are only offered when the typed prefix starts with `.`** — an empty or plain prefix must never enumerate dotfiles (they are where the story keeps its secrets). Anything new that lists FS entries for the player goes through that helper rather than `fs.listDirectory` directly.

## Flag validation (`flagValidation.ts`)

The dispatcher rejects unknown flags by default (coreutils-style `<cmd>: invalid option -- 'z'`, exit 2). Each command declares known flags via `setKnownFlags(name, {short, long})` after `register(...)` (`{}` for none). `--help` always short-circuits before validation. Three opt-out cases (call `skipFlagValidation(name)` and validate in-handler):
- **rawArgs-driven** (`find`, `head`, `tail`, `tree`, `tmux`) — the parser shatters `-name`/`-5`/`-L N`/`-s name`, so the handler re-parses `ctx.rawArgs`.
- **Per-subcommand** (`git`) — each subcommand has its own set; validated with `rejectUnknownFlags(..., {style: "git"})` (exit 129).
- **Custom prefix** (`snow`) — `rejectUnknownFlags("snow sql", ...)` so the error reads `snow sql:`.

## Chaining, pipelines, redirection

`&&`/`||`/`;` supported; pipes bind tighter (`cmd1 && cmd2 | cmd3` = `[cmd1] && [cmd2|cmd3]`). `parseChainedPipeline(raw, shell?)` splits chain operators first (consuming `||` before `splitOnPipe` misreads it). Syntax-error wording follows the `shell` param: interactive shell → zsh (`` zsh: parse error near `&&' ``, default); `bash.ts` passes `"bash"` for script lines (exit 2). Unknown commands → `zsh: command not found: <name>` (exit 127) + dimmed `Type 'help'` hint. Execution (`runPipeline.ts`, shared core): `runPipeline(opts)` runs the outer loop over `ChainSegment[]` and the inner per-pipe loop — chain-operator gating, stdin threading (`stripAnsi`-cleaned), trigger-event + security-violation accumulation, FS/mounts accumulation, optional redirection (`opts.redirection`, off in term-crunch) and intermediate `file_read` events (`opts.intermediateFileReadEvents`, termoil-only). App specifics are injected: `buildContext` builds each `CommandContext`, `applySegment` applies effects per segment (termoil: computeEffects + store/story-flag writes, term-crunch: minimal computeEffects) and returns `{newCwd, stopChain, earlyReturn}`; sessions/incremental/transitions (`isChainEarlyReturn`) stop the chain. History append is the shared `appendZshHistory` in `terminal/zshHistory.ts`. Bash scripts (`bash.ts`) still run their own loop over the same primitives, threading the same accumulators through every nesting level (pipelines, `$(...)`, if-bodies, functions) via its `ScriptState`: trigger events, the first `securityViolation`, and `mounts`. Anything a script can produce has to ride that struct out through `executeScript`, or the tripwire/effect is silently lost inside the subshell.

**Redirection (`redirection.ts`)** — zsh-realistic stdout redirect, consumed by `runPipeline.ts`/`bash.ts`/`scripts/play.ts`:
- `extractStdoutRedirect` collects **every** unquoted `>`/`>>` (zsh `multios` — all targets get output) and strips stderr redirects. A target-less `>` sets a `parseError` (exit 1, segment skipped).
- `precheckRedirects` validates targets **before** the pipeline runs (zsh opens redirect files before exec): dir target → `zsh: is a directory:`, missing parent → `zsh: no such file or directory:`. On error nothing executes (no output, no events, no FS change).
- `applyRedirection` writes to every target `stripAnsi`-cleaned (files hold plain text, same as the pipe path), emitting `file_created`/`file_modified` and running the `security.isLogTamperPath(path, machineId)` tripwire per target — the **policy** decides which machine the rules apply to (termoil's `story/security.ts` scopes it to nexacorp); core never compares a machine id to a literal; `>>` append is newline-aware. `VirtualFS.writeFile` refuses to overwrite a directory (so `echo x > some-dir` can't destroy a tree), refuses a file whose owner `w` bit is off, and preserves the existing node's mode/metadata on overwrite — pass its optional `template` node to give a NEWLY created file the source's mode/metadata (`cp`/`mv` do).

## Line splitting (`src/lib/textUtils.ts`)

`splitLines(content)` drops the single trailing empty element a final `\n` produces (`"" → []`). Use it in any line-oriented command (`sort`/`uniq`/`grep`/`head`/`tail` do) instead of bare `content.split("\n")`, which invents a phantom empty line for files ending in a newline.

## FS errors from a builtin (`fsErrors.ts`)

`VirtualFS` errors are worded for its first callers (`cat:`/`mkdir:`/`rm:` prefixes) or are bare (`Permission denied: <path>`), so **no builtin surfaces one verbatim**. Read side: `readFileForCommand(name, absPath, ctx)`. Write side (`writeFile`/`insertNode`/`removeNode`/`setPermissions` failures in `cp`/`mv`/`rm`/`chmod`): `labelFsError(name, error)`. Never hand-roll `.replace("cat:", "head:")`.

Exit-code convention across builtins: **1 = read/write failure** (missing file, permission denied), **2 = usage error** (missing operand, bad flag or flag value, `grep dir` without `-r`). Multi-operand commands collect-and-continue like `cat`: report the bad operand, keep processing the rest, and (for mutating commands — `rm`, `cp -r`, `chmod`) still return the accumulated `newFs` rather than rolling the successful work back.

`chmod -R` is the one walk that mutates the modes it is traversing, so it does its own gate instead of `setPermissions`' (which would re-judge ancestors mid-rewrite): the **named target** goes through `setPermissions`, descendants through the privileged `insertNode`, and a descendant directory is descended into only if the player could already traverse it **or** this same chmod opens it (so `chmod -R 777 /` gets in, `chmod -R 700 /` reports `cannot read directory` and skips).

## Effect computation (`applyResult.ts`)

`computeEffects(result, applyCtx)` is a **pure function** (no terminal/state access) returning `AppliedEffects`. It: builds the event list (always `command_executed`; `readsFiles: true` commands auto-add a `file_read` per file arg — declared via the 5th `register()` param, `grep 'register(' | grep ', true)`); and runs the app-injected `processDeliveries` cascade (story flags, email/piper deliveries) over those events. It names no command and no machine: a security violation routes to `applyCtx.securityHomeMachine` (termoil passes `"home"`; absent => no forced transition), and the "keep processing events instead of early-returning on a transition" case is driven by `CommandResult.sessionExit`, which termoil's `exit` builtin sets — **never** by comparing `parsedCommand` to a name. `ApplyContext`/`AppliedEffects` shapes are in `applyResult.ts` — read them there.

**`GameEvent` vocabulary** (union in `engine/mail/delivery.ts`) — emitters worth knowing: `directory_created` fires for `mkdir`/`cp -r`/`mv` (dest + every nested sub-dir); `directory_removed` for `mv`/`rm -r`; `file_created` vs `file_modified` is decided by `fs.getNode(path)` **before** the write; `file_removed` for `rm`/`mv` source-side (every file under an `rm -r` subtree). The matcher supports `path` (exact) for all events; `file_read`/`file_created`/`file_modified` also support `pathPrefix`.

## Sessions (`session/types.ts`)

`ISession` (`enter`/`handleInput`/optional `canClose`/`resize`) + `SessionResult`. Session kinds: editor (nano or vim; `EditorSessionInfo.editor` indexes the core `session/editorRegistry.ts` id→class map, absent means nano; both builtins share `builtins/editorOpen.ts` for open/validation and the backup.sh trigger, and share `buildEditorExitResult` for exit/story-trigger evaluation; vim lives in `packages/core/src/vim/` with pure grammar/motion/edit modules plus `VimSession`), snow-sql, pythonRepl, prompt, ssh, chip, piper, less. **Alt-screen sessions (editor, piper, less)** are recognized in `useSessionRouter.routeInput`'s `usedAltScreen` check so the post-session prompt writes cleanly; add new alt-screen sessions to that list. **Editor buffer contract:** both `EditorSession` (nano) and `VimSession` treat a single trailing newline as an end-of-line marker, not as a final empty line — it is stripped on load into a private `eol` flag and re-attached by each class's `serialize()`. Every write must go through `serialize()`, never a bare `lines.join("\n")`, or files silently gain/lose their terminating newline and `G`/`p`/`dd` operate on a phantom bottom line. Both apps resolve command aliases to their primary via `getPrimaryName` before gating (termoil in `availabilityPolicy.isAvailable`, term-crunch in its allowlist), so listing `vim` covers `vi` and no alias needs its own gate entry.

## Command availability (`availability.ts`)

`isCommandAvailable(name, computer, storyFlags)` gates access; gate data is in `story/commandGates.ts`. See the **narrative skill** for per-computer gating. Both `execute` and `executeAsync` enforce it (never only one), and `./script` path execution is gated on the **interpreter** that will run it (`python` for `.py`, else `bash`) since the path itself is never an allowlist entry. Anything resolving a command name for the player — `which`/`type`/`command -v`, all three via `resolveCommandPath` — must pass `ctx.storyFlags`, or a flag-gated but unlocked command reads as "not found".

## App-injected seams (core asks, the app answers)

Everything core needs to know about a *particular* game arrives through one of these; none of them may be satisfied by a literal inside `packages/core`. All default to "nothing happens", which is what makes a story-free game (term-crunch) work.

- **`CommandContext.security`** (`security.ts`) — protected paths / tripwires, including the machine scoping (see redirection above).
- **`CommandContext.devices`** (`devices.ts`) — the machine's block devices. `df` reads total size and the Filesystem column from `rootDevice()` (parsing its `size` via `lib/formatSize.parseSize`), so df and lsblk can't disagree.
- **`scriptInterceptors.ts`** — `setScriptInterceptor(fn)`. Consulted by `python foo.py`, `bash foo.py`, and bare `./foo.py` (registry `executePathCommand`) before the file is read; returning a `CommandResult` replaces execution with authored output. Termoil registers `~/scripts/auto_apply.py` from `src/engine/commands/scriptInterceptor.ts`.
- **`envTriggers.ts`** — `setEnvExportTriggers(table)`. `export VAR=value` emits a `command_executed` event when an entry matches by literal `value` or by resolved `path` (relative forms resolve against cwd, as connect(2) would). Termoil's table is `src/story/envTriggers.ts`.
- **`availability.ts` `setAvailabilityPolicy`** and **`help.ts` `registerMetaCommands`** — gating and the cyan meta-command grouping.
- **`suggestions/suggest.ts` `addSubcommandCompletions`** — TAB/ghost-text subcommand words. `SUBCOMMAND_MAP` names only core's commands; an app-owned command registers its own (termoil's `apt.ts` adds `apt: [...]` and the `apt` under `sudo`). The registry guard alone does not catch a leak here, so `coreSurface.test.ts` checks the completion tables too.
- **`builtins/man.ts` `registerManSummaries`** — the terse man NAME line for app builtins (termoil registers `TERMOIL_MAN_SUMMARIES` from its builtins index). Unlisted commands render their bare name.

All of these have a `reset*` counterpart (`resetAvailabilityPolicy`, `resetScriptInterceptor`, `resetEnvExportTriggers`, `resetSubcommandCompletions`) for test isolation.

Both seams registered at module scope are pulled in by termoil's `builtins/index.ts`, so importing that one module gives tests and the app the complete command layer.

## Adding a new command

1. Create `builtins/{name}.ts`: a `CommandHandler` `(args, flags, ctx) => CommandResult` using `ctx.fs/cwd/stdin/...`; `register("name", handler, "desc", HELP_TEXTS.name)` + `setKnownFlags("name", {...})` at the bottom. **Story-coupled command? Put it in the app's builtins dir, not core.**
2. Add the help entry to `HELP_TEXTS` in the `helpTexts.ts` next to it (core's for a core command, `apps/termoil/.../builtins/helpTexts.ts` for a termoil one). `man` reads whatever help text `register()` was given, so an app command gets a man page for free; add a `MAN_SUMMARIES`/`TERMOIL_MAN_SUMMARIES` entry for its NAME line, and `addSubcommandCompletions` if it has subcommands.
3. `import "./name";` in the matching `builtins/index.ts`.
4. Add `__tests__/name.test.ts`.

Look at a neighbouring builtin for the pattern that fits (read-only, FS mutation, piped-input, interactive-session, event-triggering). Design invariants: pure functions (no store access), immutable FS (mutations return `newFs`), engine imports types from `state/types.ts` but never Zustand, always `resolvePath(arg, ctx.cwd, ctx.homeDir)`, colors via `colorize()`/`ansi` from `src/lib/ansi.ts`.

## Block devices and mounts (`lsblk`, `mount`, `umount`)

Tooling in `builtins/{lsblk,mount,umount}.ts`; story-side registry `src/story/blockDevices.ts` (`BLOCK_DEVICES`, each entry optionally `visibleFlag` + `getContents()`). Every computer has a baseline **system disk** via `systemDisk(...)` so `lsblk` always shows a real machine; a `mountpoint?` field marks a static baseline mount (`mount` refuses to re-mount it). `getRootDevice(computer)` is the single source for **both** of `df`'s device and Size columns (`df` has no size table of its own), so a new machine only needs a `systemDisk(...)` entry to report correctly. `mount` wraps children via `dir(basename(mountpath), ...)` so `node.name` matches, refuses non-empty targets, and emits `mounted_usb_drive` only for `/dev/sdb1` at `/mnt/usb`. The `Mounts` registry is per-computer, rides the same accumulator pattern as `fs` (read from `computerState[id].mounts` → `ctx.mounts` → `result.newMounts`, committed once by `useTerminal` via `setComputerMounts`); key via `normalizeMountKey(input, cwd, homeDir)`.
