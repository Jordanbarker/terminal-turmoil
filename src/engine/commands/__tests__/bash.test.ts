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

describe("shell features", () => {
  function scriptCtx(content: string, overrides?: Partial<CommandContext>): CommandContext {
    const base = createTestFS();
    const root = base.root;
    const playerDir = (root.children.home as DirectoryNode).children.player as DirectoryNode;
    const newPlayerDir = {
      ...playerDir,
      children: {
        ...playerDir.children,
        "shell.sh": {
          type: "file" as const,
          name: "shell.sh",
          content,
          permissions: "rwxr-xr-x",
          hidden: false,
        },
      },
    };
    const newHome = {
      ...(root.children.home as DirectoryNode),
      children: { ...(root.children.home as DirectoryNode).children, player: newPlayerDir },
    };
    const newRoot = { ...root, children: { ...root.children, home: newHome } };
    const fs = new VirtualFS(newRoot, "/home/player", "/home/player");
    return ctx(fs, overrides);
  }

  it("assigns and expands variables", async () => {
    const c = scriptCtx('VAR="hello"\necho $VAR');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("hello");
  });

  it("expands ${VAR:-default} when unset", async () => {
    const c = scriptCtx('echo ${MISSING:-fallback}');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("fallback");
  });

  it("expands ${VAR:-default} when set", async () => {
    const c = scriptCtx('MYVAR="actual"\necho ${MYVAR:-fallback}');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("actual");
  });

  it("handles line continuation with backslash", async () => {
    const c = scriptCtx('echo hello \\\nworld');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("hello world");
  });

  it("defines and calls functions", async () => {
    const c = scriptCtx('greet() {\necho "hi"\n}\ngreet');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("hi");
  });

  it("passes positional args to functions", async () => {
    const c = scriptCtx('say() {\necho $1\n}\nsay hello');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("hello");
  });

  it("executes if/then/else with true condition", async () => {
    const c = scriptCtx('if echo test > /dev/null; then\necho "yes"\nelse\necho "no"\nfi');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("yes");
  });

  it("executes if/then/else with false condition", async () => {
    const c = scriptCtx('if fakecmd; then\necho "yes"\nelse\necho "no"\nfi');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("no");
  });

  it("handles command -v for existing command", async () => {
    const c = scriptCtx('command -v echo > /dev/null 2>&1');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    // Should produce no output (redirected to /dev/null) and no error
    expect(result.output.trim()).toBe("");
  });

  it("handles command -v for missing command", async () => {
    const c = scriptCtx('if command -v nonexistent_cmd > /dev/null 2>&1; then\necho "found"\nelse\necho "missing"\nfi');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("missing");
  });

  it("redirects to /dev/null suppressing output", async () => {
    const c = scriptCtx('echo "hidden" > /dev/null\necho "visible"');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output).not.toContain("hidden");
    expect(result.output).toContain("visible");
  });

  it("handles function containing if/then/else (check_env pattern)", async () => {
    const c = scriptCtx(
      'check() {\nif command -v $1 > /dev/null 2>&1; then\necho "[OK]  $1"\nelse\necho "[!!]  $1 not found"\nfi\n}\ncheck echo\ncheck nonexistent_cmd',
    );
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output).toContain("[OK]  echo");
    expect(result.output).toContain("[!!]  nonexistent_cmd not found");
  });

  it("expands variables with command substitution in assignment", async () => {
    const c = scriptCtx('DIR="backup-$(date +%Y-%m-%d)"\necho $DIR');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("backup-2026-02-23");
  });

  it("strips 2>&1 from commands", async () => {
    const c = scriptCtx('echo "test" 2>&1');
    const result = await executeAsync("bash", ["shell.sh"], {}, c);
    expect(result.output.trim()).toBe("test");
  });
});

describe("date format strings", () => {
  it("formats +%Y-%m-%d", async () => {
    const result = await executeAsync("date", ["+%Y-%m-%d"], {}, ctx());
    expect(result.output).toBe("2026-02-23");
  });

  it("formats +%H:%M:%S (base time with no deliveries)", async () => {
    const result = await executeAsync("date", ["+%H:%M:%S"], {}, ctx());
    expect(result.output).toBe("08:30:00");
  });

  it("returns default output without format", async () => {
    const result = await executeAsync("date", [], {}, ctx());
    expect(result.output).toBe("Mon Feb 23 08:30:00 UTC 2026");
  });

  it("shows home computer base time", async () => {
    const result = await executeAsync("date", [], {}, ctx(undefined, {
      activeComputer: "home",
      storyFlags: { basic_tools_unlocked: true },
    }));
    expect(result.output).toBe("Sat Feb 21 14:00:00 UTC 2026");
  });
});
