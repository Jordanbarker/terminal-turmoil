import { describe, it, expect } from "vitest";
import { renderChipResponseLines } from "../render";
import { stripAnsi } from "@tt/core/lib/ansi";
import { ALL_ITEMS } from "../../../story/chip/menuItems";
import { createHomeFilesystem } from "../../../story/filesystem/home";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";

/**
 * Chip's replies moved onto the shared `wordWrap`. Its old private copy is
 * reproduced here verbatim: every reachable menu response must still render
 * exactly as it did, at every width `ChipSession.getWidth()` can produce
 * (min(cols, 80), so a tmux split lands well under 80).
 *
 * This matters beyond looks: `ChipSession.skipAnimation` repaints by moving the
 * cursor up once per line it emitted, so a line that soft-wraps in the terminal
 * costs more physical rows than the repaint accounts for and leaves duplicated
 * text behind. Wrapping has to keep every line inside the pane.
 */
function oldChipWordWrap(text: string, width: number): string {
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

const fs = new VirtualFS(createHomeFilesystem("ren"), "/home/ren", "/home/ren");

/** Every reply chip can produce, resolved (some are computed from the FS). */
const RESPONSES: { id: string; text: string }[] = ALL_ITEMS.map((item) => ({
  id: item.id,
  text: typeof item.response === "function" ? item.response(fs) : item.response,
}));

const WIDTHS = [40, 60, 80];

describe("chip response rendering", () => {
  it("covers every menu item, including the indented git_help listing", () => {
    expect(RESPONSES.length).toBeGreaterThan(10);
    const gitHelp = RESPONSES.find((r) => r.id === "git_help");
    expect(gitHelp).toBeDefined();
    expect(gitHelp!.text).toMatch(/\n {2}git add \./);
  });

  describe.each(WIDTHS)("at width %i", (width) => {
    it.each(RESPONSES.map((r) => r.id))("%s renders as it did before the shared wordWrap", (id) => {
      const { text } = RESPONSES.find((r) => r.id === id)!;
      const expected = oldChipWordWrap(text, width).split("\r\n");
      const actual = renderChipResponseLines(text, width).map((l) => stripAnsi(l.line));
      expect(actual).toEqual(expected);
    });
  });

  describe.each(WIDTHS)("at width %i", (width) => {
    it.each(RESPONSES.map((r) => r.id))("%s leaves no wrappable line overflowing", (id) => {
      const { text } = RESPONSES.find((r) => r.id === id)!;
      // A single unbreakable token (a long path) may exceed the width: word
      // splitting is naive on purpose. Anything with a space in it should have
      // been broken, and a line that soft-wraps miscounts skipAnimation's repaint.
      const overflowing = renderChipResponseLines(text, width)
        .map((l) => stripAnsi(l.line))
        .filter((l) => l.length > width && l.trim().includes(" "));
      expect(overflowing).toEqual([]);
    });
  });
});
