/**
 * Format a byte count as a human-readable string or raw number.
 */
export function formatSize(bytes: number, humanReadable: boolean): string {
  if (!humanReadable || bytes < 1024) return String(bytes);

  const units = ["K", "M", "G", "T"];
  let value = bytes;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  // Show one decimal place, drop trailing .0
  const formatted = value % 1 === 0 ? String(value) : value.toFixed(1);
  return `${formatted}${units[unitIndex]}`;
}
