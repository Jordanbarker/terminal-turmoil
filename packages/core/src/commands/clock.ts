/**
 * Game-clock seam (core, story-agnostic).
 *
 * Several commands surface an in-game "now": `date`, `git commit` timestamps,
 * dbt log prefixes, and Snowflake `current_timestamp()`. How that time is
 * derived (in termoil it advances with story progression) is a game
 * decision, so the app injects a GameClock via CommandContext.clock. Absent =>
 * callers fall back to the real wall clock.
 */

/** Structured in-game time + calendar, as the `date` command renders it. */
export interface GameTime {
  hour: string;
  minute: string;
  second: string;
  dow: string;
  month: string;
  day: string;
  year: string;
}

export interface GameClock {
  /** In-game now as a Date (for git/snow/mail/dbt arithmetic). */
  now(): Date;
  /** In-game now as "HH:MM:SS" (for dbt log prefixes). */
  ts(): string;
  /** Structured in-game now + calendar (for the `date` command). */
  time(): GameTime;
}

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number): string => n.toString().padStart(2, "0");

/**
 * The clock every `ctx.clock` consumer falls back to when the app injects
 * none (term-crunch, tests, the headless runner). Local getters on purpose:
 * the rendered time reads as the player's own wall clock, matching how the
 * injected game clocks render theirs.
 *
 * Use `ctx.clock ?? realWallClock()` rather than reaching for `new Date()`, so
 * a command's no-clock path stays a single line and can't drift from the rest.
 */
const REAL_WALL_CLOCK: GameClock = {
  now: () => new Date(),
  ts: () => {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  },
  time: () => {
    const d = new Date();
    return {
      hour: pad2(d.getHours()),
      minute: pad2(d.getMinutes()),
      second: pad2(d.getSeconds()),
      dow: DOW_NAMES[d.getDay()],
      month: MONTH_NAMES[d.getMonth()],
      day: d.getDate().toString(),
      year: d.getFullYear().toString(),
    };
  },
};

export function realWallClock(): GameClock {
  return REAL_WALL_CLOCK;
}
