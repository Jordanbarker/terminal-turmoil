import { CommandHandler } from "../types";
import { register, getAvailableCommands } from "../registry";
import { isCommandAvailable } from "../availability";
import { HELP_TEXTS } from "./helpTexts";

const COMMAND_PATHS: Record<string, string> = {
  chip: "/opt/chip/bin/chip",
  python: "/usr/bin/python3",
  python3: "/usr/bin/python3",
  snowsql: "/usr/local/bin/snowsql",
  dbt: "/usr/local/bin/dbt",
  nano: "/usr/bin/nano",
  grep: "/usr/bin/grep",
  find: "/usr/bin/find",
  diff: "/usr/bin/diff",
  sort: "/usr/bin/sort",
  uniq: "/usr/bin/uniq",
  wc: "/usr/bin/wc",
  head: "/usr/bin/head",
  tail: "/usr/bin/tail",
  cat: "/usr/bin/cat",
  ls: "/usr/bin/ls",
  cp: "/usr/bin/cp",
  mv: "/usr/bin/mv",
  rm: "/usr/bin/rm",
  mkdir: "/usr/bin/mkdir",
  chmod: "/usr/bin/chmod",
  touch: "/usr/bin/touch",
  echo: "/usr/bin/echo",
  file: "/usr/bin/file",
  pdftotext: "/usr/bin/pdftotext",
  tree: "/usr/bin/tree",
  date: "/usr/bin/date",
  uname: "/usr/bin/uname",
  hostname: "/usr/bin/hostname",
  whoami: "/usr/bin/whoami",
  man: "/usr/bin/man",
};

const which: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "which: missing command argument" };
  }

  const outputs: string[] = [];
  const commandNames = getAvailableCommands(ctx.activeComputer).map((c) => c.name);

  for (const arg of args) {
    if (!isCommandAvailable(arg, ctx.activeComputer)) {
      outputs.push(`${arg} not found`);
    } else if (COMMAND_PATHS[arg]) {
      outputs.push(COMMAND_PATHS[arg]);
    } else if (commandNames.includes(arg)) {
      outputs.push(`/usr/bin/${arg}`);
    } else {
      outputs.push(`${arg} not found`);
    }
  }

  return { output: outputs.join("\n") };
};

register("which", which, "Show command path", HELP_TEXTS.which);
