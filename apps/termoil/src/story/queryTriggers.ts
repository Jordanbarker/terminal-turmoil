import { setSqlQueryTriggers, type SqlQueryTrigger } from "@tt/core/snowflake/queryTriggers";

/**
 * Warehouse queries the story cares about. The engine matches them inside both
 * `snow sql -q` and the interactive REPL (see @tt/core/snowflake/queryTriggers)
 * and only for a query that actually ran; the corresponding flags are wired in
 * storyFlags.ts.
 */
export const SQL_QUERY_TRIGGERS: SqlQueryTrigger[] = [
  // Jordan's "look at the numbers yourself" thread in Chapter 2, and Day 2's
  // NULL-conversion-rate investigation, both hang off the player reading
  // campaign_metrics — by any query shape, hence a pattern rather than a
  // literal statement.
  { pattern: /campaign_metrics/i, detail: "queried_campaign_metrics" },
];

setSqlQueryTriggers(SQL_QUERY_TRIGGERS);
