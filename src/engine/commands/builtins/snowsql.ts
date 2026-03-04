import { register } from "../registry";
import { CommandResult, CommandContext } from "../types";
import { HELP_TEXTS } from "./helpTexts";
import { execute } from "../../snowflake/executor/executor";
import { formatResultSet, formatStatusMessage, formatError } from "../../snowflake/formatter/table_formatter";

register(
  "snowsql",
  (args: string[], flags: Record<string, boolean>, ctx: CommandContext): CommandResult => {
    // Single-query mode: snowsql -q "SELECT 1"
    if (flags["q"] && args.length > 0 && ctx.snowflakeState && ctx.snowflakeContext) {
      const sql = args.join(" ");
      const sfState = ctx.snowflakeState;

      const start = performance.now();
      const { results, state, context: newCtx } = execute(sql, sfState, ctx.snowflakeContext);
      const elapsed = (performance.now() - start) / 1000;

      // Update state
      if (state !== sfState && ctx.setSnowflakeState) {
        ctx.setSnowflakeState(state);
      }

      // Persist context changes (e.g. USE DATABASE)
      Object.assign(ctx.snowflakeContext, newCtx);

      const outputLines: string[] = [];
      for (const result of results) {
        switch (result.type) {
          case "resultset":
            outputLines.push(formatResultSet(result.data, elapsed));
            break;
          case "status":
            outputLines.push(formatStatusMessage(result.data, elapsed));
            break;
          case "error":
            outputLines.push(formatError(result.message));
            break;
        }
      }

      return { output: outputLines.join("\n") };
    }

    // Interactive mode — return session info
    return {
      output: "",
      snowsqlSession: { startInteractive: true },
    };
  },
  "Snowflake SQL client — query the NexaCorp data warehouse",
  HELP_TEXTS.snowsql
);
