import { describe, it, expect } from "vitest";
import { splitLines, wordWrap } from "../textUtils";

describe("splitLines", () => {
  it("drops the empty element a trailing newline produces", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
  });

  it("keeps a genuine trailing blank line", () => {
    expect(splitLines("a\nb\n\n")).toEqual(["a", "b", ""]);
  });

  it("treats an empty file as no lines", () => {
    expect(splitLines("")).toEqual([]);
  });
});

/**
 * `wordWrap` replaced two near-identical copies in termoil: chip's
 * (indent-aware) and piper's (leaves pre-formatted lines alone). The
 * references below are those copies verbatim; the shared version must match
 * each of them on the inputs that copy was written for, so a chip or piper
 * pane can't silently start rendering differently.
 */
function chipWrap(text: string, width: number): string {
  if (width <= 0) return text;
  const paragraphs = text.split("\n");
  const wrapped = paragraphs.map((para) => {
    const indentMatch = para.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    const effectiveWidth = width - indent.length;
    if (effectiveWidth <= 0) return para;
    const trimmed = para.slice(indent.length);
    const words = trimmed.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > effectiveWidth && current.length > 0) {
        lines.push(indent + current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(indent + current);
    return lines.join("\r\n");
  });
  return wrapped.join("\r\n");
}

function piperWrap(text: string, width: number): string {
  if (width <= 0) return text;
  const paragraphs = text.split("\n");
  const wrapped = paragraphs.map((para) => {
    if (para.startsWith("  ")) return para;
    const words = para.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > width && current.length > 0) {
        lines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(current);
    return lines.join("\r\n");
  });
  return wrapped.join("\r\n");
}

/** Inputs with no pre-formatted (2+ space indented) paragraph: both copies agreed here. */
const FLUSH_LEFT = [
  "",
  "short",
  "the quick brown fox jumps over the lazy dog and keeps on running",
  "one\ntwo\nthree",
  "a paragraph that wraps\n\nand another one after a blank line",
  "supercalifragilisticexpialidocious-is-longer-than-any-sane-width",
  "trailing spaces at the end   ",
  "run 'tree -a' to include hidden files. beats running ls over and over.",
];

/** Pre-formatted blocks: command examples, log excerpts, aligned tables. */
const PREFORMATTED = [
  "  sudo apt install tree\n\nthen run 'tree' in any directory to see the whole thing at once.",
  'challenge 5: pipe echo into something.\n\n  echo "hello" | cat\n  echo "test" > /tmp/test.txt',
  "SYSTEM INFO:\n  whoami            print your username\n  hostname          print your machine name",
  "  [2026-02-23 02:59:42] chip-service[4821]: WARN unexpected batch job that runs long past any pane width",
];

const WIDTHS = [-1, 0, 1, 8, 16, 24, 40, 60, 76, 80, 120];

describe("wordWrap", () => {
  it.each(WIDTHS)("matches both old copies on flush-left prose (width %i)", (width) => {
    for (const text of FLUSH_LEFT) {
      expect(wordWrap(text, width, "wrap-indented")).toBe(chipWrap(text, width));
      expect(wordWrap(text, width, "preserve")).toBe(piperWrap(text, width));
    }
  });

  it.each(WIDTHS)("'preserve' matches piper's copy on pre-formatted blocks (width %i)", (width) => {
    for (const text of PREFORMATTED) {
      expect(wordWrap(text, width, "preserve")).toBe(piperWrap(text, width));
    }
  });

  it.each(WIDTHS)("'wrap-indented' matches chip's copy on pre-formatted blocks (width %i)", (width) => {
    for (const text of PREFORMATTED) {
      expect(wordWrap(text, width, "wrap-indented")).toBe(chipWrap(text, width));
    }
  });

  it("'preserve' leaves a pre-formatted line intact even when it overflows", () => {
    const table = "  alice   engineering\n  bob     sales";
    expect(wordWrap(table, 12, "preserve")).toBe("  alice   engineering\r\n  bob     sales");
  });

  it("'wrap-indented' reflows the same table inside the pane", () => {
    const table = "  alice   engineering\n  bob     sales";
    expect(wordWrap(table, 12, "wrap-indented")).toBe(
      "  alice  \r\n  engineering\r\n  bob    \r\n  sales",
    );
  });

  it("keeps a single-space indent on every continuation line", () => {
    expect(wordWrap(" aaa bbb ccc", 5, "preserve")).toBe(" aaa\r\n bbb\r\n ccc");
    expect(wordWrap(" aaa bbb ccc", 5, "wrap-indented")).toBe(" aaa\r\n bbb\r\n ccc");
  });

  it("never breaks a word longer than the width", () => {
    expect(wordWrap("a supercalifragilistic b", 6, "wrap-indented")).toBe("a\r\nsupercalifragilistic\r\nb");
  });

  it("returns the text unchanged for an unmeasured pane", () => {
    expect(wordWrap("a b c", 0, "preserve")).toBe("a b c");
    expect(wordWrap("a b c", -5, "wrap-indented")).toBe("a b c");
  });

  it("joins with \\r\\n so output can go straight to xterm", () => {
    expect(wordWrap("aaa bbb", 3, "preserve")).toBe("aaa\r\nbbb");
    expect(wordWrap("a\nb", 10, "wrap-indented")).toBe("a\r\nb");
  });
});
