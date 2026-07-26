import { describe, it, expect } from "vitest";
import { scanQuoted } from "../parser";
import { extractStdoutRedirect } from "../redirection";
import { findLastUnquotedPipe, hasUnquotedRedirect } from "@tt/core/suggestions/suggest";

/**
 * `redirection.ts` and `suggestions/suggest.ts` used to carry their own copies
 * of the quote-scanning loop. They now go through `scanQuoted`; the reference
 * implementations below are those copies verbatim, so this file fails the day
 * the shared visitor stops behaving like the code it replaced.
 */

function refExtractStdoutRedirect(raw: string): { command: string; redirects: { file: string; append: boolean }[]; parseError?: string } {
  let stripped = "";
  let inSingle = false;
  let inDouble = false;
  const redirects: { file: string; append: boolean }[] = [];
  let parseError: string | undefined;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (ch === "'" && !inDouble) { inSingle = !inSingle; stripped += ch; i++; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; stripped += ch; i++; continue; }

    if (!inSingle && !inDouble) {
      if (raw.slice(i, i + 4) === "2>&1") { i += 4; continue; }
      if (raw[i] === "2" && raw[i + 1] === ">") {
        let j = i + 2;
        if (raw[j] === ">") j++;
        while (j < raw.length && raw[j] === " ") j++;
        while (j < raw.length && raw[j] !== " " && raw[j] !== "'" && raw[j] !== '"' &&
               raw[j] !== "|" && raw[j] !== "&" && raw[j] !== ";") {
          j++;
        }
        i = j;
        continue;
      }
      if (raw[i] === ">") {
        const isAppend = raw[i + 1] === ">";
        let j = i + (isAppend ? 2 : 1);
        while (j < raw.length && raw[j] === " ") j++;
        let target = "";
        while (j < raw.length && raw[j] !== " " && raw[j] !== "'" && raw[j] !== '"' &&
               raw[j] !== "|" && raw[j] !== "&" && raw[j] !== ";") {
          target += raw[j];
          j++;
        }
        if (target === "") {
          parseError = "zsh: parse error near `\\n'";
        } else {
          redirects.push({ file: target, append: isAppend });
        }
        i = j;
        continue;
      }
    }

    stripped += ch;
    i++;
  }

  return {
    command: stripped.trim(),
    redirects,
    ...(parseError !== undefined && { parseError }),
  };
}

function refFindLastUnquotedPipe(input: string): number {
  let inSingle = false;
  let inDouble = false;
  let lastPipe = -1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === "|" && !inSingle && !inDouble) {
      if (input[i - 1] !== "|" && input[i + 1] !== "|") {
        lastPipe = i;
      }
    }
  }

  return lastPipe;
}

function refHasUnquotedRedirect(input: string): boolean {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === ">" && !inSingle && !inDouble) {
      return true;
    }
  }

  return false;
}

const CORPUS = [
  "",
  "ls",
  "echo hello",
  "echo a > out",
  "echo a >> out",
  "echo a>out",
  "echo a >",
  "echo a >   ",
  "echo a > out1 > out2",
  "echo a >> out1 > out2",
  "echo a 2> err",
  "echo a 2>> err",
  "echo a 2>&1",
  "echo a > /dev/null 2>&1",
  "echo a 2>/dev/null > out",
  'echo "a > b"',
  "echo 'a > b'",
  'echo "2>/dev/null"',
  "echo 'it'\\''s'",
  `echo "he said 'hi'" > out`,
  `echo 'she said "hi"' >> out`,
  "cat a | grep b",
  "cat a || echo b",
  "cat a | grep b | wc -l",
  "cat 'a|b' | grep c",
  'cat "a|b" | grep c',
  "echo | ",
  "| ls",
  "a || b | c",
  "a | b || c",
  'echo "unterminated',
  "echo 'unterminated",
  'echo "unterminated > out',
  "echo \"a\" 'b' > out",
  "grep foo bar.txt > out.txt 2>&1 | tee log",
  "echo a > 'quoted target'",
  'echo a > "quoted"',
  "echo a >>>b",
  "printf '%s\\n' x > y",
  "echo >&2 boom",
];

describe("scanQuoted parity with the hand-rolled loops it replaced", () => {
  it.each(CORPUS)("extractStdoutRedirect(%j)", (input) => {
    expect(extractStdoutRedirect(input)).toEqual(refExtractStdoutRedirect(input));
  });

  it.each(CORPUS)("findLastUnquotedPipe(%j)", (input) => {
    expect(findLastUnquotedPipe(input)).toBe(refFindLastUnquotedPipe(input));
  });

  it.each(CORPUS)("hasUnquotedRedirect(%j)", (input) => {
    expect(hasUnquotedRedirect(input)).toBe(refHasUnquotedRedirect(input));
  });
});

describe("scanQuoted", () => {
  it("reports the final quote state", () => {
    expect(scanQuoted("echo hi")).toEqual({ inSingle: false, inDouble: false });
    expect(scanQuoted('echo "hi')).toEqual({ inSingle: false, inDouble: true });
    expect(scanQuoted("echo 'hi")).toEqual({ inSingle: true, inDouble: false });
    expect(scanQuoted("echo 'hi'")).toEqual({ inSingle: false, inDouble: false });
  });

  it("does not let the other quote kind toggle while one is open", () => {
    expect(scanQuoted(`'a "b'`)).toEqual({ inSingle: false, inDouble: false });
    expect(scanQuoted(`"a 'b"`)).toEqual({ inSingle: false, inDouble: false });
  });

  it("visits every character with the state as of BEFORE it", () => {
    const seen: string[] = [];
    scanQuoted(`a'b'`, (char, i, state, isQuote) => {
      seen.push(`${i}:${char}:${state.inSingle ? "S" : "-"}:${isQuote ? "q" : "-"}`);
    });
    expect(seen).toEqual(["0:a:-:-", "1:':-:q", "2:b:S:-", "3:':S:q"]);
  });

  it("skips the characters a visitor claims, so they never toggle quote state", () => {
    const seen: string[] = [];
    // Claim the two chars after index 0, swallowing the opening quote.
    const state = scanQuoted(`a'bc`, (char, i) => {
      seen.push(char);
      return i === 0 ? 2 : 0;
    });
    expect(seen).toEqual(["a", "c"]);
    expect(state.inSingle).toBe(false);
  });
});
