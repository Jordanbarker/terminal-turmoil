import { describe, it, expect } from "vitest";
import { parseEditorInput } from "../keymap";

describe("parseEditorInput", () => {
  describe("escape sequences", () => {
    it("parses arrow keys", () => {
      expect(parseEditorInput("\x1b[A")).toEqual([{ type: "arrowUp" }]);
      expect(parseEditorInput("\x1b[B")).toEqual([{ type: "arrowDown" }]);
      expect(parseEditorInput("\x1b[C")).toEqual([{ type: "arrowRight" }]);
      expect(parseEditorInput("\x1b[D")).toEqual([{ type: "arrowLeft" }]);
    });

    it("parses Home and End", () => {
      expect(parseEditorInput("\x1b[H")).toEqual([{ type: "home" }]);
      expect(parseEditorInput("\x1b[F")).toEqual([{ type: "end" }]);
    });

    it("parses Delete key", () => {
      expect(parseEditorInput("\x1b[3~")).toEqual([{ type: "delete" }]);
    });

    it("parses PageUp and PageDown", () => {
      expect(parseEditorInput("\x1b[5~")).toEqual([{ type: "pageUp" }]);
      expect(parseEditorInput("\x1b[6~")).toEqual([{ type: "pageDown" }]);
    });

    it("skips unknown escape sequences", () => {
      expect(parseEditorInput("\x1b[Z")).toEqual([]);
    });
  });

  describe("Ctrl combinations", () => {
    it("Ctrl+A → home", () => {
      expect(parseEditorInput("\x01")).toEqual([{ type: "home" }]);
    });

    it("Ctrl+E → end", () => {
      expect(parseEditorInput("\x05")).toEqual([{ type: "end" }]);
    });

    it("Ctrl+G → help", () => {
      expect(parseEditorInput("\x07")).toEqual([{ type: "help" }]);
    });

    it("Ctrl+K → cutLine", () => {
      expect(parseEditorInput("\x0b")).toEqual([{ type: "cutLine" }]);
    });

    it("Ctrl+O → save", () => {
      expect(parseEditorInput("\x0f")).toEqual([{ type: "save" }]);
    });

    it("Ctrl+S → save", () => {
      expect(parseEditorInput("\x13")).toEqual([{ type: "save" }]);
    });

    it("Ctrl+U → pasteLine", () => {
      expect(parseEditorInput("\x15")).toEqual([{ type: "pasteLine" }]);
    });

    it("Ctrl+V → pageDown", () => {
      expect(parseEditorInput("\x16")).toEqual([{ type: "pageDown" }]);
    });

    it("Ctrl+X → exit", () => {
      expect(parseEditorInput("\x18")).toEqual([{ type: "exit" }]);
    });

    it("Ctrl+Y → pageUp", () => {
      expect(parseEditorInput("\x19")).toEqual([{ type: "pageUp" }]);
    });
  });

  describe("basic keys", () => {
    it("parses Backspace (127 and 8)", () => {
      expect(parseEditorInput("\x7f")).toEqual([{ type: "backspace" }]);
      expect(parseEditorInput("\x08")).toEqual([{ type: "backspace" }]);
    });

    it("parses Enter (\\r and \\n)", () => {
      expect(parseEditorInput("\r")).toEqual([{ type: "enter" }]);
      expect(parseEditorInput("\n")).toEqual([{ type: "enter" }]);
    });

    it("parses printable characters", () => {
      expect(parseEditorInput("a")).toEqual([{ type: "insert", char: "a" }]);
      expect(parseEditorInput("Z")).toEqual([{ type: "insert", char: "Z" }]);
      expect(parseEditorInput(" ")).toEqual([{ type: "insert", char: " " }]);
    });
  });

  describe("multi-character input", () => {
    it("parses multiple characters into multiple actions", () => {
      const actions = parseEditorInput("abc");
      expect(actions).toEqual([
        { type: "insert", char: "a" },
        { type: "insert", char: "b" },
        { type: "insert", char: "c" },
      ]);
    });

    it("handles mixed input types", () => {
      // "a" + Enter + Ctrl+X
      const actions = parseEditorInput("a\r\x18");
      expect(actions).toEqual([
        { type: "insert", char: "a" },
        { type: "enter" },
        { type: "exit" },
      ]);
    });

    it("handles escape sequence followed by text", () => {
      const actions = parseEditorInput("\x1b[Ahello");
      expect(actions[0]).toEqual({ type: "arrowUp" });
      expect(actions[1]).toEqual({ type: "insert", char: "h" });
      expect(actions).toHaveLength(6); // arrowUp + h,e,l,l,o
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty input", () => {
      expect(parseEditorInput("")).toEqual([]);
    });

    it("skips unknown control characters", () => {
      // Ctrl+B (0x02) is not mapped
      expect(parseEditorInput("\x02")).toEqual([]);
    });
  });
});
