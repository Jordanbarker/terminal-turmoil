import { describe, it, expect } from "vitest";
import { computeDiff } from "@tt/core/lib/diff";
import { contentLines, shortHash, DiffFile } from "../repo";
import { formatDiff, buildHunks } from "../output";

const lines = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => `line ${i + from}`).join("\n") + "\n";

function modified(path: string, oldContent: string, newContent: string): DiffFile {
  return { path, oldContent, newContent, status: "modified" };
}

describe("buildHunks", () => {
  const hunksOf = (a: string, b: string) => buildHunks(computeDiff(contentLines(a), contentLines(b)));

  it("brackets a single change with three lines of context", () => {
    const before = lines(10);
    const after = before.replace("line 5\n", "line 5 CHANGED\n");
    const hunks = hunksOf(before, after);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldStart).toBe(2);
    expect(hunks[0].oldCount).toBe(7); // lines 2-8: 3 context + change + 3 context
    expect(hunks[0].newStart).toBe(2);
    expect(hunks[0].newCount).toBe(7);
  });

  it("splits far-apart changes and merges nearby ones", () => {
    const before = lines(30);
    const far = before.replace("line 2\n", "line 2 X\n").replace("line 25\n", "line 25 X\n");
    expect(hunksOf(before, far)).toHaveLength(2);

    // Six unchanged lines between the two edits is exactly 2x context — still one hunk.
    const near = before.replace("line 2\n", "line 2 X\n").replace("line 9\n", "line 9 X\n");
    expect(hunksOf(before, near)).toHaveLength(1);
  });

  it("anchors a whole-file add at old line 0", () => {
    const hunks = hunksOf("", "a\nb\n");
    expect(hunks).toEqual([
      expect.objectContaining({ oldStart: 0, oldCount: 0, newStart: 1, newCount: 2 }),
    ]);
  });

  it("returns nothing when the contents match", () => {
    expect(hunksOf("same\n", "same\n")).toEqual([]);
  });
});

describe("formatDiff", () => {
  it("emits real-git headers for a modified file", () => {
    const oldContent = "one\ntwo\n";
    const newContent = "one\nTWO\n";
    const out = formatDiff([modified("app.py", oldContent, newContent)], true);
    expect(out.split("\n")).toEqual([
      "diff --git a/app.py b/app.py",
      `index ${shortHash(oldContent)}..${shortHash(newContent)} 100644`,
      "--- a/app.py",
      "+++ b/app.py",
      "@@ -1,2 +1,2 @@",
      " one",
      "-two",
      "+TWO",
    ]);
  });

  it("marks new files with /dev/null on the a side", () => {
    const out = formatDiff([{ path: "new.txt", oldContent: "", newContent: "hi\n", status: "added" }], true);
    expect(out.split("\n")).toEqual([
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      `index 0000000..${shortHash("hi\n")}`,
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1 @@",
      "+hi",
    ]);
  });

  it("marks deleted files with /dev/null on the b side", () => {
    const out = formatDiff([{ path: "gone.txt", oldContent: "bye\n", newContent: "", status: "deleted" }], true);
    expect(out.split("\n")).toEqual([
      "diff --git a/gone.txt b/gone.txt",
      "deleted file mode 100644",
      `index ${shortHash("bye\n")}..0000000`,
      "--- a/gone.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
    ]);
  });

  it("prints one hunk header per change region", () => {
    const before = lines(30);
    const after = before.replace("line 2\n", "line 2 X\n").replace("line 25\n", "line 25 X\n");
    const headers = formatDiff([modified("big.txt", before, after)], true)
      .split("\n")
      .filter((l) => l.startsWith("@@"));
    expect(headers).toEqual(["@@ -1,5 +1,5 @@", "@@ -22,7 +22,7 @@"]);
  });

  it("omits ANSI when plain, includes it otherwise", () => {
    const diffs = [modified("a.txt", "one\n", "two\n")];
    expect(formatDiff(diffs, true)).not.toMatch(/\[/);
    expect(formatDiff(diffs, false)).toMatch(/\[/);
  });

  it("is empty for an empty diff list", () => {
    expect(formatDiff([], true)).toBe("");
  });
});
