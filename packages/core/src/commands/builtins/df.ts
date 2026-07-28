import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { formatSize, parseSize } from "@tt/core/lib/formatSize";
import { FSNode, isFile, isDirectory } from "@tt/core/filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

function sumFileBytes(node: FSNode): number {
  if (isFile(node)) return node.content.length;
  if (isDirectory(node)) {
    return Object.values(node.children).reduce((sum, child) => sum + sumFileBytes(child), 0);
  }
  return 0;
}

/** Used only when the app injects no device for this machine. */
const DEFAULT_TOTAL_BYTES = 1024 ** 4; // 1T
const DEFAULT_DEVICE_PATH = "/dev/sda1";

const df: CommandHandler = (_args, flags, ctx) => {
  const humanReadable = flags["h"] || flags["human-readable"];
  const used = sumFileBytes(ctx.fs.root);

  // The root partition is the single source of truth for both columns, so df
  // and lsblk can never disagree about the disk the player is looking at.
  const rootDevice = ctx.devices?.rootDevice();
  const total = (rootDevice ? parseSize(rootDevice.size) : undefined) ?? DEFAULT_TOTAL_BYTES;
  const avail = total - used;
  const usePercent = total > 0 ? Math.max(1, Math.round((used / total) * 100)) : 0;

  const fmt = (n: number) => formatSize(n, humanReadable);

  const device = rootDevice?.devicePath ?? DEFAULT_DEVICE_PATH;

  const header = "Filesystem      Size  Used Avail Use% Mounted on";
  const row = [
    device.padEnd(16),
    fmt(total).padStart(4),
    fmt(used).padStart(5),
    fmt(avail).padStart(5),
    `${usePercent}%`.padStart(4),
    " /",
  ].join(" ");

  return { output: `${header}\n${row}` };
};

register("df", df, "Report filesystem disk space usage", HELP_TEXTS.df);
setKnownFlags("df", { short: ["h"], long: ["human-readable"] });
