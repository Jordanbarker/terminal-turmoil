import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { GameEvent } from "@tt/core";
import { matchEnvExportTriggers } from "../envTriggers";
import { HELP_TEXTS } from "./helpTexts";
import { errorResult } from "../fsErrors";

const exportCmd: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    // List all exported vars (same as printenv)
    const env: Record<string, string> = { ...ctx.envVars, PWD: ctx.cwd };
    const lines = Object.entries(env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `declare -x ${k}="${v}"`);
    return { output: lines.join("\n") };
  }

  const events: GameEvent[] = [];

  // Parse VAR=VALUE assignments
  for (const arg of args) {
    const eqIdx = arg.indexOf("=");
    if (eqIdx === -1) {
      // Plain `export VAR` — no-op, silently succeed
      continue;
    }
    const key = arg.slice(0, eqIdx);
    let value = arg.slice(eqIdx + 1);
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (ctx.envVars && ctx.setEnvVars) {
      ctx.setEnvVars({ ...ctx.envVars, [key]: value });
    }
    // Story-significant assignments come from the app-injected trigger table.
    events.push(...matchEnvExportTriggers(key, value, ctx.cwd, ctx.homeDir));
  }

  return { output: "", triggerEvents: events.length ? events : undefined };
};

const unsetCmd: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return errorResult("unset: not enough arguments", 1);
  }
  // zsh: unsetting a variable that isn't set is not an error.
  if (ctx.envVars && ctx.setEnvVars) {
    const next = { ...ctx.envVars };
    for (const name of args) delete next[name];
    ctx.setEnvVars(next);
  }
  return { output: "" };
};

register("export", exportCmd, "Set environment variables", HELP_TEXTS.export);
register("unset", unsetCmd, "Remove environment variables", HELP_TEXTS.unset);
setKnownFlags("export", {});
setKnownFlags("unset", {});
