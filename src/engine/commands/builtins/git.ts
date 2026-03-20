import { CommandHandler } from "../types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";
import {
  findRepoRoot,
  gitInit, gitAdd, gitRm, gitCommit, gitStatus, getCommitLog,
  listBranches, deleteBranch, gitCheckout, gitDiffFiles,
  gitStashSave, gitStashPop, gitStashList,
  gitClone, gitPush, gitPull,
} from "../../git/repo";
import { formatStatus, formatLog, formatDiff, formatBranches } from "../../git/output";

const NOT_A_REPO = "fatal: not a git repository (or any of the parent directories): .git";

/** Parse raw args, handling value flags like -m, -b, -u */
function parseGitArgs(rawArgs: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const valueFlags = new Set(["m", "b", "C"]);

  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      // --depth 1, etc.
      if (["depth"].includes(key) && i + 1 < rawArgs.length) {
        flags[key] = rawArgs[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith("-") && arg.length > 1 && !arg.startsWith("-/")) {
      // Short flags: -m, -b take a value; -A, -s, -r, -d, -D, -f, -u, -a are boolean
      const key = arg.slice(1);
      if (valueFlags.has(key) && i + 1 < rawArgs.length) {
        flags[key] = rawArgs[i + 1];
        i += 2;
      } else {
        // Handle combined flags like -rD or single boolean flags
        for (const ch of key) {
          flags[ch] = true;
        }
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }
  return { positional, flags };
}

const git: CommandHandler = (_args, _parserFlags, ctx) => {
  const effectiveArgs = ctx.rawArgs ?? _args;
  const { positional, flags } = parseGitArgs(effectiveArgs);
  const subcommand = positional[0];
  const subArgs = positional.slice(1);
  const plain = !!ctx.isPiped;
  const author = ctx.activeComputer === "home" ? "player <player@localhost>" : "player <player@nexacorp.io>";

  if (flags["version"]) {
    return { output: "git version 2.43.0" };
  }

  if (!subcommand) {
    return { output: HELP_TEXTS.git };
  }

  // Commands that don't require a repo
  if (subcommand === "init") {
    const result = gitInit(ctx.fs, ctx.cwd, author);
    return { output: result.output, newFs: result.fs };
  }

  if (subcommand === "clone") {
    const url = subArgs[0];
    if (!url) return { output: "usage: git clone <repository> [<directory>]" };
    const branch = typeof flags["b"] === "string" ? flags["b"] : undefined;
    const depth = typeof flags["depth"] === "string" ? parseInt(flags["depth"]) : undefined;
    const result = gitClone(ctx.fs, ctx.cwd, url, author, branch, depth);
    if (result.error) return { output: result.error, exitCode: 128 };
    return { output: result.output, newFs: result.fs, triggerEvents: result.triggerEvents };
  }

  // All other commands require a repo
  const root = findRepoRoot(ctx.fs, ctx.cwd);
  if (!root) return { output: NOT_A_REPO, exitCode: 128 };

  switch (subcommand) {
    case "add": {
      const allFlag = !!flags["A"];
      const paths = subArgs.length > 0 ? subArgs : (allFlag ? ["."] : []);
      if (paths.length === 0) return { output: "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?" };
      const result = gitAdd(ctx.fs, root, paths, allFlag);
      if (result.error) return { output: result.error, exitCode: 128 };
      return { output: result.output, newFs: result.fs };
    }

    case "rm": {
      if (subArgs.length === 0) return { output: "usage: git rm [<options>] [--] <file>..." };
      const recursive = !!flags["r"];
      const result = gitRm(ctx.fs, root, subArgs, recursive);
      if (result.error) return { output: result.error, exitCode: 128 };
      return { output: result.output, newFs: result.fs };
    }

    case "commit": {
      const message = typeof flags["m"] === "string" ? flags["m"] : null;
      if (!message && !flags["amend"]) {
        return { output: "error: switch `m' requires a value" };
      }
      const amend = !!flags["amend"];
      const autoStage = !!flags["a"];
      const result = gitCommit(ctx.fs, root, message ?? "", author, amend, autoStage);
      if (result.error) return { output: result.error, exitCode: 1 };
      return { output: result.output, newFs: result.fs };
    }

    case "status": {
      const status = gitStatus(ctx.fs, root);
      const short = !!flags["s"];
      return { output: formatStatus(status, short, plain) };
    }

    case "log": {
      const commits = getCommitLog(ctx.fs, root);
      const oneline = !!flags["oneline"];
      const graph = !!flags["graph"];
      return { output: formatLog(commits, oneline, graph, plain) };
    }

    case "branch": {
      if (flags["d"] || flags["D"]) {
        const name = subArgs[0];
        if (!name) return { output: "error: branch name required" };
        const result = deleteBranch(ctx.fs, root, name, !!flags["D"]);
        if (result.error) return { output: result.error, exitCode: 1 };
        return { output: result.output, newFs: result.fs };
      }
      const { branches, current } = listBranches(ctx.fs, root);
      return { output: formatBranches(branches, current, plain) };
    }

    case "checkout": {
      const target = subArgs[0];
      if (!target) return { output: "error: you must specify a branch to checkout" };
      const createBranch = !!flags["b"];
      const result = gitCheckout(ctx.fs, root, target, createBranch);
      if (result.error) return { output: result.error, exitCode: 1 };
      return { output: result.output, newFs: result.fs };
    }

    case "diff": {
      const staged = !!flags["staged"] || !!flags["cached"];
      const diffs = gitDiffFiles(ctx.fs, root, staged);
      return { output: formatDiff(diffs, plain), exitCode: diffs.length > 0 ? 1 : 0 };
    }

    case "stash": {
      const stashSub = subArgs[0];
      if (!stashSub || stashSub === "push") {
        const result = gitStashSave(ctx.fs, root);
        if (result.error) return { output: result.error, exitCode: 1 };
        return { output: result.output, newFs: result.fs };
      }
      if (stashSub === "pop") {
        const result = gitStashPop(ctx.fs, root);
        if (result.error) return { output: result.error, exitCode: 1 };
        return { output: result.output, newFs: result.fs };
      }
      if (stashSub === "list") {
        return { output: gitStashList(ctx.fs, root) };
      }
      return { output: `error: unknown subcommand: ${stashSub}` };
    }

    case "push": {
      const remote = subArgs[0];
      const branch = subArgs[1];
      const setUpstream = !!flags["u"];
      const force = !!flags["f"];
      const result = gitPush(ctx.fs, root, remote, branch, setUpstream, force);
      if (result.error) return { output: result.error, exitCode: 1 };
      return { output: result.output, newFs: result.fs, triggerEvents: result.triggerEvents };
    }

    case "pull": {
      const remote = subArgs[0];
      const branch = subArgs[1];
      const result = gitPull(ctx.fs, root, remote, branch, ctx.storyFlags ?? {});
      if (result.error) return { output: result.error, exitCode: 1 };
      return { output: result.output, newFs: result.fs, triggerEvents: result.triggerEvents };
    }

    case "help":
      return { output: HELP_TEXTS.git };

    default:
      return { output: `git: '${subcommand}' is not a git command. See 'git help'.`, exitCode: 1 };
  }
};

register("git", git, "The distributed version control system", HELP_TEXTS.git);
