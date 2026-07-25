---
name: play-testing
description: "Headless runner for programmatically play-testing term-crunch challenges without a browser, plus a Playwright recipe for browser-driving the real game. Use this skill whenever using or modifying apps/term-crunch/scripts/play.ts or playtest_tracks.ts, manually play-testing term-crunch from the terminal, or verifying challenge/gate/pane behavior in the browser."
---

# Headless Runner (term-crunch)

`apps/term-crunch/scripts/play.ts` exports **`CrunchRunner`** plus an interactive REPL. Unlike termoil's `GameRunner` (which reimplements the browser loop), this is a **thin shim over the real code**: a fake terminal (only `write`/`clear` are ever called) + the real `useGameStore`, driving the real `runLine` from `src/hooks/useTerminal.ts`. So aliases, chained pipelines, `checkCompletion()`, post-commit challenge navigation and `applyTmuxAction` ordering are all exercised for real. Read the class for its API; conventions and traps:

- **No duplicated state** — read everything from `runner.store` (`useGameStore.getState()`): `stepIndex`, `challengeIndex`, `activeCategory`, `completed`/`awaitingContinue` (use `isGradeGateUp`), `bestTimes`, `reviewStats`, `windows`. `runner.challenge` resolves the current challenge through the active **category** (never `CHALLENGES[challengeIndex]` — see the `challenges` skill's index trap).
- `run(line)` is async and returns `{ output, rawOutput, startSession }`. Navigation helpers (`goto`, `track`) go through `run`, so they exercise the real meta commands; `gotoId(id)` is the direct store jump for test setup.
- `grade(1-4 | Grade)` answers the completion gate (`continueToNext`), returning false when no gate is up. Grading is what advances to the next challenge. Mastery awards are echoed (with the running `masteryLine()`, also a `:status` row) by a store subscription installed in the runner that watches `lastAwards` (written in the same `set()` as `mastery`, so one transition carries labels + new total), since the award display is browser-only and MP lands at completion time (inside `checkCompletion`), not at the grade.
- Scripts import `./localStorageStub` **before** the store so persist neither warns (`--localstorage-file`) nor writes a real file. Keep that import first if you add a script.

**Two limitations to plan around:**
- **Keyboard chords are bypassed.** Prefix chords and `~/.tmux.conf` bindings live in the React `useTabManager` hook, so pane/window play runs through the store actions those chords call: `split`, `killPane`, `focus`/`cyclePane`/`focusPaneAt`, `resize`, `newWindow`, `cycleWindow`, `renameWindow`. `resize(dir, steps)` nudges by `MAX_NUDGE_RATIO` per step; the real chord derives its delta from live xterm cell geometry. Copy mode isn't reachable at all — for a copy-mode challenge, drive the observable outcome (e.g. the `mkdir` that spends the yanked token) and verify the yank itself in the browser.
- **Editor/pager sessions can't be driven.** vim/nano/less return a `SessionToStart` that the React layer instantiates; `run()` surfaces it and stops. `writeFile(path, content)` is the editor stand-in when a predicate only reads the saved file (that's how `git-rebase`'s conflict resolution is played).

## Track playtest

`scripts/playtest_tracks.ts` (`npm -w @tt/term-crunch run playtest`, also in the root `npm run playtest` / `npm run check` gate) plays **every** registry challenge end to end with a fresh runner each: asserts it loads on step 1 (a predicate satisfied at load is a bug), plays the declared solution, then asserts the gate rose, a best time was recorded, grading fed `reviewStats`, and the grade handed over to the next challenge. Solutions live in `SOLUTIONS` keyed by challenge id — a command string or a function driving the runner. **Every new challenge needs an entry**, or a `SKIPPED` entry with a reason (the 6 vim challenges are skipped: editor keystrokes). A challenge with neither fails, so coverage can't silently lapse.

This complements `src/__tests__/challenges.test.ts`, which pokes predicates with hand-built snapshots; the playtest drives the real pipeline + store + gate.

## Browser play-testing (Playwright)

The headless runner has no chord layer, no copy mode, no editor sessions and no React, so keybindings, the `ChallengePanel` readouts, cheat sheets and the Settings modal are browser-only. Playwright is a **root devDependency (1.61.0)** — use it from the repo root, no scratch install.

**Two committed harnesses already drive the browser** — extend them instead of writing a throwaway: `npm run screenshot:panes` (`scripts/visual/pane-dividers.mjs`, the divider seams) and `npm run screenshot:mp-reward` (`scripts/visual/mp-reward.mjs`, the MP reward animation). The latter is the pattern to copy for anything *time-dependent*: it seeds a save via `addInitScript` + localStorage (`term-crunch-progress`; the store deep-merges `mastery`, so an mp-only save hydrates) to reach states that would take real play to reach, runs an in-page rAF recorder so single-frame glitches can't hide between screenshots, and re-runs the whole pass under `reducedMotion: "reduce"`.

**When headless passes and the browser fails, suspect the driver before the game.** Replaying the challenge's declared `SOLUTIONS` moves is the fastest discriminator: if that passes in the browser, your driver is what's broken. `SOLUTIONS` (and its `Move` type) are exported from `playtest_tracks.ts` — importing them does not start the playtest — but only the string moves are browser-typeable; function moves drive `CrunchRunner` store actions and must be translated to chords. Most browser-only "bugs" are a chord sent to the wrong pane, a click that never landed, or `innerText` hiding whitespace (all covered below).

### Setup

- **Dev server:** term-crunch is on **:3001** under the full `npm run dev` (termoil takes 3000, landing page 8080), or **:3000** via `npm run dev:crunch` alone. Check `curl -s localhost:3001` before starting another.
- Fresh context = empty localStorage (key `term-crunch-progress`; the persisted-field list lives in the `challenges` skill — don't duplicate it here) → boot lands directly in challenge 1. **No nano tutorial, no transitions, no `cheat`** (that's termoil). Navigate with the terminal meta commands `goto N` / `track <id>` / `next` / `prev` / `review`, or the panel dropdowns.
- Player is `player@crunch`, home `/home/player`.
- **Driving from an ad-hoc script** (rather than the workspace playtests): imports need **absolute** paths; `@tt/core` resolves only with `npx tsx --tsconfig apps/term-crunch/tsconfig.json`; `require`/`import` of `playwright` needs an absolute path into the repo's `node_modules`; and top-level `await` fails under the cjs transform, so wrap the body in an `async main()`. Write such scripts to the session scratchpad, not the repo.

### Game-side facts the driver must know

- **The grade gate freezes terminal input.** On completion the pane stops accepting typed input until a grade key (`1`-`4`, Enter = Good) is pressed — a driver that keeps typing will hang. Watch for the gate, press a grade, then continue. Detection strings below.
- Every challenge starts attached to tmux session `"0"`; while detached (`tmux detach` / `<prefix> d`) the status bar, dividers and chords are gone and `checkCompletion` is skipped except for `checkWhileDetached` challenges.
- The per-challenge command allowlist is real: an out-of-allowlist command reports as unavailable, and `help` lists only the permitted set.

### Driving xterm.js

Identical to termoil (that half of its skill ports verbatim — the driver skeleton lives there). The traps, restated because each one has cost a real investigation:

- **Read per-row `textContent` off `.xterm-rows`, never `innerText`.** `innerText` collapses blank rows, so a stray empty line disappears from your assertion *and* from `cat` output that looks correct. This hid a `vim-reorder` root cause through ~6 rounds. Corollary: `ls -l` byte counts are a cheap invisible-whitespace probe, but a 3-line and a 4-line file can share a byte count, so counts alone never prove content.
- **Coordinate-click the `.xterm-screen` bounding-box centre to focus**, not a locator click on `.xterm-rows` — `.xterm-screen` intercepts pointer events, so the `.xterm-rows` click never lands and times out after 30s.
- **Panes** are absolutely-positioned children of the `.isolate` wrapper; non-active windows are `display:none`. The active pane's `style.outline` (`1px solid #e6b450`) is **only set when 2+ panes are visible** — with a single pane every outline is `"none"`, so an empty outline doesn't mean your selector is wrong. `PaneDividers` gold seams (`bg-[#e6b450]` vs `bg-[#3d4751]`) are the independent second signal.
- **Chords are pane-relative.** `nearestResizableSplit` resolves from the *focused* pane, so 25 resize chords sent while the wrong pane is focused change nothing — and that looks exactly like a broken predicate. Click the target pane first and confirm focus moved.
- **Clipboard:** Playwright's synthetic `Control+V` does not paste in Chromium — dispatch a real `ClipboardEvent` on `.xterm-helper-textarea`. Grant `clipboard-read`/`clipboard-write` on the context and verify a yank by reading the clipboard back; duplicate scrollback lines make screen-based verification ambiguous.
- **Copy mode has two coordinate systems.** `g` goes to the top of *scrollback*, so once the viewport scrolls a rendered row index is not the cursor's line offset. Don't conflate them.
- React needs real Playwright clicks (not `dispatchEvent`); match output against the **tail**, not the whole scrollback; poll with generous timeouts rather than fixed sleeps.

Prefix is **Ctrl+Space** by default (from `~/.tmux.conf`): `keyboard.down('Control'); press('Space'); up('Control')`, then the chord key (`|` `-` `o` `x` `c` `n` `p` `1-9` `r` `[` `d`, arrows/`hjkl` focus, `HJKL` resize).

### DOM map

- Layout is **terminal on the left, `ChallengePanel` `<aside>` on the right** (`w-[420px]`). The panel has **no data attributes — select by text**: the challenge title, `CURRENT`/`TARGET` schematic headings, the brief, the step instruction, the hint controls, `Restart`, `Settings`.
- Window tab bar is the shared `TmuxStatusBar` (same labels as termoil: `1:crunch:~ *`, `(n)` pane count).
- **Gate detection: match on the full panel text, not its tail.** The mid-track gate and the end-of-track banner render differently and the banner sits *above* the cheat sheet, so tail-matching the panel misses it. Both live in `ChallengePanel.tsx`; the strings to match are `✓ <title> complete!` (mid-track gate header), `Enter = Good` (the `GradeBar`, rendered under both), and `🎉 All … challenges complete. Nicely done.` (end of track).

Screenshot after each step: the schematic readouts are the reviewer's evidence that a layout matched for the right reason.
