import { useCallback, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { EditorSession } from "../engine/editor/EditorSession";
import { PythonReplSession } from "../engine/python/PythonReplSession";
import { SnowSqlSession } from "../engine/snowflake/session/SnowSqlSession";
import { createDefaultContext } from "../engine/snowflake/session/context";
import { checkEmailDeliveries } from "../engine/mail/delivery";
import { getTriggersForComputer, checkStoryFlagTriggers } from "../engine/narrative/storyFlags";
import { colorize, ansi } from "../lib/ansi";
import { PromptSession } from "../engine/prompt/PromptSession";
import { SshSession } from "../engine/ssh/SshSession";
import { ChipSession } from "../engine/chip/ChipSession";
import { PiperSession } from "../engine/piper/PiperSession";
import { checkPiperDeliveries } from "../engine/piper/delivery";
import { ISession } from "../engine/session/types";
import { SessionToStart } from "../engine/commands/applyResult";
import { ComputerId, StoryFlags } from "../state/types";
import { buildDbtProject } from "../story/filesystem/nexacorp";

interface EventActionContext {
  term: Terminal;
  setStoryFlag: (key: string, value: string | boolean) => void;
  storyFlagsRef: React.MutableRefObject<StoryFlags>;
  fsRef: React.MutableRefObject<VirtualFS>;
  setFs: (fs: VirtualFS) => void;
}

interface EventActionResult {
  shouldTransition?: boolean;
  skipDefault?: boolean;
}

/** Maps objective_completed event details to special actions. New events go here. */
const EVENT_ACTIONS: Record<string, (ctx: EventActionContext) => EventActionResult> = {
  ssh_connect: () => ({ shouldTransition: true, skipDefault: true }),
  search_tools_accepted: (ctx) => {
    ctx.setStoryFlag("search_tools_unlocked", true);
    ctx.storyFlagsRef.current = { ...ctx.storyFlagsRef.current, search_tools_unlocked: true };
    useGameStore.getState().addToast("grep, find, and diff are now available!");
    return {};
  },
  inspection_tools_accepted: (ctx) => {
    ctx.setStoryFlag("inspection_tools_unlocked", true);
    ctx.storyFlagsRef.current = { ...ctx.storyFlagsRef.current, inspection_tools_unlocked: true };
    useGameStore.getState().addToast("head, tail, and wc are now available!");
    return {};
  },
  processing_tools_accepted: (ctx) => {
    ctx.setStoryFlag("processing_tools_unlocked", true);
    ctx.storyFlagsRef.current = { ...ctx.storyFlagsRef.current, processing_tools_unlocked: true };
    useGameStore.getState().addToast("sort and uniq are now available!");
    return {};
  },
  pipeline_tools_accepted: (ctx) => {
    ctx.setStoryFlag("coder_unlocked", true);
    ctx.storyFlagsRef.current = { ...ctx.storyFlagsRef.current, coder_unlocked: true };
    useGameStore.getState().addToast("coder command is now available! Try: coder ssh ai");
    return {};
  },
  dana_ops_accepted: (ctx) => {
    ctx.setStoryFlag("chmod_unlocked", true);
    ctx.storyFlagsRef.current = { ...ctx.storyFlagsRef.current, chmod_unlocked: true };
    useGameStore.getState().addToast("chmod command unlocked!");
    return {};
  },
  dana_ops_no_access: () => {
    return {};
  },
  dbt_project_cloned: (ctx) => {
    ctx.setStoryFlag("dbt_project_cloned", true);
    ctx.storyFlagsRef.current = { ...ctx.storyFlagsRef.current, dbt_project_cloned: true };
    const homeDir = ctx.fsRef.current.homeDir;
    const result = ctx.fsRef.current.insertNode(`${homeDir}/nexacorp-analytics`, buildDbtProject());
    if (result.fs) {
      ctx.setFs(result.fs);
      ctx.fsRef.current = result.fs;
    }
    useGameStore.getState().addToast("dbt project cloned to ~/nexacorp-analytics/");
    return { skipDefault: true };
  },
};

interface SessionRouterDeps {
  fsRef: React.MutableRefObject<VirtualFS>;
  usernameRef: React.MutableRefObject<string>;
  deliveredIdsRef: React.MutableRefObject<string[]>;
  deliveredPiperIdsRef: React.MutableRefObject<string[]>;
  activeComputerRef: React.MutableRefObject<ComputerId>;
  storyFlagsRef: React.MutableRefObject<StoryFlags>;
  setFs: (fs: VirtualFS) => void;
  addDeliveredEmails: (ids: string[]) => void;
  addDeliveredPiperMessages: (ids: string[]) => void;
  setStoryFlag: (key: string, value: string | boolean) => void;
  writePrompt: (term: Terminal) => void;
  runSshTransition: (term: Terminal) => void;
}

export function useSessionRouter(deps: SessionRouterDeps) {
  const {
    fsRef,
    usernameRef,
    deliveredIdsRef,
    deliveredPiperIdsRef,
    activeComputerRef,
    storyFlagsRef,
    setFs,
    addDeliveredEmails,
    addDeliveredPiperMessages,
    setStoryFlag,
    writePrompt,
    runSshTransition,
  } = deps;

  const sessionRef = useRef<ISession | null>(null);
  const sessionTypeRef = useRef<string | null>(null);
  const piperInfoRef = useRef<import("../engine/piper/types").PiperSessionInfo | null>(null);

  const hasActiveSession = useCallback(() => {
    return sessionRef.current !== null;
  }, []);

  /** Sync piper IDs from the live session back to game state. */
  const syncPiperIds = useCallback(() => {
    if (!piperInfoRef.current) return;
    const newIds = piperInfoRef.current.deliveredPiperIds.filter(
      (id) => !deliveredPiperIdsRef.current.includes(id)
    );
    if (newIds.length > 0) {
      addDeliveredPiperMessages(newIds);
      deliveredPiperIdsRef.current = [...deliveredPiperIdsRef.current, ...newIds];

      // Fire piper_delivered story flag triggers for newly delivered messages
      const piperTriggers = getTriggersForComputer(activeComputerRef.current, usernameRef.current);
      for (const id of newIds) {
        if (id.startsWith("reply:") || id.startsWith("seen:")) continue;
        const pdEvent = { type: "piper_delivered" as const, detail: id };
        const flagResults = checkStoryFlagTriggers(pdEvent, piperTriggers, storyFlagsRef.current);
        for (const flagResult of flagResults) {
          setStoryFlag(flagResult.flag, flagResult.value);
          storyFlagsRef.current = { ...storyFlagsRef.current, [flagResult.flag]: flagResult.value };
          if (flagResult.toast) useGameStore.getState().addToast(flagResult.toast);
        }
      }
    }
  }, [addDeliveredPiperMessages, setStoryFlag, deliveredPiperIdsRef, activeComputerRef, usernameRef, storyFlagsRef]);

  /**
   * Process trigger events from a session result. Returns true if SSH transition triggered.
   * When notify is false (mid-session), skip terminal notifications since the session owns the screen.
   */
  const processTriggerEvents = useCallback(
    (term: Terminal, events: import("../engine/mail/delivery").GameEvent[], notify: boolean): boolean => {
      let shouldTransition = false;
      const actionCtx: EventActionContext = { term, setStoryFlag, storyFlagsRef, fsRef, setFs };

      for (const event of events) {
        // Check for registered event actions
        if (event.type === "objective_completed" && EVENT_ACTIONS[event.detail]) {
          const actionResult = EVENT_ACTIONS[event.detail](actionCtx);
          if (actionResult.shouldTransition) shouldTransition = true;
          if (actionResult.skipDefault) continue;
        }

        const delivery = checkEmailDeliveries(
          fsRef.current,
          event,
          deliveredIdsRef.current,
          activeComputerRef.current
        );
        if (delivery.newDeliveries.length > 0) {
          setFs(delivery.fs);
          fsRef.current = delivery.fs;
          addDeliveredEmails(delivery.newDeliveries);
          deliveredIdsRef.current = [
            ...deliveredIdsRef.current,
            ...delivery.newDeliveries,
          ];
          if (notify) {
            term.write(`\r\n\n${colorize(`You have new mail in /var/mail/${usernameRef.current}`, ansi.yellow, ansi.bold)}`);
          }
        }

        // Check piper deliveries
        const piperNew = checkPiperDeliveries(
          event,
          deliveredPiperIdsRef.current,
          usernameRef.current,
          activeComputerRef.current,
          storyFlagsRef.current
        );
        if (piperNew.length > 0) {
          addDeliveredPiperMessages(piperNew);
          deliveredPiperIdsRef.current = [
            ...deliveredPiperIdsRef.current,
            ...piperNew,
          ];
          if (notify) {
            term.write(`\r\n\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
          }
        }

        // Wire objective_completed events to store
        if (event.type === "objective_completed") {
          const store = useGameStore.getState();
          store.completeObjective(event.detail);
        }
      }

      // Process story flag triggers from session events
      const triggers = getTriggersForComputer(activeComputerRef.current, usernameRef.current);
      for (const event of events) {
        const flagResults = checkStoryFlagTriggers(event, triggers, storyFlagsRef.current);
        for (const flagResult of flagResults) {
          setStoryFlag(flagResult.flag, flagResult.value);
          storyFlagsRef.current = { ...storyFlagsRef.current, [flagResult.flag]: flagResult.value };
          if (flagResult.toast) useGameStore.getState().addToast(flagResult.toast);
        }
      }

      return shouldTransition;
    },
    [setFs, addDeliveredEmails, addDeliveredPiperMessages, setStoryFlag, fsRef, usernameRef, deliveredIdsRef, deliveredPiperIdsRef, activeComputerRef, storyFlagsRef]
  );

  /** Route input to the active session. Returns true if input was consumed. */
  const routeInput = useCallback(
    (term: Terminal, data: string): boolean => {
      if (!sessionRef.current) return false;

      const result = sessionRef.current.handleInput(data);
      if (!result) return true; // still waiting (prompt session)

      // Apply session FS changes FIRST so trigger event deliveries build on top
      if (result.newFs) {
        fsRef.current = result.newFs;
      }

      // Process mid-session events without terminal notifications (session owns the screen)
      if (result.triggerEvents?.length && result.type !== "exit") {
        processTriggerEvents(term, result.triggerEvents, false);
      }

      // Sync piper IDs mid-session (replies + seen markers)
      if (sessionTypeRef.current === "piper") {
        syncPiperIds();
      }

      if (result.type !== "exit") return true; // continue

      // Session exited — clean up
      const type = sessionTypeRef.current;
      sessionRef.current = null;
      sessionTypeRef.current = null;

      // Mark intro as seen when player exits nano (not when it opens)
      if (type === "editor" && activeComputerRef.current === "home") {
        const store = useGameStore.getState();
        if (!store.hasSeenIntro) {
          store.setHasSeenIntro();
        }
      }

      if (type === "snow-sql" && result.newState) {
        const store = useGameStore.getState();
        store.setSnowflakeState(result.newState);
      }

      // Final piper ID sync on exit
      if (type === "piper") {
        syncPiperIds();
        piperInfoRef.current = null;
      }

      if (result.output) {
        term.write(result.output.replace(/\n/g, "\r\n"));
      }

      // Process exit trigger events AFTER output, with notification
      if (result.triggerEvents?.length) {
        const shouldTransition = processTriggerEvents(term, result.triggerEvents, true);
        if (shouldTransition) {
          runSshTransition(term);
          return true;
        }
      }

      // Sync store with fsRef (which may have been updated by trigger event deliveries)
      if (result.newFs) {
        setFs(fsRef.current);
      }

      writePrompt(term);
      return true;
    },
    [setFs, setStoryFlag, writePrompt, runSshTransition, fsRef, usernameRef, deliveredIdsRef, deliveredPiperIdsRef, activeComputerRef, storyFlagsRef, processTriggerEvents, syncPiperIds]
  );

  /** Start a new session from an AppliedEffects startSession descriptor. */
  const startSession = useCallback(
    (term: Terminal, session: SessionToStart): void => {
      if (session.type === "editor") {
        const { filePath, content, readOnly, triggerRow, triggerEvents, requireSave } = session.info;
        const trigger = triggerEvents
          ? { triggerRow: triggerRow ?? 0, triggerEvents, requireSave }
          : undefined;
        const editorSession = new EditorSession(
          term,
          fsRef.current,
          filePath,
          content,
          readOnly,
          (newFs: VirtualFS) => {
            setFs(newFs);
            fsRef.current = newFs;
          },
          trigger
        );
        sessionRef.current = editorSession;
        sessionTypeRef.current = "editor";
        editorSession.enter();
      } else if (session.type === "snow-sql") {
        const store = useGameStore.getState();
        const snowSqlSession = new SnowSqlSession(
          term,
          store.snowflakeState,
          createDefaultContext(store.username),
          (newState) => store.setSnowflakeState(newState)
        );
        sessionRef.current = snowSqlSession;
        sessionTypeRef.current = "snow-sql";
        snowSqlSession.enter();
      } else if (session.type === "prompt") {
        const promptSession = new PromptSession(
          term,
          session.info,
          fsRef.current,
          usernameRef.current
        );
        sessionRef.current = promptSession;
        sessionTypeRef.current = "prompt";
        promptSession.enter();
      } else if (session.type === "pythonRepl") {
        const pythonSession = new PythonReplSession(term);
        sessionRef.current = pythonSession;
        sessionTypeRef.current = "pythonRepl";
        pythonSession.enter().then(() => {
          if (!pythonSession.isReady()) {
            sessionRef.current = null;
            sessionTypeRef.current = null;
            writePrompt(term);
          }
        });
      } else if (session.type === "ssh") {
        const sshSession = new SshSession(
          term,
          fsRef.current,
          session.info.host,
          session.info.username,
          fsRef.current.homeDir
        );
        sessionRef.current = sshSession;
        sessionTypeRef.current = "ssh";
        sshSession.enter();
      } else if (session.type === "chip") {
        const chipSession = new ChipSession(term, session.info, (topics) => {
          const value = topics.join(",");
          setStoryFlag("used_chip_topics", value);
          storyFlagsRef.current = { ...storyFlagsRef.current, used_chip_topics: value };
        });
        sessionRef.current = chipSession;
        sessionTypeRef.current = "chip";
        chipSession.enter();
      } else if (session.type === "piper") {
        const store = useGameStore.getState();
        const piperInfo = {
          ...session.info,
          deliveredPiperIds: [...store.deliveredPiperIds],
        };
        piperInfoRef.current = piperInfo;
        const piperSession = new PiperSession(term, piperInfo, store.username);
        sessionRef.current = piperSession;
        sessionTypeRef.current = "piper";
        piperSession.enter();
      }
    },
    [setFs, setStoryFlag, writePrompt, fsRef, usernameRef, storyFlagsRef]
  );

  return { hasActiveSession, routeInput, startSession };
}
