import { useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore, buildFs } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createDevcontainerFilesystem } from "../story/filesystem/devcontainer";
import { createHomeFilesystem } from "../story/filesystem/home";
import { checkEmailDeliveries, seedDeliveredEmails, GameEvent } from "../engine/mail/delivery";
import { seedImmediatePiper, checkPiperDeliveries } from "../engine/piper/delivery";
import { getTriggersForComputer, checkStoryFlagTriggers } from "../engine/narrative/storyFlags";
import { syncToVirtualFS } from "../engine/snowflake/bridge/fs_bridge";
import { colorize, ansi } from "../lib/ansi";
import { nexacorpLogo, getSshConnectionSequence, getBootSequence, getCoderConnectionSequence, coderBanner } from "../lib/ascii";
import { BOOT_LINE_INTERVAL_MS } from "../lib/timing";
import { ComputerId } from "../state/types";

interface TransitionDeps {
  cwdRef: React.MutableRefObject<string>;
  activeComputerRef: React.MutableRefObject<ComputerId>;
  writePrompt: (term: Terminal) => void;
}

export function useComputerTransitions(deps: TransitionDeps) {
  const { cwdRef, activeComputerRef, writePrompt } = deps;

  const runSshTransition = useCallback((term: Terminal) => {
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

        setTimeout(() => {
          term.clear();
          const s = useGameStore.getState();
          s.setCurrentChapter("chapter-2");

          // Build NexaCorp filesystem directly and init computer state
          const nexaFs = buildFs(username, "nexacorp", s.storyFlags, s.deliveredEmailIds);
          const finalFs = syncToVirtualFS(s.snowflakeState, nexaFs);
          s.initComputer("nexacorp", finalFs);
          const newCwd = finalFs.cwd;

          // Update current tab to nexacorp
          s.setTabComputer(s.activeTabId, "nexacorp", newCwd);
          activeComputerRef.current = "nexacorp";
          cwdRef.current = newCwd;

          const state = useGameStore.getState();

          // Seed immediate piper messages for NexaCorp
          const piperIds = seedImmediatePiper(state.username, "nexacorp");
          if (piperIds.length > 0) {
            state.addDeliveredPiperMessages(piperIds);
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
              useGameStore.getState().setGamePhase("playing");
            }
          }, BOOT_LINE_INTERVAL_MS);
        }, BOOT_LINE_INTERVAL_MS);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef]);

  const runCoderTransition = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    store.setGamePhase("transitioning");

    const lines = getCoderConnectionSequence();
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        term.writeln(lines[i]);
        i++;
      } else {
        clearInterval(interval);

        const s = useGameStore.getState();
        s.setStoryFlag("devcontainer_visited", true);
        s.addToast("dbt and snow commands unlocked on NexaCorp!");

        // Build or restore devcontainer FS
        let newFs: VirtualFS;
        let newCwd: string;
        const previousEntry = s.computerState.devcontainer;
        if (previousEntry) {
          newFs = previousEntry.fs;
          newCwd = newFs.cwd;
        } else {
          const username = s.username;
          const root = createDevcontainerFilesystem(username);
          newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);
          newCwd = newFs.cwd;
        }

        s.initComputer("devcontainer", newFs);

        // Repurpose current tab to devcontainer
        s.setTabComputer(s.activeTabId, "devcontainer", newCwd);
        activeComputerRef.current = "devcontainer";
        cwdRef.current = newCwd;

        term.writeln("");
        coderBanner.forEach((line) => term.writeln(line));
        useGameStore.getState().setGamePhase("playing");
        writePrompt(term);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef, writePrompt]);

  const runExitToNexacorp = useCallback((term: Terminal) => {
    const store = useGameStore.getState();

    // Close any other devcontainer tabs (keep only the current one, which we repurpose)
    const otherDevTabs = store.tabs.filter(
      (t) => t.computerId === "devcontainer" && t.id !== store.activeTabId
    );
    for (const t of otherDevTabs) store.removeTab(t.id);

    // Restore NexaCorp cwd from computerState
    const nexaEntry = store.computerState.nexacorp;
    const nexaCwd = nexaEntry?.fs?.cwd ?? `/home/${store.username}`;

    // Repurpose current tab back to nexacorp
    store.setTabComputer(store.activeTabId, "nexacorp", nexaCwd);
    activeComputerRef.current = "nexacorp";
    cwdRef.current = nexaCwd;

    term.writeln(colorize("\r\nDisconnected from coder-ai.", ansi.dim));
    writePrompt(term);
  }, [cwdRef, activeComputerRef, writePrompt]);

  const runExitToHome = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
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

        // Close all other nexacorp and devcontainer tabs
        const tabsToClose = s.tabs.filter(
          (t) => (t.computerId === "nexacorp" || t.computerId === "devcontainer") && t.id !== s.activeTabId
        );
        for (const t of tabsToClose) s.removeTab(t.id);

        // Rebuild home FS
        const username = s.username;
        const root = createHomeFilesystem(username);
        let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);

        // Re-seed previously delivered emails
        const allDelivered = s.deliveredEmailIds;
        if (allDelivered.length > 0) {
          newFs = seedDeliveredEmails(newFs, allDelivered, "home", username);
        }

        s.initComputer("home", newFs);

        // Remove nexacorp/devcontainer from computerState so they don't appear in "+" dropdown
        s.removeComputer("nexacorp");
        s.removeComputer("devcontainer");

        // Repurpose current tab to home
        const homeCwd = newFs.cwd;
        s.setTabComputer(s.activeTabId, "home", homeCwd);
        activeComputerRef.current = "home";
        cwdRef.current = homeCwd;

        // Set story flags and complete objective
        s.setStoryFlag("returned_home_day1", true);
        s.completeObjective("head_home");

        // Deliver Alex's email triggered by head_home objective
        const latest = useGameStore.getState();
        const homeFs = latest.computerState.home?.fs ?? newFs;
        const deliveryResult = checkEmailDeliveries(
          homeFs,
          { type: "objective_completed", detail: "head_home" },
          [...latest.deliveredEmailIds],
          "home"
        );
        if (deliveryResult.newDeliveries.length > 0) {
          latest.setComputerFs("home", deliveryResult.fs);
          latest.addDeliveredEmails(deliveryResult.newDeliveries);
          term.writeln("");
          term.write(colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold));
        }

        // Deliver Piper messages triggered by returned_home_day1
        const latestForPiper = useGameStore.getState();
        const newPiperIds = checkPiperDeliveries(
          { type: "objective_completed", detail: "head_home" },
          [...latestForPiper.deliveredPiperIds],
          username,
          "home",
          latestForPiper.storyFlags
        );
        if (newPiperIds.length > 0) {
          latestForPiper.addDeliveredPiperMessages(newPiperIds);
          term.writeln("");
          term.write(colorize("You have new messages on Piper", ansi.yellow, ansi.bold));

          // Process piper_delivered story flag triggers (mirrors processDeliveries 4th pass)
          const storyFlagTriggers = getTriggersForComputer("home", username);
          const latestFlags = useGameStore.getState().storyFlags;
          let currentFlags = { ...latestFlags };
          for (const id of newPiperIds) {
            const pdEvent: GameEvent = { type: "piper_delivered", detail: id };
            const flagResults = checkStoryFlagTriggers(pdEvent, storyFlagTriggers, currentFlags);
            for (const flagResult of flagResults) {
              useGameStore.getState().setStoryFlag(flagResult.flag, flagResult.value);
              currentFlags = { ...currentFlags, [flagResult.flag]: flagResult.value };
            }
          }
        }

        useGameStore.getState().setGamePhase("playing");
        writePrompt(term);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [cwdRef, activeComputerRef, writePrompt]);

  return { runSshTransition, runCoderTransition, runExitToNexacorp, runExitToHome };
}
