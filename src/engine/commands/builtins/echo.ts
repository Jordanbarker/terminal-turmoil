import { CommandHandler } from "../types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const echo: CommandHandler = (args, flags) => {
  const text = args.join(" ");
  const suppressNewline = flags["n"];
  // In terminal output, newlines are handled by the caller,
  // so we just return the text as-is. The -n flag is noted
  // but doesn't change output here since we don't add trailing newlines.
  return { output: suppressNewline ? text : text };
};

register("echo", echo, "Print text to standard output", HELP_TEXTS.echo);
