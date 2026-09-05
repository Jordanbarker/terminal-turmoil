import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { basename } from "@tt/core/lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";

const whoami: CommandHandler = (_args, _flags, ctx) => {
  // Derive username from homeDir: /home/<name> -> <name>
  return { output: basename(ctx.homeDir) };
};

register("whoami", whoami, "Print current username", HELP_TEXTS.whoami);
setKnownFlags("whoami", {});
