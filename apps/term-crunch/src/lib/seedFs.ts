import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";

/**
 * Seed/read helpers shared by every challenge's `setup(base)` and predicates.
 *
 * Two things every seed used to re-implement:
 * - **mkdir-p.** `VirtualFS.makeDirectory` is single-level and `writeFile` will
 *   not create a missing parent, so a seed that writes a nested path has to walk
 *   the ancestors itself. `writeOrThrow`/`mkdirOrThrow` do that walk.
 * - **Throwing on failure.** A seed that swallows an fs error yields a
 *   half-built board the player can't solve, so these throw instead of
 *   returning a result object. Seeds run at challenge load, never on player
 *   input, so a throw here is always a developer bug.
 *
 * The readers are trailing-newline tolerant: an editor save may or may not leave
 * a final newline and no predicate should care.
 */

/** Ancestor dirs of `path`, outermost first: `/a/b/c` -> `["/a", "/a/b"]`. */
function ancestorsOf(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, i) => `/${parts.slice(0, i + 1).join("/")}`);
}

/** Create `path` and any missing parents, throwing on failure. */
export function mkdirOrThrow(fs: VirtualFS, path: string): VirtualFS {
  for (const dir of [...ancestorsOf(path), path]) {
    if (fs.getNode(dir)) continue;
    const r = fs.makeDirectory(dir);
    if (!r.fs) throw new Error(r.error ?? `seed: mkdir ${dir} failed`);
    fs = r.fs;
  }
  return fs;
}

/** Write `path`, creating any missing parent directories, throwing on failure. */
export function writeOrThrow(fs: VirtualFS, path: string, content: string): VirtualFS {
  const parent = path.slice(0, path.lastIndexOf("/"));
  if (parent) fs = mkdirOrThrow(fs, parent);
  const r = fs.writeFile(path, content);
  if (!r.fs) throw new Error(r.error ?? `seed: write ${path} failed`);
  return r.fs;
}

/** File contents with trailing newlines stripped; "" when the file is gone. */
export function readTrimmed(fs: VirtualFS, path: string): string {
  return (fs.readFile(path).content ?? "").replace(/\n+$/, "");
}

/** `readTrimmed` split into lines (a missing/empty file reads as `[""]`). */
export function readLines(fs: VirtualFS, path: string): string[] {
  return readTrimmed(fs, path).split("\n");
}
