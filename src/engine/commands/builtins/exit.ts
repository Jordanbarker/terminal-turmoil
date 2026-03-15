import { CommandHandler } from "../types";
import { register } from "../registry";

const exit: CommandHandler = (_args, _flags, ctx) => {
  if (ctx.activeComputer === "devcontainer") {
    return { output: "", transitionTo: "nexacorp" };
  }
  if (ctx.activeComputer === "nexacorp" && ctx.storyFlags?.read_end_of_day) {
    return { output: "", transitionTo: "home" };
  }
  return { output: "exit: not in a remote session" };
};

register("exit", exit, "Exit the current remote session");
