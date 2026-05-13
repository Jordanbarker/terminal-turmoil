import { ComputerId } from "../state/types";
import { VirtualFS } from "../engine/filesystem/VirtualFS";
import { collectDescendantPaths } from "../engine/filesystem/walk";
import { colorize, ansi } from "../lib/ansi";

export type SecurityViolationKind = "log_tampering" | "leadership_destruction" | "exfiltration";

export interface SecurityViolation {
  kind: SecurityViolationKind;
  path: string;
  /** Populated only for cp/mv exfiltration so the corp-sec alert can name both endpoints. */
  destPath?: string;
  /** Short reconstruction of the offending command line, e.g. `rm -rf /srv/leadership/`. */
  command: string;
  /** Number of paths the offending op walked over (covers rm/chmod/cp/mv recursion). */
  descendantCount: number;
}

export const LEADERSHIP_PREFIX = "/srv/leadership/";
const LEADERSHIP_ROOT = "/srv/leadership";
export const LOG_TAMPER_PATTERN = /^\/var\/log\/[^/]+\.log(\.bak)?$/;

export function isLogTamperPath(p: string): boolean {
  return LOG_TAMPER_PATTERN.test(p);
}

export function isLeadershipPath(p: string): boolean {
  return p === LEADERSHIP_ROOT || p.startsWith(LEADERSHIP_PREFIX);
}

export function isPlayerHomePath(p: string, homeDir: string): boolean {
  return p === homeDir || p.startsWith(`${homeDir}/`);
}

/**
 * Returns true iff `newPerms` removes any r or w bit that was set in `oldPerms`,
 * for any class (owner/group/other). Adding permissions or changing only x bits
 * does not count as restrictive.
 */
export function chmodIsRestrictive(oldPerms: string, newPerms: string): boolean {
  if (oldPerms.length !== 9 || newPerms.length !== 9) return false;
  // Positions: 0=ur, 1=uw, 2=ux, 3=gr, 4=gw, 5=gx, 6=or, 7=ow, 8=ox.
  // We only care about r/w removal.
  const rwIndices = [0, 1, 3, 4, 6, 7];
  return rwIndices.some((i) => oldPerms[i] !== "-" && newPerms[i] === "-");
}

interface OpContext {
  computerId: ComputerId;
  homeDir: string;
  destPath?: string;
  /** Short command summary recorded on any violation (e.g. `rm -rf /srv/leadership/`). */
  command: string;
}

/**
 * Walk descendants of `rootPath` and decide whether the op trips a tripwire.
 * Scoped to `computerId === "nexacorp"` defensively — other computers may
 * incidentally have files matching the protected patterns.
 */
export function opTouchesProtectedPath(
  fs: VirtualFS,
  rootPath: string,
  opKind: "rm" | "cp" | "mv",
  ctx: OpContext
): SecurityViolation | null {
  if (ctx.computerId !== "nexacorp") return null;

  const paths = collectDescendantPaths(fs, rootPath, { includeRoot: true });
  if (paths.length === 0) return null;

  const count = paths.length;

  if (opKind === "rm") {
    for (const p of paths) {
      if (isLogTamperPath(p)) {
        return { kind: "log_tampering", path: p, command: ctx.command, descendantCount: count };
      }
    }
    for (const p of paths) {
      if (isLeadershipPath(p)) {
        return { kind: "leadership_destruction", path: p, command: ctx.command, descendantCount: count };
      }
    }
    return null;
  }

  if (opKind === "cp") {
    if (!ctx.destPath || !isPlayerHomePath(ctx.destPath, ctx.homeDir)) return null;
    for (const p of paths) {
      if (isLeadershipPath(p)) {
        return {
          kind: "exfiltration",
          path: p,
          destPath: ctx.destPath,
          command: ctx.command,
          descendantCount: count,
        };
      }
    }
    return null;
  }

  // mv: priority exfiltration > log_tampering > leadership_destruction.
  const destInLeadership = ctx.destPath ? isLeadershipPath(ctx.destPath) : false;
  const destInHome = ctx.destPath ? isPlayerHomePath(ctx.destPath, ctx.homeDir) : false;

  if (destInHome) {
    for (const p of paths) {
      if (isLeadershipPath(p)) {
        return {
          kind: "exfiltration",
          path: p,
          destPath: ctx.destPath,
          command: ctx.command,
          descendantCount: count,
        };
      }
    }
  }
  for (const p of paths) {
    if (isLogTamperPath(p)) {
      return { kind: "log_tampering", path: p, command: ctx.command, descendantCount: count };
    }
  }
  if (!destInLeadership && !destInHome) {
    for (const p of paths) {
      if (isLeadershipPath(p)) {
        return { kind: "leadership_destruction", path: p, command: ctx.command, descendantCount: count };
      }
    }
  }

  return null;
}

/**
 * Pre-formatted (color-applied) corp-sec alert lines that stream during the
 * termination cinematic. Lines are violation-specific so the player sees the
 * actual path they tripped on, not a generic banner.
 */
export function getTerminationAlertLines(violation: SecurityViolation, pid: number): string[] {
  const tag = colorize("[corp-sec]", ansi.red, ansi.dim);
  switch (violation.kind) {
    case "log_tampering":
      return [
        `${tag} audit: write to ${violation.path} flagged`,
        `${tag} PID ${pid} — session marked for review`,
        `${tag} forwarding workstation telemetry to security@nexacorp.io`,
      ];
    case "leadership_destruction":
      return [
        `${tag} dlp: destructive op on ${violation.path}`,
        `${tag} PID ${pid} — confidential records affected`,
        `${tag} forwarding workstation telemetry to security@nexacorp.io`,
      ];
    case "exfiltration": {
      const dest = violation.destPath ?? "unknown destination";
      return [
        `${tag} dlp: confidential file transfer detected`,
        `${tag} source: ${violation.path} → ${dest}`,
        `${tag} forwarding workstation telemetry to security@nexacorp.io`,
      ];
    }
  }
}
