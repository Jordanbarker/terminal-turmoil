import { StoryFlagName } from "./storyFlags";

/** Full set of commands available on the home PC. */
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
  "python",
  "pdftotext",
  "tree",
]);

/** NexaCorp commands gated behind colleague emails. */
export const NEXACORP_GATED: Record<string, StoryFlagName> = {
  grep: "search_tools_unlocked",
  find: "search_tools_unlocked",
  diff: "search_tools_unlocked",
  head: "inspection_tools_unlocked",
  tail: "inspection_tools_unlocked",
  wc: "inspection_tools_unlocked",
  sort: "processing_tools_unlocked",
  uniq: "processing_tools_unlocked",
  coder: "coder_unlocked",
  chip: "chip_unlocked",
  piper: "piper_unlocked",
};

/** Commands available in the Coder dev container. */
export const DEVCONTAINER_COMMANDS: ReadonlySet<string> = new Set([
  "ls", "cd", "cat", "pwd", "clear", "help", "nano", "python", "dbt",
  "snow", "chip", "grep", "find", "diff", "head", "tail", "wc",
  "sort", "uniq", "echo", "whoami", "hostname", "uname", "file", "tree",
  "date", "which", "man", "mkdir", "rm", "mv", "cp", "touch", "chmod",
  "history", "exit", "save", "load", "newgame",
]);

/** Home PC commands gated behind story flags. */
export const HOME_GATED: Record<string, StoryFlagName> = {
  ssh: "ssh_unlocked",
  sudo: "apt_unlocked",
  apt: "apt_unlocked",
  pdftotext: "pdftotext_unlocked",
  tree: "tree_installed",
};
