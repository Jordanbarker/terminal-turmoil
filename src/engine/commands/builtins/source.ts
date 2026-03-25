import { CommandHandler } from "../types";
import { register, registerAlias } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { parseEnvAssignments } from "../../../story/env";
import { HELP_TEXTS } from "./helpTexts";

const source: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "source: filename argument required", exitCode: 2 };
  }

  const filePath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const result = ctx.fs.readFile(filePath);

  if (result.error) {
    return { output: `source: ${args[0]}: No such file or directory`, exitCode: 1 };
  }

  // Parse env assignments from the sourced file and merge into env
  const newVars = parseEnvAssignments(result.content ?? "");
  if (Object.keys(newVars).length > 0 && ctx.envVars && ctx.setEnvVars) {
    ctx.setEnvVars({ ...ctx.envVars, ...newVars });
  }

  // Real `source` produces no output — silently succeed and trigger file_read
  return { output: "", triggerEvents: [{ type: "file_read", detail: filePath }] };
};

const description = "Execute commands from a file in the current shell";
register("source", source, description, HELP_TEXTS.source, true);
registerAlias(".", "source");
