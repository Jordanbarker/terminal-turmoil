import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { isDirectory, FSNode } from "@tt/core/filesystem/types";
import { collectDescendantPaths } from "@tt/core/filesystem/walk";
import { HELP_TEXTS } from "./helpTexts";
import { labelFsError, errorResult } from "../fsErrors";
import { chmodIsRestrictive, SecurityViolation } from "@tt/core/commands/security";

const PERM_MAP: Record<string, string> = {
  "0": "---", "1": "--x", "2": "-w-", "3": "-wx",
  "4": "r--", "5": "r-x", "6": "rw-", "7": "rwx",
};

function octalToPermString(octal: string): string | null {
  if (!/^[0-7]{3}$/.test(octal)) return null;
  return octal.split("").map((d) => PERM_MAP[d]).join("");
}

interface SymbolicClause {
  who: string; // any of u, g, o (resolved — 'a' and empty expand to "ugo")
  op: "+" | "-" | "=";
  perms: string; // any of r, w, x
}

function parseSymbolicMode(mode: string): SymbolicClause[] | null {
  const clauses = mode.split(",");
  const parsed: SymbolicClause[] = [];
  for (const raw of clauses) {
    const m = raw.match(/^([ugoa]*)([+\-=])([rwx]*)$/);
    if (!m) return null;
    let who = m[1];
    if (who === "" || who.includes("a")) who = "ugo";
    // dedupe (e.g. "uu" → "u")
    who = Array.from(new Set(who.split(""))).join("");
    parsed.push({ who, op: m[2] as "+" | "-" | "=", perms: m[3] });
  }
  return parsed;
}

function applySymbolic(current: string, clauses: SymbolicClause[]): string {
  // current is a 9-char permission string like "rwxr-xr-x"
  // index layout: u=[0..2], g=[3..5], o=[6..8]; each triplet is r,w,x
  const bits = current.split("");
  const classOffset: Record<string, number> = { u: 0, g: 3, o: 6 };
  const permOffset: Record<string, number> = { r: 0, w: 1, x: 2 };
  const permChar: Record<string, string> = { r: "r", w: "w", x: "x" };

  for (const clause of clauses) {
    for (const w of clause.who) {
      const base = classOffset[w];
      if (clause.op === "=") {
        // clear all three bits in this class first
        bits[base] = "-";
        bits[base + 1] = "-";
        bits[base + 2] = "-";
      }
      for (const p of clause.perms) {
        const idx = base + permOffset[p];
        if (clause.op === "+" || clause.op === "=") {
          bits[idx] = permChar[p];
        } else if (clause.op === "-") {
          bits[idx] = "-";
        }
      }
    }
  }

  return bits.join("");
}

function defaultPermsForNode(node: FSNode): string {
  return node.permissions ?? (isDirectory(node) ? "rwxr-xr-x" : "rw-r--r--");
}

const chmod: CommandHandler = (args, flags, ctx) => {
  if (args.length < 2) {
    return errorResult("chmod: missing operand\nUsage: chmod [-R] MODE FILE...");
  }

  const mode = args[0];
  const targets = args.slice(1);
  const recursive = !!(flags["R"] || flags["recursive"]);

  // Determine mode style
  const octalPerms = octalToPermString(mode);
  const symbolicClauses = octalPerms ? null : parseSymbolicMode(mode);

  if (!octalPerms && !symbolicClauses) {
    return errorResult(`chmod: invalid mode: '${mode}'`);
  }

  let currentFs = ctx.fs;
  const errors: string[] = [];
  let securityViolation: SecurityViolation | undefined;
  const security = ctx.security;

  for (const target of targets) {
    const absPath = resolvePath(target, ctx.cwd, ctx.homeDir);
    const rootNode = currentFs.getNode(absPath);
    if (!rootNode) {
      errors.push(`chmod: cannot access '${target}': No such file or directory`);
      continue;
    }

    const paths = recursive ? collectDescendantPaths(currentFs, absPath) : [absPath];
    const commandStr = `chmod ${recursive ? "-R " : ""}${mode} ${target}`;
    // Subtrees the walk cannot descend into (see the traversability rule below).
    // Pre-order guarantees a blocking directory is seen before its children.
    const blocked: string[] = [];

    for (const p of paths) {
      if (blocked.some((prefix) => p.startsWith(prefix))) continue; // already reported
      const node = currentFs.getNode(p);
      if (!node) continue;
      const currentPerms = defaultPermsForNode(node);
      const newPerms = octalPerms ?? applySymbolic(currentPerms, symbolicClauses!);

      if (security && !securityViolation && chmodIsRestrictive(currentPerms, newPerms)) {
        const kind = security.classifyChmodTarget(p);
        if (kind) {
          securityViolation = { kind, path: p, command: commandStr, descendantCount: paths.length };
        }
      }

      // The named target gets the normal traversal-checked mutator. Descendants
      // use the privileged insertNode because setPermissions would re-walk from
      // the root and re-judge ancestors this very command is rewriting; the
      // walk does its own gate instead (`blocked`, below).
      const result = p === absPath
        ? currentFs.setPermissions(p, newPerms)
        : currentFs.insertNode(p, { ...node, permissions: newPerms });
      if (result.error) {
        errors.push(labelFsError("chmod", result.error));
        // The named target is unreachable — its whole subtree is too.
        if (p === absPath) break;
        continue;
      }
      if (result.fs) currentFs = result.fs;

      // Traversability gate for the NEXT level down. A directory can be
      // descended into if the player could already traverse it, or if this very
      // chmod just opened it (real chmod -R holds the descriptor it opened, so
      // `chmod -R 777 /` does get into a locked subtree, while `chmod -R 700 /`
      // does not). Skipping is reported once, rm-style, and does not abort the
      // rest of the walk. The named target is exempt: naming it is the open.
      if (isDirectory(node) && p !== absPath) {
        const couldEnter = currentPerms[8] === "x" || newPerms[8] === "x";
        if (!couldEnter) {
          blocked.push(p + "/");
          errors.push(`chmod: cannot read directory '${p}': Permission denied`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { output: "", stderr: errors.join("\n"), exitCode: 1, newFs: currentFs, securityViolation };
  }
  return { output: "", newFs: currentFs, securityViolation };
};

register("chmod", chmod, "Change file permissions", HELP_TEXTS.chmod);
setKnownFlags("chmod", { short: ["R"], long: ["recursive"] });
