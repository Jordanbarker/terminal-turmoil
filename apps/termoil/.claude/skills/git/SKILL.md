---
name: git
description: "How the virtual git CLI works — repo state stored in .git/, commit graph, branches, refs, remotes, and the dispatcher in commands/builtins/git.ts. Use this skill whenever adding or modifying a git subcommand, working with the commit graph or remotes, touching files under src/engine/git/, or wiring up a new git-related story trigger (e.g. git_clone_*, git_pull_*, git_push)."
---

# Git System

A virtual git CLI storing all state in the player's VirtualFS under `.git/` — same as real git, so `cat .git/HEAD` / `ls .git/refs/heads` match what a real repo shows (part of the narrative-realism rule). Used heavily in the Day 2 "Fix the Broken Pipeline" questline (clone → pull → checkout -b → commit → push). `DEVCONTAINER_ONLY`.

Code map (`src/engine/git/`): `types.ts` (all types — read them there), `repo.ts` (pure functions for every subcommand, `(fs, root, ...args) => {fs, output, error?, triggerEvents?}`; reads via `readHead`/`readIndex`/`readCommit`/`readRepo`, writes via `writeOrFail`/`mkdirOrFail`/`removeOrFail`/`writeRefOrFail`), `remotes.ts` (`REMOTE_REPOS` registry), `output.ts` (formatters). Dispatcher `commands/builtins/git.ts`. On-disk layout mirrors real git (`HEAD`, `config`, `index.json`, `stash.json`, `rebase-state.json`, `merge-state.json`, `objects/<hash>.json`, `refs/heads/<branch>`).

**Tree-snapshot model:** every commit stores the *complete* file tree, not a diff; diffs are computed on demand by walking parent→child. Trades storage for simplicity — fine at this scale.

**First-parent by default.** `GitCommit.parent2` is optional and set only by merges, so every existing `.parent` reader stays valid and old saves need no migration. Only `parentsOf` / `ancestorSet` / `^2` look at it: `git log`, `~N`, pull's ff check and rebase are deliberately first-parent. Reachability questions (merge-base, `branch -d` safety, "Already up to date") must go through `ancestorSet`, which follows both parents — a hand-rolled `.parent` loop silently ignores merged history.

**Line counting:** anything reporting insertions/deletions (commit stats, unified-diff hunks) must go through `contentLines` + `countLineChanges` in `repo.ts` — raw `split("\n")` counts an empty file as one line and a trailing newline as an extra one, which is how the old approximate stats drifted from real git. `diffTrees` (behind the shared `formatDiffStat`, used by `pull` and `merge`) is the remaining approximation.

## Dispatcher (`commands/builtins/git.ts`)

Reads positional args (skipping global flags), treats the first as subcommand, special-cases `init`/`clone` (no existing repo needed), else `findRepoRoot(fs, cwd)` walks up for `.git/`; a `switch` dispatches to the matching `gitX(...)`. Every result becomes `{ fs, output, triggerEvents? }` → `CommandResult`. Unknown subcommand → `git: '<sub>' is not a git command. See 'git help'.` (exit 1). **The supported subcommand set is the `switch` in `git.ts` — read it there.** Behavior traps worth knowing:

- **`add`** — pathspecs and `.` resolve against **cwd**; `-A`/`--all` stage the whole repo regardless of cwd. Index keys stay root-relative.
- **`commit`** — takes a `timestamp` arg; the dispatcher passes `gameNowFor(...).getTime()` so `git log` Date headers agree with `date` (UTC `+0000`).
- **`status`** — fills `tracking = {remoteRef, ahead, behind}` and renders the "behind/ahead/up to date/diverged" line **only when the remote-tracking ref exists**; short format `-s` gets no line. Takes pathspecs (cwd-relative, `--` optional) that narrow the staged/unstaged/untracked/unmerged lists but never the branch line; unlike diff/log an unmatched pathspec is **not** fatal, it just yields empty sections.
- **`rebase`** — replays the branch's commits onto `<upstream>` (resolved through `resolveRef`, so `origin/<branch>` and hashes work, not just local branches; file-level 3-way merge); on overlap writes whole-file conflict markers, persists `GitRebaseState`, stops. HEAD stays on the branch (no detach) — `rebase-state.json` is the source of truth. `--continue` needs conflict files staged AND marker-free. No `--onto`/interactive todo.
- **`merge`** — ff when HEAD is an ancestor of the target, else a real merge commit with `parent2` (or, under `--ff-only`, the `NOT_FAST_FORWARD` refusal `pull --ff-only` shares). Conflicts persist `GitMergeState` (`.git/merge-state.json`) and stop with **exit 1 on stdout**, not stderr. HEAD does not move until the merge is concluded by `git commit -m` (the player's message) or `git merge --continue` (the prepared `Merge branch 'x'`); `--abort` restores HEAD's tree. The conclusion **rebuilds** the merged tree via `mergeTrees` and overlays the staged resolutions — the auto-merged files were never staged, so committing the index alone would silently drop them. Uses `mergeTrees`, not rebase's `mergeCommitOnto` (which assumes "theirs" is a replayed commit whose own parent is the base). Lands its result through `writeMergeToWorkingDir`, **not** `writeTreeToWorkingDir`: only paths the merge changes relative to HEAD are written, so uncommitted edits to files the merge leaves alone survive (`overwriteCollisions` exempts them from the refusal for the same reason — writing the whole tree would clobber exactly what it just allowed).
- **`reset`** — path form (`git reset [<ref>] [<paths>]`, no mode flag) only edits the index; commit form supports `--soft`/`--mixed` (default)/`--hard`. Refused mid-rebase and mid-merge; `--hard` reuses `writeTreeToWorkingDir` so untracked files survive but staged-new files are removed.
- **Revisions (`resolveRef`)** — one choke point for `log`/`diff`/`reset`/`checkout`/`merge`. Grammar is `<base>` + any number of `^`/`~N` steps: base is `HEAD`, a local branch, a remote-tracking name (`origin/main`), an exact hash, or a **unique 4+-char abbreviation**; `~N` walks first parents, `^`/`^1` is the first parent, `^2` a merge's second, `^0` itself. Anything missing or ambiguous → `null`. `splitRevsAndPaths` resolves undivided args with `allowPrefix: false` **first**, then prefers a known path, then retries loosely — otherwise a file named `cafe` becomes a revision as soon as some object's hash starts with it.
- **Detached HEAD** — `checkout <rev>` writes a raw hash to `.git/HEAD` (`checkout HEAD` is the one exception: a no-op, as in real git, so it can't detach a branch onto its own tip) (`Note: switching to …` + `HEAD is now at …`) and emits `git_checkout_detached`, never `git_checkout_b`. `git switch` passes `allowDetach: false` unless `-d`/`--detach`, so it refuses with `fatal: a branch is expected, got commit '<x>'`. Commit/reset/merge on a detached HEAD move the raw ref via `moveHeadTo`; `status` reports `detachedAt`.
- **Mid-merge refusals** — `MERGE_IN_PROGRESS` (`fatal: You have not concluded your merge (MERGE_HEAD exists).`) is exported from `repo.ts` and returned by `reset`/`rebase`/`checkout`/`stash`/`pull`/`commit --amend`. A new state-mutating subcommand should add the same guard.
- **`restore`** — `--staged` shares `unstagePaths` with `git reset <paths>`; the worktree form rewrites each file from `index.staged` if present, else HEAD. Silent on success. `git checkout -- <file>` and bare `git checkout <file>` (when no branch has that name) route to the same function; `git checkout <rev> -- <file>` is refused (restoring from a revision isn't modeled).
- **`diff` / `log`** — both take revisions and pathspecs through `splitRevsAndPaths` (repo.ts): `--` is authoritative, else each arg that resolves is a revision and the rest are paths, with an unmatchable arg becoming the `ambiguous argument` fatal. `diff` accepts `<rev>`, `<rev1>..<rev2>`, and `<rev1> <rev2>`; `log` accepts one revision and `-n N`/`-N`. **`git diff` never reports untracked files** (so its exit code is a real "are there tracked changes" signal). `status` takes pathspecs too, but not through `splitRevsAndPaths` — it accepts no revisions.
- **`stash`** — one-deep stack; `-u`/`--include-untracked` folds untracked files in and `pop` restores them generically.
- **`pull`** — two FF paths: (1) if `refs/remotes/origin/<branch>` exists and local is a strict ancestor, FF to the tracking tip (guarding uncommitted changes); (2) else `getUpdates(storyFlags, localHead)` fetches story-driven commits. **Termoil's story pulls use path (2)** — `gitClone` seeds local and tracking refs equal and `getUpdates` advances both together, so path (1) never fires. `--ff-only` refuses a diverged branch with `NOT_FAST_FORWARD`; `--rebase` delegates to `gitRebase` onto `origin/<branch>` (the two are rejected together in `git.ts`). Both still emit `git_pull_origin_<branch>`.
- **`fetch`** — lives **only** in `git.ts`, no `repo.ts` function: remote-tracking refs are seeded statically, so with a remote configured it is a silent no-op (exit 0, no output, no trigger events) and without one it is `fatal: 'origin' does not appear to be a git repository`. Every "pull without a merge commit" route (`fetch` + `merge --ff-only`, `fetch` + `rebase origin/<b>`, `pull --rebase`) therefore lands on the same state as `pull --ff-only`.
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
| `git_merge_<rev>` | `gitMerge` (ff + clean) and `gitCommit`/`gitMergeContinue` (conflict conclusion) | (unused) — `<rev>` is the player's spelling, unsanitized like `git_push_origin_<branch>`. A conflicted stop emits **nothing**; only a completed merge counts. |
| `git_checkout_detached` | `checkout <rev>` / `switch --detach` | (unused) — deliberately **not** `git_checkout_b`, so detaching can't satisfy "create a fix branch". |

Prefer a generic detail + `requiredFlags` gating over per-branch details **unless which ref was acted on is the objective** — "push the fix branch" is exactly that case, so it matches the per-branch detail by prefix and excludes main (the branch name itself is the player's).

**Status hints must name subcommands this engine has** — they are the primary discovery path for `restore`, so `output.ts`'s hints and the `git.ts` switch have to move together.

**Push events fire on a no-op re-push too.** `gitPush`'s "Everything up-to-date" branch returns the same `triggerEvents` as a real push, so a flag whose gate wasn't satisfied on the first push can still be earned. Story flags are set-to-true, so duplicates are harmless — keep it that way if you add a push-driven flag.

**`gitPush` pushes the named ref, not HEAD.** `git push origin <branch>` resolves `refs/heads/<branch>`; a branch with no local ref is `error: src refspec <branch> does not match any` on stderr with exit 1, and no remote ref is written. Reading HEAD instead silently published the checked-out branch's commits under someone else's name.

## Adding

**A subcommand:** implement a pure function in `repo.ts` (use the existing helpers, don't touch VFS directly) → add a `case` in `git.ts`, parsing flags **after** stripping the subcommand → **add its flag set to `GIT_SUBCOMMAND_FLAGS`** → add the name to `SUBCOMMAND_MAP.git` in `@tt/core/suggestions/suggest` so TAB/ghost-text offer it → guard it with `MERGE_IN_PROGRESS`/rebase state if it mutates repo state → emit `triggerEvents` with a stable `git_<verb>` detail if it drives a story flag → test the pure function in `__tests__/repo.test.ts` (or a focused file like `merge.test.ts`) → update `HELP_TEXTS.git` if it should appear in `--help`.

**A cloneable remote:** add a `REMOTE_REPOS` entry (`files` via `flattenTree(...)`, `commits`, `defaultBranch`) → build realistic history (see `buildAnalyticsCommits`) → implement `getUpdates` if pull should depend on story state (return the *new* commits in order) → wire the clone event into `getDevcontainerStoryFlagTriggers()` with `git_clone_<repoName>`.
