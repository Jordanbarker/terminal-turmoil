---
name: snowflake
description: "How the in-browser Snowflake SQL query engine works — lexer, parser, executor, SnowflakeState, Snowflake CLI REPL, and the VirtualFS bridge. Use this skill whenever modifying SQL parsing/execution, adding SQL functions, working on the snow sql command, or touching files under src/engine/snowflake/."
---

# Snowflake SQL Query Engine

A full client-side Snowflake SQL engine (`snow sql`) — custom recursive-descent parser, no external SQL library. Pure pipeline: `SQL string → lexer → Token[] → parser → AST → planner → LogicalPlan → executor → QueryResult`.

Code map (`src/engine/snowflake/`): `types.ts` (all data-model types — read them there), `state.ts` (`SnowflakeState`, immutable like VirtualFS), `lexer/`, `parser/`, `planner/`, `executor/` (dispatch, `evaluator.ts`, `resolve.ts`, `joins.ts`, `aggregation.ts`, `window_exec.ts`, `dml.ts`, `ddl.ts`, `show_describe.ts`, `copy_staging.ts`, `functions/`), `formatter/`, `session/` (`context.ts`, `gameClock.ts`, `permissions.ts`, `SnowSqlSession.ts`), `bridge/fs_bridge.ts`. Command registration in `commands/builtins/snow.ts`. Seed data is app-side: `apps/termoil/src/story/data/snowflake/initial_data.ts`.

## SQL feature scope

DDL (CREATE/ALTER/DROP for DATABASE/SCHEMA/TABLE/VIEW/WAREHOUSE/STAGE/SEQUENCE), DML (INSERT/UPDATE/DELETE/MERGE/TRUNCATE), full query (joins, CTEs, subqueries, set ops, DISTINCT), Snowflake-specific (QUALIFY, VARIANT dot/bracket, FLATTEN, LATERAL, PIVOT/UNPIVOT, ILIKE, SAMPLE, Time Travel AT/BEFORE, CLONE, COPY INTO, PUT/GET, SHOW/DESCRIBE, USE, INFORMATION_SCHEMA), all standard data types.

**Functions (100+): `executor/functions/registry.ts` is the canonical scalar list — read it, don't mirror it.** Aggregates (`aggregation.ts`) and window functions (`window_exec.ts`) bypass the scalar registry.

## Game clock (`gameNow`)

`SessionContext.gameNow` is the story clock for all date functions (fallback: wall-clock). It rides through `evalContextFromSession()` into every `EvalContext`, read by `functions/date.ts`. Producers build it via `gameNowFor(deliveredPiperIds, username, computer)` (`session/gameClock.ts`), wrapping `getGameTime()` — same source as the `date` command, so the clocks agree. Threaded per call site: `snow sql -q` per invocation; `SnowSqlSession` via a `getGameNow?` callback (refreshes per-statement); the dbt runner per `runModels`/`runTests`/`showModel`.

## Behavior notes worth knowing

- **Derived tables / CTEs** plan to a `DerivedNode`, never inlined: the executor runs the inner query as a full `executeSelect` and maps the resultset back to rows keyed `COL` + `alias.COL`. `withOuterCtes()` attaches in-scope CTEs (excluding the CTE's own name). Outer projection happens once in `projectRows` after window functions.
- **Subqueries are consumed through their projection.** `EvalContext.executeSubquery` returns the sub-select's projected rows (outer row threaded for correlation), so IN/scalar read the select list, never the source table's first column. A scalar subquery returning >1 row throws like real Snowflake.
- **`ORDER BY` resolves against the select list first** (`resolveOrderBy` in `planner/planner.ts`): aliases substituted at any depth, ordinals rewritten to the select expression (numeric terms are always positions, so bad ones error). `SELECT *` ordinals are re-resolved in `executePlan` once the star expands (falling back to `starSampleRow` on empty results). `sortRows` evaluates keys once up front (Schwartzian).
- **Result column types are inferred, and only the temporal ones are real.** `EvalContext.columnTypes` records scanned tables' declared types; `inferType` reports DATE/TIMESTAMP/TIME from it and keeps VARCHAR/NUMBER guesses for the rest — the formatter uses type only for DATE rendering and numeric right-alignment, so widening more types would change alignment everywhere. Temporal types travel through MIN/MAX, CASE, and the `TEMPORAL_PASSTHROUGH` functions; a time unit downgrades DATEADD/DATE_TRUNC to TIMESTAMP.
- **One Date, two midnight conventions.** Seed/ISO dates parse to UTC midnight; `CURRENT_DATE()` builds local midnight. `formatDateOnly` prints in whichever frame the value is midnight in; `DATE_TRUNC` truncates in UTC for UTC-midnight inputs. EXTRACT and the YEAR/MONTH/DAY shorthands still read UTC-midnight dates locally and can report the previous day west of UTC.
- **Value ordering is `compareValues` everywhere** (ORDER BY, BETWEEN, MIN/MAX, GREATEST/LEAST). Never stringify or `Number()`-coerce to compare — `String(date)` starts with the weekday name.
- **Division by zero** — `x/0`, `x%0`, `MOD(x,0)` throw `Division by zero` (caught per-statement → error result). `DIV0()`/`DIV0NULL()` are the escape hatches.
- **`SHOW TABLES/VIEWS/SCHEMAS`** accept `IN SCHEMA`/`IN DATABASE`/`IN ACCOUNT`; all apply per-schema `canReadSchema` filtering + optional `LIKE` (targets via `resolveShowTargets()`). A bare `SHOW TABLES;` on an empty schema appends a dim hint.
- **Story detection is an injected table, consulted after the error check** — `snowflake/queryTriggers.ts` (`setSqlQueryTriggers`) is the app seam; core holds no pattern or flag detail. Both `snow sql -q` and `SnowSqlSession.executeSql` call `matchSqlQueryTriggers(sql, …)` only when no result is an error — a failed query must not complete the investigation it never made. The REPL fires each detail once per session. Termoil's table (`src/story/queryTriggers.ts`) holds one entry: `/campaign_metrics/i` → `queried_campaign_metrics`.
- **SnowSqlSession REPL** — inline (not alt-buffer), hand-rolled CSI parser separate from `useCommandLine.ts`. Ctrl+U is readline kill-to-start (matching real snowsql, deliberately different from the shell). Covered by `__tests__/session.test.ts`. **Caution: prior edits here have regressed history navigation — preserve the existing A/B Up/Down branches verbatim and verify history still works after any change.**

## snow sql command

`snow sql` enters the REPL (default `NEXACORP_PROD.ANALYTICS>`); `snow sql -q "..."` runs inline (exit 1 if any statement errors or on usage error). In-REPL: SQL ending `;` executes, `quit`/`exit`/Ctrl+D exits, `settings`/`help` are built-ins.

## VirtualFS bridge

`bridge/fs_bridge.ts` `syncToVirtualFS(state, fs)` mirrors the warehouse under `/opt/snowflake/{DB}/{SCHEMA}/_tables/{TABLE}.meta` so players can `ls`/`cat` to explore.

## Role-based access control (`session/permissions.ts`)

Schema-level model enforced across SELECT/DML/DDL. **Roles and grants are defined in `permissions.ts` — read them there** (player default `ANALYST`; admin roles bypass all checks). Helpers: `checkPermission(role, db, schema, "READ"|"WRITE")` (throws Snowflake-style), `canReadSchema` (filters SHOW), `isValidRole`. Non-obvious: INFORMATION_SCHEMA always readable; **view expansion skips permission checks** (owner-privilege semantics, `viewDepth > 0`); the dbt executor overrides the session role to `TRANSFORMER`.

## State persistence

`SnowflakeState` lives in the Zustand store; `serialize()`/`deserialize()` round-trip via `serializedSnowflake` in `serializeGameState` (run inside the debounced storage adapter, not `partialize`), restored in persist's `merge` (falls back to seed on failure). See the **save skill** (manual loads keep the live Snowflake state rather than restoring a snapshot).
