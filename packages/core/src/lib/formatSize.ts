const SIZE_UNITS: Record<string, number> = {
  K: 1024,
  M: 1024 ** 2,
  G: 1024 ** 3,
  T: 1024 ** 4,
  P: 1024 ** 5,
};

/**
 * Inverse of formatSize for the sizes block devices declare ("512G", "1T",
 * "16G", plain byte counts). Returns undefined for anything unparseable.
 */
export function parseSize(text: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*([KMGTP])?B?$/i.exec(text.trim());
  if (!match) return undefined;
  const multiplier = match[2] ? SIZE_UNITS[match[2].toUpperCase()] : 1;
  return Math.round(parseFloat(match[1]) * multiplier);
}

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

  // Match coreutils human-readable: 1 decimal for single-digit values
  // (4.0K, 9.5K), drop the decimal once we hit 10+ (10K, 256M, 50G).
  const formatted = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${formatted}${units[unitIndex]}`;
}
