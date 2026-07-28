# Deferred Backlog

Known gaps and accepted inaccuracies, recorded so they are decisions rather than
surprises. None of it soft-locks the game or fails a playtest.

**Source of truth = source files.** This list is derived and can drift. Re-verify
before acting on a line. Items are one-liners on purpose; where the reasoning is
long-lived it belongs in a code comment next to the code, not here.

Fix an item when a player can actually hit it, or when a story beat starts
depending on it. Otherwise leave it.

## Shell

- `cat a b c` joins with extra blank lines and a trailing newline (blank-line/EOF handling).
- A trailing `;` is a parse error (`zsh: parse error near ';'`); real zsh accepts it.
- Quoted redirect targets unsupported: `echo hi > "out q.txt"` is a parse error.
- No `<` input redirection; `<` is taken as a file operand.
- `--` end-of-flags is unsupported (`cat -- f` → "unrecognized option '--'"). Flags-anywhere itself works.
- Alias expansion does not run on pipeline stages after the first: `echo hi | g` → command not found.
- `head -n5` (attached flag value) is read as a filename; only `head -n 5` works. Bare `-` stdin operands do work.
- Backslash escapes are not escapes: `echo a\ b` prints `a\ b` literally.
- `~` only expands in path operands, not everywhere: `echo ~` prints `~`.
- Usage/error exit codes are 0 where a real tool would be non-zero: `ssh` unreachable host (should be 255), `mail`, `file`, `nano`, and `save`/`load`/`cheat` usage errors.
- `history` self-listing and count semantics differ from zsh.
- `diff` prints an invented format (no `@@` hunks, no line counts).
- Redirects on non-final pipeline stages are not honoured (only the `2>` token is correctly stripped).
- `&` is literal: `echo done &` prints `done &`. No job control.
- `> $VAR` with an unset var creates a file literally named `$VAR` instead of erroring.
- Glob-produced `-flag` tokens hit strict `flagValidation`: a file named `-la.txt` makes `ls *.txt` fail. Real-shell-faithful but harsh.
- term-crunch: a glob nomatch aborts the segment before the availability policy speaks, so the allowlist message never appears.
- `$1` outside a script is literal (interactive shells have no positional args).
- `${}` expands to empty; zsh raises a bad-substitution error.
- `play.ts` still hand-rolls the chain/pipe loop instead of `@tt/core`'s `runPipeline`. Blocked on sync callers (`run()` cannot be async) plus `ApplySegmentOutcome` needing a `newFs` channel. Adopting it would also fix `useTerminal`'s double-`setComputerFs` quirk. Reasoning is in the comment at `apps/termoil/scripts/play.ts:197`.

## SQL (Snowflake engine)

- Unknown identifiers evaluate to NULL instead of raising.
- `SPLIT_PART` is 0-indexed; real Snowflake is 1-indexed.
- `LEFT` / `RIGHT` are unparseable.
- Quoted identifiers are not case-sensitive the way Snowflake makes them.
- `AVG` returns raw floats with no Snowflake scale/rounding.
- Window post-sort (`window_exec.ts`) re-sorts the whole result by the *first* window's ORDER BY, ignoring PARTITION BY and clobbering the query's own ORDER BY/LIMIT. It is a hack compensating for window aliases evaluating to `null` during the plan sort.
- `NOT IN` does not implement three-valued logic: a NULL in the list should yield no rows.
- A multi-column `IN (subquery)` silently compares column 1 only.
- Duplicate select aliases do not raise an ambiguous-column error.
- `CAMPAIGN_METRICS` dates are stored as strings and are absent from `DATE_COLUMNS` (`apps/termoil/src/story/data/snowflake/initial_data.ts:8`).
- `EXTRACT(part FROM expr)` does not parse at all ("Expected RPAREN but got FROM"); only the `YEAR(x)`/`MONTH(x)`/`DAY(x)` forms exist.
- `YEAR`/`MONTH`/`DAY` read UTC-midnight dates with local getters: off by one in negative-offset timezones.
- Correlated-subquery evaluation is still O(n^2) past the memoized keys.

## Git

- No `merge`, no `^` / `~N~M` revision chains, no detached-HEAD checkout of a commit.
- Diffs have no rename detection and no `\ No newline at end of file` marker.

## dbt

- `dbt test --select` is rejected.
- Failed models render as `[SELECT undefined ...]`.
- Header grammar in the run summary is off.

## Mail / story

- Message-less piper deliveries make their reply prompts read as non-sequiturs; they need lead-in lines.
- `readEmailIds` is not persisted; `buildFs` defaults it to "everything delivered was read", so heal/read-state is approximate.
- The day-2 nexacorp rebuild marks unread teammate welcome mail as read.
- `DAY2_PIPELINE_FIXED`'s repo state does not reflect its own flags (flags say pulled/branched/fixed/pushed; the tree is a fresh clone on `main`). Deliberate, with the reasoning at `apps/termoil/src/story/checkpoints.ts:309`.
- `listSaveSlots` does not filter on `SAVE_FORMAT_VERSION`, so version-mismatched slots are listed as loadable with stale labels even though `loadGame` refuses them.
- Slot labels are stored as `Save slot-2` (`gameStore.ts:612`) while the UI renders `Slot 2` via `formatSlotName`.
- erik-pc mail UX is unpolished.
- `chip` and `piper` silently ignore positional arguments.
- `piper | cat` swallows the session and prints nothing.
- Dana's CSV quest has no comparison artifact to check the answer against.
- `journalctl` / `systemctl` appear in emails, logs and dotfiles but are not implemented commands.
- `DBT_PROFILES_DIR` is exported on nexacorp, where dbt is not available.
- `/srv/leadership` is `ls`-denied but `rm -rf`-able (the tripwire fires, but permissions are inconsistent).
- The `incrementalLines` path drops `stderr`. Unreachable today: nothing emits both.
- The headless REPL double-prints "You have new mail" (`apps/termoil/scripts/play.ts:830` and `:1066`).
