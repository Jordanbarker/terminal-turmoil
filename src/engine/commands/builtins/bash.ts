import { registerAsync } from "../registry";
import { AsyncCommandHandler, CommandContext, CommandResult } from "../types";
import { parsePipeline, parseInput } from "../parser";
import { execute, executeAsync, isAsyncCommand } from "../registry";
import { applyRedirection } from "../redirection";
import { resolvePath } from "../../../lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { GameEvent } from "../../mail/delivery";

const MAX_SUBSTITUTION_DEPTH = 5;

/** Session fields that indicate an interactive command. */
const SESSION_FIELDS = [
  "editorSession",
  "interactiveSession",
  "snowSqlSession",
  "sshSession",
  "chipSession",
  "piperSession",
  "promptSession",
] as const;

interface Line {
  text: string;
  lineNumber: number;
}

/** Parse script content into executable lines, stripping comments/shebangs/blanks. */
function parseScript(content: string): Line[] {
  const lines: Line[] = [];
  const rawLines = content.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue; // comments and shebangs
    lines.push({ text: rawLines[i], lineNumber: i + 1 });
  }
  return lines;
}

/** Find the matching closing paren for $( at position `start`, handling nesting. */
function findMatchingParen(text: string, start: number): number {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(" && i > 0 && text[i - 1] === "$") {
      depth++;
    } else if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Expand $(command) substitutions by executing inner commands. */
async function expandSubstitutions(
  text: string,
  ctx: CommandContext,
  runningFs: VirtualFS,
  currentCwd: string,
  allTriggerEvents: GameEvent[],
  depth: number,
): Promise<{ text: string; fs: VirtualFS; cwd: string }> {
  if (depth > MAX_SUBSTITUTION_DEPTH) return { text, fs: runningFs, cwd: currentCwd };

  let result = "";
  let i = 0;
  let fs = runningFs;
  let cwd = currentCwd;

  while (i < text.length) {
    if (text[i] === "$" && i + 1 < text.length && text[i + 1] === "(") {
      const innerStart = i + 2;
      const closeIdx = findMatchingParen(text, innerStart);
      if (closeIdx === -1) {
        result += text.slice(i);
        break;
      }
      const innerCmd = text.slice(innerStart, closeIdx);

      // Recursively expand nested substitutions
      const expanded = await expandSubstitutions(innerCmd, ctx, fs, cwd, allTriggerEvents, depth + 1);
      fs = expanded.fs;
      cwd = expanded.cwd;

      // Execute the inner command
      const innerResult = await executeSingleLine(expanded.text, {
        ...ctx,
        fs,
        cwd,
      }, fs, cwd, allTriggerEvents);
      fs = innerResult.fs;
      cwd = innerResult.cwd;

      // Replace with trimmed output
      result += innerResult.output.trim();
      i = closeIdx + 1;
    } else {
      result += text[i];
      i++;
    }
  }

  return { text: result, fs, cwd };
}

/** Execute a single line (may be a pipeline with redirection). */
async function executeSingleLine(
  lineText: string,
  ctx: CommandContext,
  runningFs: VirtualFS,
  currentCwd: string,
  allTriggerEvents: GameEvent[],
): Promise<{ output: string; fs: VirtualFS; cwd: string; stopped: boolean }> {
  const pipeline = parsePipeline(lineText);

  // Check for parse errors
  const parseError = pipeline.find((p) => p.error);
  if (parseError) {
    return { output: parseError.error!, fs: runningFs, cwd: currentCwd, stopped: false };
  }

  // Check for redirection in the last segment
  let redirectFile: string | null = null;
  let redirectAppend = false;
  const lastSegment = pipeline[pipeline.length - 1];
  if (lastSegment.raw.includes(">>") || lastSegment.raw.includes(">")) {
    const raw = lastSegment.raw;
    const appendIdx = raw.indexOf(">>");
    const overwriteIdx = raw.indexOf(">");
    if (appendIdx !== -1) {
      redirectAppend = true;
      const parts = raw.split(">>");
      pipeline[pipeline.length - 1] = parseInput(parts[0].trim());
      redirectFile = parts[1].trim();
    } else if (overwriteIdx !== -1) {
      const parts = raw.split(">");
      pipeline[pipeline.length - 1] = parseInput(parts[0].trim());
      redirectFile = parts[1].trim();
    }
  }

  let stdin: string | undefined;
  let lastResult: CommandResult = { output: "" };
  let fs = runningFs;
  let cwd = currentCwd;

  for (let pi = 0; pi < pipeline.length; pi++) {
    const p = pipeline[pi];
    if (!p.command) continue;

    const subCtx: CommandContext = {
      ...ctx,
      fs,
      cwd,
      stdin,
      rawArgs: p.rawArgs,
      isPiped: pi < pipeline.length - 1 || !!redirectFile,
    };

    if (isAsyncCommand(p.command)) {
      lastResult = await executeAsync(p.command, p.args, p.flags, subCtx);
    } else {
      lastResult = execute(p.command, p.args, p.flags, subCtx);
    }

    // Check for interactive session — skip with warning
    if (SESSION_FIELDS.some((f) => lastResult[f])) {
      // Strip session fields, keep output
      const cleaned: CommandResult = { output: lastResult.output, exitCode: lastResult.exitCode };
      if (lastResult.triggerEvents) cleaned.triggerEvents = lastResult.triggerEvents;
      if (lastResult.newFs) cleaned.newFs = lastResult.newFs;
      if (lastResult.newCwd) cleaned.newCwd = lastResult.newCwd;
      lastResult = cleaned;
    }

    // Check for computer transition — stop script
    if (lastResult.transitionTo) {
      if (lastResult.triggerEvents) allTriggerEvents.push(...lastResult.triggerEvents);
      return {
        output: `bash: cannot transition computers from within a script`,
        fs: lastResult.newFs ?? fs,
        cwd,
        stopped: true,
      };
    }

    if (lastResult.triggerEvents) {
      allTriggerEvents.push(...lastResult.triggerEvents);
    }

    if (lastResult.newFs) {
      fs = lastResult.newFs;
    }

    if (lastResult.newCwd) {
      cwd = lastResult.newCwd;
    }

    stdin = lastResult.output;
  }

  // Apply redirection
  if (redirectFile && lastResult) {
    const redir = applyRedirection(redirectFile, redirectAppend, lastResult, cwd, ctx.homeDir, fs);
    lastResult = redir.result;
    fs = redir.fs;
  }

  return { output: lastResult.output, fs, cwd, stopped: false };
}

/** Execute a script's content. Exported for use by the registry path-execution fallback. */
export async function executeScript(content: string, ctx: CommandContext): Promise<CommandResult> {
  const lines = parseScript(content);
  const allTriggerEvents: GameEvent[] = [];
  const outputs: string[] = [];
  let runningFs = ctx.fs;
  let currentCwd = ctx.cwd;

  for (const line of lines) {
    // Expand command substitutions
    const expanded = await expandSubstitutions(
      line.text.trim(),
      ctx,
      runningFs,
      currentCwd,
      allTriggerEvents,
      0,
    );
    runningFs = expanded.fs;
    currentCwd = expanded.cwd;

    const result = await executeSingleLine(
      expanded.text,
      { ...ctx, fs: runningFs, cwd: currentCwd },
      runningFs,
      currentCwd,
      allTriggerEvents,
    );

    if (result.output) {
      outputs.push(result.output);
    }
    runningFs = result.fs;
    currentCwd = result.cwd;

    if (result.stopped) break;
  }

  const combinedResult: CommandResult = {
    output: outputs.join("\n"),
    triggerEvents: allTriggerEvents.length > 0 ? allTriggerEvents : undefined,
  };

  if (runningFs !== ctx.fs) {
    combinedResult.newFs = runningFs;
  }

  // Do NOT propagate newCwd — script runs in a subshell

  return combinedResult;
}

const bashHandler: AsyncCommandHandler = async (args, flags, ctx) => {
  // bash -c "command string"
  if (flags.c) {
    const cmdString = args.join(" ");
    if (!cmdString) {
      return { output: "bash: -c: option requires an argument" };
    }
    return executeScript(cmdString, ctx);
  }

  // bash (no args) — not supported
  if (args.length === 0) {
    return {
      output: "bash: interactive mode not supported. Usage: bash <script.sh> or bash -c \"command\"",
    };
  }

  // bash script.sh — read file and execute
  const filePath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const fileResult = ctx.fs.readFile(filePath);
  if (fileResult.error) {
    return { output: `bash: ${args[0]}: No such file or directory`, exitCode: 1 };
  }

  const result = await executeScript(fileResult.content!, ctx);

  // Add file_read event for the script file itself
  const scriptEvent: GameEvent = { type: "file_read", detail: filePath };
  const events = result.triggerEvents ? [scriptEvent, ...result.triggerEvents] : [scriptEvent];
  return { ...result, triggerEvents: events };
};

const description = "Execute shell scripts";
registerAsync("bash", bashHandler, description, HELP_TEXTS.bash);
registerAsync("sh", bashHandler, description, HELP_TEXTS.bash);
