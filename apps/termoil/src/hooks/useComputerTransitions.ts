import { useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore, buildFs, getActiveLeaf } from "../state/gameStore";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { createChipinfraFilesystem } from "../story/filesystem/chipinfra";
import { checkEmailDeliveries, GameEvent } from "../engine/mail/delivery";
import { seedImmediatePiper, deliverPiperAndCascade } from "../engine/piper/delivery";
import { syncToVirtualFS } from "@tt/core/snowflake/bridge/fs_bridge";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { nexacorpLogo, getSshConnectionSequence, getBootSequence, getHomeBootSequence, getCoderConnectionSequence, getCoderBanner, getHomeWelcome, UNLOCK_BOX, getUpdateNotification, getEndgameCreditsBlock } from "@/lib/ascii";
import {
  BOOT_LINE_INTERVAL_MS,
  SECURITY_ALERT_LINE_INTERVAL_MS,
  SECURITY_DISCONNECT_PAUSE_MS,
  TERMINATION_PRE_BLACKOUT_MS,
  TERMINATION_BLACKOUT_MS,
} from "@tt/core/lib/timing";
import { ComputerId, COMPUTERS } from "../state/types";
import { SecurityViolation, getTerminationAlertLines } from "../story/security";

interface TransitionDeps {
  cwdRef: React.MutableRefObject<string>;
  activeComputerRef: React.MutableRefObject<ComputerId>;
  writePrompt: (term: Terminal) => void;
}

/**
 * A "genuine end-of-day" exit from NexaCorp tears the workday down (work
 * machines removed from computerState, evening deliveries at home). Anything
 * else is a mid-shift logoff and gets a plain ssh-style soft disconnect that
 * preserves tabs and work-machine state. Home itself survives either way.
 *
 * read_end_of_day is set on Day 1 and persists into Day 2, so it alone can't
 * distinguish a Day 2 mid-shift exit: Day 1 ends once read_end_of_day is set
 * (while day1_shutdown is still unset); Day 2 ends with accusation_made.
 */
function isEndOfDayExit(flags: Record<string, string | boolean>): boolean {
  return !!flags.accusation_made || (!!flags.read_end_of_day && !flags.day1_shutdown);
}

/**
 * The home box the player comes back to, at the end of a day or after a forced
 * termination. **Keeps the live filesystem**; it only builds one from seed if
 * the home machine somehow has no state at all.
 *
 * These transitions used to rebuild home wholesale (`createHomeFilesystem` +
 * `seedDeliveredEmails` + `initComputer`), which threw away everything the
 * player had done there: files they created, the read/unread state of their
 * mail, the `sent/` maildir (so an already-answered job offer became answerable
 * again, and declining post-hire spawned a recruiting email), plus every
 * exported env var and alias, since `initComputer` re-derives both from the
 * fresh FS.
 *
 * Nothing in that rebuild was load-bearing. `createHomeFilesystem(username)`
 * takes no story flags and has no per-day content, so a rebuild is byte-for-byte
 * the Day 1 seed, and the re-seed step could only ever restore mail the live FS
 * already had (email delivery is computer-scoped — see `processDeliveries` — so
 * home mail is only ever delivered while the player is at home). New evening /
 * overnight mail still arrives the normal way: each transition runs its own
 * `checkEmailDeliveries` pass after this.
 *
 * `known_hosts` no longer needs its bespoke copy-forward either: it is just
 * another file on a filesystem that now survives.
 *
 * Exported for tests: the transitions themselves are hook-bound cinematics
 * with no headless equivalent, so this is the seam the preservation contract
 * is asserted against (`homeContinuity.test.ts`).
 */
export function resolveHomeForReentry(): VirtualFS {
  const s = useGameStore.getState();
  const existing = s.computerState.home?.fs;
  if (existing) return existing;
  s.initComputer("home", buildFs(s.username, "home", {
    storyFlags: s.storyFlags,
    deliveredEmailIds: s.deliveredEmailIds,
    completedObjectives: s.completedObjectives,
  }));
  return useGameStore.getState().computerState.home!.fs;
}

export function useComputerTransitions(deps: TransitionDeps) {
  const { cwdRef, activeComputerRef, writePrompt } = deps;

  /** Arrival on Erik's laptop via stolen ssh-agent. No boot animation —
   * SSHing into an already-running box just prints the last-login line
   * and drops you into a shell.
   */
  const runErikpcArrival = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    const username = store.username;

    // Lazy-init: only build the FS the first time. Re-pivots preserve any edits.
    let entry = store.computerState["erik-pc"];
    if (!entry) {
      const newFs = buildFs(username, "erik-pc", {
        storyFlags: store.storyFlags,
        deliveredEmailIds: store.deliveredEmailIds,
        completedObjectives: store.completedObjectives,
      });
      store.initComputer("erik-pc", newFs);
      entry = useGameStore.getState().computerState["erik-pc"]!;
    }

    const newCwd = entry.fs.cwd;
    store.setActivePaneComputer("erik-pc", newCwd);
    activeComputerRef.current = "erik-pc";
    cwdRef.current = newCwd;

    // Flag is set on arrival so the path is reliable even if the player
    // backs out of the fingerprint prompt and tries again from scratch.
    if (!store.storyFlags.pivoted_to_erik_pc) {
      store.setStoryFlag("pivoted_to_erik_pc", true);
    }

    // Realistic OpenSSH last-login line. No "Connected to X." text — real ssh
    // prints nothing of the sort. Erik's laptop has MOTD disabled (typical
    // for personal dev workstations), so no system banner either.
    term.writeln("");
    term.writeln(colorize("Last login: Fri May  9 14:23:18 2026 from coder-chip.platform.internal", ansi.dim));
    useGameStore.getState().setGamePhase("playing");
    writePrompt(term);
  }, [cwdRef, activeComputerRef, writePrompt]);

  const runSshTransition = useCallback((term: Terminal, target: ComputerId = "nexacorp") => {
    if (target === "erik-pc") {
      runErikpcArrival(term);
      return;
    }
    const store = useGameStore.getState();
    store.setGamePhase("transitioning");

    const username = store.username;
    const sshLines = getSshConnectionSequence(username);
    let i = 0;
    const sshInterval = setInterval(() => {
      if (i < sshLines.length) {
        term.writeln(sshLines[i]);
        i++;
      } else {
        clearInterval(sshInterval);

        // Reattach: nexacorp state survived a mid-shift soft disconnect. The
        // workstation is already running, so no boot sequence, no logo, and no
        // FS rebuild: files and flags are exactly as the player left them,
        // though like any fresh ssh login the shell starts at ~, not the cwd
        // at exit time. First-arrival side effects (chapter bump, Day 2
        // Snowflake rebuild, seedImmediatePiper, ssh_day2 cascade) are
        // skipped: they all belong to the build-from-seed path below, which
        // still runs whenever the end-of-day teardown or Day 1 shutdown
        // removed the state.
        const pre = useGameStore.getState();
        const existing = pre.computerState.nexacorp;
        if (existing) {
          const newCwd = existing.fs.cwd;
          pre.setActivePaneComputer("nexacorp", newCwd);
          activeComputerRef.current = "nexacorp";
          cwdRef.current = newCwd;
          if (pre.pendingPiperNotification) {
            term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
            pre.setPendingPiperNotification(false);
          }
          useGameStore.getState().setGamePhase("playing");
          writePrompt(term);
          return;
        }

        setTimeout(() => {
          term.clear();
          const s = useGameStore.getState();

          if (s.currentChapter === "chapter-1") {
            s.setCurrentChapter("chapter-2");
          }

          // On Day 2, rebuild SnowflakeState with extended data
          if (s.storyFlags.day1_shutdown) {
            const newSfState = createInitialSnowflakeState({ includeDay2: true });
            s.setSnowflakeState(newSfState);
          }

          // Build NexaCorp filesystem directly and init computer state
          const nexaFs = buildFs(username, "nexacorp", {
            storyFlags: s.storyFlags,
            deliveredEmailIds: s.deliveredEmailIds,
            completedObjectives: s.completedObjectives,
          });
          const sfState = useGameStore.getState().snowflakeState;
          const finalFs = syncToVirtualFS(sfState, nexaFs);
          s.initComputer("nexacorp", finalFs);
          const newCwd = finalFs.cwd;

          // Update current tab to nexacorp
          s.setActivePaneComputer("nexacorp", newCwd);
          activeComputerRef.current = "nexacorp";
          cwdRef.current = newCwd;

          const state = useGameStore.getState();

          // Seed immediate piper messages for NexaCorp
          const piperIds = seedImmediatePiper(state.username, "nexacorp");
          if (piperIds.length > 0) {
            state.addDeliveredPiperMessages(piperIds);
          }

          // Track whether new Piper messages were delivered during transition
          let hadNewPiper = false;

          // On Day 2 SSH, set ssh_day2 flag and run delivery cascade
          if (state.storyFlags.day1_shutdown) {
            state.setStoryFlag("ssh_day2", true);

            // Deliver Piper messages triggered by ssh_day2 (e.g. auri_day2_morning)
            const sshState = useGameStore.getState();
            const cascade = deliverPiperAndCascade(
              { type: "command_executed", detail: "ssh_nexacorp" },
              "nexacorp",
              sshState.username,
              sshState.deliveredPiperIds,
              sshState.storyFlags
            );
            if (cascade.newPiperIds.length > 0) {
              hadNewPiper = true;
              useGameStore.getState().addDeliveredPiperMessages(cascade.newPiperIds);
              for (const update of cascade.flagUpdates) {
                useGameStore.getState().setStoryFlag(update.flag, update.value);
              }
            }
          }

          // Boot sequence
          state.setGamePhase("booting");
          const bootLines = getBootSequence(username);
          let j = 0;
          const bootInterval = setInterval(() => {
            if (j < bootLines.length) {
              term.writeln(bootLines[j]);
              j++;
            } else {
              clearInterval(bootInterval);
              term.writeln("");
              nexacorpLogo.forEach((line) => term.writeln(line));
              if (hadNewPiper) {
                term.writeln("");
                term.writeln(colorize("You have new messages on Piper", ansi.yellow, ansi.bold));
              }
              useGameStore.getState().setGamePhase("playing");
            }
          }, BOOT_LINE_INTERVAL_MS);
        }, BOOT_LINE_INTERVAL_MS);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef, runErikpcArrival, writePrompt]);

  /**
   * Build a fresh per-computer filesystem for a Coder workspace transition.
   * Centralizes the per-target divergence so runCoderTransition stays generic.
   */
  const buildCoderTargetFs = (
    target: "devcontainer" | "chipinfra",
    username: string,
    storyFlags: Record<string, string | boolean>,
  ): VirtualFS => {
    if (target === "chipinfra") {
      const root = createChipinfraFilesystem(username, storyFlags);
      return new VirtualFS(root, `/home/${username}`, `/home/${username}`);
    }
    // devcontainer: buildFs owns the dbt_project_cloned → real `git clone` path,
    // so checkpoint loads and workspace revisits produce the same repo.
    return buildFs(username, "devcontainer", { storyFlags });
  };

  const runCoderTransition = useCallback((term: Terminal, target: "devcontainer" | "chipinfra" = "devcontainer") => {
    const store = useGameStore.getState();
    const visitedFlag = target === "chipinfra" ? "chipinfra_visited" : "devcontainer_visited";
    const workspaceName = target === "chipinfra" ? "chip" : "ai";
    const banner = getCoderBanner(workspaceName);
    const isSubsequent = !!store.computerState[target] || !!store.storyFlags[visitedFlag];

    if (isSubsequent) {
      // Subsequent visit — no animation, just repurpose tab
      let entry = store.computerState[target];

      if (!entry) {
        // State was removed (e.g. exit to home) — rebuild silently
        const newFs = buildCoderTargetFs(target, store.username, store.storyFlags);
        store.initComputer(target, newFs);
        entry = useGameStore.getState().computerState[target]!;
      }

      const newCwd = entry.fs.cwd;
      store.setActivePaneComputer(target, newCwd);
      activeComputerRef.current = target;
      cwdRef.current = newCwd;
      term.writeln("");
      banner.forEach((line) => term.writeln(line));
      writePrompt(term);
      return;
    }

    // First-time visit — full connection animation
    store.setGamePhase("transitioning");

    const lines = getCoderConnectionSequence(workspaceName);
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        term.writeln(lines[i]);
        i++;
      } else {
        clearInterval(interval);

        const s = useGameStore.getState();
        if (!s.storyFlags[visitedFlag]) {
          s.setStoryFlag(visitedFlag, true);
          if (target === "devcontainer") {
            s.addToast("dbt and snow commands unlocked on NexaCorp!");
          }
          // Cross-arc bridge: if the player already read the USB note before
          // first chipinfra visit, open "Pulling at a Loose Thread" now. The
          // reverse ordering (visit-first, read-later) is handled by a
          // file_read trigger in storyFlags.ts requiring chipinfra_visited.
          if (
            target === "chipinfra" &&
            s.storyFlags.read_usb_note &&
            !s.storyFlags.loose_thread_quest_started
          ) {
            s.setStoryFlag("loose_thread_quest_started", true);
            s.addToast("New quest: Pulling at a Loose Thread");
          }
        }

        const newFs = buildCoderTargetFs(target, s.username, s.storyFlags);
        const newCwd = newFs.cwd;

        s.initComputer(target, newFs);

        // Repurpose current tab to the new target
        s.setActivePaneComputer(target, newCwd);
        activeComputerRef.current = target;
        cwdRef.current = newCwd;

        term.writeln("");
        banner.forEach((line) => term.writeln(line));
        useGameStore.getState().setGamePhase("playing");
        writePrompt(term);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef, writePrompt]);

  /**
   * Generalized "exit back to the parent" soft disconnect. Repurposes the
   * active tab to `target`, restores the target's cwd, and writes a disconnect
   * banner using the source hostname. Other tabs are untouched — each tab is
   * its own session, and the source's computerState stays alive, so siblings
   * keep working (and the player can reconnect to find things as they were).
   *
   * Used by:
   *   - chipinfra/devcontainer → nexacorp
   *   - erik-pc → chipinfra
   *   - nexacorp → home (mid-shift logoff; see runExitToHome)
   */
  const runExitToParent = useCallback((term: Terminal, target: ComputerId) => {
    const store = useGameStore.getState();
    const sourceComputer = getActiveLeaf(store)?.computerId as ComputerId | undefined;

    // Restore target cwd from computerState (default to its conventional home dir)
    const targetEntry = store.computerState[target];
    const fallbackHome = `/home/${store.username}`;
    const targetCwd = targetEntry?.fs?.cwd ?? fallbackHome;

    store.setActivePaneComputer(target, targetCwd);
    activeComputerRef.current = target;
    cwdRef.current = targetCwd;

    const sourceHostname = sourceComputer
      ? COMPUTERS[sourceComputer].promptHostname
      : "remote";
    term.writeln(colorize(`\r\nDisconnected from ${sourceHostname}.`, ansi.dim));

    // Piper notifications only land on nexacorp — chipinfra/devcontainer/erik-pc
    // don't surface them. So gate the deferred-notification flush to nexacorp.
    if (target === "nexacorp") {
      const latest = useGameStore.getState();
      if (latest.pendingPiperNotification) {
        term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
        latest.setPendingPiperNotification(false);
      }
    }

    writePrompt(term);
  }, [cwdRef, activeComputerRef, writePrompt]);

  const runExitToHome = useCallback((term: Terminal) => {
    const store = useGameStore.getState();

    // Mid-shift logoff: a plain ssh disconnect, exactly like exiting any other
    // remote session. Every other tab and all work-machine state survive, so
    // the player can keep working in sibling tabs or ssh back in to find the
    // workstation as they left it. Only a genuine end-of-day exit (below)
    // tears the workday down.
    if (!isEndOfDayExit(store.storyFlags)) {
      runExitToParent(term, "home");
      return;
    }

    store.setGamePhase("transitioning");

    const logoffLines = [
      colorize("Logging off NexaCorp workstation...", ansi.dim),
      "",
      colorize("Session closed.", ansi.dim),
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (i < logoffLines.length) {
        term.writeln(logoffLines[i]);
        i++;
      } else {
        clearInterval(interval);

        const s = useGameStore.getState();

        // Close all other work-machine panes (nexacorp + everything reachable
        // only through it). The active pane is preserved and retargeted to home below.
        s.closePanesForComputers(["nexacorp", "devcontainer", "chipinfra", "erik-pc"]);

        const username = s.username;
        // The home box is left exactly as the player left it — see resolveHomeForReentry.
        const homeFsAtReentry = resolveHomeForReentry();

        // Tracks-exposed scan. If the player pivoted to Erik's PC and left
        // chipinfra's ~/.ssh/known_hosts containing the nexacorp-lt05 entry that
        // SshSession appended on first connect, fire tracks_exposed_chapter4
        // so the hr_security_freeze email delivers alongside marcus_board_debrief.
        // Must run BEFORE removeComputer("chipinfra") below.
        if (s.storyFlags.pivoted_to_erik_pc) {
          const chipFs = s.computerState.chipinfra?.fs;
          const kh = chipFs?.readFile(`/home/${username}/.ssh/known_hosts`).content ?? "";
          if (kh.includes("nexacorp-lt05")) {
            s.setStoryFlag("tracks_exposed_chapter4", true);
          }
        }

        // Discard all work-machine state: the day is over, nothing survives.
        // (The "+" dropdown is independently filtered to open-tab machines in
        // TabBar.tsx, so this is about state teardown, not dropdown hygiene.)
        s.removeComputer("nexacorp");
        s.removeComputer("devcontainer");
        s.removeComputer("chipinfra");
        s.removeComputer("erik-pc");

        // Repurpose current tab to home. Coming home is a fresh login shell, so
        // land in ~ rather than wherever the last home session was cd'd to.
        const homeCwd = homeFsAtReentry.homeDir;
        s.setActivePaneComputer("home", homeCwd);
        activeComputerRef.current = "home";
        cwdRef.current = homeCwd;

        // Day 2 wrap path: accusation_made was set during Chapter 3, and the
        // synthetic `exit_day2_logoff` event from exit.ts set returned_home_day2
        // just before this transition. read_board_debrief_day2 is still unset
        // (it only fires when the player opens Marcus's email at home).
        const isDay2Wrap = !!s.storyFlags.returned_home_day2 && !s.storyFlags.read_board_debrief_day2;

        const runDeliveries = () => {
          const ss = useGameStore.getState();
          // Idempotent on Day 2 (already set/completed).
          ss.setStoryFlag("returned_home_day1", true);
          ss.completeObjective("head_home");

          // Pass storyFlags so after_story_flag triggers (e.g. marcus_board_debrief)
          // fire and any flag-branched bodies render correctly.
          const latest = useGameStore.getState();
          const homeFs = latest.computerState.home?.fs ?? homeFsAtReentry;
          const deliveryResult = checkEmailDeliveries(
            homeFs,
            { type: "objective_completed", detail: "head_home" },
            [...latest.deliveredEmailIds],
            "home",
            latest.storyFlags
          );
          if (deliveryResult.newDeliveries.length > 0) {
            latest.setComputerFs("home", deliveryResult.fs);
            latest.addDeliveredEmails(deliveryResult.newDeliveries);
            term.writeln("");
            term.write(colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold));
          }

          // Deliver Piper messages triggered by returned_home_day1
          const latestForPiper = useGameStore.getState();
          const cascade = deliverPiperAndCascade(
            { type: "objective_completed", detail: "head_home" },
            "home",
            username,
            latestForPiper.deliveredPiperIds,
            latestForPiper.storyFlags
          );
          if (cascade.newPiperIds.length > 0) {
            useGameStore.getState().addDeliveredPiperMessages(cascade.newPiperIds);
            term.writeln("");
            term.writeln(colorize("You have new messages on Piper", ansi.yellow, ansi.bold));
            for (const update of cascade.flagUpdates) {
              useGameStore.getState().setStoryFlag(update.flag, update.value);
            }
          }

          useGameStore.getState().setGamePhase("playing");
          writePrompt(term);
        };

        // Mid-shift logoffs never reach this point (the soft-disconnect branch
        // at the top returns early), so this is always a genuine end-of-day.
        if (isDay2Wrap) {
          // Evening pause — implies hours passing between leaving work and
          // arriving home. Then a quiet grounding line before deliveries.
          term.writeln("");
          setTimeout(() => {
            term.writeln("");
            term.writeln(colorize("21:14. You're home.", ansi.dim));
            term.writeln("");
            setTimeout(runDeliveries, 800);
          }, 1800);
        } else {
          runDeliveries();
        }
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef, writePrompt, runExitToParent]);

  /**
   * Cosmetic home-PC reboot for a non-questline `shutdown`: power off, boot
   * right back up. No FS rebuild, no story flags, no deliveries, no chapter
   * change — the in-game clock derives from delivery progression, so the
   * datetime is unchanged too. Other tabs are closed (a reboot kills every
   * terminal and any SSH session originating from this box) but computerState
   * is kept, so reconnecting finds everything as it was.
   */
  const runRebootTransition = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    store.setGamePhase("transitioning");

    term.write("\x1b[?25l"); // hide cursor during animation
    term.clear();

    setTimeout(() => {
      const s = useGameStore.getState();
      // A reboot kills every terminal — collapse to a single home pane.
      s.closeOtherPanes();

      // Fresh login shell starts in ~
      const homeDir = `/home/${s.username}`;
      s.setActivePaneCwd(homeDir);
      cwdRef.current = homeDir;

      useGameStore.getState().setGamePhase("booting");
      const bootLines = getHomeBootSequence();
      let j = 0;
      const bootInterval = setInterval(() => {
        if (j < bootLines.length) {
          term.writeln(bootLines[j]);
          j++;
        } else {
          clearInterval(bootInterval);
          term.write("\x1b[?25h"); // restore cursor
          // No writePrompt here: the booting -> playing effect in TabManager
          // owns the prompt for every boot animation (same as the nexacorp and
          // Day 2 boots below). Writing one here printed it twice.
          useGameStore.getState().setGamePhase("playing");
        }
      }, BOOT_LINE_INTERVAL_MS);
    }, 2500);
  }, [cwdRef]);

  const runShutdownTransition = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    const isEndgame = Boolean(store.storyFlags.read_board_debrief_day2);
    store.setGamePhase("transitioning");

    // Black screen pause (simulating overnight on Day 1; "lights out" for endgame).
    term.write("\x1b[?25l"); // hide cursor during animation
    term.clear();

    if (isEndgame) {
      // Endgame: no FS rebuild, no Day-2 boot, no delivery cascades. Just print
      // the credits block, set game_ended, and leave the terminal idle.
      setTimeout(() => {
        const credits = getEndgameCreditsBlock();
        credits.forEach((line) => term.writeln(line));
        useGameStore.getState().setStoryFlag("game_ended", true);
        // Stay in "transitioning" phase so the input handler never re-enables
        // and writePrompt is never called.
      }, 2500);
      return;
    }

    setTimeout(() => {
      const s = useGameStore.getState();
      const username = s.username;

      // Powering off kills every terminal, and overnight no work session
      // survives. Collapse to a single home pane and drop any lingering
      // work-machine state (the player can ssh back end-of-day, soft-disconnect
      // home, and reach shutdown with work panes still open).
      s.closeOtherPanes();
      s.removeComputer("nexacorp");
      s.removeComputer("devcontainer");
      s.removeComputer("chipinfra");
      s.removeComputer("erik-pc");

      // The machine reboots overnight; its disk does not get reimaged. Home
      // survives untouched — see resolveHomeForReentry. Day 2 content is state,
      // not files: the flags below plus the delivery cascade further down.
      const homeFsAtReentry = resolveHomeForReentry();

      // Set Day 2 state
      s.setStoryFlag("day1_shutdown", true);
      s.setStoryFlag("apt_unlocked", true);
      s.setCurrentChapter("chapter-3");

      // Repurpose current tab to home — a post-boot login shell starts in ~.
      const homeCwd = homeFsAtReentry.homeDir;
      s.setActivePaneComputer("home", homeCwd);
      activeComputerRef.current = "home";
      cwdRef.current = homeCwd;

      // Run delivery cascade for day1_shutdown
      const latest = useGameStore.getState();
      const homeFs = latest.computerState.home?.fs ?? homeFsAtReentry;
      const shutdownEvent: GameEvent = { type: "command_executed", detail: "shutdown" };
      const emailResult = checkEmailDeliveries(
        homeFs,
        shutdownEvent,
        [...latest.deliveredEmailIds],
        "home",
        latest.storyFlags
      );
      if (emailResult.newDeliveries.length > 0) {
        latest.setComputerFs("home", emailResult.fs);
        latest.addDeliveredEmails(emailResult.newDeliveries);
      }

      const latestForPiper = useGameStore.getState();
      const cascade = deliverPiperAndCascade(
        shutdownEvent,
        "home",
        username,
        latestForPiper.deliveredPiperIds,
        latestForPiper.storyFlags
      );
      if (cascade.newPiperIds.length > 0) {
        useGameStore.getState().addDeliveredPiperMessages(cascade.newPiperIds);
        for (const update of cascade.flagUpdates) {
          useGameStore.getState().setStoryFlag(update.flag, update.value);
        }
      }

      // Cinematic boot sequence
      useGameStore.getState().setGamePhase("booting");
      const bootLines = getHomeBootSequence();
      let j = 0;
      const bootInterval = setInterval(() => {
        if (j < bootLines.length) {
          term.writeln(bootLines[j]);
          j++;
        } else {
          clearInterval(bootInterval);

          // Show Day 2 welcome banner
          const day2Welcome = getHomeWelcome(2);
          day2Welcome.forEach((line) => term.writeln(line));
          UNLOCK_BOX.forEach((line) => term.writeln(line));

          if (!useGameStore.getState().storyFlags.apt_upgraded) {
            getUpdateNotification().forEach((line) => term.writeln(line));
          }

          term.write("\x1b[?25h"); // restore cursor
          useGameStore.getState().setGamePhase("playing");
        }
      }, BOOT_LINE_INTERVAL_MS);
    }, 2500);
  }, [cwdRef, activeComputerRef]);

  /**
   * Forced disconnect from NexaCorp after a security tripwire fires. Same
   * end-of-day shape as runExitToHome (work machines torn down, player returned
   * to their untouched home box via resolveHomeForReentry) but: prints a
   * hostile-disconnect line, sets the termination flags before delivery, and
   * triggers the termination email via a synthesized `terminated` event.
   */
  const runTerminationTransition = useCallback(
    (term: Terminal, violation: SecurityViolation) => {
      const store = useGameStore.getState();
      store.setGamePhase("transitioning");

      // t=0: flip flags immediately so any code reading them during the cinematic
      // sees the post-termination state. Violation specifics are persisted so the
      // HR email body can name the actual command and path, and survive save/load.
      store.setStoryFlag("terminated_for_misconduct", true);
      store.setStoryFlag("termination_reason", violation.kind);
      store.setStoryFlag("termination_path", violation.path);
      store.setStoryFlag("termination_command", violation.command);
      store.setStoryFlag("termination_descendant_count", String(violation.descendantCount));
      if (violation.destPath) {
        store.setStoryFlag("termination_dest_path", violation.destPath);
      }

      // t=0: close sibling work-machine panes so the player can't switch to
      // another pane on the doomed workstation and keep working while the
      // cinematic plays. The active pane is preserved and retargeted to home below.
      store.closePanesForComputers(["nexacorp", "devcontainer", "chipinfra", "erik-pc"]);

      const pid = Math.floor(1000 + Math.random() * 9000);
      const alertLines = getTerminationAlertLines(violation, pid);

      term.writeln("");

      // Stages 1-3: stream the corp-sec audit lines.
      alertLines.forEach((line, i) => {
        setTimeout(() => term.writeln(line), SECURITY_ALERT_LINE_INTERVAL_MS * (i + 1));
      });

      // Stage 4: disconnect.
      const disconnectAt =
        SECURITY_ALERT_LINE_INTERVAL_MS * alertLines.length + SECURITY_DISCONNECT_PAUSE_MS;
      setTimeout(() => {
        term.writeln("");
        term.writeln(colorize("Connection to nexacorp closed by remote host.", ansi.red));
        term.writeln(colorize("Killed by signal 1.", ansi.dim));
      }, disconnectAt);

      // Stage 5: blackout.
      const blackoutAt = disconnectAt + TERMINATION_PRE_BLACKOUT_MS;
      setTimeout(() => {
        term.write("\x1b[?25l");
        term.clear();
      }, blackoutAt);

      // Stage 6: home reentry.
      const reentryAt = blackoutAt + TERMINATION_BLACKOUT_MS;
      setTimeout(() => {
        const s = useGameStore.getState();
        const username = s.username;
        // Being fired doesn't reimage the player's own PC — see resolveHomeForReentry.
        const homeFsAtReentry = resolveHomeForReentry();

        s.removeComputer("nexacorp");
        s.removeComputer("devcontainer");
        s.removeComputer("chipinfra");
        s.removeComputer("erik-pc");

        const homeCwd = homeFsAtReentry.homeDir;
        s.setActivePaneComputer("home", homeCwd);
        activeComputerRef.current = "home";
        cwdRef.current = homeCwd;

        const finalState = useGameStore.getState();
        const homeFs = finalState.computerState.home?.fs ?? homeFsAtReentry;
        const deliveryResult = checkEmailDeliveries(
          homeFs,
          { type: "terminated", detail: violation.kind },
          [...finalState.deliveredEmailIds],
          "home",
          finalState.storyFlags
        );
        if (deliveryResult.newDeliveries.length > 0) {
          finalState.setComputerFs("home", deliveryResult.fs);
          finalState.addDeliveredEmails(deliveryResult.newDeliveries);
          term.writeln("");
          term.write(colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold));
        }

        term.write("\x1b[?25h");
        useGameStore.getState().setGamePhase("playing");
        writePrompt(term);
      }, reentryAt);
    },
    [cwdRef, activeComputerRef, writePrompt]
  );

  /**
   * Source-aware transition dispatcher. Centralizes the matrix of
   * (transitionTo × sourceComputer) → which transition function to run.
   * Both the command-result dispatcher in useTerminal and the session-result
   * dispatcher in useSessionRouter route through this helper.
   *
   * Returns true if a transition was dispatched.
   */
  const dispatchTransition = useCallback(
    (
      term: Terminal,
      transitionTo: ComputerId,
      sourceComputer: ComputerId,
      terminationReason?: SecurityViolation,
    ): boolean => {
      // Security tripwire: forced disconnect from nexacorp.
      if (transitionTo === "home" && sourceComputer === "nexacorp" && terminationReason) {
        runTerminationTransition(term, terminationReason);
        return true;
      }
      // First-time pivots from nexacorp → coder workspace
      if (transitionTo === "devcontainer") {
        runCoderTransition(term, "devcontainer");
        return true;
      }
      if (transitionTo === "chipinfra" && sourceComputer === "nexacorp") {
        runCoderTransition(term, "chipinfra");
        return true;
      }
      // Exit erik-pc → chipinfra
      if (transitionTo === "chipinfra" && sourceComputer === "erik-pc") {
        runExitToParent(term, "chipinfra");
        return true;
      }
      // Exit coder workspace → nexacorp
      if (transitionTo === "nexacorp" && (sourceComputer === "devcontainer" || sourceComputer === "chipinfra")) {
        runExitToParent(term, "nexacorp");
        return true;
      }
      // SSH home → nexacorp (first ssh)
      if (transitionTo === "nexacorp" && sourceComputer === "home") {
        runSshTransition(term, "nexacorp");
        return true;
      }
      // SSH chipinfra → erik-pc
      if (transitionTo === "erik-pc" && sourceComputer === "chipinfra") {
        runSshTransition(term, "erik-pc");
        return true;
      }
      // Exit nexacorp → home (soft disconnect mid-shift, teardown end-of-day)
      if (transitionTo === "home" && sourceComputer === "nexacorp") {
        runExitToHome(term);
        return true;
      }
      return false;
    },
    [runCoderTransition, runExitToParent, runSshTransition, runExitToHome, runTerminationTransition]
  );

  return { runSshTransition, runCoderTransition, runExitToParent, runExitToHome, runShutdownTransition, runRebootTransition, runTerminationTransition, dispatchTransition };
}
