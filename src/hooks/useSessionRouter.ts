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
import { ISession } from "../engine/session/types";
import { SessionToStart } from "../engine/commands/applyResult";
import { StoryFlags } from "../state/types";
import { COMMANDS_SECTION_ROW } from "../engine/filesystem/homeFilesystem";
import { UNLOCK_BOX } from "../lib/ascii";

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
        for (const event of result.triggerEvents) {
          // Detect SSH connect event — trigger transition
          if (event.type === "objective_completed" && event.detail === "ssh_connect") {
            shouldTransition = true;
            continue;
          }

          // Handle commands_unlocked event from nano trigger
          if (event.type === "objective_completed" && event.detail === "commands_unlocked") {
            setStoryFlag("commands_unlocked", true);
            storyFlagsRef.current = { ...storyFlagsRef.current, commands_unlocked: true };
            UNLOCK_BOX.forEach((line) => term.writeln(line));
            useGameStore.getState().addToast("New commands unlocked! Type 'help' to see all.");
            useGameStore.getState().completeObjective("learn_commands");
            continue;
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

          // Process story flags (e.g. edward_impression from reply options)
          if (
            activeComputerRef.current === "home" &&
            event.type === "objective_completed" &&
            event.detail.startsWith("edward_impression:")
          ) {
            const impression = event.detail.split(":")[1];
            setStoryFlag("edward_impression", impression);
            storyFlagsRef.current = { ...storyFlagsRef.current, edward_impression: impression };
          }

          // Wire objective_completed events to store
          if (
            event.type === "objective_completed" &&
            !event.detail.startsWith("edward_impression:")
          ) {
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
      }
    },
    [setFs, writePrompt, fsRef, usernameRef, getEditorTrigger]
  );

  return { hasActiveSession, routeInput, startSession };
}
