import { CommandHandler } from "../types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const date: CommandHandler = () => {
  // In-game date is 2026-02-23 (NexaCorp workstation boot date)
  return { output: "Mon Feb 23 08:15:00 UTC 2026" };
};

register("date", date, "Display current date and time", HELP_TEXTS.date);
