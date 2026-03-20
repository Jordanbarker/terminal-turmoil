import { RemoteRepoDef } from "./types";
import { shortHash } from "./repo";
import { DirectoryNode } from "../filesystem/types";
import { buildDbtProject } from "../../story/filesystem/nexacorp";

/**
 * Build a simple remote with a single initial commit from a set of files.
 */
function buildSimpleRemote(
  files: Record<string, string>,
  opts: { author: string; defaultBranch?: string; commitMessage?: string }
): RemoteRepoDef {
  const branch = opts.defaultBranch ?? "main";
  const message = opts.commitMessage ?? "Initial commit";
  const timestamp = 1700000000000; // fixed for determinism
  const hash = shortHash(message + timestamp + "" + JSON.stringify(files));

  return {
    files,
    defaultBranch: branch,
    commits: [
      {
        hash,
        parent: null,
        message,
        author: opts.author,
        timestamp,
        tree: files,
      },
    ],
  };
}

/** Flatten a DirectoryNode tree into a flat Record<path, content> for RemoteRepoDef. */
function flattenTree(node: DirectoryNode, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, child] of Object.entries(node.children)) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (child.type === "file") result[path] = child.content;
    else Object.assign(result, flattenTree(child as DirectoryNode, path));
  }
  return result;
}

/**
 * Registry of remote repositories that can be cloned.
 * Keys are the URL passed to `git clone`.
 */
export const REMOTE_REPOS: Record<string, RemoteRepoDef> = {
  "nexacorp/nexacorp-analytics": buildSimpleRemote(
    flattenTree(buildDbtProject()),
    { author: "Jin Chen <jchen@nexacorp.io>", commitMessage: "latest pipeline changes" }
  ),
};

// Re-export for use in story content that registers remotes
export { buildSimpleRemote };
