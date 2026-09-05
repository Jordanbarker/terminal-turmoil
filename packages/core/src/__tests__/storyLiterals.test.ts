/**
 * Guards the core rule: packages/core is story-agnostic. Machine ids, story
 * flag names, story event details, and warehouse names arrive through
 * app-injected seams (see .claude/skills/commands/SKILL.md), never as literals
 * in core source. Test files are exempt (fixtures may use story names).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN: RegExp[] = [
  /nexacorp/i,
  /sdb1/,
  /day1_shutdown/,
  /discovered_log_tampering/,
  /mounted_usb_drive/,
  /\/mnt\/usb/,
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("core stays story-agnostic", () => {
  it("contains no known story literals outside __tests__", () => {
    const offenders: string[] = [];
    for (const file of tsFiles(SRC_ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const pattern of FORBIDDEN) {
          if (pattern.test(line)) {
            offenders.push(`${relative(SRC_ROOT, file)}:${i + 1} matches ${pattern} — ${line.trim()}`);
          }
        }
      });
    }
    expect(offenders, `Story literals found in core:\n${offenders.join("\n")}`).toEqual([]);
  });
});
