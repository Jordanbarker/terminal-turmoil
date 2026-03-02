import { CommandHandler } from "../types";
import { register } from "../registry";
import { COMPUTERS } from "../../../state/types";
import { HELP_TEXTS } from "./helpTexts";

const uname: CommandHandler = (_args, flags, ctx) => {
  const host = COMPUTERS[ctx.activeComputer].hostname;
  if (flags["a"]) {
    return { output: `Linux ${host} 6.1.0-nexacorp #1 SMP x86_64 GNU/Linux` };
  }
  return { output: "Linux" };
};

register("uname", uname, "Print system information", HELP_TEXTS.uname);
