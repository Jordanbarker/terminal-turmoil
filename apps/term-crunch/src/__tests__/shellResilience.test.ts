/**
 * Browser-shaped tests for the shell's failure handling: they go through the
 * real `runLine` (the entry point `TabManager` calls) with a fake xterm, so
 * they cover the hook's own catch and its per-pane `$?`, not just the engine.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { register } from "@tt/core/commands/registry";
import { setKnownFlags } from "@tt/core/commands/flagValidation";
import { resetAvailabilityPolicy } from "@tt/core/commands/availability";
import { stripAnsi } from "@tt/core/lib/ansi";
import { runLine } from "../hooks/useTerminal";
import { useGameStore } from "../state/gameStore";

class FakeTerminal {
  buffer = "";
  write(data: string): void { this.buffer += data; }
  clear(): void { this.buffer = ""; }
  asTerminal(): Terminal { return this as unknown as Terminal; }
}

function paneId(): string {
  const s = useGameStore.getState();
  return (s.windows.find((w) => w.id === s.activeWindowId) ?? s.windows[0]).activePaneId;
}

async function submit(input: string, pane = paneId()): Promise<string> {
  const term = new FakeTerminal();
  await runLine(term.asTerminal(), pane, input);
  return stripAnsi(term.buffer).replace(/\r\n/g, "\n");
}

beforeEach(() => {
  useGameStore.getState().loadChallenge(0);
  // Challenge 1 allows almost nothing; drop the allowlist so the commands under
  // test reach the engine. Vitest isolates modules per file, so this (and the
  // throwing builtin below) cannot leak into another suite.
  resetAvailabilityPolicy();
});

describe("an invalid glob cannot take the shell down", () => {
  // Every one of these compiles to a JS character class `new RegExp` rejects.
  // The throw used to escape runPipeline and leave the pane with no prompt.
  for (const pattern of ["[9-0]", "[z-a]", "[b-a]x", "a[]-[]b", "[a-[-]"]) {
    it(`survives \`ls ${pattern}\` and keeps taking commands`, async () => {
      const out = await submit(`ls ${pattern}`);
      expect(out).not.toContain("internal error");
      expect(await submit("pwd")).toContain("/home/player");
    });
  }
});

describe("an engine throw degrades instead of hanging", () => {
  beforeEach(() => {
    register("boomcmd", () => { throw new Error("kaboom"); }, "throws", "throws");
    setKnownFlags("boomcmd", {});
  });

  it("reports it and hands the prompt back", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await submit("boomcmd")).toContain("internal error");
      // The shell is still alive: the next line runs normally.
      expect(await submit("pwd")).toContain("/home/player");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("$? persists across lines, per pane", () => {
  it("carries the previous line's status into the next one", async () => {
    await submit("cat nosuch.txt");
    expect(await submit("echo $?")).toContain("1");
    await submit("pwd");
    expect(await submit("echo $?")).toContain("0");
  });

  it("a fresh pane starts at 0", async () => {
    await submit("cat nosuch.txt");
    const other = useGameStore.getState().splitPane(paneId(), "v");
    expect(other).toBeTruthy();
    expect(await submit("echo $?", other!)).toContain("0");
  });

  it("resets when the challenge reseeds the panes", async () => {
    await submit("cat nosuch.txt");
    useGameStore.getState().loadChallenge(0);
    expect(await submit("echo $?")).toContain("0");
  });
});
