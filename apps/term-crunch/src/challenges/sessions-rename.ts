import type { Challenge } from "./types";

// Teaches rename-session, and specifically its -t requirement: once you've
// detached there is no current client, so `tmux rename-session old` errors with
// "no current client" and the player has to target the session by name.
//
// Steps are cumulative state checkpoints. Step 1 keys off the name being gone
// rather than any rename event, so a player who renames via a different route
// still passes.
export const sessionsRename: Challenge = {
  id: "sessions-rename",
  title: "Rename a session",
  type: "tmux",
  checkWhileDetached: true,
  commands: [], // tmux itself is always available
  brief:
    "Park your current session under the name old, then start a fresh one called new.",
  setup: (base) => base,
  steps: [
    {
      instruction: "Leave the session running and drop back to the bare shell.",
      hint: "Detaching disconnects your client without killing the session.",
      command: "tmux detach",
      isComplete: (s) =>
        s.tmux.attachedSession === null &&
        s.tmux.detachedSessions.some((d) => d.name === "0"),
    },
    {
      instruction: "Rename the parked session from 0 to old.",
      hint: "rename-session takes the new name as its argument; with no client attached you must also name the target with -t.",
      command: "tmux rename-session -t 0 old",
      isComplete: (s) =>
        s.tmux.detachedSessions.some((d) => d.name === "old") &&
        !s.tmux.detachedSessions.some((d) => d.name === "0"),
    },
    {
      instruction: "Start a new session named new, leaving old detached.",
      hint: "new-session takes -s to name the session.",
      command: "tmux new -s new",
      isComplete: (s) =>
        s.tmux.attachedSession === "new" &&
        s.tmux.detachedSessions.some((d) => d.name === "old"),
    },
  ],
};
