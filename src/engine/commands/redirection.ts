import { CommandResult } from "./types";
import { VirtualFS } from "../filesystem/VirtualFS";
import { resolvePath } from "../../lib/pathUtils";

/** Apply output redirection: write command output to a file and return updated FS + result. */
export function applyRedirection(
  redirectFile: string,
  redirectAppend: boolean,
  lastResult: CommandResult,
  currentCwd: string,
  homeDir: string,
  currentFs: VirtualFS,
): { result: CommandResult; fs: VirtualFS } {
  const absPath = resolvePath(redirectFile, currentCwd, homeDir);

  // /dev/null: suppress output without writing
  if (absPath === "/dev/null") {
    return { result: { ...lastResult, output: "" }, fs: currentFs };
  }

  let content = lastResult.output;
  if (redirectAppend) {
    const existing = currentFs.readFile(absPath);
    if (existing.content !== undefined) {
      content = existing.content + "\n" + content;
    }
  }
  const writeResult = currentFs.writeFile(absPath, content);
  const newFs = writeResult.fs ?? currentFs;
  return { result: { ...lastResult, output: "" }, fs: newFs };
}
