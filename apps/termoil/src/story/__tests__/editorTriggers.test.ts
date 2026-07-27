import { describe, it, expect } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { execute } from "@tt/core/commands/registry";
import { buildEditorExitResult } from "@tt/core/editor/EditorSession";
import { createHomeFilesystem } from "../filesystem/home";
import "../../engine/commands/builtins";

const USERNAME = "testplayer";
const SCRIPT = `/home/${USERNAME}/scripts/backup.sh`;

function homeFs(): VirtualFS {
  return new VirtualFS(createHomeFilesystem(USERNAME), `/home/${USERNAME}`, `/home/${USERNAME}`);
}

function open(editor: "nano" | "vim", path: string, computer = "home") {
  const fs = homeFs();
  return execute(editor, [path], {}, {
    fs, cwd: fs.homeDir, homeDir: fs.homeDir, username: USERNAME, activeComputer: computer,
  });
}

/**
 * The app-side half of the editor trigger seam: core knows only "some file has
 * a predicate", termoil says which file and what counts as fixed.
 */
describe("backup.sh editor trigger", () => {
  it("attaches the trigger when the script is opened at home", () => {
    for (const editor of ["nano", "vim"] as const) {
      const session = open(editor, SCRIPT).editorSession;
      expect(session?.triggerEvents).toEqual([{ type: "file_read", detail: "fixed_backup_script" }]);
      expect(session?.requireSave).toBe(true);
      expect(session?.contentPredicate).toBeTypeOf("function");
    }
  });

  it("attaches nothing to an unrelated file", () => {
    const session = open("nano", `/home/${USERNAME}/scripts/scrape_glassdoor.py`).editorSession;
    expect(session?.triggerEvents).toBeUndefined();
  });

  it("the seeded script still carries the typo the predicate looks for", () => {
    const content = homeFs().readFile(SCRIPT).content ?? "";
    expect(content).toContain("BAKCUP_DIR");
  });

  // The whole point of the predicate: saving the file unchanged used to
  // complete "Fix the backup script".
  it("a save that leaves the typo in place does not fire the event", () => {
    const result = open("nano", SCRIPT);
    const info = result.editorSession!;
    const unchanged = info.content;
    const exit = buildEditorExitResult(
      homeFs(), [], { triggerRow: 0, triggerEvents: info.triggerEvents!, requireSave: true, contentPredicate: info.contentPredicate },
      99, true, unchanged
    );
    expect(exit.triggerEvents ?? []).not.toContainEqual({ type: "file_read", detail: "fixed_backup_script" });
  });

  it("fixing the typo and saving fires the event", () => {
    const result = open("nano", SCRIPT);
    const info = result.editorSession!;
    const fixed = info.content.replace("BAKCUP_DIR", "BACKUP_DIR");
    const exit = buildEditorExitResult(
      homeFs(), [], { triggerRow: 0, triggerEvents: info.triggerEvents!, requireSave: true, contentPredicate: info.contentPredicate },
      99, true, fixed
    );
    expect(exit.triggerEvents).toContainEqual({ type: "file_read", detail: "fixed_backup_script" });
  });
});
