/**
 * Split text into lines, dropping the single empty element a trailing
 * newline produces ("a\nb\n" → ["a", "b"], not ["a", "b", ""]).
 * An empty string yields no lines, matching how Unix tools treat empty files.
 */
export function splitLines(content: string): string[] {
  if (content === "") return [];
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * What to do with a paragraph the author indented by two or more spaces, which
 * in practice means a command example, a log excerpt, or an aligned table.
 *
 * - `"preserve"` emits it untouched, even when it overflows the pane. Re-flowing
 *   an aligned table turns it into confetti, so piper's message bodies (full of
 *   pasted log lines) use this.
 * - `"wrap-indented"` wraps it like any other paragraph, re-applying the indent
 *   to each continuation line. Chip's replies use this: its longest blocks are
 *   indented command listings that must stay inside the pane, because
 *   `ChipSession.skipAnimation` repaints by counting the rows it emitted and a
 *   line that soft-wraps costs more rows than it counted.
 */
export type PreformattedHandling = "preserve" | "wrap-indented";

/**
 * Wrap authored prose for a fixed-width xterm pane. Paragraphs (`\n`-separated)
 * wrap independently and the result is joined with `\r\n`, ready to write
 * straight to a terminal.
 *
 * Leading whitespace is always preserved and re-applied to every continuation
 * line, with the wrap width reduced to match. `preformatted` decides the one
 * case the two callers genuinely disagree on (see `PreformattedHandling`); it
 * is required rather than defaulted, because picking wrong is invisible until
 * a pane gets narrow.
 *
 * Word-splitting is naive on purpose: a single word longer than `width` is left
 * long rather than broken mid-token, which keeps paths and commands copyable.
 * `width <= 0` (an unmeasured pane) returns the text unchanged.
 */
export function wordWrap(text: string, width: number, preformatted: PreformattedHandling): string {
  if (width <= 0) return text;

  return text
    .split("\n")
    .map((paragraph) => {
      if (preformatted === "preserve" && paragraph.startsWith("  ")) return paragraph;

      const indent = /^\s*/.exec(paragraph)![0];
      const effectiveWidth = width - indent.length;
      if (effectiveWidth <= 0) return paragraph;

      const lines: string[] = [];
      let current = "";
      for (const word of paragraph.slice(indent.length).split(" ")) {
        if (current.length + word.length + 1 > effectiveWidth && current.length > 0) {
          lines.push(indent + current);
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      if (current) lines.push(indent + current);
      return lines.join("\r\n");
    })
    .join("\r\n");
}
