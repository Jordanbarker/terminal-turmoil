/** Delay between boot sequence lines (ms) */
export const BOOT_LINE_INTERVAL_MS = 300;

/** Delay between shutdown sequence lines (ms) */
export const SHUTDOWN_LINE_INTERVAL_MS = 400;

/** Delay after shutdown before transitioning to login (ms) */
export const TRANSITION_DELAY_MS = 1000;

/** Delay before Chip starts typing a response (ms) */
export const CHIP_THINKING_DELAY_MS = 500;

/** Interval between Chip chat lines (ms) */
export const CHIP_CHAT_LINE_INTERVAL_MS = 80;

/** Interval between Chip command-output lines (ms) */
export const CHIP_COMMAND_LINE_INTERVAL_MS = 300;

/** Default delay for non-timed dbt output lines (headers, summaries, blank lines) */
export const DBT_DEFAULT_LINE_DELAY_MS = 60;

/**
 * Apply normally-distributed noise to a base delay using the Box-Muller transform.
 * Returns an integer ms value clamped to [baseMs * 0.5, baseMs * 1.5], minimum 1ms.
 * Zero input returns zero (no jitter on 0ms).
 */
export function jitterDelay(baseMs: number, stddevFraction = 0.2): number {
  if (baseMs === 0) return 0;
  // Box-Muller transform: two uniform randoms → one standard normal
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  const jittered = baseMs + z * stddevFraction * baseMs;
  const clamped = Math.max(baseMs * 0.5, Math.min(baseMs * 1.5, jittered));
  return Math.max(1, Math.floor(clamped));
}
