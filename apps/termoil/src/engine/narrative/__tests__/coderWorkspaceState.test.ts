import { describe, it, expect } from "vitest";
import { checkStoryFlagTriggers } from "../storyFlags";
import { getNexacorpStoryFlagTriggers } from "../../../story/storyFlags";
import { GameEvent } from "../../mail/delivery";
import { StoryFlags } from "../../../state/types";
import { execute } from "@tt/core/commands/registry";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import "../../commands/builtins";
import "../../../story/availabilityPolicy";

const username = "ren";
const triggers = getNexacorpStoryFlagTriggers(username);

function emptyFs(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      home: {
        type: "directory",
        name: "home",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          ren: { type: "directory", name: "ren", permissions: "rwxr-xr-x", hidden: false, children: {} },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/ren", "/home/ren");
}

function ctx(storyFlags: StoryFlags): CommandContext {
  const fs = emptyFs();
  return { fs, cwd: fs.cwd, homeDir: fs.homeDir, username, activeComputer: "nexacorp", storyFlags };
}

/** Apply the flag updates a `coder` result would produce to a flag map. */
function applyEvents(flags: StoryFlags, events: GameEvent[]): StoryFlags {
  let next = { ...flags };
  for (const event of events) {
    for (const update of checkStoryFlagTriggers(event, triggers, next)) {
      next = { ...next, [update.flag]: update.value };
    }
  }
  return next;
}

// Regression: the trigger engine used to fire only when a flag was `undefined`,
// so `coder_workspace_stopped` latched to true on the first `coder stop` and the
// `value: false` reset from `coder start` could never fire. That soft-locked the
// devcontainer for the rest of the run.
describe("coder_workspace_stopped is a toggling state flag", () => {
  const stop: GameEvent = { type: "command_executed", detail: "coder_stop" };
  const start: GameEvent = { type: "command_executed", detail: "coder_start" };

  it("sets true on stop and back to false on start", () => {
    const stopped = applyEvents({ coder_unlocked: true }, [stop]);
    expect(stopped.coder_workspace_stopped).toBe(true);

    const restarted = applyEvents(stopped, [start]);
    expect(restarted.coder_workspace_stopped).toBe(false);
  });

  it("survives repeated stop/start cycles", () => {
    let flags: StoryFlags = { coder_unlocked: true };
    for (let i = 0; i < 3; i++) {
      flags = applyEvents(flags, [stop]);
      expect(flags.coder_workspace_stopped).toBe(true);
      flags = applyEvents(flags, [start]);
      expect(flags.coder_workspace_stopped).toBe(false);
    }
  });

  it("does not re-fire when the flag is already at the target value", () => {
    const stopped = applyEvents({ coder_unlocked: true }, [stop]);
    expect(checkStoryFlagTriggers(stop, triggers, stopped)).toEqual([]);
    const restarted = applyEvents(stopped, [start]);
    expect(checkStoryFlagTriggers(start, triggers, restarted)).toEqual([]);
  });
});

describe("coder stop -> start -> ssh ai round trip", () => {
  it("lets the player back into the devcontainer after a restart", () => {
    let flags: StoryFlags = { coder_unlocked: true };

    const stopResult = execute("coder", ["stop", "ai"], {}, ctx(flags));
    expect(stopResult.closeTabsForComputer).toBe("devcontainer");
    flags = applyEvents(flags, stopResult.triggerEvents ?? []);
    expect(flags.coder_workspace_stopped).toBe(true);

    // While stopped, ssh is refused.
    const blocked = execute("coder", ["ssh", "ai"], {}, ctx(flags));
    expect(blocked.exitCode).toBe(1);
    expect(blocked.transitionTo).toBeUndefined();

    const startResult = execute("coder", ["start", "ai"], {}, ctx(flags));
    flags = applyEvents(flags, startResult.triggerEvents ?? []);
    expect(flags.coder_workspace_stopped).toBe(false);

    const sshResult = execute("coder", ["ssh", "ai"], {}, ctx(flags));
    expect(sshResult.transitionTo).toBe("devcontainer");
    expect(sshResult.exitCode).toBeUndefined();
  });

  it("reports the workspace as Running again in `coder list`", () => {
    let flags: StoryFlags = { coder_unlocked: true };
    flags = applyEvents(flags, execute("coder", ["stop", "ai"], {}, ctx(flags)).triggerEvents ?? []);
    expect(execute("coder", ["list"], {}, ctx(flags)).output).toContain("Stopped");
    flags = applyEvents(flags, execute("coder", ["start", "ai"], {}, ctx(flags)).triggerEvents ?? []);
    expect(execute("coder", ["list"], {}, ctx(flags)).output).toContain("Running");
  });
});
