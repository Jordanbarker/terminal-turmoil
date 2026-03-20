import { CommandHandler, AsyncCommandHandler, CommandResult, CommandContext } from "./types";
import { isCommandAvailable } from "./availability";
import { ComputerId, StoryFlags } from "../../state/types";
import { resolvePath } from "../../lib/pathUtils";

/** Check if a command string looks like a path (starts with ./ or /). */
function isPathCommand(name: string): boolean {
  return name.startsWith("./") || name.startsWith("/");
}

const NEXACORP_GATE_HINTS: Record<string, string> = {
  coder: "Read your welcome email and check /srv/engineering/onboarding.md to get set up.",
  piper: "Read your welcome email — it has instructions for getting started.",
};

const commands = new Map<string, { handler: CommandHandler; description: string; helpText?: string; readsFiles?: boolean }>();
const asyncCommands = new Map<string, { handler: AsyncCommandHandler; description: string; helpText?: string; readsFiles?: boolean }>();

export function register(name: string, handler: CommandHandler, description: string, helpText?: string, readsFiles?: boolean): void {
  commands.set(name, { handler, description, helpText, readsFiles });
}

export function registerAsync(name: string, handler: AsyncCommandHandler, description: string, helpText?: string, readsFiles?: boolean): void {
  asyncCommands.set(name, { handler, description, helpText, readsFiles });
}

/** Returns true if the command reads files (triggers file_read events in applyResult). */
export function commandReadsFiles(name: string): boolean {
  return !!(commands.get(name)?.readsFiles ?? asyncCommands.get(name)?.readsFiles);
}

export function execute(
  commandName: string,
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
): CommandResult {
  if (!isCommandAvailable(commandName, ctx.activeComputer, ctx.storyFlags)) {
    if (ctx.activeComputer === "nexacorp") {
      const hint = NEXACORP_GATE_HINTS[commandName] ?? "Check your mail and Piper messages — your colleagues will help you get set up.";
      return { output: `${commandName}: not yet available. ${hint}`, exitCode: 127 };
    }
    return { output: `${commandName}: command not found. Type 'help' for available commands.`, exitCode: 127 };
  }
  const entry = commands.get(commandName);
  if (!entry) {
    return { output: `${commandName}: command not found. Type 'help' for available commands.`, exitCode: 127 };
  }
  if (flags["help"] && entry.helpText) {
    return { output: entry.helpText };
  }
  return entry.handler(args, flags, ctx);
}

export async function executeAsync(
  commandName: string,
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
): Promise<CommandResult> {
  // Path execution: ./script.sh or /path/to/script.sh
  if (isPathCommand(commandName)) {
    return executePathCommand(commandName, ctx);
  }
  const asyncEntry = asyncCommands.get(commandName);
  if (asyncEntry) {
    if (flags["help"] && asyncEntry.helpText) {
      return { output: asyncEntry.helpText };
    }
    return asyncEntry.handler(args, flags, ctx);
  }
  return execute(commandName, args, flags, ctx);
}

/** Execute a file path as a script (./script.sh or /path/to/script). */
async function executePathCommand(pathStr: string, ctx: CommandContext): Promise<CommandResult> {
  const absPath = resolvePath(pathStr, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absPath);
  if (!node) {
    return { output: `bash: ${pathStr}: No such file or directory`, exitCode: 127 };
  }
  if (node.type === "directory") {
    return { output: `bash: ${pathStr}: Is a directory`, exitCode: 126 };
  }
  // Check execute permission (owner execute = index 2 in "rwxr-xr-x")
  const perms = node.permissions ?? "rw-r--r--";
  if (perms[2] !== "x") {
    return { output: `bash: ${pathStr}: Permission denied`, exitCode: 126 };
  }
  const content = node.type === "file" ? node.content : "";
  // Lazy import to avoid circular dependency at module load time
  const { executeScript } = await import("./builtins/bash");
  const result = await executeScript(content, ctx);
  // Add file_read event for the script file
  const scriptEvent = { type: "file_read" as const, detail: absPath };
  const events = result.triggerEvents ? [scriptEvent, ...result.triggerEvents] : [scriptEvent];
  return { ...result, triggerEvents: events };
}

export function isAsyncCommand(name: string): boolean {
  if (isPathCommand(name)) return true;
  return asyncCommands.has(name);
}

export function getCommandList(): { name: string; description: string }[] {
  const all = new Map<string, string>();
  for (const [name, { description }] of commands) {
    all.set(name, description);
  }
  for (const [name, { description }] of asyncCommands) {
    all.set(name, description);
  }
  return Array.from(all.entries()).map(([name, description]) => ({
    name,
    description,
  }));
}

/** Returns only commands available on the given computer. */
export function getAvailableCommands(computer: ComputerId, storyFlags?: StoryFlags): { name: string; description: string }[] {
  return getCommandList().filter((c) => isCommandAvailable(c.name, computer, storyFlags));
}
