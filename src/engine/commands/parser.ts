import { ParsedCommand } from "./types";

/**
 * Tokenize and parse raw terminal input into a structured command.
 */
export function parseInput(raw: string): ParsedCommand {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { command: "", args: [], flags: {}, raw: trimmed, rawArgs: [] };
  }

  const tokens = tokenize(trimmed);
  if (tokens === null) {
    return { command: "", args: [], flags: {}, raw: trimmed, rawArgs: [], error: "syntax error: unterminated quote" };
  }
  const command = tokens[0] || "";
  const rawArgs = tokens.slice(1);
  const args: string[] = [];
  const flags: Record<string, boolean> = {};

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith("--")) {
      flags[token.slice(2)] = true;
    } else if (token.startsWith("-") && token.length > 1) {
      // Expand combined short flags: -la -> -l -a
      for (const char of token.slice(1)) {
        flags[char] = true;
      }
    } else {
      args.push(token);
    }
  }

  return { command, args, flags, raw: trimmed, rawArgs };
}

/**
 * Split raw input on unquoted `|` characters and parse each segment.
 * Returns an array of ParsedCommands representing the pipeline.
 */
export function parsePipeline(raw: string): ParsedCommand[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [{ command: "", args: [], flags: {}, raw: trimmed, rawArgs: [] }];
  }

  const segments = splitOnPipe(trimmed);
  return segments.map((seg) => parseInput(seg));
}

/**
 * Split input on unquoted `|` characters, respecting single/double quotes.
 * Also handles `>` and `>>` redirection operators as separate segments.
 */
export function splitOnPipe(input: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
    } else if (char === "|" && !inSingle && !inDouble) {
      segments.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * Split input into tokens, respecting single and double quotes.
 */
function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === " " && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (inSingle || inDouble) return null;

  if (current) tokens.push(current);
  return tokens;
}
