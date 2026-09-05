import type { Challenge } from "./types";

// Teaches multi-session juggling: create a second named session, hop back to
// the original, and clean up with kill-session. Step 1's hint teaches the
// nested-session rule (`tmux new` while attached errors with "sessions should
// be nested with care") — the instruction states the objective so the error
// is discoverable, not baked in.
//
// Steps are cumulative state checkpoints, so out-of-order play still
// completes: e.g. killing "scratch" while detached and then attaching to 0
// satisfies steps 4 and 5 in one cascade pass, and killing "scratch" from
// inside it (which drops the client to a bare shell) satisfies step 3 on the
// way, so the following `attach -t 0` still cascades to the end.
export const sessionsJuggle: Challenge = {
  id: "sessions-juggle",
  title: "Juggle two sessions",
  type: "tmux",
  checkWhileDetached: true,
  commands: [], // tmux itself is always available
  brief:
    "Create a second session named scratch, then return to your original session and kill scratch.",
  setup: (base) => base,
  steps: [
    {
      instruction:
        "Free your client so a second session can be created (tmux refuses to start a session inside another).",
      hint: "Starting a session while attached fails with \"sessions should be nested with care\": detach first.",
      command: "tmux detach",
      isComplete: (s) =>
        s.tmux.attachedSession === null &&
        s.tmux.detachedSessions.some((d) => d.name === "0"),
    },
    {
      instruction: "Create a new session named scratch.",
      hint: "new-session takes -s to name the session.",
      command: "tmux new -s scratch",
      isComplete: (s) =>
        s.tmux.attachedSession === "scratch" &&
        s.tmux.detachedSessions.some((d) => d.name === "0"),
    },
    {
      instruction: "Detach from scratch, keeping both sessions alive.",
      hint: "Same move as before; the server now holds two sessions.",
      command: "tmux detach",
      // Deliberately does NOT require scratch to still be alive: killing
      // scratch from inside it lands the player detached with only 0 — the
      // same never-again predicate trap step 4's comment describes. The
      // looser check is cascade-safe: step 2 (attached to scratch) gates
      // entry to this step, and no state on the way there satisfies it.
      isComplete: (s) =>
        s.tmux.attachedSession === null &&
        s.tmux.detachedSessions.some((d) => d.name === "0"),
    },
    {
      instruction: "Reattach to your original session (0), not scratch.",
      hint: "attach defaults to the most recently detached session; use -t to target a specific one.",
      command: "tmux attach -t 0",
      // Deliberately does NOT require scratch to still exist: a player who
      // kills scratch while detached must not be stranded on a predicate that
      // can never be true again — the cascade then consumes steps 4 and 5 together.
      isComplete: (s) => s.tmux.attachedSession === "0",
    },
    {
      instruction: "Kill the scratch session.",
      hint: "kill-session takes -t to target a session other than the current one.",
      command: "tmux kill-session -t scratch",
      isComplete: (s) =>
        s.tmux.attachedSession === "0" &&
        !s.tmux.detachedSessions.some((d) => d.name === "scratch"),
    },
  ],
};
