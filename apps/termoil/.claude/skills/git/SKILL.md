---
name: git
description: "How the virtual git CLI works — repo state stored in .git/, commit graph, branches, refs, remotes, and the dispatcher in commands/builtins/git.ts. Use this skill whenever adding or modifying a git subcommand, working with the commit graph or remotes, touching files under src/engine/git/, or wiring up a new git-related story trigger (e.g. git_clone_*, git_pull_*, git_push)."
---

# Git System

A virtual git CLI storing all state in the player's VirtualFS under `.git/` — same as real git, so `cat .git/HEAD` / `ls .git/refs/heads` match what a real repo shows (part of the narrative-realism rule). Used heavily in the Day 2 "Fix the Broken Pipeline" questline (clone → pull → checkout -b → commit → push). `DEVCONTAINER_ONLY`.

Code map (`src/engine/git/`): `types.ts` (all types — read them there), `repo.ts` (pure functions for every subcommand, `(fs, root, ...args) => {fs, output, error?, triggerEvents?}`; reads via `readHead`/`readIndex`/`readCommit`/`readRepo`, writes via `writeOrFail`/`mkdirOrFail`/`removeOrFail`/`writeRefOrFail`), `remotes.ts` (`REMOTE_REPOS` registry), `output.ts` (formatters). Dispatcher `commands/builtins/git.ts`. On-disk layout mirrors real git (`HEAD`, `config`, `index.json`, `stash.json`, `rebase-state.json`, `objects/<hash>.json`, `refs/heads/<branch>`).

**Tree-snapshot model:** every commit stores the *complete* file tree, not a diff; diffs are computed on demand by walking parent→child. Trades storage for simplicity — fine at this scale.

**Line counting:** anything reporting insertions/deletions (commit stats, unified-diff hunks) must go through `contentLines` + `countLineChanges` in `repo.ts` — raw `split("\n")` counts an empty file as one line and a trailing newline as an extra one, which is how the old approximate stats drifted from real git. `diffTrees` (still used by `pull --stat`) is the remaining approximation.

## Dispatcher (`commands/builtins/git.ts`)

Reads positional args (skipping global flags), treats the first as subcommand, special-cases `init`/`clone` (no existing repo needed), else `findRepoRoot(fs, cwd)` walks up for `.git/`; a `switch` dispatches to the matching `gitX(...)`. Every result becomes `{ fs, output, triggerEvents? }` → `CommandResult`. Unknown subcommand → `error: unknown subcommand: ...` (exit 1). **The supported subcommand set is the `switch` in `git.ts` — read it there.** Behavior traps worth knowing:

- **`add`** — pathspecs and `.` resolve against **cwd**; `-A`/`--all` stage the whole repo regardless of cwd. Index keys stay root-relative.
- **`commit`** — takes a `timestamp` arg; the dispatcher passes `gameNowFor(...).getTime()` so `git log` Date headers agree with `date` (UTC `+0000`).
- **`status`** — fills `tracking = {remoteRef, ahead, behind}` and renders the "behind/ahead/up to date/diverged" line **only when the remote-tracking ref exists**; short format `-s` gets no line.
- **`rebase`** — replays the branch's commits onto `<upstream>` (file-level 3-way merge); on overlap writes whole-file conflict markers, persists `GitRebaseState`, stops. HEAD stays on the branch (no detach) — `rebase-state.json` is the source of truth. `--continue` needs conflict files staged AND marker-free. No `merge`/`--onto`/interactive todo.
- **`reset`** — path form (`git reset [<ref>] [<paths>]`, no mode flag) only edits the index; commit form supports `--soft`/`--mixed` (default)/`--hard`. Revisions resolve via `resolveRef` (branch, hash, `HEAD`, single `~N` suffix — no `^`/`~N~M` chains). Refused mid-rebase; `--hard` reuses `writeTreeToWorkingDir` so untracked files survive but staged-new files are removed.
- **`restore`** — `--staged` shares `unstagePaths` with `git reset <paths>`; the worktree form rewrites each file from `index.staged` if present, else HEAD. Silent on success. `git checkout -- <file>` and bare `git checkout <file>` (when no branch has that name) route to the same function; `git checkout <rev> -- <file>` is refused (restoring from a revision isn't modeled).
- **`diff` / `log`** — both take revisions and pathspecs through `splitRevsAndPaths` (repo.ts): `--` is authoritative, else each arg that `resolveRef`s is a revision and the rest are paths, with an unmatchable arg becoming the `ambiguous argument` fatal. `diff` accepts `<rev>`, `<rev1>..<rev2>`, and `<rev1> <rev2>`; `log` accepts one revision and `-n N`/`-N`. **`git diff` never reports untracked files** (so its exit code is a real "are there tracked changes" signal). No `git status <pathspec>`.
- **`stash`** — one-deep stack; `-u`/`--include-untracked` folds untracked files in and `pop` restores them generically.
- **`pull`** — two FF paths: (1) if `refs/remotes/origin/<branch>` exists and local is a strict ancestor, FF to the tracking tip (guarding uncommitted changes); (2) else `getUpdates(storyFlags, localHead)` fetches story-driven commits. **Termoil's story pulls use path (2)** — `gitClone` seeds local and tracking refs equal and `getUpdates` advances both together, so path (1) never fires. `--ff-only` is tolerated.
- **`branch <name>`** / `checkout -b` / `switch -c` all emit `git_checkout_b`.

**Per-subcommand flag validation:** `git` calls `skipFlagValidation("git")` and validates in-handler. `GIT_SUBCOMMAND_FLAGS` (top of `git.ts`) maps each subcommand to its `KnownFlags`; the handler calls `rejectUnknownFlags("git", flags, known, {style: "git"})` (git-style errors, exit 129). **Without a `GIT_SUBCOMMAND_FLAGS` entry, validation is silently bypassed for that subcommand.**

## Remotes (`remotes.ts`)

`REMOTE_REPOS` is the cloneable-repo registry (currently one: `nexacorp-analytics`, hand-built by `buildAnalyticsCommits()` to look authentic; its `_marts__models.yml` goes through several versions so `git log -p`/`diff` produce realistic output). `getUpdates(storyFlags, localHead)` is the hook for **story-driven pulls** — the Day 2 `git pull origin main` after `ssh_day2` returns Auri's broken commit. Add story-gated remote commits here, not in `repo.ts`. `buildSimpleRemote(...)` is exported for tests.

## Story integration (stable contract)

These `command_executed` details are emitted from `repo.ts` and consumed by `getDevcontainerStoryFlagTriggers()` in `story/storyFlags.ts`. They are the stable contract between this module and the story — change them carefully.

| Event detail | Emitted by | Wires into |
|---|---|---|
| `git_clone_<repoName>` | `gitClone` | `dbt_project_cloned` (when `nexacorp-analytics`) |
| `git_pull_origin_<branch>` | `gitPull` | `pulled_day2_updates` (gated on `ssh_day2`) |
| `git_checkout_b` | `checkout -b` / `switch -c` / `branch <name>` | `created_fix_branch` (gated on `dbt_test_failed_day2`) |
| `git_push_origin_<branch>` | `gitPush` | `pushed_fix_branch` (`detailPrefix`, `detailNot: git_push_origin_main`, gated on `fixed_campaign_model`) |
| `git_push` | `gitPush` | (unused; the branch-less detail can't tell a fix-branch push from a main push) |

Prefer a generic detail + `requiredFlags` gating over per-branch details **unless which ref was acted on is the objective** — "push the fix branch" is exactly that case, so it matches the per-branch detail by prefix and excludes main (the branch name itself is the player's).

**Status hints must name subcommands this engine has** — they are the primary discovery path for `restore`, so `output.ts`'s hints and the `git.ts` switch have to move together.

**Push events fire on a no-op re-push too.** `gitPush`'s "Everything up-to-date" branch returns the same `triggerEvents` as a real push, so a flag whose gate wasn't satisfied on the first push can still be earned. Story flags are set-to-true, so duplicates are harmless — keep it that way if you add a push-driven flag.

**`gitPush` pushes the named ref, not HEAD.** `git push origin <branch>` resolves `refs/heads/<branch>`; a branch with no local ref is `error: src refspec <branch> does not match any` on stderr with exit 1, and no remote ref is written. Reading HEAD instead silently published the checked-out branch's commits under someone else's name.

## Adding

**A subcommand:** implement a pure function in `repo.ts` (use the existing helpers, don't touch VFS directly) → add a `case` in `git.ts`, parsing flags **after** stripping the subcommand → **add its flag set to `GIT_SUBCOMMAND_FLAGS`** → emit `triggerEvents` with a stable `git_<verb>` detail if it drives a story flag → test the pure function in `__tests__/repo.test.ts` → update `HELP_TEXTS.git` if it should appear in `--help`.

**A cloneable remote:** add a `REMOTE_REPOS` entry (`files` via `flattenTree(...)`, `commits`, `defaultBranch`) → build realistic history (see `buildAnalyticsCommits`) → implement `getUpdates` if pull should depend on story state (return the *new* commits in order) → wire the clone event into `getDevcontainerStoryFlagTriggers()` with `git_clone_<repoName>`.
