import { ComputerId } from "../../state/types";

/** Commands available on the home PC — minimal set for Chapter 1. */
export const HOME_COMMANDS: ReadonlySet<string> = new Set([
  "ls",
  "cd",
  "cat",
  "pwd",
  "clear",
  "help",
  "mail",
  "nano",
  "save",
  "load",
  "newgame",
  "history",
  "ssh",
]);

/** Returns true if the command is available on the given computer. */
export function isCommandAvailable(commandName: string, computer: ComputerId): boolean {
  if (computer === "nexacorp") return true;
  return HOME_COMMANDS.has(commandName);
}
