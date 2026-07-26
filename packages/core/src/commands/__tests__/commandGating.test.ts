import { describe, it, expect, afterEach } from "vitest";
import { execute, executeAsync } from "../registry";
import { setAvailabilityPolicy, resetAvailabilityPolicy } from "../availability";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import "../builtins";

const HOME = "/home/player";

function createTestFS(): VirtualFS {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "hello.sh": file("hello.sh", "echo hi\n", "rwxr-xr-x"),
      }),
    }),
  });
  return new VirtualFS(root, HOME, HOME);
}

function ctx(overrides?: Partial<CommandContext>): CommandContext {
  const fs = createTestFS();
  return {
    fs,
    cwd: HOME,
    homeDir: HOME,
    username: "player",
    activeComputer: "home",
    ...overrides,
  };
}

afterEach(() => resetAvailabilityPolicy());

/** Policy where `grep` only exists once `search_tools_unlocked` is set. */
function gateGrepBehindFlag() {
  setAvailabilityPolicy({
    isAvailable: (name, _computer, flags) =>
      name === "grep" ? !!flags?.["search_tools_unlocked"] : true,
    unavailableMessage: (name) => `${name}: not yet available.`,
  });
}

describe("command lookup honors story flags", () => {
  it("which resolves a flag-gated command once the flag is set", () => {
    gateGrepBehindFlag();
    const unlocked = ctx({ storyFlags: { search_tools_unlocked: true } });
    const result = execute("which", ["grep"], {}, unlocked);
    expect(result.output).toBe("/usr/bin/grep");
    expect(result.exitCode).toBe(0);
  });

  it("which still reports not found while the flag is unset", () => {
    gateGrepBehindFlag();
    const result = execute("which", ["grep"], {}, ctx({ storyFlags: {} }));
    expect(result.output).toBe("grep not found");
    expect(result.exitCode).toBe(1);
  });

  it("type resolves the same flag-gated command", () => {
    gateGrepBehindFlag();
    const result = execute("type", ["grep"], {}, ctx({ storyFlags: { search_tools_unlocked: true } }));
    expect(result.output).toContain("/usr/bin/grep");
  });

  it("bash's inline `command -v` resolves it too", async () => {
    gateGrepBehindFlag();
    const result = await executeAsync(
      "bash",
      ["command -v grep"],
      { c: true },
      ctx({ storyFlags: { search_tools_unlocked: true } }),
    );
    expect(result.output).toBe("/usr/bin/grep");
  });
});

describe("executeAsync enforces the availability policy", () => {
  it("rejects a gated async command with the policy's unavailableMessage", async () => {
    setAvailabilityPolicy({
      isAvailable: (name) => name !== "python",
      unavailableMessage: (name) => `${name}: not installed here.`,
    });
    const result = await executeAsync("python", [], {}, ctx());
    expect(result.output).toBe("python: not installed here.");
    expect(result.exitCode).toBe(127);
  });

  it("blocks ./script.sh when the interpreting shell is gated off", async () => {
    setAvailabilityPolicy({
      isAvailable: (name) => name !== "bash",
      unavailableMessage: (name) => `${name}: not installed here.`,
    });
    const result = await executeAsync("./hello.sh", [], {}, ctx({ rawArgs: [] }));
    expect(result.exitCode).toBe(127);
    expect(result.output).toContain("bash");
  });

  it("still runs ./script.sh when bash is allowed", async () => {
    const result = await executeAsync("./hello.sh", [], {}, ctx({ rawArgs: [] }));
    expect(result.output).toBe("hi");
  });
});
