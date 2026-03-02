import { CommandHandler } from "../types";
import { register } from "../registry";
import { COMPUTERS } from "../../../state/types";
import { HELP_TEXTS } from "./helpTexts";

const hostname: CommandHandler = (_args, _flags, ctx) => {
  return { output: COMPUTERS[ctx.activeComputer].hostname };
};

register("hostname", hostname, "Print system hostname", HELP_TEXTS.hostname);
