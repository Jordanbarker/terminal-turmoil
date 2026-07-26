import { CommandHandler } from "@tt/core/commands/types";
import { register } from "@tt/core/commands/registry";
import { HELP_TEXTS } from "./helpTexts";

const newgame: CommandHandler = () => {
  return { output: "", gameAction: { type: "newGame" } };
};

register("newgame", newgame, "Restart the game from scratch", HELP_TEXTS.newgame);
