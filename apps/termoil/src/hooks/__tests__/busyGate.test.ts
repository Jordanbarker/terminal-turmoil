import { describe, it, expect } from "vitest";
import { createBusyGate } from "../busyGate";

describe("createBusyGate", () => {
  it("blocks only the pane that owns the gate", () => {
    const gate = createBusyGate();
    expect(gate.isBlocked("pane-1")).toBe(false);

    const token = gate.acquire("pane-1");
    expect(gate.isBlocked("pane-1")).toBe(true);
    expect(gate.isBlocked("pane-2")).toBe(false);

    gate.release(token);
    expect(gate.isBlocked("pane-1")).toBe(false);
  });

  // The bug this token exists for: `handleInput`'s enqueued command resolves
  // (and runs its `finally`) while an incrementalLines animation it kicked off
  // is still streaming. The stale release must not unlock the terminal.
  it("a superseded owner's release is a no-op", () => {
    const gate = createBusyGate();
    const commandToken = gate.acquire("pane-1");
    const streamToken = gate.acquire("pane-1");

    gate.release(commandToken); // the command's `finally`, mid-stream
    expect(gate.isBlocked("pane-1")).toBe(true);

    gate.release(streamToken); // last incremental line lands
    expect(gate.isBlocked("pane-1")).toBe(false);
  });

  it("releasing the same token twice does not unlock a later claimant", () => {
    const gate = createBusyGate();
    const first = gate.acquire("pane-1");
    gate.release(first);
    gate.acquire("pane-1");
    gate.release(first);
    expect(gate.isBlocked("pane-1")).toBe(true);
  });

  it("re-targets the gate when a different pane claims it", () => {
    const gate = createBusyGate();
    gate.acquire("pane-1");
    const second = gate.acquire("pane-2");
    expect(gate.isBlocked("pane-1")).toBe(false);
    expect(gate.isBlocked("pane-2")).toBe(true);
    gate.release(second);
    expect(gate.isBlocked("pane-2")).toBe(false);
  });

  it("an undefined active pane does not match a null owner", () => {
    const gate = createBusyGate();
    gate.acquire(null);
    expect(gate.isBlocked(undefined)).toBe(false);
    expect(gate.isBlocked(null)).toBe(true);
  });
});
