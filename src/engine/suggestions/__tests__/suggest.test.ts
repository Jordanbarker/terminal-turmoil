import { describe, it, expect } from "vitest";
import { getSuggestion, SuggestionContext } from "../suggest";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";

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
                content: "hello",
                permissions: "rw-r--r--",
                hidden: false,
              },
              docs: {
                type: "directory",
                name: "docs",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {},
              },
              downloads: {
                type: "directory",
                name: "downloads",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {},
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

function createCtx(overrides?: Partial<SuggestionContext>): SuggestionContext {
  const fs = createTestFS();
  return {
    commandHistory: [],
    commandNames: ["ls", "cd", "cat", "pwd", "clear", "help", "nano", "mail"],
    fs,
    cwd: fs.cwd,
    homeDir: fs.homeDir,
    ...overrides,
  };
}

describe("getSuggestion", () => {
  it("returns null for empty input", () => {
    expect(getSuggestion("", createCtx())).toBeNull();
  });

  describe("history matching", () => {
    it("matches from history (most recent first)", () => {
      const ctx = createCtx({
        commandHistory: ["ls -la", "ls /etc", "ls -la /home"],
      });
      expect(getSuggestion("ls -la", ctx)).toBe("ls -la /home");
    });

    it("returns null when no history match", () => {
      const ctx = createCtx({ commandHistory: ["cd /etc"] });
      expect(getSuggestion("ls", ctx)).not.toBe("cd /etc");
    });
  });

  describe("command name completion", () => {
    it("completes partial command name", () => {
      expect(getSuggestion("cl", createCtx())).toBe("clear");
    });

    it("returns first alphabetical match", () => {
      expect(getSuggestion("c", createCtx())).toBe("cat");
    });

    it("returns null when no command matches", () => {
      expect(getSuggestion("xyz", createCtx())).toBeNull();
    });

    it("does not complete commands after a space", () => {
      // After space, it should try path completion, not command completion
      const result = getSuggestion("cat c", createCtx());
      // No file starting with 'c' exists in this test FS → null
      expect(result).toBeNull();
    });
  });

  describe("path completion", () => {
    it("completes file path for cat", () => {
      expect(getSuggestion("cat no", createCtx())).toBe("cat notes.txt");
    });

    it("completes directory path for cd", () => {
      expect(getSuggestion("cd do", createCtx())).toBe("cd docs/");
    });

    it("cd only suggests directories", () => {
      // 'n' matches notes.txt (file) — cd should not suggest it
      expect(getSuggestion("cd n", createCtx())).toBeNull();
    });

    it("completes path with slash prefix", () => {
      expect(getSuggestion("ls /home/player/no", createCtx())).toBe(
        "ls /home/player/notes.txt"
      );
    });

    it("returns null for empty partial after space", () => {
      // "cd " — partial is empty, returns null
      expect(getSuggestion("cd ", createCtx())).toBeNull();
    });

    it("supports nano path completion", () => {
      expect(getSuggestion("nano no", createCtx())).toBe("nano notes.txt");
    });

    it("completes path after flags (head -n 1)", () => {
      expect(getSuggestion("head -n 1 no", createCtx())).toBe("head -n 1 notes.txt");
    });

    it("completes path after flags (tail -n 5)", () => {
      expect(getSuggestion("tail -n 5 no", createCtx())).toBe("tail -n 5 notes.txt");
    });

    it("completes path after pattern argument (grep)", () => {
      expect(getSuggestion("grep pattern no", createCtx())).toBe("grep pattern notes.txt");
    });
    it("completes file path for bash", () => {
      expect(getSuggestion("bash no", createCtx())).toBe("bash notes.txt");
    });

    it("completes file path for sh", () => {
      expect(getSuggestion("sh no", createCtx())).toBe("sh notes.txt");
    });

    it("suggests -c subcommand for bash", () => {
      expect(getSuggestion("bash -", createCtx())).toBe("bash -c");
    });
  });

  describe("alias path completion", () => {
    it("completes paths when alias expands to a path command", () => {
      const ctx = createCtx({
        aliasNames: ["ll"],
        aliases: { ll: "ls -la" },
      });
      expect(getSuggestion("ll no", ctx)).toBe("ll notes.txt");
    });

    it("completes directories when alias expands to cd", () => {
      const ctx = createCtx({
        aliasNames: ["go"],
        aliases: { go: "cd" },
      });
      expect(getSuggestion("go do", ctx)).toBe("go docs/");
    });

    it("does not complete paths when alias expands to non-path command", () => {
      const ctx = createCtx({
        aliasNames: ["h"],
        aliases: { h: "help" },
      });
      expect(getSuggestion("h no", ctx)).toBeNull();
    });
  });

  describe("priority", () => {
    it("history takes priority over command completion", () => {
      const ctx = createCtx({
        commandHistory: ["cat notes.txt"],
      });
      // "ca" matches history "cat notes.txt" before command "cat"
      expect(getSuggestion("ca", ctx)).toBe("cat notes.txt");
    });
  });
});
