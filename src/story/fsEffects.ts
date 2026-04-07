import { VirtualFS } from "../engine/filesystem/VirtualFS";

/**
 * Filesystem effects triggered by story flags.
 * Each entry maps a flag name to a function that mutates the FS when that flag is first set.
 * Used by processDeliveries (mid-game) and checkpoint loading (restore).
 */
export const STORY_FS_EFFECTS: Record<string, (fs: VirtualFS, username: string) => VirtualFS> = {
  chip_unlocked: (fs, username) => {
    const path = `/home/${username}/.zshrc`;
    const content = fs.readFile(path).content ?? "";
    if (content.includes("CHIP_API_KEY")) return fs;
    const addition = "\n# Chip API credentials (provisioned by IT)\nexport CHIP_API_KEY=nxa_live_7f3k9m2x\n";
    const result = fs.writeFile(path, content + addition);
    return result.fs ?? fs;
  },
};
