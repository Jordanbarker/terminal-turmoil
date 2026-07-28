import { describe, it, expect } from "vitest";
import { renderConversation } from "../render";
import { stripAnsi } from "@tt/core/lib/ansi";
import { getPiperDeliveries } from "../../../story/piper/messages";
import { PiperMessage } from "../types";

/**
 * Piper's message bodies moved onto the shared `wordWrap`. Its old private copy
 * is reproduced here verbatim: every authored body must still render exactly as
 * it did. Piper messages are full of pasted log lines and aligned command
 * tables, which is why it asks for `"preserve"`.
 */
function oldPiperWordWrap(text: string, width: number): string {
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

/** Every authored body, NPC messages and player reply text alike. */
const BODIES: string[] = [];
for (const delivery of getPiperDeliveries("ren")) {
  for (const message of delivery.messages) BODIES.push(message.body);
  for (const reply of delivery.replyOptions ?? []) BODIES.push(reply.messageBody);
}

const WIDTHS = [44, 60, 80, 120];

describe("piper conversation rendering", () => {
  it("has authored bodies to check, including pre-formatted blocks", () => {
    expect(BODIES.length).toBeGreaterThan(100);
    expect(BODIES.some((b) => b.split("\n").some((l) => l.startsWith("  ")))).toBe(true);
  });

  it.each(WIDTHS)("renders every body as it did before the shared wordWrap (width %i)", (width) => {
    for (const body of BODIES) {
      const messages: PiperMessage[] = [{ id: "m", from: "oscar", timestamp: "", body }];
      const rendered = stripAnsi(renderConversation(messages, width, 0));
      // The conversation frame indents each body line by two spaces.
      const expected = oldPiperWordWrap(body, width - 4)
        .split("\r\n")
        .map((l) => `  ${l}`);
      for (const line of expected) {
        expect(rendered.split("\r\n")).toContain(line);
      }
    }
  });
});
