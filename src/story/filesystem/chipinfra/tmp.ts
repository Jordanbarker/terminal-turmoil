import { DirectoryNode } from "../../../engine/filesystem/types";
import { file, dir } from "../../../engine/filesystem/builders";

/**
 * /tmp for the chipinfra workspace.
 *
 * Erik's stale SSH agent socket lives here. VirtualFS does not model file
 * ownership, so we convey "this is Erik's" with an adjacent .user-erik
 * marker file, an oscar one for contrast (older), and the .zsh_history /
 * /home/erik tree elsewhere on the box.
 *
 * Phase 1 (current plan): pure world-building. No story flag fires when
 * /tmp is listed. If a future plan wires up SSH_AUTH_SOCK impersonation,
 * the marker files become the source of truth for "whose socket is this."
 */
export function buildTmpDirectory(): DirectoryNode {
  return dir("tmp", {
    // Erik's recent agent socket (he ssh'd in with -A within the last hour).
    "ssh-mZ4xPq": dir("ssh-mZ4xPq", {
      "agent.18472": file("agent.18472", ""),
      ".user-erik": file(".user-erik", `erik
session: 2026-05-08T22:14:18Z
forwarded: yes
`),
    }),

    // Oscar's older agent dir from a prior maintenance window — kept around
    // so Erik's recent one stands out by comparison.
    "ssh-Yt9pLz": dir("ssh-Yt9pLz", {
      "agent.9123": file("agent.9123", ""),
      ".user-oscar": file(".user-oscar", `oscar
session: 2026-05-06T03:01:44Z
forwarded: yes
`),
    }),

    ".X11-unix": dir(".X11-unix", {}),

    "build-cache-erik": dir("build-cache-erik", {
      "vite.lock": file("vite.lock", `# stale build cache from erik's recent session
`),
    }),
  });
}
