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
  return { fs, cwd: "/", homeDir: "/", activeComputer: "home", storyFlags: { apt_unlocked: true, ...storyFlags }, ...rest };
}

describe("apt update", () => {
  it("requires sudo", () => {
    const result = execute("apt", ["update"], {}, ctx());
    expect(result.output).toContain("Permission denied");
  });

  it("shows update output and triggers event", () => {
    const result = execute("apt", ["update"], {}, ctx({ elevated: true }));
    expect(result.output).toContain("Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease");
    expect(result.output).toContain("6 packages can be upgraded");
    expect(result.triggerEvents).toEqual([{ type: "command_executed", detail: "apt_update" }]);
  });

  it("shows up-to-date when already updated", () => {
    const result = execute("apt", ["update"], {}, ctx({ elevated: true, storyFlags: { apt_updated: true } }));
    expect(result.output).toBe("All packages are up to date.");
    expect(result.triggerEvents).toBeUndefined();
  });
});

describe("apt upgrade", () => {
  it("requires sudo", () => {
    const result = execute("apt", ["upgrade"], {}, ctx());
    expect(result.output).toContain("Permission denied");
  });

  it("shows nothing to upgrade when apt update not run", () => {
    const result = execute("apt", ["upgrade"], {}, ctx({ elevated: true }));
    expect(result.output).toContain("0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.");
    expect(result.triggerEvents).toBeUndefined();
  });

  it("upgrades packages after apt update", () => {
    const result = execute("apt", ["upgrade"], {}, ctx({ elevated: true, storyFlags: { apt_updated: true } }));
    expect(result.output).toContain("The following packages will be upgraded:");
    expect(result.output).toContain("Setting up base-files");
    expect(result.triggerEvents).toEqual([{ type: "command_executed", detail: "apt_upgrade" }]);
  });

  it("shows nothing to upgrade when already upgraded", () => {
    const result = execute("apt", ["upgrade"], {}, ctx({ elevated: true, storyFlags: { apt_updated: true, apt_upgraded: true } }));
    expect(result.output).toContain("0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.");
    expect(result.triggerEvents).toBeUndefined();
  });
});

describe("apt install", () => {
  it("requires a package name", () => {
    const result = execute("apt", ["install"], {}, ctx({ elevated: true }));
    expect(result.output).toContain("No packages specified");
  });

  it("errors on unknown package", () => {
    const result = execute("apt", ["install", "vim"], {}, ctx({ elevated: true }));
    expect(result.output).toContain("Unable to locate package vim");
  });
});

describe("apt usage", () => {
  it("shows usage for no subcommand", () => {
    const result = execute("apt", [], {}, ctx({ elevated: true }));
    expect(result.output).toContain("Usage: apt <update|upgrade|install>");
  });

  it("shows usage for unknown subcommand", () => {
    const result = execute("apt", ["remove"], {}, ctx({ elevated: true }));
    expect(result.output).toContain("Usage: apt <update|upgrade|install>");
  });
});
