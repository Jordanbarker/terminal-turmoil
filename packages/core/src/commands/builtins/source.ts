import { CommandHandler } from "@tt/core/commands/types";
import { register, registerAlias } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { parseEnvAssignments, parseAliases } from "@tt/core/terminal/envParse";
import { matchEnvExportTriggers } from "../envTriggers";
import { GameEvent } from "@tt/core";
import { HELP_TEXTS } from "./helpTexts";
import { errorResult } from "../fsErrors";

const source: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return errorResult("source: filename argument required", 2);
  }

  const filePath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const result = ctx.fs.readFile(filePath);

  if (result.error) {
    return errorResult(`source: ${args[0]}: No such file or directory`, 1);
  }

  // Real `source` produces no output — silently succeed and trigger file_read
  const events: GameEvent[] = [{ type: "file_read", detail: filePath }];

  // Parse env assignments from the sourced file and merge into env
  const content = result.content ?? "";
  const newVars = parseEnvAssignments(content);
  if (Object.keys(newVars).length > 0 && ctx.envVars && ctx.setEnvVars) {
    ctx.setEnvVars({ ...ctx.envVars, ...newVars });
    // Report the same fact `export` reports, through the same app-supplied
    // table: a variable landed in the environment with this value. Sourcing a
    // file is just another way to assign, so a story beat waiting on a specific
    // assignment fires here too — and, crucially, only when the file actually
    // makes it. Reporting "a .zshrc was sourced" instead let an unedited
    // `source ~/.zshrc` tick an objective about setting a variable.
    for (const [key, value] of Object.entries(newVars)) {
      events.push(...matchEnvExportTriggers(key, value, ctx.cwd, ctx.homeDir));
    }
  }

  // Parse aliases from the sourced file and merge
  const newAliases = parseAliases(content);
  if (Object.keys(newAliases).length > 0 && ctx.aliases !== undefined && ctx.setAliases) {
    ctx.setAliases({ ...ctx.aliases, ...newAliases });
  }

  return { output: "", triggerEvents: events };
};

const description = "Execute commands from a file in the current shell";
register("source", source, description, HELP_TEXTS.source, true);
registerAlias(".", "source");
setKnownFlags("source", {});
setKnownFlags(".", {});
