import type { Challenge } from "./types";

// Teaches the core tmux session lifecycle: detach (client leaves, session
// survives on the server), then reattach. checkWhileDetached is required —
// step 1 is only observable while detached, and checkCompletion normally
// skips the bare shell.
//
// Predicate gotchas:
// - `tmux ls` is read-only, so step 2 gates on the reattach; the ls output is
//   the payoff, not the checkpoint.
// - Step 2's predicate is trivially true at challenge load, but the cascade
//   starts at step 0 (false at load), so it can never pre-fire. Never make
//   step 0 of a lifecycle challenge something true at load.
export const sessionsDetachAttach: Challenge = {
  id: "sessions-detach-attach",
  title: "Detach & reattach",
  type: "tmux",
  checkWhileDetached: true,
  commands: [], // tmux itself is always available
  brief:
    "A long build is running in your session. Step away without killing it, then come back.",
  setup: (base) => base,
  steps: [
    {
      instruction:
        "Detach from the session, leaving it running on the server.",
      hint: "Detaching disconnects your client without killing the session; there's a prefix chord for it, and a tmux subcommand.",
      command: "tmux detach",
      isComplete: (s) =>
        s.tmux.attachedSession === null &&
        s.tmux.detachedSessions.some((d) => d.name === "0"),
    },
    {
      instruction:
        "List sessions to confirm it survived, then reattach.",
      hint: "tmux ls shows every session; attach reconnects to the most recently detached one by default.",
      command: "tmux attach",
      // Name-scoped, not a count: an explorer who spun up and detached some
      // other session first would be stranded forever by
      // `detachedSessions.length === 0`. Attaching to "0" is the checkpoint;
      // whatever else lives on the server is irrelevant here.
      isComplete: (s) => s.tmux.attachedSession === "0",
    },
  ],
};
