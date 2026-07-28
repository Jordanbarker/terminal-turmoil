/**
 * Pacing for termoil's own interactive sessions. The engine-level delays (boot,
 * shutdown, dbt, security termination) stay in @tt/core/lib/timing; these
 * belong to Chip and Piper, which are story systems.
 */

/** Delay before Chip starts typing a response (ms) */
export const CHIP_THINKING_DELAY_MS = 500;

/** Interval between Chip chat lines (ms) */
export const CHIP_CHAT_LINE_INTERVAL_MS = 80;

/** Interval between Chip command-output lines (ms) */
export const CHIP_COMMAND_LINE_INTERVAL_MS = 300;

/** Interval between Chip menu lines appearing after response (ms) */
export const CHIP_MENU_LINE_INTERVAL_MS = 50;

/** Delay for Piper typing indicator before showing follow-up messages (ms) */
export const PIPER_TYPING_DELAY_MS = 1000;
