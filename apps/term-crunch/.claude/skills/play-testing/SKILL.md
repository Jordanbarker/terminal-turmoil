---
name: play-testing
description: "Headless runner for programmatically play-testing term-crunch challenges without a browser, plus a Playwright recipe for browser-driving the real game. Use this skill whenever using or modifying apps/term-crunch/scripts/play.ts or playtest_tracks.ts, manually play-testing term-crunch from the terminal, or verifying challenge/gate/pane behavior in the browser."
---

# Headless Runner (term-crunch)

`apps/term-crunch/scripts/play.ts` exports **`CrunchRunner`** plus an interactive REPL. Unlike termoil's `GameRunner` (which reimplements the browser loop), this is a **thin shim over the real code**: a fake terminal (only `write`/`clear` are ever called) + the real `useGameStore`, driving the real `runLine` from `src/hooks/useTerminal.ts`. So aliases, chained pipelines, `checkCompletion()`, post-commit challenge navigation and `applyTmuxAction` ordering are all exercised for real. Read the class for its API; conventions and traps:

- **No duplicated state** — read everything from `runner.store` (`useGameStore.getState()`): `stepIndex`, `challengeIndex`, `activeCategory`, `completed`/`awaitingContinue` (use `isGradeGateUp`), `bestTimes`, `reviewStats`, `windows`. `runner.challenge` resolves the current challenge through the active **category** (never `CHALLENGES[challengeIndex]` — see the `challenges` skill's index trap).
- `run(line)` is async and returns `{ output, rawOutput, startSession }`. Navigation helpers (`goto`, `track`) go through `run`, so they exercise the real meta commands; `gotoId(id)` is the direct store jump for test setup.
- `grade(1-4 | Grade)` answers the completion gate (`continueToNext`), returning false when no gate is up. Grading is what advances to the next challenge.
- Scripts import `./localStorageStub` **before** the store so persist neither warns (`--localstorage-file`) nor writes a real file. Keep that import first if you add a script.

**Two limitations to plan around:**
- **Keyboard chords are bypassed.** Prefix chords and `~/.tmux.conf` bindings live in the React `useTabManager` hook, so pane/window play runs through the store actions those chords call: `split`, `killPane`, `focus`/`cyclePane`/`focusPaneAt`, `resize`, `newWindow`, `cycleWindow`, `renameWindow`. `resize(dir, steps)` nudges by `MAX_NUDGE_RATIO` per step; the real chord derives its delta from live xterm cell geometry. Copy mode isn't reachable at all — for a copy-mode challenge, drive the observable outcome (e.g. the `mkdir` that spends the yanked token) and verify the yank itself in the browser.
- **Editor/pager sessions can't be driven.** vim/nano/less return a `SessionToStart` that the React layer instantiates; `run()` surfaces it and stops. `writeFile(path, content)` is the editor stand-in when a predicate only reads the saved file (that's how `git-rebase`'s conflict resolution is played).

## Track playtest

`scripts/playtest_tracks.ts` (`npm -w @tt/term-crunch run playtest`, also in the root `npm run playtest` / `npm run check` gate) plays **every** registry challenge end to end with a fresh runner each: asserts it loads on step 1 (a predicate satisfied at load is a bug), plays the declared solution, then asserts the gate rose, a best time was recorded, grading fed `reviewStats`, and the grade handed over to the next challenge. Solutions live in `SOLUTIONS` keyed by challenge id — a command string or a function driving the runner. **Every new challenge needs an entry**, or a `SKIPPED` entry with a reason (the 6 vim challenges are skipped: editor keystrokes). A challenge with neither fails, so coverage can't silently lapse.

This complements `src/__tests__/challenges.test.ts`, which pokes predicates with hand-built snapshots; the playtest drives the real pipeline + store + gate.

## Browser play-testing (Playwright)

The headless runner has no chord layer, no copy mode, no editor sessions and no React, so keybindings, the `ChallengePanel` readouts, cheat sheets and the Settings modal are browser-only. Playwright is a **root devDependency (1.61.0)** — use it from the repo root, no scratch install.

### Setup

- **Dev server:** term-crunch is on **:3001** under the full `npm run dev` (termoil takes 3000, landing page 8080), or **:3000** via `npm run dev:crunch` alone. Check `curl -s localhost:3001` before starting another.
- Fresh context = empty localStorage (key `term-crunch-progress`, holding only `bestTimes`/`reviewStats`/`activeCategory`/`zshrc`/`tmuxConf`) → boot lands directly in challenge 1. **No nano tutorial, no transitions, no `cheat`** (that's termoil). Navigate with the terminal meta commands `goto N` / `track <id>` / `next` / `prev` / `review`, or the panel dropdowns.
- Player is `player@crunch`, home `/home/player`.

### Game-side facts the driver must know

- **The grade gate freezes terminal input.** On completion the pane stops accepting typed input until a grade key (`1`-`4`, Enter = Good) is pressed — a driver that keeps typing will hang. Watch for the gate, press a grade, then continue.
- Every challenge starts attached to tmux session `"0"`; while detached (`tmux detach` / `<prefix> d`) the status bar, dividers and chords are gone and `checkCompletion` is skipped except for `checkWhileDetached` challenges.
- The per-challenge command allowlist is real: an out-of-allowlist command reports as unavailable, and `help` lists only the permitted set.

### Driving xterm.js

Identical to termoil (that half of its skill ports verbatim): DOM renderer, so text reads from `.xterm-rows` innerText; **panes are absolutely-positioned children of the `.isolate` wrapper, non-active windows are `display:none`, the active pane has a non-`none` `style.outline`**; real-mouse-click the visible `.xterm-rows` before `keyboard.type`; React needs real Playwright clicks (not `dispatchEvent`); match output against the **tail**, not the whole scrollback; poll with generous timeouts rather than fixed sleeps.

Prefix is **Ctrl+Space** by default (from `~/.tmux.conf`): `keyboard.down('Control'); press('Space'); up('Control')`, then the chord key (`|` `-` `o` `x` `c` `n` `p` `1-9` `r` `[` `d`, arrows/`hjkl` focus, `HJKL` resize).

### DOM map

- Layout is **terminal on the left, `ChallengePanel` `<aside>` on the right** (`w-[420px]`). The panel has **no data attributes — select by text**: the challenge title, `CURRENT`/`TARGET` schematic headings, the brief, the step instruction, the hint controls, `Restart`, `Settings`.
- Window tab bar is the shared `TmuxStatusBar` (same labels as termoil: `1:crunch:~ *`, `(n)` pane count).
- The completion gate and the end-of-track banner render in the panel/terminal as text — assert on the grade prompt text, not a selector.

Screenshot after each step: the schematic readouts are the reviewer's evidence that a layout matched for the right reason.
