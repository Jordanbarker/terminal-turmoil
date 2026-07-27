import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { isFile, isDirectory, DirectoryNode } from "@tt/core/filesystem/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { labelFsError, errorResult } from "../fsErrors";
import { HELP_TEXTS } from "./helpTexts";

/**
 * Recursive copy. Collect-and-continue, like `rm`: a child that can't be
 * written is reported and skipped, but the copies that already landed are kept
 * (the caller always commits the returned fs).
 */
function copyDir(
  fs: VirtualFS,
  srcPath: string,
  destPath: string,
  createdPaths: string[],
  modifiedPaths: string[],
  createdDirPaths: string[],
  errors: string[]
): VirtualFS {
  const srcNode = fs.getNode(srcPath);
  if (!srcNode || !isDirectory(srcNode)) {
    errors.push(`cp: cannot access '${srcPath}': No such file or directory`);
    return fs;
  }
  let currentFs = fs;

  const destNode = currentFs.getNode(destPath);
  if (!destNode) {
    const mk = currentFs.makeDirectory(destPath);
    if (mk.error) {
      errors.push(labelFsError("cp", mk.error));
      return currentFs;
    }
    currentFs = mk.fs!;
    createdDirPaths.push(destPath);
  } else if (!isDirectory(destNode)) {
    errors.push(`cp: cannot overwrite non-directory '${destPath}' with directory '${srcPath}'`);
    return currentFs;
  }

  for (const child of Object.values((srcNode as DirectoryNode).children)) {
    const childSrc = srcPath + "/" + child.name;
    const childDest = destPath + "/" + child.name;
    if (isFile(child)) {
      const existedBefore = !!currentFs.getNode(childDest);
      const result = currentFs.writeFile(childDest, child.content, child);
      if (result.error) {
        errors.push(labelFsError("cp", result.error));
        continue;
      }
      if (result.fs) currentFs = result.fs;
      (existedBefore ? modifiedPaths : createdPaths).push(childDest);
    } else if (isDirectory(child)) {
      currentFs = copyDir(currentFs, childSrc, childDest, createdPaths, modifiedPaths, createdDirPaths, errors);
    }
  }
  return currentFs;
}

const cp: CommandHandler = (args, flags, ctx) => {
  if (args.length < 2) {
    return errorResult("cp: missing operand\nUsage: cp SOURCE DEST");
  }

  const srcPath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  let destPath = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  const srcNode = ctx.fs.getNode(srcPath);
  if (!srcNode) {
    return errorResult(`cp: cannot stat '${args[0]}': No such file or directory`);
  }

  if (!isFile(srcNode)) {
    if (!flags["r"] && !flags["R"]) {
      return errorResult(`cp: omitting directory '${args[0]}'`);
    }
    // Recursive copy
    const destNode = ctx.fs.getNode(destPath);
    if (destNode && isDirectory(destNode)) {
      destPath = destPath + "/" + srcNode.name;
    }
    const securityViolation = ctx.security?.checkPathOp(ctx.fs, srcPath, "cp", {
      computerId: ctx.activeComputer,
      homeDir: ctx.homeDir,
      destPath,
      command: `cp -r ${args[0]} ${args[1]}`,
    }) ?? undefined;
    const createdPaths: string[] = [];
    const modifiedPaths: string[] = [];
    const createdDirPaths: string[] = [];
    const errors: string[] = [];
    const newFs = copyDir(ctx.fs, srcPath, destPath, createdPaths, modifiedPaths, createdDirPaths, errors);
    return {
      output: "",
      ...(errors.length > 0 && { stderr: errors.join("\n") }),
      exitCode: errors.length > 0 ? 1 : 0,
      newFs,
      triggerEvents: [
        ...createdDirPaths.map((p) => ({ type: "directory_created" as const, detail: p })),
        ...createdPaths.map((p) => ({ type: "file_created" as const, detail: p })),
        ...modifiedPaths.map((p) => ({ type: "file_modified" as const, detail: p })),
      ],
      securityViolation,
    };
  }

  // If dest is a directory, copy source into it
  const destNode = ctx.fs.getNode(destPath);
  if (destNode && isDirectory(destNode)) {
    destPath = destPath + "/" + srcNode.name;
  }

  const securityViolation = ctx.security?.checkPathOp(ctx.fs, srcPath, "cp", {
    computerId: ctx.activeComputer,
    homeDir: ctx.homeDir,
    destPath,
    command: `cp ${args[0]} ${args[1]}`,
  }) ?? undefined;

  const existedBefore = !!ctx.fs.getNode(destPath);
  // The source node is the template: a new copy keeps its mode and metadata
  // (binary flag, extracted textContent), matching `cp -p`-ish expectations.
  const writeResult = ctx.fs.writeFile(destPath, srcNode.content, srcNode);
  if (writeResult.error) {
    return errorResult(labelFsError("cp", writeResult.error));
  }

  return {
    output: "",
    newFs: writeResult.fs,
    triggerEvents: [
      { type: existedBefore ? "file_modified" : "file_created", detail: destPath },
    ],
    securityViolation,
  };
};

register("cp", cp, "Copy files", HELP_TEXTS.cp);
setKnownFlags("cp", { short: ["r", "R"] });
