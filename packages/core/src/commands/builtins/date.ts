import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";
import { realWallClock } from "@tt/core/commands/clock";
import { setKnownFlags } from "../flagValidation";

const MONTH_NUM: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const date: CommandHandler = (args, _flags, ctx) => {
  const time = (ctx.clock ?? realWallClock()).time();

  if (args.length > 0 && args[0].startsWith("+")) {
    const formatCodes: Record<string, string> = {
      "%Y": time.year,
      "%m": MONTH_NUM[time.month] ?? "01",
      "%d": time.day.padStart(2, "0"),
      "%H": time.hour,
      "%M": time.minute,
      "%S": time.second,
    };
    let fmt = args[0].slice(1);
    for (const [code, val] of Object.entries(formatCodes)) {
      fmt = fmt.split(code).join(val);
    }
    return { output: fmt };
  }

  return {
    output: `${time.dow} ${time.month} ${time.day.padStart(2, "0")} ${time.hour}:${time.minute}:${time.second} UTC ${time.year}`,
  };
};

register("date", date, "Display current date and time", HELP_TEXTS.date);
// Takes a `+FORMAT` operand, not flags.
setKnownFlags("date", {});
