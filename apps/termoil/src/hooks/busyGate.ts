/**
 * The terminal's input gate: swallows keystrokes aimed at a pane while
 * something is still writing to it.
 *
 * Two claimants overlap in `useTerminal`. The enqueued command run in
 * `handleInput` claims the gate at submission and drops it in a `finally`; an
 * `incrementalLines` animation started by `executeEffects` keeps streaming
 * (via `setTimeout`) long after that promise resolves. Ownership is therefore
 * a monotonic token rather than a bare boolean: the most recent `acquire` owns
 * the gate, and a stale owner's `release` is a no-op. Without that, the
 * command's `finally` unlocked input mid-stream and the player could type over
 * a running animation.
 */
export interface BusyGate {
  /** True when input for `paneId` should be ignored. */
  isBlocked(paneId: string | null | undefined): boolean;
  /** Claim the gate for `paneId`; returns the token that now owns it. */
  acquire(paneId: string | null | undefined): number;
  /** Release the gate, but only if `token` is still the owner. */
  release(token: number): void;
}

export function createBusyGate(): BusyGate {
  let busy = false;
  let owner: string | null | undefined = null;
  let token = 0;

  return {
    isBlocked: (paneId) => busy && paneId === owner,
    acquire: (paneId) => {
      busy = true;
      owner = paneId;
      token += 1;
      return token;
    },
    release: (t) => {
      if (t !== token) return;
      busy = false;
      owner = null;
    },
  };
}
