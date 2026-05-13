import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";

import "../builtins";

const root: DirectoryNode = {
  type: "directory",
  name: "/",
  permissions: "rwxr-xr-x",
  hidden: false,
  children: {},
};

function ctx(overrides?: Partial<CommandContext>): CommandContext {
  const fs = new VirtualFS(root);
  const { storyFlags, ...rest } = overrides ?? {};
  return {
    fs,
    cwd: "/",
    homeDir: "/",
    username: "ren",
    activeComputer: "home",
    // shutdown is HOME_GATED on returned_home_day1 — set it by default so the
    // command is actually dispatchable. Per-test overrides win.
    storyFlags: { returned_home_day1: true, ...storyFlags },
    ...rest,
  };
}

describe("shutdown", () => {
  it("only works on home", () => {
    const result = execute("shutdown", [], {}, ctx({ activeComputer: "nexacorp" }));
    expect(result.output).toContain("operation not permitted");
    expect(result.gameAction).toBeUndefined();
  });

  it("Day 1: bare shutdown emits gameAction with 60s countdown lines", () => {
    const result = execute("shutdown", [], {}, ctx());
    expect(result.gameAction).toEqual({ type: "shutdown" });
    expect(result.incrementalLines?.some((l) => l.text.includes("1 minute"))).toBe(true);
  });

  it("Day 1: shutdown -h now skips the countdown", () => {
    const result = execute("shutdown", ["now"], { h: true }, ctx());
    expect(result.gameAction).toEqual({ type: "shutdown" });
    expect(result.incrementalLines?.some((l) => l.text.includes("1 minute"))).toBe(false);
  });

  it("mid Day 2: blocked between day1_shutdown and reading the debrief", () => {
    const result = execute("shutdown", [], {}, ctx({ storyFlags: { day1_shutdown: true } }));
    expect(result.output).toContain("still work to be done");
    expect(result.gameAction).toBeUndefined();
  });

  it("post-debrief: shutdown unlocks again and emits gameAction", () => {
    const result = execute(
      "shutdown",
      [],
      {},
      ctx({ storyFlags: { day1_shutdown: true, read_board_debrief_day2: true } })
    );
    expect(result.gameAction).toEqual({ type: "shutdown" });
  });

  it("post-debrief: bare shutdown skips the 60s countdown (no one else to broadcast to)", () => {
    const result = execute(
      "shutdown",
      [],
      {},
      ctx({ storyFlags: { day1_shutdown: true, read_board_debrief_day2: true } })
    );
    expect(result.incrementalLines?.some((l) => l.text.includes("1 minute"))).toBe(false);
  });

  it("post-debrief: shutdown -h now still works", () => {
    const result = execute(
      "shutdown",
      ["now"],
      { h: true },
      ctx({ storyFlags: { day1_shutdown: true, read_board_debrief_day2: true } })
    );
    expect(result.gameAction).toEqual({ type: "shutdown" });
  });
});
