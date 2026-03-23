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
import { ComputerId } from "../state/types";

interface EventActionContext {
  term: Terminal;
  computerId: ComputerId;
}

interface EventActionResult {
  shouldTransition?: boolean;
  skipDefault?: boolean;
}

/** Maps objective_completed event details to special actions. New events go here. */
const EVENT_ACTIONS: Record<string, (ctx: EventActionContext) => EventActionResult> = {
  ssh_connect: () => {
    const store = useGameStore.getState();
    store.setStoryFlag("first_ssh_connect", true);
    return { shouldTransition: true, skipDefault: true };
  },
  search_tools_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("search_tools_unlocked", true);
    store.addToast("grep, find, and diff are now available!");
    // Unlock multi-terminal tabs alongside search tools
    if (!store.storyFlags.tabs_unlocked) {
      store.setStoryFlag("tabs_unlocked", true);
      store.addToast("Terminal tabs unlocked!");
    }
    return {};
  },
  inspection_tools_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("inspection_tools_unlocked", true);
    store.addToast("head, tail, and wc are now available!");
    return {};
  },
  processing_tools_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("processing_tools_unlocked", true);
    store.addToast("sort and uniq are now available!");
    return {};
  },
  pipeline_tools_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("coder_unlocked", true);
    store.addToast("coder command is now available! Try: coder ssh ai");
    return {};
  },
  dana_ops_accepted: (ctx) => {
    const store = useGameStore.getState();
    store.setStoryFlag("chmod_unlocked", true);
    store.addToast("chmod command unlocked!");
    return {};
  },
  dana_ops_no_access: () => {
    return {};
  },
};

interface SessionRouterDeps {
  activeComputerRef: React.MutableRefObject<ComputerId>;
  writePrompt: (term: Terminal) => void;
  getPrompt: () => string;
  runSshTransition: (term: Terminal) => void;
  pendingNotificationsRef: React.MutableRefObject<{ email: number; piper: number } | null>;
}

export function useSessionRouter(deps: SessionRouterDeps) {
  const { activeComputerRef, writePrompt, getPrompt, runSshTransition, pendingNotificationsRef } = deps;

  const sessionRef = useRef<ISession | null>(null);
  const sessionTypeRef = useRef<string | null>(null);
  const sessionTabIdRef = useRef<string | null>(null);
  const piperInfoRef = useRef<import("../engine/piper/types").PiperSessionInfo | null>(null);

  const hasActiveSession = useCallback(() => {
    return sessionRef.current !== null;
  }, []);

  /** Sync piper IDs from the live session back to game state. */
  const syncPiperIds = useCallback(() => {
    if (!piperInfoRef.current) return;
    const store = useGameStore.getState();
    const newIds = piperInfoRef.current.deliveredPiperIds.filter(
      (id) => !store.deliveredPiperIds.includes(id)
    );
    if (newIds.length > 0) {
      store.addDeliveredPiperMessages(newIds);

      // Fire piper_delivered story flag triggers for newly delivered messages
      const computerId = activeComputerRef.current;
      const latestStore = useGameStore.getState();
      const piperTriggers = getTriggersForComputer(computerId, latestStore.username);
      for (const id of newIds) {
        if (id.startsWith("reply:") || id.startsWith("seen:")) continue;
        const pdEvent = { type: "piper_delivered" as const, detail: id };
        const flagResults = checkStoryFlagTriggers(pdEvent, piperTriggers, latestStore.storyFlags);
        for (const flagResult of flagResults) {
          latestStore.setStoryFlag(flagResult.flag, flagResult.value);
          if (flagResult.toast) latestStore.addToast(flagResult.toast);
        }
      }
    }
  }, [activeComputerRef]);

  /**
   * Process trigger events from a session result. Returns true if SSH transition triggered.
   * When notify is false (mid-session), skip terminal notifications since the session owns the screen.
   */
  const processTriggerEvents = useCallback(
    (term: Terminal, events: import("../engine/mail/delivery").GameEvent[], notify: boolean): boolean => {
      let shouldTransition = false;
      const computerId = activeComputerRef.current;
      const actionCtx: EventActionContext = { term, computerId };

      for (const event of events) {
        // Check for registered event actions
        if (event.type === "objective_completed" && EVENT_ACTIONS[event.detail]) {
          const actionResult = EVENT_ACTIONS[event.detail](actionCtx);
          if (actionResult.shouldTransition) shouldTransition = true;
          if (actionResult.skipDefault) continue;
        }

        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;

        const delivery = checkEmailDeliveries(
          currentFs,
          event,
          store.deliveredEmailIds,
          computerId,
          store.storyFlags
        );
        if (delivery.newDeliveries.length > 0) {
          store.setComputerFs(computerId, delivery.fs);
          store.addDeliveredEmails(delivery.newDeliveries);
          if (notify) {
            term.write(`\r\n${colorize(`You have new mail in /var/mail/${store.username}`, ansi.yellow, ansi.bold)}`);
          }
        }

        // Check piper deliveries
        const latestStore = useGameStore.getState();
        const piperNew = checkPiperDeliveries(
          event,
          latestStore.deliveredPiperIds,
          latestStore.username,
          computerId,
          latestStore.storyFlags
        );
        if (piperNew.length > 0) {
          latestStore.addDeliveredPiperMessages(piperNew);
          if (notify) {
            term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
          }
        }

        // Wire objective_completed events to store
        if (event.type === "objective_completed") {
          useGameStore.getState().completeObjective(event.detail);
        }
      }

      // Process story flag triggers from session events
      const store = useGameStore.getState();
      const triggers = getTriggersForComputer(computerId, store.username);
      for (const event of events) {
        const latestFlags = useGameStore.getState().storyFlags;
        const flagResults = checkStoryFlagTriggers(event, triggers, latestFlags);
        for (const flagResult of flagResults) {
          useGameStore.getState().setStoryFlag(flagResult.flag, flagResult.value);
          if (flagResult.toast) useGameStore.getState().addToast(flagResult.toast);
        }
      }

      return shouldTransition;
    },
    [activeComputerRef]
  );

  /** Route input to the active session. Returns true if input was consumed. */
  const routeInput = useCallback(
    (term: Terminal, data: string): boolean => {
      if (!sessionRef.current) return false;

      // Only route input to the session from the tab that owns it
      const activeTabId = useGameStore.getState().activeTabId;
      if (activeTabId !== sessionTabIdRef.current) return false;

      const result = sessionRef.current.handleInput(data);
      if (!result) return true; // still waiting (prompt session)

      const computerId = activeComputerRef.current;

      // Apply session FS changes FIRST so trigger event deliveries build on top
      if (result.newFs) {
        useGameStore.getState().setComputerFs(computerId, result.newFs);
      }

      // Sync piper IDs mid-session BEFORE processing trigger events,
      // so processTriggerEvents sees already-delivered IDs and doesn't re-deliver them
      if (sessionTypeRef.current === "piper") {
        syncPiperIds();
      }

      // Process mid-session events without terminal notifications (session owns the screen)
      if (result.triggerEvents?.length && result.type !== "exit") {
        processTriggerEvents(term, result.triggerEvents, false);
      }

      if (result.type !== "exit") return true; // continue

      // Session exited — clean up
      const type = sessionTypeRef.current;
      sessionRef.current = null;
      sessionTypeRef.current = null;
      sessionTabIdRef.current = null;

      // Mark intro as seen when player exits nano (not when it opens)
      if (type === "editor" && computerId === "home") {
        const store = useGameStore.getState();
        if (!store.hasSeenIntro) {
          store.setHasSeenIntro();
        }
      }

      if (type === "snow-sql") {
        if (result.newState) {
          useGameStore.getState().setSnowflakeState(result.newState);
        }
        useGameStore.getState().setActiveSnowSession(null);
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
          pendingNotificationsRef.current = null;
          runSshTransition(term);
          return true;
        }
      }

      // Flush notifications deferred from the command that started this session
      let wroteNotifications = false;
      if (pendingNotificationsRef.current) {
        const pending = pendingNotificationsRef.current;
        pendingNotificationsRef.current = null;
        const username = useGameStore.getState().username;
        if (pending.email > 0) {
          term.write(`\r\n${colorize(`You have new mail in /var/mail/${username}`, ansi.yellow, ansi.bold)}`);
          wroteNotifications = true;
        }
        if (pending.piper > 0) {
          term.write(`\r\n${colorize("You have new messages on Piper", ansi.yellow, ansi.bold)}`);
          wroteNotifications = true;
        }
      }

      // FS was already synced to store via setComputerFs above
      // Piper and editor use the alternate screen buffer — no leading \r\n needed
      // (but if notifications were just written, we need a newline before the prompt)
      const usedAltScreen = type === "piper" || type === "editor";
      if (usedAltScreen) {
        term.write((wroteNotifications ? "\r\n" : "") + getPrompt());
      } else {
        writePrompt(term);
      }
      return true;
    },
    [activeComputerRef, processTriggerEvents, syncPiperIds, writePrompt, getPrompt, runSshTransition]
  );

  /** Start a new session from an AppliedEffects startSession descriptor. */
  const startSession = useCallback(
    (term: Terminal, session: SessionToStart, tabId?: string): void => {
      const computerId = activeComputerRef.current;
      sessionTabIdRef.current = tabId ?? useGameStore.getState().activeTabId;

      if (session.type === "editor") {
        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;
        const { filePath, content, readOnly, triggerRow, triggerEvents, requireSave } = session.info;
        const trigger = triggerEvents
          ? { triggerRow: triggerRow ?? 0, triggerEvents, requireSave }
          : undefined;
        const editorSession = new EditorSession(
          term,
          currentFs,
          filePath,
          content,
          readOnly,
          (newFs: VirtualFS) => {
            useGameStore.getState().setComputerFs(computerId, newFs);
          },
          trigger
        );
        sessionRef.current = editorSession;
        sessionTypeRef.current = "editor";
        editorSession.enter();
      } else if (session.type === "snow-sql") {
        const store = useGameStore.getState();
        if (store.activeSnowSession) {
          term.write("\r\n" + colorize("Another Snowflake session is already active.", ansi.red) + "\r\n");
          writePrompt(term);
          return;
        }
        const tabId = store.activeTabId;
        store.setActiveSnowSession(tabId);
        const snowSqlSession = new SnowSqlSession(
          term,
          store.snowflakeState,
          createDefaultContext(store.username),
          (newState) => useGameStore.getState().setSnowflakeState(newState),
          () => useGameStore.getState().setActiveSnowSession(null)
        );
        sessionRef.current = snowSqlSession;
        sessionTypeRef.current = "snow-sql";
        snowSqlSession.enter();
      } else if (session.type === "prompt") {
        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;
        const promptSession = new PromptSession(
          term,
          session.info,
          currentFs,
          store.username
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
        const store = useGameStore.getState();
        const currentFs = store.computerState[computerId]!.fs;
        const sshSession = new SshSession(
          term,
          currentFs,
          session.info.host,
          session.info.username,
          currentFs.homeDir
        );
        sessionRef.current = sshSession;
        sessionTypeRef.current = "ssh";
        const enterResult = sshSession.enter();
        if (enterResult && enterResult.type === "exit") {
          // Known host — process exit immediately without waiting for input
          sessionRef.current = null;
          sessionTypeRef.current = null;
          sessionTabIdRef.current = null;
          if (enterResult.triggerEvents?.length) {
            const shouldTransition = processTriggerEvents(term, enterResult.triggerEvents, true);
            if (shouldTransition) {
              pendingNotificationsRef.current = null;
              runSshTransition(term);
              return;
            }
          }
          writePrompt(term);
          return;
        }
      } else if (session.type === "chip") {
        const chipSession = new ChipSession(term, session.info, (topics) => {
          const value = topics.join(",");
          useGameStore.getState().setStoryFlag("used_chip_topics", value);
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
    [activeComputerRef, writePrompt]
  );

  const canCloseCurrentSession = useCallback((): boolean => {
    if (!sessionRef.current) return true;
    // Only the tab that owns the session needs to check canClose
    const activeTabId = useGameStore.getState().activeTabId;
    if (activeTabId !== sessionTabIdRef.current) return true;
    return sessionRef.current.canClose?.() ?? true;
  }, []);

  return { hasActiveSession, routeInput, startSession, canCloseCurrentSession };
}
