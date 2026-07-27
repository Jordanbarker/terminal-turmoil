import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execute, getPrimaryName } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import { setEditorOpenTriggers, resetEditorOpenTriggers } from "../editorTriggers";
import "../builtins";

const HOME = "/home/player";

// Core ships no editor triggers of its own; the app registers them. Stand in
// for that here so the seam is exercised without core learning a story.
beforeEach(() => {
  setEditorOpenTriggers([
    {
      computer: "home",
      pathSuffix: "/scripts/backup.sh",
      contentPredicate: (content) => !content.includes("TYPO"),
      events: [{ type: "file_read", detail: "script_fixed" }],
    },
  ]);
});
afterEach(() => resetEditorOpenTriggers());

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "notes.txt": file("notes.txt", "alpha\nbeta\n"),
        "locked.txt": file("locked.txt", "secret", "r--r--r--"),
        docs: dir("docs", {}),
        scripts: dir("scripts", {
          "backup.sh": file("backup.sh", "#!/bin/bash\n"),
        }),
      }),
    }),
  });
  return {
    fs: new VirtualFS(root, HOME, HOME),
    cwd: HOME,
    homeDir: HOME,
    username: "player",
    activeComputer: "home",
    commandHistory: [],
    envVars: {},
    setEnvVars: () => {},
    aliases: {},
    setAliases: () => {},
    ...overrides,
  };
}

function run(name: string, rawArgs: string[], overrides: Partial<CommandContext> = {}) {
  const ctx = createContext(overrides);
  return execute(name, rawArgs, {}, { ...ctx, rawArgs });
}

describe("vim builtin (shared editorOpen paths)", () => {
  it("opens an existing file with the vim discriminator", () => {
    const result = run("vim", ["notes.txt"]);
    expect(result.editorSession).toMatchObject({
      filePath: `${HOME}/notes.txt`,
      content: "alpha\nbeta\n",
      readOnly: false,
      isNewFile: false,
      editor: "vim",
    });
  });

  it("resolves the vi alias to the same handler", () => {
    expect(getPrimaryName("vi")).toBe("vim");
    const result = run("vi", ["notes.txt"]);
    expect(result.editorSession?.editor).toBe("vim");
  });

  it("detects read-only files from permissions", () => {
    const result = run("vim", ["locked.txt"]);
    expect(result.editorSession?.readOnly).toBe(true);
  });

  it("rejects directories", () => {
    expect(run("vim", ["docs"]).stderr).toBe('vim: "docs": Is a directory');
  });

  it("requires a filename", () => {
    expect(run("vim", []).stderr).toBe("Usage: vim <filename>");
  });

  it("opens a new file when the parent directory exists", () => {
    const result = run("vim", ["fresh.txt"]);
    expect(result.editorSession).toMatchObject({
      filePath: `${HOME}/fresh.txt`,
      content: "",
      isNewFile: true,
      editor: "vim",
    });
  });

  it("rejects a new file in a missing directory", () => {
    expect(run("vim", ["nowhere/f.txt"]).stderr).toBe('vim: "nowhere/f.txt": No such file or directory');
  });

  it("carries the app-registered editor trigger for a matching file", () => {
    const result = run("vim", ["scripts/backup.sh"]);
    expect(result.editorSession).toMatchObject({
      triggerRow: 0,
      requireSave: true,
      triggerEvents: [{ type: "file_read", detail: "script_fixed" }],
    });
    // A content predicate implies requireSave and rides along to the session.
    expect(result.editorSession?.contentPredicate?.("ok")).toBe(true);
    expect(result.editorSession?.contentPredicate?.("TYPO")).toBe(false);
  });

  it("carries no trigger for a file the table does not name", () => {
    const result = run("vim", ["notes.txt"]);
    expect(result.editorSession?.triggerEvents).toBeUndefined();
    expect(result.editorSession?.requireSave).toBeUndefined();
  });

  it("carries no trigger on a different machine", () => {
    const result = run("vim", ["scripts/backup.sh"], { activeComputer: "elsewhere" });
    expect(result.editorSession?.triggerEvents).toBeUndefined();
  });
});

describe("nano builtin (shares editorOpen with vim)", () => {
  it("opens an existing file tagged as the nano editor", () => {
    const result = run("nano", ["notes.txt"]);
    expect(result.editorSession).toMatchObject({
      filePath: `${HOME}/notes.txt`,
      readOnly: false,
      isNewFile: false,
      editor: "nano",
    });
  });

  it("keeps nano-prefixed error messages", () => {
    expect(run("nano", ["docs"]).stderr).toBe('nano: "docs": Is a directory');
    expect(run("nano", []).stderr).toBe("Usage: nano <filename>");
  });

  it("still carries the registered editor trigger", () => {
    const result = run("nano", ["scripts/backup.sh"]);
    expect(result.editorSession).toMatchObject({ triggerRow: 0, requireSave: true });
  });
});
