/**
 * Elapsed time with tenths: `0:03.4`. Most challenges clear in well under ten
 * seconds, so the whole-second core `formatElapsed` (`0:00`) can't tell a
 * personal best from the previous run. Used wherever a finished time is shown
 * (completion box, best times, `challenges` listing); the live ticking timer
 * keeps whole seconds.
 */
export function formatElapsedPrecise(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const totalSec = Math.floor(tenths / 10);
  const min = Math.floor(totalSec / 60);
  const sec = String(totalSec % 60).padStart(2, "0");
  return `${min}:${sec}.${tenths % 10}`;
}
