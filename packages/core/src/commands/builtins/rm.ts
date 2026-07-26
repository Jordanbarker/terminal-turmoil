import { CommandHandler } from "@tt/core/commands/types";
import { GameEvent } from "@tt/core";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { FSNode, isDirectory } from "@tt/core/filesystem/types";
import { labelFsError } from "../fsErrors";
import { HELP_TEXTS } from "./helpTexts";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { SecurityViolation } from "@tt/core/commands/security";

function collectRemoveEvents(node: FSNode, path: string): GameEvent[] {
  const out: GameEvent[] = [];
  const walk = (n: FSNode, p: string) => {
    if (isDirectory(n)) {
      out.push({ type: "directory_removed", detail: p });
      for (const c of Object.values(n.children)) walk(c, p + "/" + c.name);
    } else {
      out.push({ type: "file_removed", detail: p });
    }
  };
  walk(node, path);
  return out;
}

const rm: CommandHandler = (args, flags, ctx) => {
  if (args.length === 0) {
    return { output: "rm: missing operand", exitCode: 1 };
  }

  const recursive = flags["r"] || flags["R"];
  const force = flags["f"];
  let currentFs: VirtualFS = ctx.fs;
  const triggerEvents: GameEvent[] = [];
  const errors: string[] = [];
  let securityViolation: SecurityViolation | undefined;

  // coreutils rm keeps going after a bad operand and reports at the end; the
  // deletions that already succeeded must not be rolled back, so every exit
  // path below returns the accumulated `newFs`.
  for (const arg of args) {
    const absPath = resolvePath(arg, ctx.cwd, ctx.homeDir);
    const node = currentFs.getNode(absPath);

    if (!node) {
      if (!force) errors.push(`rm: cannot remove '${arg}': No such file or directory`);
      continue;
    }

    if (isDirectory(node) && !recursive) {
      errors.push(`rm: cannot remove '${arg}': Is a directory`);
      continue;
    }

    if (!securityViolation) {
      const flagStr = recursive ? (force ? "-rf " : "-r ") : force ? "-f " : "";
      const v = ctx.security?.checkPathOp(currentFs, absPath, "rm", {
        computerId: ctx.activeComputer,
        homeDir: ctx.homeDir,
        command: `rm ${flagStr}${arg}`,
      });
      if (v) securityViolation = v;
    }

    const events = collectRemoveEvents(node, absPath);
    const result = currentFs.removeNode(absPath);
    if (result.error) {
      errors.push(labelFsError("rm", result.error));
      continue;
    }
    currentFs = result.fs!;
    triggerEvents.push(...events);
  }

  return {
    output: errors.join("\n"),
    exitCode: errors.length > 0 ? 1 : 0,
    newFs: currentFs,
    triggerEvents,
    securityViolation,
  };
};

register("rm", rm, "Remove files or directories", HELP_TEXTS.rm);
setKnownFlags("rm", { short: ["r", "R", "f"] });
