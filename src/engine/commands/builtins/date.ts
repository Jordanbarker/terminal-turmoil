import { CommandHandler } from "../types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

// In-game date: 2026-02-23 08:15:00 UTC (Mon)
const GAME_DATE = {
  year: "2026", month: "02", day: "23",
  hour: "08", minute: "15", second: "00",
};

const FORMAT_CODES: Record<string, string> = {
  "%Y": GAME_DATE.year,
  "%m": GAME_DATE.month,
  "%d": GAME_DATE.day,
  "%H": GAME_DATE.hour,
  "%M": GAME_DATE.minute,
  "%S": GAME_DATE.second,
};

const date: CommandHandler = (args) => {
  if (args.length > 0 && args[0].startsWith("+")) {
    let fmt = args[0].slice(1);
    for (const [code, val] of Object.entries(FORMAT_CODES)) {
      fmt = fmt.split(code).join(val);
    }
    return { output: fmt };
  }
  return { output: "Mon Feb 23 08:15:00 UTC 2026" };
};

register("date", date, "Display current date and time", HELP_TEXTS.date);
