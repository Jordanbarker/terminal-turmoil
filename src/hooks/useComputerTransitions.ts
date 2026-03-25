import { useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore, buildFs } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createDevcontainerFilesystem } from "../story/filesystem/devcontainer";
import { createHomeFilesystem } from "../story/filesystem/home";
import { checkEmailDeliveries, seedDeliveredEmails, GameEvent } from "../engine/mail/delivery";
import { getReadEmailIds } from "../engine/mail/mailUtils";
import { getEmailDefinitions } from "../engine/mail/emails";
import { seedImmediatePiper, checkPiperDeliveries } from "../engine/piper/delivery";
import { getTriggersForComputer, checkStoryFlagTriggers } from "../engine/narrative/storyFlags";
import { gitClone } from "../engine/git/repo";
import { syncToVirtualFS } from "../engine/snowflake/bridge/fs_bridge";
import { createInitialSnowflakeState } from "../engine/snowflake/seed/initial_data";
import { colorize, ansi } from "../lib/ansi";
import { nexacorpLogo, getSshConnectionSequence, getBootSequence, getHomeBootSequence, getCoderConnectionSequence, coderBanner, getHomeWelcome, UNLOCK_BOX } from "../lib/ascii";
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

          // Close all non-active home tabs
          const homeTabs = s.tabs.filter(
            (t) => t.computerId === "home" && t.id !== s.activeTabId
          );
          for (const t of homeTabs) s.removeTab(t.id);
          if (s.currentChapter === "chapter-1") {
            s.setCurrentChapter("chapter-2");
          }

          // On Day 2, rebuild SnowflakeState with extended data
          if (s.storyFlags.day1_shutdown) {
            const newSfState = createInitialSnowflakeState({ includeDay2: true });
            s.setSnowflakeState(newSfState);
          }

          // Build NexaCorp filesystem directly and init computer state
          const nexaFs = buildFs(username, "nexacorp", s.storyFlags, s.deliveredEmailIds);
          const sfState = useGameStore.getState().snowflakeState;
          const finalFs = syncToVirtualFS(sfState, nexaFs);
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

          // Track whether new Piper messages were delivered during transition
          let hadNewPiper = false;

          // On Day 2 SSH, set ssh_day2 flag and run delivery cascade
          if (state.storyFlags.day1_shutdown) {
            state.setStoryFlag("ssh_day2", true);

            // Deliver Piper messages triggered by ssh_day2 (e.g. auri_day2_morning)
            const sshState = useGameStore.getState();
            const sshEvent: GameEvent = { type: "command_executed", detail: "ssh_nexacorp" };
            const newPiperIds = checkPiperDeliveries(
              sshEvent,
              [...sshState.deliveredPiperIds],
              sshState.username,
              "nexacorp",
              sshState.storyFlags
            );
            if (newPiperIds.length > 0) {
              hadNewPiper = true;
              sshState.addDeliveredPiperMessages(newPiperIds);

              // Process piper_delivered story flag triggers (4th pass pattern)
              const storyFlagTriggers = getTriggersForComputer("nexacorp", sshState.username);
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
  }, [cwdRef, activeComputerRef]);

  const runCoderTransition = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    const isSubsequent = !!store.computerState.devcontainer || !!store.storyFlags.devcontainer_visited;

    if (isSubsequent) {
      // Subsequent visit — no animation, just repurpose tab
      let entry = store.computerState.devcontainer;

      if (!entry) {
        // State was removed (e.g. exit to home) — rebuild silently
        const username = store.username;
        // Build base FS with dbt_project_cloned suppressed — gitClone will recreate it with .git
        const rebuildFlags = { ...store.storyFlags, dbt_project_cloned: false };
        const root = createDevcontainerFilesystem(username, rebuildFlags);
        let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);

        // Re-clone the repo so git history is preserved
        if (store.storyFlags.dbt_project_cloned) {
          const cloneResult = gitClone(newFs, `/home/${username}`, "nexacorp/nexacorp-analytics", username);
          if (!cloneResult.error) newFs = cloneResult.fs;
        }

        store.initComputer("devcontainer", newFs);
        entry = useGameStore.getState().computerState.devcontainer!;
      }

      const newCwd = entry.fs.cwd;
      store.setTabComputer(store.activeTabId, "devcontainer", newCwd);
      activeComputerRef.current = "devcontainer";
      cwdRef.current = newCwd;
      term.writeln("");
      coderBanner.forEach((line) => term.writeln(line));
      writePrompt(term);
      return;
    }

    // First-time visit — full connection animation
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
        if (!s.storyFlags.devcontainer_visited) {
          s.setStoryFlag("devcontainer_visited", true);
          s.addToast("dbt and snow commands unlocked on NexaCorp!");
        }

        const username = s.username;
        const root = createDevcontainerFilesystem(username, s.storyFlags);
        const newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);
        const newCwd = newFs.cwd;

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
        const prevHomeFs = s.computerState.home?.fs;

        // Capture read email IDs before rebuilding FS
        const readIds = prevHomeFs
          ? getReadEmailIds(prevHomeFs, getEmailDefinitions(username, "home").map((d) => d.email))
          : new Set<string>();

        const root = createHomeFilesystem(username);
        let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);

        // Re-seed previously delivered emails, preserving read state
        const allDelivered = s.deliveredEmailIds;
        if (allDelivered.length > 0) {
          newFs = seedDeliveredEmails(newFs, allDelivered, "home", username, readIds);
        }

        // Preserve known_hosts from previous FS
        if (prevHomeFs) {
          const knownHostsPath = `/home/${username}/.ssh/known_hosts`;
          const prev = prevHomeFs.readFile(knownHostsPath);
          if (prev.content) {
            const result = newFs.writeFile(knownHostsPath, prev.content);
            if (result.fs) newFs = result.fs;
          }
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
          term.writeln(colorize("You have new messages on Piper", ansi.yellow, ansi.bold));

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

  const runShutdownTransition = useCallback((term: Terminal) => {
    const store = useGameStore.getState();
    store.setGamePhase("transitioning");

    // Black screen pause (simulating overnight)
    term.write("\x1b[?25l"); // hide cursor during animation
    term.clear();
    setTimeout(() => {
      const s = useGameStore.getState();
      const username = s.username;

      // Capture read email IDs before rebuilding FS
      const prevHomeFs = s.computerState.home?.fs;
      const readIds = prevHomeFs
        ? getReadEmailIds(prevHomeFs, getEmailDefinitions(username, "home").map((d) => d.email))
        : new Set<string>();

      // Rebuild home FS for Day 2
      const root = createHomeFilesystem(username);
      let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);
      const allDelivered = s.deliveredEmailIds;
      if (allDelivered.length > 0) {
        newFs = seedDeliveredEmails(newFs, allDelivered, "home", username, readIds);
      }

      // Preserve known_hosts from previous FS
      if (prevHomeFs) {
        const knownHostsPath = `/home/${username}/.ssh/known_hosts`;
        const prev = prevHomeFs.readFile(knownHostsPath);
        if (prev.content) {
          const result = newFs.writeFile(knownHostsPath, prev.content);
          if (result.fs) newFs = result.fs;
        }
      }

      // Preserve .zsh_history from previous FS
      if (prevHomeFs) {
        const historyPath = `/home/${username}/.zsh_history`;
        const prevHistory = prevHomeFs.readFile(historyPath);
        if (prevHistory.content) {
          const result = newFs.writeFile(historyPath, prevHistory.content);
          if (result.fs) newFs = result.fs;
        }
      }

      s.initComputer("home", newFs);

      // Set Day 2 state
      s.setStoryFlag("day1_shutdown", true);
      s.setCurrentChapter("chapter-3");

      // Repurpose current tab to home
      const homeCwd = newFs.cwd;
      s.setTabComputer(s.activeTabId, "home", homeCwd);
      activeComputerRef.current = "home";
      cwdRef.current = homeCwd;

      // Run delivery cascade for day1_shutdown
      const latest = useGameStore.getState();
      const homeFs = latest.computerState.home?.fs ?? newFs;
      const shutdownEvent: GameEvent = { type: "command_executed", detail: "shutdown" };
      const emailResult = checkEmailDeliveries(
        homeFs,
        shutdownEvent,
        [...latest.deliveredEmailIds],
        "home"
      );
      if (emailResult.newDeliveries.length > 0) {
        latest.setComputerFs("home", emailResult.fs);
        latest.addDeliveredEmails(emailResult.newDeliveries);
      }

      const latestForPiper = useGameStore.getState();
      const newPiperIds = checkPiperDeliveries(
        shutdownEvent,
        [...latestForPiper.deliveredPiperIds],
        username,
        "home",
        latestForPiper.storyFlags
      );
      if (newPiperIds.length > 0) {
        latestForPiper.addDeliveredPiperMessages(newPiperIds);

        // Process piper_delivered story flag triggers
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

          term.write("\x1b[?25h"); // restore cursor
          useGameStore.getState().setGamePhase("playing");
        }
      }, BOOT_LINE_INTERVAL_MS);
    }, 2500);
  }, [cwdRef, activeComputerRef, writePrompt]);

  return { runSshTransition, runCoderTransition, runExitToNexacorp, runExitToHome, runShutdownTransition };
}
