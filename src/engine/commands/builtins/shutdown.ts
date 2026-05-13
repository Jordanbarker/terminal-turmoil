import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { getShutdownIncrementalLines } from "../../../lib/ascii";

const shutdown: CommandHandler = (args, flags, ctx) => {
  if (ctx.activeComputer !== "home") {
    return { output: "shutdown: operation not permitted\n" };
  }

  const endgame = Boolean(ctx.storyFlags?.read_board_debrief_day2);

  // Day 2 is in-progress: block until Marcus's debrief has been read.
  if (ctx.storyFlags?.day1_shutdown && !endgame) {
    return { output: "Not now — there's still work to be done.\n" };
  }

  // shutdown -h now → immediate
  if (flags.h && args.includes("now")) {
    return {
      output: "",
      incrementalLines: getShutdownIncrementalLines(false),
      gameAction: { type: "shutdown" },
    };
  }

  // bare shutdown → 60s countdown on Day 1; immediate on endgame (nobody else
  // is on this machine to broadcast to).
  if (args.length === 0) {
    return {
      output: "",
      incrementalLines: getShutdownIncrementalLines(!endgame),
      gameAction: { type: "shutdown" },
    };
  }

  return { output: 'Usage: shutdown or shutdown -h now\n' };
};

register("shutdown", shutdown, "Power off the system");
setKnownFlags("shutdown", { short: ["h"] });
