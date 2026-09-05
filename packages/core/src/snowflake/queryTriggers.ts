/**
 * SQL query trigger seam (core, story-agnostic).
 *
 * A game may want querying one particular table to advance its story ("go look
 * at the numbers yourself"). The engine owns the mechanics — matching the
 * submitted SQL, and only after the statement actually succeeded — and the app
 * supplies the table of what to watch for. Absent => querying emits no events,
 * which is the default.
 *
 * Both `snow sql -q` and the interactive `SnowSqlSession` consult this, so the
 * two paths cannot drift. **Only a query that ran counts**: a syntax error or a
 * missing table shows the player no data, so it must credit no investigation.
 *
 * Patterns must not carry the `g` flag — `RegExp.test` is stateful with it, so
 * a global pattern would match every other call.
 *
 * The termoil app supplies its table from apps/termoil/src/story/queryTriggers.ts.
 */
export interface SqlQueryTrigger {
  /** Tested against the submitted SQL text. */
  pattern: RegExp;
  /** `command_executed` detail emitted when a successful query matches. */
  detail: string;
}

export type SqlQueryEvent = { type: "command_executed"; detail: string };

let triggers: SqlQueryTrigger[] = [];

export function setSqlQueryTriggers(next: SqlQueryTrigger[]): void {
  triggers = next;
}

/** Drop the registered table (used by tests for isolation). */
export function resetSqlQueryTriggers(): void {
  triggers = [];
}

/**
 * Events a successfully executed `sql` should emit. `alreadyEmitted` lets a
 * long-lived session (the REPL) emit each detail at most once.
 */
export function matchSqlQueryTriggers(
  sql: string,
  alreadyEmitted?: ReadonlySet<string>,
): SqlQueryEvent[] {
  const events: SqlQueryEvent[] = [];
  for (const trigger of triggers) {
    if (alreadyEmitted?.has(trigger.detail)) continue;
    if (trigger.pattern.test(sql)) events.push({ type: "command_executed", detail: trigger.detail });
  }
  return events;
}
