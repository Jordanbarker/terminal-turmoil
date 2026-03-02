import { CommandHandler, AsyncCommandHandler, CommandResult, CommandContext } from "./types";
import { isCommandAvailable } from "./availability";
import { ComputerId } from "../../state/types";

const commands = new Map<string, { handler: CommandHandler; description: string; helpText?: string }>();
const asyncCommands = new Map<string, { handler: AsyncCommandHandler; description: string; helpText?: string }>();

export function register(name: string, handler: CommandHandler, description: string, helpText?: string): void {
  commands.set(name, { handler, description, helpText });
}

export function registerAsync(name: string, handler: AsyncCommandHandler, description: string, helpText?: string): void {
  asyncCommands.set(name, { handler, description, helpText });
}

export function execute(
  commandName: string,
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
): CommandResult {
  if (!isCommandAvailable(commandName, ctx.activeComputer)) {
    return { output: `${commandName}: command not found. Type 'help' for available commands.` };
  }
  const entry = commands.get(commandName);
  if (!entry) {
    return { output: `${commandName}: command not found. Type 'help' for available commands.` };
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
  if (!isCommandAvailable(commandName, ctx.activeComputer)) {
    return { output: `${commandName}: command not found. Type 'help' for available commands.` };
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

export function isAsyncCommand(name: string): boolean {
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
export function getAvailableCommands(computer: ComputerId): { name: string; description: string }[] {
  return getCommandList().filter((c) => isCommandAvailable(c.name, computer));
}
