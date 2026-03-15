import { useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { createDevcontainerFilesystem } from "../story/filesystem/devcontainer";
import { createHomeFilesystem } from "../story/filesystem/home";
import { checkEmailDeliveries, seedDeliveredEmails } from "../engine/mail/delivery";
import { seedImmediatePiper } from "../engine/piper/delivery";
import { colorize, ansi } from "../lib/ansi";
import { nexacorpLogo, getSshConnectionSequence, getBootSequence, getCoderConnectionSequence, coderBanner } from "../lib/ascii";
import { BOOT_LINE_INTERVAL_MS } from "../lib/timing";

interface TransitionRefs {
  fsRef: React.MutableRefObject<VirtualFS>;
  cwdRef: React.MutableRefObject<string>;
  usernameRef: React.MutableRefObject<string>;
  deliveredIdsRef: React.MutableRefObject<string[]>;
  deliveredPiperIdsRef: React.MutableRefObject<string[]>;
  activeComputerRef: React.MutableRefObject<import("../state/types").ComputerId>;
  storyFlagsRef: React.MutableRefObject<import("../state/types").StoryFlags>;
  stashedFsRef: React.MutableRefObject<VirtualFS | null>;
  stashedCwdRef: React.MutableRefObject<string | null>;
}

interface TransitionSetters {
  setFs: (fs: VirtualFS) => void;
  setCwd: (cwd: string) => void;
  setActiveComputer: (id: import("../state/types").ComputerId) => void;
  setGamePhase: (phase: import("../state/types").GamePhase) => void;
  setCurrentChapter: (chapter: string) => void;
  setStashedFs: (fs: VirtualFS | null) => void;
  setStashedCwd: (cwd: string) => void;
  setStoryFlag: (key: string, value: string | boolean) => void;
  addDeliveredEmails: (ids: string[]) => void;
  addDeliveredPiperMessages: (ids: string[]) => void;
  writePrompt: (term: Terminal) => void;
}

export function useComputerTransitions(refs: TransitionRefs, setters: TransitionSetters) {
  const {
    fsRef,
    cwdRef,
    usernameRef,
    deliveredIdsRef,
    deliveredPiperIdsRef,
    activeComputerRef,
    storyFlagsRef,
    stashedFsRef,
    stashedCwdRef,
  } = refs;

  const {
    setFs,
    setCwd,
    setActiveComputer,
    setGamePhase,
    setCurrentChapter,
    setStashedFs,
    setStashedCwd,
    setStoryFlag,
    addDeliveredEmails,
    addDeliveredPiperMessages,
    writePrompt,
  } = setters;

  const runSshTransition = useCallback((term: Terminal) => {
    setGamePhase("transitioning");

    // Phase 1: SSH connection lines
    const sshLines = getSshConnectionSequence(usernameRef.current);
    let i = 0;
    const sshInterval = setInterval(() => {
      if (i < sshLines.length) {
        term.writeln(sshLines[i]);
        i++;
      } else {
        clearInterval(sshInterval);

        // Switch computer and rebuild filesystem
        setTimeout(() => {
          term.clear();
          setActiveComputer("nexacorp");
          activeComputerRef.current = "nexacorp";
          setCurrentChapter("chapter-2");

          // setUsername rebuilds NexaCorp filesystem
          const store = useGameStore.getState();
          store.setUsername(store.username);

          // Sync refs from rebuilt state
          const state = useGameStore.getState();
          fsRef.current = state.fs;
          cwdRef.current = state.cwd;

          // Seed immediate piper messages for NexaCorp
          const piperIds = seedImmediatePiper(state.username, "nexacorp");
          if (piperIds.length > 0) {
            addDeliveredPiperMessages(piperIds);
            deliveredPiperIdsRef.current = [...deliveredPiperIdsRef.current, ...piperIds];
          }

          // Phase 2: Boot sequence
          setGamePhase("booting");
          const bootLines = getBootSequence(usernameRef.current);
          let j = 0;
          const bootInterval = setInterval(() => {
            if (j < bootLines.length) {
              term.writeln(bootLines[j]);
              j++;
            } else {
              clearInterval(bootInterval);
              term.writeln("");
              nexacorpLogo.forEach((line) => term.writeln(line));
              setGamePhase("playing");
            }
          }, BOOT_LINE_INTERVAL_MS);
        }, BOOT_LINE_INTERVAL_MS);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [setGamePhase, setActiveComputer, setCurrentChapter, addDeliveredPiperMessages, fsRef, cwdRef, usernameRef, deliveredPiperIdsRef, activeComputerRef]);

  const runCoderTransition = useCallback((term: Terminal) => {
    setGamePhase("transitioning");

    // Capture old stash (previous devcontainer FS, or null on first visit) before overwriting
    const previousDevcontainerFs = stashedFsRef.current;
    const previousDevcontainerCwd = stashedCwdRef.current;

    // Stash current NexaCorp FS so we can restore it on exit
    setStashedFs(fsRef.current);
    setStashedCwd(cwdRef.current);
    stashedFsRef.current = fsRef.current;
    stashedCwdRef.current = cwdRef.current;

    // Show connection animation
    const lines = getCoderConnectionSequence();
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        term.writeln(lines[i]);
        i++;
      } else {
        clearInterval(interval);

        setActiveComputer("devcontainer");
        activeComputerRef.current = "devcontainer";

        // Mark devcontainer as visited so dbt/snow unlock on NexaCorp
        setStoryFlag("devcontainer_visited", true);
        storyFlagsRef.current = { ...storyFlagsRef.current, devcontainer_visited: true };
        useGameStore.getState().addToast("dbt and snow commands unlocked on NexaCorp!");

        // Restore previous devcontainer FS or build fresh on first visit
        let newFs: VirtualFS;
        let newCwd: string;
        if (previousDevcontainerFs) {
          newFs = previousDevcontainerFs;
          newCwd = (previousDevcontainerCwd && previousDevcontainerFs.getNode(previousDevcontainerCwd))
            ? previousDevcontainerCwd
            : previousDevcontainerFs.cwd;
        } else {
          const username = usernameRef.current;
          const root = createDevcontainerFilesystem(username);
          newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);
          newCwd = newFs.cwd;
        }

        setFs(newFs);
        fsRef.current = newFs;
        setCwd(newCwd);
        cwdRef.current = newCwd;

        term.writeln("");
        coderBanner.forEach((line) => term.writeln(line));
        setGamePhase("playing");
        writePrompt(term);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [setGamePhase, setActiveComputer, setFs, setCwd, setStashedFs, setStashedCwd, setStoryFlag, writePrompt, fsRef, cwdRef, usernameRef, activeComputerRef, storyFlagsRef, stashedFsRef, stashedCwdRef]);

  const runExitToNexacorp = useCallback((term: Terminal) => {
    // Capture the NexaCorp FS from stash before overwriting
    const nexaFs = stashedFsRef.current;
    const nexaCwd = stashedCwdRef.current;

    // Stash current devcontainer FS for re-entry
    setStashedFs(fsRef.current);
    setStashedCwd(cwdRef.current);
    stashedFsRef.current = fsRef.current;
    stashedCwdRef.current = cwdRef.current;

    // Restore NexaCorp FS
    if (nexaFs) {
      setFs(nexaFs);
      fsRef.current = nexaFs;
      const cwd = (nexaCwd && nexaFs.getNode(nexaCwd)) ? nexaCwd : nexaFs.cwd;
      setCwd(cwd);
      cwdRef.current = cwd;
    }

    setActiveComputer("nexacorp");
    activeComputerRef.current = "nexacorp";

    term.writeln(colorize("\r\nDisconnected from coder-ai.", ansi.dim));
    writePrompt(term);
  }, [setActiveComputer, setFs, setCwd, setStashedFs, setStashedCwd, writePrompt, fsRef, cwdRef, activeComputerRef, stashedFsRef, stashedCwdRef]);

  const runExitToHome = useCallback((term: Terminal) => {
    // Stash current NexaCorp FS for future day 2 restore
    setStashedFs(fsRef.current);
    setStashedCwd(cwdRef.current);
    stashedFsRef.current = fsRef.current;
    stashedCwdRef.current = cwdRef.current;

    setGamePhase("transitioning");

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

        setActiveComputer("home");
        activeComputerRef.current = "home";

        // Rebuild home FS
        const username = usernameRef.current;
        const root = createHomeFilesystem(username);
        let newFs = new VirtualFS(root, `/home/${username}`, `/home/${username}`);

        // Re-seed previously delivered emails
        const allDelivered = deliveredIdsRef.current;
        if (allDelivered.length > 0) {
          newFs = seedDeliveredEmails(newFs, allDelivered, "home", username);
        }

        setFs(newFs);
        fsRef.current = newFs;
        setCwd(newFs.cwd);
        cwdRef.current = newFs.cwd;

        // Set story flags and complete objective
        setStoryFlag("returned_home_day1", true);
        storyFlagsRef.current = { ...storyFlagsRef.current, returned_home_day1: true };

        const store = useGameStore.getState();
        store.completeObjective("head_home");

        // Deliver Alex's email triggered by head_home objective
        const deliveryResult = checkEmailDeliveries(
          fsRef.current,
          { type: "objective_completed", detail: "head_home" },
          [...deliveredIdsRef.current],
          "home"
        );
        if (deliveryResult.newDeliveries.length > 0) {
          setFs(deliveryResult.fs);
          fsRef.current = deliveryResult.fs;
          addDeliveredEmails(deliveryResult.newDeliveries);
          deliveredIdsRef.current = [...deliveredIdsRef.current, ...deliveryResult.newDeliveries];
          term.writeln("");
          term.write(colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold));
        }

        setGamePhase("playing");
        writePrompt(term);
      }
    }, BOOT_LINE_INTERVAL_MS);
  }, [setGamePhase, setActiveComputer, setFs, setCwd, setStashedFs, setStashedCwd, setStoryFlag, addDeliveredEmails, writePrompt, fsRef, cwdRef, usernameRef, deliveredIdsRef, activeComputerRef, storyFlagsRef, stashedFsRef, stashedCwdRef]);

  return { runSshTransition, runCoderTransition, runExitToNexacorp, runExitToHome };
}
