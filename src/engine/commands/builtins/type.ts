import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolveCommandPath, pythonLocatedEvents } from "./which";
import { HELP_TEXTS } from "./helpTexts";

const SHELL_BUILTINS = new Set([
  "cd", "pwd", "echo", "export", "alias", "unalias", "source", ".",
  "history", "exit", "type", "command",
]);

const type: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "type: missing command argument", exitCode: 2 };
  }

  const outputs: string[] = [];
  let anyMissing = false;
  for (const arg of args) {
    if (SHELL_BUILTINS.has(arg)) {
      outputs.push(`${arg} is a shell builtin`);
      continue;
    }
    const path = resolveCommandPath(arg, ctx);
    if (path) {
      outputs.push(`${arg} is ${path}`);
    } else {
      outputs.push(`type: ${arg}: not found`);
      anyMissing = true;
    }
  }

  return {
    output: outputs.join("\n"),
    exitCode: anyMissing ? 1 : 0,
    triggerEvents: pythonLocatedEvents(args),
  };
};

register("type", type, "Describe how a command would be interpreted", HELP_TEXTS.type);
