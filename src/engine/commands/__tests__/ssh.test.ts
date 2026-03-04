import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";
import "../builtins";

function createTestFS(configContent = ""): VirtualFS {
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
          ren: {
            type: "directory",
            name: "ren",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              ".ssh": {
                type: "directory",
                name: ".ssh",
                permissions: "rwx--xr-x",
                hidden: true,
                children: {
                  config: {
                    type: "file",
                    name: "config",
                    content: configContent,
                    permissions: "rw-r--r--",
                    hidden: false,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/ren", "/home/ren");
}

function createCtx(overrides?: Partial<CommandContext>): CommandContext {
  return {
    fs: createTestFS(),
    cwd: "/home/ren",
    homeDir: "/home/ren",
    activeComputer: "home",
    storyFlags: { commands_unlocked: true },
    ...overrides,
  };
}

describe("ssh command", () => {
  it("returns usage with no args", () => {
    const result = execute("ssh", [], {}, createCtx());
    expect(result.output).toContain("usage");
    expect(result.sshSession).toBeUndefined();
  });

  it("returns connection refused on non-home computer", () => {
    const result = execute("ssh", ["nexacorp"], {}, createCtx({ activeComputer: "nexacorp" }));
    expect(result.output).toContain("Connection refused");
    expect(result.sshSession).toBeUndefined();
  });

  it("returns connection refused for unknown host", () => {
    const result = execute("ssh", ["ren@badhost.example.com"], {}, createCtx());
    expect(result.output).toContain("Connection refused");
    expect(result.sshSession).toBeUndefined();
  });

  it("connects with user@host format to valid target", () => {
    const result = execute(
      "ssh",
      ["ren@nexacorp-ws01.nexacorp.internal"],
      {},
      createCtx()
    );
    expect(result.sshSession).toEqual({
      host: "nexacorp-ws01.nexacorp.internal",
      username: "ren",
    });
    expect(result.output).toBe("");
  });

  it("resolves config alias", () => {
    const config = `Host nexacorp
  HostName nexacorp-ws01.nexacorp.internal
  User ren`;
    const fs = createTestFS(config);
    const result = execute("ssh", ["nexacorp"], {}, createCtx({ fs }));
    expect(result.sshSession).toEqual({
      host: "nexacorp-ws01.nexacorp.internal",
      username: "ren",
    });
  });

  it("returns error for alias without user in config", () => {
    const config = `Host nexacorp
  HostName nexacorp-ws01.nexacorp.internal`;
    const fs = createTestFS(config);
    const result = execute("ssh", ["nexacorp"], {}, createCtx({ fs }));
    expect(result.output).toContain("Could not resolve");
    expect(result.sshSession).toBeUndefined();
  });

  it("returns error for bare unknown host", () => {
    const result = execute("ssh", ["randomhost"], {}, createCtx());
    expect(result.output).toContain("Connection refused");
    expect(result.sshSession).toBeUndefined();
  });
});
