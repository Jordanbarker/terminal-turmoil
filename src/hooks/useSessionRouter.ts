import { useCallback, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { EditorSession, EditorTrigger } from "../engine/editor/EditorSession";
import { PythonReplSession } from "../engine/python/PythonReplSession";
import { SnowSQLSession } from "../engine/snowflake/session/SnowSQLSession";
import { createDefaultContext } from "../engine/snowflake/session/context";
import { checkEmailDeliveries } from "../engine/mail/delivery";
import { PromptSession } from "../engine/prompt/PromptSession";
import { SshSession } from "../engine/ssh/SshSession";
import { ChipSession } from "../engine/chip/ChipSession";
import { ISession } from "../engine/session/types";
import { SessionToStart } from "../engine/commands/applyResult";
import { StoryFlags } from "../state/types";
import { COMMANDS_SECTION_ROW } from "../engine/filesystem/homeFilesystem";
import { UNLOCK_BOX } from "../lib/ascii";
import { buildDbtProject } from "../engine/filesystem/initialFilesystem";

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
  commands_unlocked: (ctx) => {
    ctx.setStoryFlag("commands_unlocked", true);
    ctx.storyFlagsRef.current = { ...ctx.storyFlagsRef.current, commands_unlocked: true };
    UNLOCK_BOX.forEach((line) => ctx.term.writeln(line));
    useGameStore.getState().addToast("New commands unlocked! Type 'help' to see all.");
    useGameStore.getState().completeObjective("learn_commands");
    return { skipDefault: true };
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
  activeComputerRef: React.MutableRefObject<"home" | "nexacorp">;
  storyFlagsRef: React.MutableRefObject<StoryFlags>;
  setFs: (fs: VirtualFS) => void;
  addDeliveredEmails: (ids: string[]) => void;
  setStoryFlag: (key: string, value: string | boolean) => void;
  writePrompt: (term: Terminal) => void;
  runSshTransition: (term: Terminal) => void;
}

export function useSessionRouter(deps: SessionRouterDeps) {
  const {
    fsRef,
    usernameRef,
    deliveredIdsRef,
    activeComputerRef,
    storyFlagsRef,
    setFs,
    addDeliveredEmails,
    setStoryFlag,
    writePrompt,
    runSshTransition,
  } = deps;

  const sessionRef = useRef<ISession | null>(null);
  const sessionTypeRef = useRef<string | null>(null);

  const hasActiveSession = useCallback(() => {
    return sessionRef.current !== null;
  }, []);

  /** Route input to the active session. Returns true if input was consumed. */
  const routeInput = useCallback(
    (term: Terminal, data: string): boolean => {
      if (!sessionRef.current) return false;

      const result = sessionRef.current.handleInput(data);
      if (!result) return true; // still waiting (prompt session)
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

      if (type === "snowsql" && result.newState) {
        const store = useGameStore.getState();
        store.setSnowflakeState(result.newState);
      }

      if (result.newFs) {
        setFs(result.newFs);
        fsRef.current = result.newFs;
      }

      if (result.output) {
        term.write(result.output.replace(/\n/g, "\r\n"));
      }

      // Fire trigger events from sessions
      if (result.triggerEvents) {
        let shouldTransition = false;
        const actionCtx: EventActionContext = { term, setStoryFlag, storyFlagsRef, fsRef, setFs };

        for (const event of result.triggerEvents) {
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
            term.write(`\r\n\nYou have new mail in /var/mail/${usernameRef.current}`);
          }

          // Wire objective_completed events to store
          if (event.type === "objective_completed") {
            const store = useGameStore.getState();
            store.completeObjective(event.detail);
          }
        }

        if (shouldTransition) {
          runSshTransition(term);
          return true;
        }
      }

      writePrompt(term);
      return true;
    },
    [setFs, addDeliveredEmails, setStoryFlag, writePrompt, runSshTransition, fsRef, usernameRef, deliveredIdsRef, activeComputerRef, storyFlagsRef]
  );

  /** Build an EditorTrigger if the file is terminal_notes.txt on home PC before unlock. */
  const getEditorTrigger = useCallback(
    (filePath: string): EditorTrigger | undefined => {
      if (activeComputerRef.current !== "home") return undefined;
      if (storyFlagsRef.current.commands_unlocked) return undefined;
      const homeDir = fsRef.current.homeDir;
      if (filePath !== `${homeDir}/terminal_notes.txt`) return undefined;
      return {
        triggerRow: COMMANDS_SECTION_ROW,
        triggerEvents: [{ type: "objective_completed", detail: "commands_unlocked" }],
      };
    },
    [fsRef, activeComputerRef, storyFlagsRef]
  );

  /** Start a new session from an AppliedEffects startSession descriptor. */
  const startSession = useCallback(
    (term: Terminal, session: SessionToStart): void => {
      if (session.type === "editor") {
        const { filePath, content, readOnly } = session.info;
        const trigger = getEditorTrigger(filePath);
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
      } else if (session.type === "snowsql") {
        const store = useGameStore.getState();
        const snowsqlSession = new SnowSQLSession(
          term,
          store.snowflakeState,
          createDefaultContext(store.username),
          (newState) => store.setSnowflakeState(newState)
        );
        sessionRef.current = snowsqlSession;
        sessionTypeRef.current = "snowsql";
        snowsqlSession.enter();
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
      }
    },
    [setFs, setStoryFlag, writePrompt, fsRef, usernameRef, storyFlagsRef, getEditorTrigger]
  );

  return { hasActiveSession, routeInput, startSession };
}
