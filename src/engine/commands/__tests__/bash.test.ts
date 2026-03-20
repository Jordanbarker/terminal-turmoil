import { describe, it, expect } from "vitest";
import { executeAsync, isAsyncCommand } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";

// Import builtins to trigger registration
import "../builtins";

function createTestFS(): VirtualFS {
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
          player: {
            type: "directory",
            name: "player",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              "test.sh": {
                type: "file",
                name: "test.sh",
                content: '#!/bin/bash\necho "hello world"\necho "second line"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "no-exec.sh": {
                type: "file",
                name: "no-exec.sh",
                content: 'echo "no exec"',
                permissions: "rw-r--r--",
                hidden: false,
              },
              "with-comments.sh": {
                type: "file",
                name: "with-comments.sh",
                content: '#!/bin/bash\n# This is a comment\necho "after comment"\n\n# Another comment\necho "done"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "pipe-script.sh": {
                type: "file",
                name: "pipe-script.sh",
                content: 'echo "hello world" | wc -w',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "fs-chain.sh": {
                type: "file",
                name: "fs-chain.sh",
                content: 'echo "new content" > /home/player/output.txt\ncat /home/player/output.txt',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "bad-cmd.sh": {
                type: "file",
                name: "bad-cmd.sh",
                content: 'echo "before"\nfakecmd --whatever\necho "after"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "subst.sh": {
                type: "file",
                name: "subst.sh",
                content: 'echo "user is $(whoami)"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "nano-script.sh": {
                type: "file",
                name: "nano-script.sh",
                content: 'echo "before"\nnano somefile\necho "after"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "exit-script.sh": {
                type: "file",
                name: "exit-script.sh",
                content: 'echo "before"\nexit\necho "after"',
                permissions: "rwxr-xr-x",
                hidden: false,
              },
              "notes.txt": {
                type: "file",
                name: "notes.txt",
                content: "hello world",
                permissions: "rw-r--r--",
                hidden: false,
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

function ctx(fs?: VirtualFS, overrides?: Partial<CommandContext>): CommandContext {
  const f = fs ?? createTestFS();
  return {
    fs: f,
    cwd: f.cwd,
    homeDir: f.homeDir,
    activeComputer: "nexacorp",
    storyFlags: {},
    ...overrides,
  };
}

describe("bash command", () => {
  it("executes a basic echo script", async () => {
    const result = await executeAsync("bash", ["test.sh"], {}, ctx());
    expect(result.output).toContain("hello world");
    expect(result.output).toContain("second line");
  });

  it("skips shebangs and comments", async () => {
    const result = await executeAsync("bash", ["with-comments.sh"], {}, ctx());
    expect(result.output).toContain("after comment");
    expect(result.output).toContain("done");
    expect(result.output).not.toContain("#");
    expect(result.output).not.toContain("bin/bash");
  });

  it("handles pipes within script lines", async () => {
    const c = ctx(undefined, {
      storyFlags: { inspection_tools_unlocked: true },
    });
    const result = await executeAsync("bash", ["pipe-script.sh"], {}, c);
    expect(result.output.trim()).toBe("2");
  });

  it("chains FS between lines (write then read)", async () => {
    const result = await executeAsync("bash", ["fs-chain.sh"], {}, ctx());
    expect(result.output).toContain("new content");
    expect(result.newFs).toBeDefined();
  });

  it("continues after command errors", async () => {
    const result = await executeAsync("bash", ["bad-cmd.sh"], {}, ctx());
    expect(result.output).toContain("before");
    expect(result.output).toContain("command not found");
    expect(result.output).toContain("after");
  });

  it("expands command substitutions", async () => {
    const c = ctx(undefined, {
      storyFlags: { basic_tools_unlocked: true },
    });
    const result = await executeAsync("bash", ["subst.sh"], {}, c);
    expect(result.output).toContain("user is");
  });

  it("returns file not found error", async () => {
    const result = await executeAsync("bash", ["nonexistent.sh"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
    expect(result.exitCode).toBe(1);
  });

  it("returns usage error with no args", async () => {
    const result = await executeAsync("bash", [], {}, ctx());
    expect(result.output).toContain("interactive mode not supported");
  });

  it("executes inline command with -c", async () => {
    const result = await executeAsync("bash", ["echo hello"], { c: true }, ctx());
    expect(result.output).toContain("hello");
  });

  it("adds file_read trigger event for the script file", async () => {
    const result = await executeAsync("bash", ["test.sh"], {}, ctx());
    expect(result.triggerEvents).toBeDefined();
    const fileReads = result.triggerEvents!.filter((e) => e.type === "file_read");
    expect(fileReads.some((e) => e.detail === "/home/player/test.sh")).toBe(true);
  });

  it("blocks computer transitions in scripts", async () => {
    const c = ctx(undefined, {
      activeComputer: "devcontainer",
    });
    const result = await executeAsync("bash", ["exit-script.sh"], {}, c);
    expect(result.output).toContain("before");
    expect(result.output).toContain("cannot transition computers");
    expect(result.transitionTo).toBeUndefined();
  });

  it("does not propagate cwd changes from script", async () => {
    const fs = createTestFS();
    const root = fs.root;
    // Add a script that cd's
    const cdScript = {
      type: "file" as const,
      name: "cd-script.sh",
      content: "cd /\npwd",
      permissions: "rwxr-xr-x",
      hidden: false,
    };
    const playerDir = (root.children.home as DirectoryNode).children.player as DirectoryNode;
    const newPlayerDir = { ...playerDir, children: { ...playerDir.children, "cd-script.sh": cdScript } };
    const newHome = { ...(root.children.home as DirectoryNode), children: { ...(root.children.home as DirectoryNode).children, player: newPlayerDir } };
    const newRoot = { ...root, children: { ...root.children, home: newHome } };
    const newFs = new VirtualFS(newRoot, "/home/player", "/home/player");

    const result = await executeAsync("bash", ["cd-script.sh"], {}, ctx(newFs));
    expect(result.output).toContain("/");
    expect(result.newCwd).toBeUndefined();
  });
});

describe("path execution (./script.sh)", () => {
  it("identifies path commands as async", () => {
    expect(isAsyncCommand("./test.sh")).toBe(true);
    expect(isAsyncCommand("/home/player/test.sh")).toBe(true);
  });

  it("executes ./script.sh with execute permission", async () => {
    const result = await executeAsync("./test.sh", [], {}, ctx());
    expect(result.output).toContain("hello world");
    expect(result.output).toContain("second line");
  });

  it("returns permission denied without execute bit", async () => {
    const result = await executeAsync("./no-exec.sh", [], {}, ctx());
    expect(result.output).toContain("Permission denied");
    expect(result.exitCode).toBe(126);
  });

  it("returns not found for nonexistent path", async () => {
    const result = await executeAsync("./missing.sh", [], {}, ctx());
    expect(result.output).toContain("No such file or directory");
    expect(result.exitCode).toBe(127);
  });

  it("executes absolute path scripts", async () => {
    const result = await executeAsync("/home/player/test.sh", [], {}, ctx());
    expect(result.output).toContain("hello world");
  });
});

describe("sh alias", () => {
  it("works as an alias for bash", async () => {
    const result = await executeAsync("sh", ["test.sh"], {}, ctx());
    expect(result.output).toContain("hello world");
  });
});
