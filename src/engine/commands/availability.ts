import { ComputerId, StoryFlags } from "../../state/types";

/** Commands available before the player unlocks the full set by scrolling through terminal_notes.txt. */
export const INITIAL_HOME_COMMANDS: ReadonlySet<string> = new Set([
  "nano",
  "clear",
  "help",
  "save",
  "load",
  "newgame",
]);

/** Full set of commands available on the home PC after unlocking. */
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
  "pdftotext",
  "tree",
]);

/** Returns true if the command is available on the given computer. */
export function isCommandAvailable(commandName: string, computer: ComputerId, storyFlags?: StoryFlags): boolean {
  if (computer === "nexacorp") return true;
  if (commandName === "pdftotext" && !storyFlags?.pdftotext_unlocked) return false;
  if (storyFlags?.commands_unlocked) return HOME_COMMANDS.has(commandName);
  return INITIAL_HOME_COMMANDS.has(commandName);
}
