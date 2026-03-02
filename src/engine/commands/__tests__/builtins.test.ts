import { describe, it, expect, beforeAll } from "vitest";
import { execute, executeAsync } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";
import { HELP_TEXTS } from "../builtins/helpTexts";

// Import builtins to trigger registration
import "../builtins/ls";
import "../builtins/cd";
import "../builtins/cat";
import "../builtins/pwd";
import "../builtins/clear";
import "../builtins/help";
import "../builtins/nano";
import "../builtins/save";
import "../builtins/load";
import "../builtins/newgame";
import "../builtins/mail";
import "../builtins/python";
import "../builtins/snowsql";

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
              "notes.txt": {
                type: "file",
                name: "notes.txt",
                content: "hello world",
                permissions: "rw-r--r--",
                hidden: false,
              },
              ".hidden": {
                type: "file",
                name: ".hidden",
                content: "secret",
                permissions: "rw-r--r--",
                hidden: true,
              },
              docs: {
                type: "directory",
                name: "docs",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {
                  "readme.md": {
                    type: "file",
                    name: "readme.md",
                    content: "# Docs",
                    permissions: "rw-r--r--",
                    hidden: false,
                  },
                },
              },
            },
          },
        },
      },
      etc: {
        type: "directory",
        name: "etc",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          "readonly.txt": {
            type: "file",
            name: "readonly.txt",
            content: "protected",
            permissions: "r--r--r--",
            hidden: false,
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

function ctx(fs?: VirtualFS): CommandContext {
  const f = fs ?? createTestFS();
  return { fs: f, cwd: f.cwd, homeDir: f.homeDir, activeComputer: "nexacorp" };
}

describe("ls", () => {
  it("lists current directory", () => {
    const result = execute("ls", [], {}, ctx());
    expect(result.output).toContain("notes.txt");
    expect(result.output).toContain("docs");
  });

  it("hides hidden files by default", () => {
    const result = execute("ls", [], {}, ctx());
    expect(result.output).not.toContain(".hidden");
  });

  it("shows hidden files with -a", () => {
    const result = execute("ls", [], { a: true }, ctx());
    expect(result.output).toContain(".hidden");
  });

  it("shows long format with -l", () => {
    const result = execute("ls", [], { l: true }, ctx());
    expect(result.output).toContain("rw-r--r--");
    expect(result.output).toContain("rwxr-xr-x");
  });

  it("lists a specific directory", () => {
    const result = execute("ls", ["/etc"], {}, ctx());
    expect(result.output).toContain("readonly.txt");
  });

  it("returns error for nonexistent path", () => {
    const result = execute("ls", ["/missing"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns empty output for empty directory", () => {
    const fs = createTestFS();
    const c = ctx(fs);
    const result = execute("ls", ["docs"], {}, c);
    expect(result.output).toContain("readme.md");
  });
});

describe("cd", () => {
  it("changes to absolute path", () => {
    const result = execute("cd", ["/etc"], {}, ctx());
    expect(result.newCwd).toBe("/etc");
  });

  it("changes to relative path", () => {
    const result = execute("cd", ["docs"], {}, ctx());
    expect(result.newCwd).toBe("/home/player/docs");
  });

  it("changes to ~ with no args", () => {
    const fs = createTestFS().changeCwd("/etc").fs!;
    const result = execute("cd", [], {}, ctx(fs));
    expect(result.newCwd).toBe("/home/player");
  });

  it("navigates with ..", () => {
    const result = execute("cd", [".."], {}, ctx());
    expect(result.newCwd).toBe("/home");
  });

  it("returns error for nonexistent directory", () => {
    const result = execute("cd", ["/missing"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns error when cd to a file", () => {
    const result = execute("cd", ["notes.txt"], {}, ctx());
    expect(result.output).toContain("Not a directory");
  });
});

describe("cat", () => {
  it("reads a file", () => {
    const result = execute("cat", ["notes.txt"], {}, ctx());
    expect(result.output).toBe("hello world");
  });

  it("reads multiple files", () => {
    const result = execute("cat", ["notes.txt", ".hidden"], {}, ctx());
    expect(result.output).toContain("hello world");
    expect(result.output).toContain("secret");
  });

  it("returns error for missing file operand", () => {
    const result = execute("cat", [], {}, ctx());
    expect(result.output).toContain("missing file operand");
  });

  it("returns error for nonexistent file", () => {
    const result = execute("cat", ["missing.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("returns error for directory", () => {
    const result = execute("cat", ["docs"], {}, ctx());
    expect(result.output).toContain("Is a directory");
  });
});

describe("pwd", () => {
  it("returns current working directory", () => {
    const result = execute("pwd", [], {}, ctx());
    expect(result.output).toBe("/home/player");
  });
});

describe("clear", () => {
  it("returns clearScreen flag", () => {
    const result = execute("clear", [], {}, ctx());
    expect(result.clearScreen).toBe(true);
    expect(result.output).toBe("");
  });
});

describe("help", () => {
  it("lists available commands", () => {
    const result = execute("help", [], {}, ctx());
    expect(result.output).toContain("ls");
    expect(result.output).toContain("cd");
    expect(result.output).toContain("cat");
  });
});

describe("nano", () => {
  it("opens existing file for editing", () => {
    const result = execute("nano", ["notes.txt"], {}, ctx());
    expect(result.editorSession).toBeDefined();
    expect(result.editorSession!.content).toBe("hello world");
    expect(result.editorSession!.readOnly).toBe(false);
    expect(result.editorSession!.isNewFile).toBe(false);
  });

  it("opens read-only file as read-only", () => {
    const result = execute("nano", ["/etc/readonly.txt"], {}, ctx());
    expect(result.editorSession).toBeDefined();
    expect(result.editorSession!.readOnly).toBe(true);
  });

  it("opens new file in valid directory", () => {
    const result = execute("nano", ["newfile.txt"], {}, ctx());
    expect(result.editorSession).toBeDefined();
    expect(result.editorSession!.isNewFile).toBe(true);
    expect(result.editorSession!.content).toBe("");
  });

  it("rejects directory as target", () => {
    const result = execute("nano", ["docs"], {}, ctx());
    expect(result.output).toContain("Is a directory");
  });

  it("rejects file in nonexistent directory", () => {
    const result = execute("nano", ["/missing/file.txt"], {}, ctx());
    expect(result.output).toContain("No such file or directory");
  });

  it("shows usage with no args", () => {
    const result = execute("nano", [], {}, ctx());
    expect(result.output).toContain("Usage");
  });
});

describe("save", () => {
  it("lists saves with no args", () => {
    const result = execute("save", [], {}, ctx());
    expect(result.gameAction).toEqual({ type: "listSaves" });
  });

  it("saves to valid slot", () => {
    const result = execute("save", ["1"], {}, ctx());
    expect(result.gameAction).toEqual({ type: "save", slotId: "slot-1" });
  });

  it("rejects invalid slot", () => {
    const result = execute("save", ["5"], {}, ctx());
    expect(result.output).toContain("invalid slot");
  });
});

describe("load", () => {
  it("lists saves with no args", () => {
    const result = execute("load", [], {}, ctx());
    expect(result.gameAction).toEqual({ type: "listSaves" });
  });

  it("loads from valid slot", () => {
    const result = execute("load", ["2"], {}, ctx());
    expect(result.gameAction).toEqual({ type: "load", slotId: "slot-2" });
  });

  it("loads auto slot", () => {
    const result = execute("load", ["auto"], {}, ctx());
    expect(result.gameAction).toEqual({ type: "load", slotId: "auto" });
  });

  it("rejects invalid slot", () => {
    const result = execute("load", ["5"], {}, ctx());
    expect(result.output).toContain("invalid slot");
  });
});

describe("newgame", () => {
  it("returns newGame action", () => {
    const result = execute("newgame", [], {}, ctx());
    expect(result.gameAction).toEqual({ type: "newGame" });
  });
});

describe("mail", () => {
  function createMailFS(): VirtualFS {
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
              children: {},
            },
          },
        },
        var: {
          type: "directory",
          name: "var",
          permissions: "rwxr-xr-x",
          hidden: false,
          children: {
            mail: {
              type: "directory",
              name: "mail",
              permissions: "rwxr-xr-x",
              hidden: false,
              children: {
                player: {
                  type: "directory",
                  name: "player",
                  permissions: "rwxr-xr-x",
                  hidden: false,
                  children: {
                    new: {
                      type: "directory",
                      name: "new",
                      permissions: "rwxr-xr-x",
                      hidden: false,
                      children: {
                        "001_welcome": {
                          type: "file",
                          name: "001_welcome",
                          content:
                            "From: Edward <edward@nexacorp.com>\nTo: player@nexacorp.com\nDate: Mon, 23 Feb 2026 07:45:00\nSubject: Welcome!\n\nWelcome aboard!",
                          permissions: "rw-r--r--",
                          hidden: false,
                        },
                      },
                    },
                    cur: {
                      type: "directory",
                      name: "cur",
                      permissions: "rwxr-xr-x",
                      hidden: false,
                      children: {
                        "002_setup": {
                          type: "file",
                          name: "002_setup",
                          content:
                            "From: IT <it@nexacorp.com>\nTo: player@nexacorp.com\nDate: Mon, 23 Feb 2026 08:00:00\nSubject: Setup info\nStatus: R\n\nYour account is ready.",
                          permissions: "rw-r--r--",
                          hidden: false,
                        },
                      },
                    },
                    sent: {
                      type: "directory",
                      name: "sent",
                      permissions: "rwxr-xr-x",
                      hidden: false,
                      children: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    return new VirtualFS(root, "/home/player", "/home/player");
  }

  function mailCtx(fs?: VirtualFS): CommandContext {
    const f = fs ?? createMailFS();
    return { fs: f, cwd: f.cwd, homeDir: f.homeDir, activeComputer: "nexacorp" };
  }

  it("shows inbox listing with message count", () => {
    const result = execute("mail", [], {}, mailCtx());
    expect(result.output).toContain("2 messages");
    expect(result.output).toContain("1 unread");
  });

  it("shows sender names in inbox", () => {
    const result = execute("mail", [], {}, mailCtx());
    expect(result.output).toContain("Edward");
    expect(result.output).toContain("IT");
  });

  it("shows 'No mail.' for empty inbox", () => {
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
              children: {},
            },
          },
        },
        var: {
          type: "directory",
          name: "var",
          permissions: "rwxr-xr-x",
          hidden: false,
          children: {
            mail: {
              type: "directory",
              name: "mail",
              permissions: "rwxr-xr-x",
              hidden: false,
              children: {
                player: {
                  type: "directory",
                  name: "player",
                  permissions: "rwxr-xr-x",
                  hidden: false,
                  children: {
                    new: { type: "directory", name: "new", permissions: "rwxr-xr-x", hidden: false, children: {} },
                    cur: { type: "directory", name: "cur", permissions: "rwxr-xr-x", hidden: false, children: {} },
                    sent: { type: "directory", name: "sent", permissions: "rwxr-xr-x", hidden: false, children: {} },
                  },
                },
              },
            },
          },
        },
      },
    };
    const emptyFs = new VirtualFS(root, "/home/player", "/home/player");
    const result = execute("mail", [], {}, mailCtx(emptyFs));
    expect(result.output).toBe("No mail.");
  });

  it("reads a specific message by number", () => {
    const result = execute("mail", ["1"], {}, mailCtx());
    expect(result.output).toContain("Welcome!");
    expect(result.output).toContain("Edward");
    expect(result.output).toContain("Welcome aboard!");
  });

  it("marks unread message as read and returns new FS", () => {
    const result = execute("mail", ["1"], {}, mailCtx());
    // Message 1 is in "new", so reading it should produce a newFs
    expect(result.newFs).toBeDefined();
  });

  it("does not return newFs for already-read message", () => {
    const result = execute("mail", ["2"], {}, mailCtx());
    // Message 2 is in "cur" (already read)
    expect(result.newFs).toBeUndefined();
  });

  it("returns error for invalid message number", () => {
    const result = execute("mail", ["99"], {}, mailCtx());
    expect(result.output).toContain("invalid message number");
  });

  it("returns error for non-numeric message number", () => {
    const result = execute("mail", ["abc"], {}, mailCtx());
    expect(result.output).toContain("invalid message number");
  });

  it("sends mail with -s flag", () => {
    const result = execute("mail", ["Test Subject", "alice@nexacorp.com"], { s: true }, mailCtx());
    expect(result.output).toContain("Message sent to alice@nexacorp.com");
    expect(result.newFs).toBeDefined();
  });

  it("emits triggerEvents with email ID when reading a matching email", () => {
    // Create a FS with an email that matches the welcome_edward definition
    const root: DirectoryNode = {
      type: "directory", name: "/", permissions: "rwxr-xr-x", hidden: false,
      children: {
        home: {
          type: "directory", name: "home", permissions: "rwxr-xr-x", hidden: false,
          children: {
            player: { type: "directory", name: "player", permissions: "rwxr-xr-x", hidden: false, children: {} },
          },
        },
        var: {
          type: "directory", name: "var", permissions: "rwxr-xr-x", hidden: false,
          children: {
            mail: {
              type: "directory", name: "mail", permissions: "rwxr-xr-x", hidden: false,
              children: {
                player: {
                  type: "directory", name: "player", permissions: "rwxr-xr-x", hidden: false,
                  children: {
                    new: {
                      type: "directory", name: "new", permissions: "rwxr-xr-x", hidden: false,
                      children: {
                        "001_welcome": {
                          type: "file", name: "001_welcome", permissions: "rw-r--r--", hidden: false,
                          content: "From: Edward Torres <edward@nexacorp.com>\nTo: player@nexacorp.com\nDate: Mon, 23 Feb 2026 07:45:00\nSubject: Welcome aboard!\n\nWelcome!",
                        },
                      },
                    },
                    cur: { type: "directory", name: "cur", permissions: "rwxr-xr-x", hidden: false, children: {} },
                    sent: { type: "directory", name: "sent", permissions: "rwxr-xr-x", hidden: false, children: {} },
                  },
                },
              },
            },
          },
        },
      },
    };
    const fs = new VirtualFS(root, "/home/player", "/home/player");
    const result = execute("mail", ["1"], {}, { fs, cwd: fs.cwd, homeDir: fs.homeDir, activeComputer: "nexacorp" });
    expect(result.triggerEvents).toBeDefined();
    expect(result.triggerEvents!.length).toBeGreaterThan(0);
    expect(result.triggerEvents![0]).toEqual({ type: "file_read", detail: "welcome_edward" });
  });

  it("does not emit triggerEvents for unknown emails", () => {
    // The existing fixture has "Welcome!" / "Edward <edward@nexacorp.com>"
    // which doesn't match any email definition
    const result = execute("mail", ["1"], {}, mailCtx());
    expect(result.triggerEvents).toBeUndefined();
  });
});

describe("unknown command", () => {
  it("returns command not found", () => {
    const result = execute("foobar", [], {}, ctx());
    expect(result.output).toContain("command not found");
  });
});

describe("--help", () => {
  const linuxCommands = ["pwd", "cd", "ls", "cat", "clear", "nano", "mail"] as const;

  for (const cmd of linuxCommands) {
    it(`${cmd} --help returns help text`, () => {
      const result = execute(cmd, [], { help: true }, ctx());
      expect(result.output).toBe(HELP_TEXTS[cmd]);
    });
  }

  it("python --help returns help text (async)", async () => {
    const result = await executeAsync("python", [], { help: true }, ctx());
    expect(result.output).toBe(HELP_TEXTS.python);
  });

  it("snowsql --help returns help text", () => {
    const result = execute("snowsql", [], { help: true }, ctx());
    expect(result.output).toBe(HELP_TEXTS.snowsql);
  });

  const gameCommands = ["save", "load", "newgame", "help"] as const;

  for (const cmd of gameCommands) {
    it(`${cmd} --help does NOT return help text`, () => {
      const result = execute(cmd, [], { help: true }, ctx());
      expect(result.output).not.toBe(HELP_TEXTS[cmd]);
    });
  }
});
