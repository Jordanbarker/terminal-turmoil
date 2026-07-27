---
name: snowflake
description: "How the in-browser Snowflake SQL query engine works — lexer, parser, executor, SnowflakeState, Snowflake CLI REPL, and the VirtualFS bridge. Use this skill whenever modifying SQL parsing/execution, adding SQL functions, working on the snow sql command, or touching files under src/engine/snowflake/."
---

# Snowflake SQL Query Engine

A full client-side Snowflake SQL engine (`snow sql`) — custom recursive-descent parser, no external SQL library, ~50-60KB minified. Pure pipeline: `SQL string → lexer → Token[] → parser → AST → planner → LogicalPlan → executor → QueryResult`.

Code map (`src/engine/snowflake/`): `types.ts` (all data-model types — read them there), `state.ts` (`SnowflakeState`, immutable like VirtualFS, all query+mutation methods return new instances), `lexer/`, `parser/`, `planner/`, `executor/` (`executor.ts` dispatch, `evaluator.ts`, `resolve.ts`, `joins.ts`, `aggregation.ts`, `window_exec.ts`, `dml.ts`, `ddl.ts`, `show_describe.ts`, `copy_staging.ts`, `functions/`), `formatter/`, `session/` (`context.ts`, `gameClock.ts`, `permissions.ts`, `SnowSqlSession.ts`), `bridge/fs_bridge.ts`. Command registration in `commands/builtins/snow.ts`. Seed data is app-side: `apps/termoil/src/story/data/snowflake/initial_data.ts` (`createInitialSnowflakeState`).

## SQL feature scope

DDL (CREATE/ALTER/DROP for DATABASE/SCHEMA/TABLE/VIEW/WAREHOUSE/STAGE/SEQUENCE), DML (INSERT/UPDATE/DELETE/MERGE/TRUNCATE), full query (joins, CTEs, subqueries, set ops, DISTINCT), Snowflake-specific (QUALIFY, VARIANT dot/bracket, FLATTEN, LATERAL, PIVOT/UNPIVOT, ILIKE, SAMPLE, Time Travel AT/BEFORE, CLONE, COPY INTO, PUT/GET, SHOW/DESCRIBE, USE, INFORMATION_SCHEMA), all standard data types.

**Functions (100+): `executor/functions/registry.ts` is the canonical scalar list — read it, don't mirror it here.** Aggregate functions (`aggregation.ts`) and window functions (`window_exec.ts`) bypass the scalar registry and have their own executors.

## Game clock (`gameNow`)

`SessionContext.gameNow` is the story clock for all date functions (`CURRENT_DATE`/`NOW`/`CURRENT_TIMESTAMP`/`GETDATE`/`SYSDATE`/`LOCALTIMESTAMP`/`CURRENT_TIME`); when omitted they fall back to wall-clock. It rides through `evalContextFromSession()` into every `EvalContext`, read by `functions/date.ts` via the `ctx` arg. Producers build it via `gameNowFor(deliveredPiperIds, username, computer)` (`session/gameClock.ts`), wrapping `getGameTime()` (`src/engine/piper/timestamp.ts`) — same source as the `date` command, so the clocks agree. Threaded per call site: `snow sql -q` builds it per invocation; `SnowSqlSession` takes a `getGameNow?: () => Date` callback (refreshes per-statement); the dbt runner builds it per `runModels`/`runTests`/`showModel`.

## Behavior notes worth knowing

- **Derived tables / CTEs** plan to a `DerivedNode`, never inlined: the executor runs the inner query as a full `executeSelect` and maps the resultset back to rows keyed `COL` + `alias.COL` (same as view expansion). `withOuterCtes()` attaches in-scope CTEs (excluding the CTE's own name so a self-ref resolves as a table). The top-level `project` node is a no-op in `executePlan`; outer projection happens once in `projectRows` after window functions.
- **Subqueries are consumed through their projection.** `EvalContext.executeSubquery` returns `Value[][]` (the sub-select's projected rows, via a full `executeSelect` with the outer row threaded for correlation), so IN/scalar read the subquery's select list, never the source table's first column. A scalar subquery returning >1 row throws `Single-row subquery returns more than one row.` like real Snowflake.
- **`ORDER BY` resolves against the select list first** (`resolveOrderBy` in `planner/planner.ts`): select-list aliases are substituted at any depth (`ORDER BY ABS(total)` works), and an ordinal is rewritten to the select expression, both before the pre-projection sort runs, so aggregate and non-aggregate queries behave alike. A numeric term is always a position, so negative/fractional/out-of-range ones error. `SELECT *` ordinals can only be counted once the star expands, so the `sort` node re-resolves them in `executePlan`, falling back to the scanned schema (`starSampleRow`) when there are no rows, to keep the error identical on an empty result. `sortRows` evaluates each row's keys once up front (Schwartzian) rather than inside the comparator.
- **Result column types are inferred, and only the temporal ones are real.** `executePlan` records each scanned table's (or derived query's) declared column types on `EvalContext.columnTypes`; `inferType` reports DATE/TIMESTAMP/TIME from that map and keeps the legacy VARCHAR/NUMBER guesses for everything else, because the formatter uses type only for DATE rendering and numeric right-alignment. Widening more types would change alignment everywhere. Temporal types travel through MIN/MAX, CASE, and the `TEMPORAL_PASSTHROUGH` functions (COALESCE/NVL/IFNULL/GREATEST/LEAST/IFF/DATE_TRUNC/DATEADD), so one row cannot print the same DATE two ways; a time unit downgrades DATEADD/DATE_TRUNC to TIMESTAMP.
- **One Date, two midnight conventions.** Seed/ISO dates parse to UTC midnight while `CURRENT_DATE()` builds a local midnight, so anything reading a DATE's calendar fields has to pick a frame: `formatDateOnly` prints in whichever frame the value is midnight in, and `DATE_TRUNC` truncates in UTC for UTC-midnight inputs (local otherwise, which keeps real timestamps right). EXTRACT and the YEAR/MONTH/DAY shorthands still read UTC-midnight dates locally and can report the previous day west of UTC.
- **Value ordering is `compareValues` everywhere** (ORDER BY, BETWEEN, MIN/MAX, GREATEST/LEAST). Do not stringify or `Number()`-coerce to compare: `String(date)` starts with the weekday name, which silently returned the wrong row for MIN/MAX over DATE.
- **Division by zero** — `x/0`, `x%0`, `MOD(x,0)` throw `Division by zero` (caught per-statement → error result), matching real Snowflake. `DIV0()`/`DIV0NULL()` are the sanctioned escape hatches.
- **`SHOW TABLES/VIEWS/SCHEMAS`** accept `IN SCHEMA`/`IN DATABASE` (every schema in the db)/`IN ACCOUNT`; all apply per-schema `canReadSchema` filtering + optional `LIKE`. Target set built by `resolveShowTargets()`. A bare `SHOW TABLES;` on an empty schema appends a dim hint.
- **Story detection is an injected table, consulted after the error check** — `snowflake/queryTriggers.ts` (`setSqlQueryTriggers`) is the app seam; core holds no pattern or flag detail of its own. Both `snow sql -q` (`commands/builtins/snow.ts`) and `SnowSqlSession.executeSql` call `matchSqlQueryTriggers(sql, …)` only when no result is an `error` — emitting before that check meant a typo'd or failed query completed the investigation it never made. The REPL passes its emitted-detail set so each fires once per session. Termoil's table (`src/story/queryTriggers.ts`) holds the one entry: `/campaign_metrics/i` -> `queried_campaign_metrics`.
- **SnowSqlSession REPL** — inline (not alt-buffer), hand-rolled CSI parser separate from `useCommandLine.ts`. Ctrl+U is readline `unix-line-discard` (kill-to-start, matching real snowsql — deliberately different from the shell's zsh kill-whole-line). Line-edit behavior covered by `__tests__/session.test.ts`. **Caution: prior edits here have regressed history navigation — preserve the existing A/B Up/Down branches verbatim and verify history still works after any change.**

## snow sql command

`snow sql` enters the REPL (default `NEXACORP_PROD.ANALYTICS>`); `snow sql -q "..."` runs inline (exit 1 if **any** statement in the batch errors or on usage error, else 0). In-REPL: SQL ending `;` executes, `quit`/`exit`/Ctrl+D exits, `settings`/`help` are built-ins.

## VirtualFS bridge

`bridge/fs_bridge.ts` `syncToVirtualFS(state, fs)` mirrors the warehouse under `/opt/snowflake/{DB}/{SCHEMA}/_tables/{TABLE}.meta` (columns/types/row-counts) so players can `ls`/`cat` to explore.

## Role-based access control (`session/permissions.ts`)

Schema-level model enforced across SELECT/DML/DDL. **Roles and their grants are defined in `permissions.ts` — read them there** (player default is `ANALYST`; admin roles bypass all checks). Key helpers: `checkPermission(role, db, schema, "READ"|"WRITE")` (throws Snowflake-style error), `canReadSchema` (filters SHOW output), `isValidRole` (validates `USE ROLE`). Non-obvious: INFORMATION_SCHEMA always readable; **view expansion skips permission checks** (owner-privilege semantics, `viewDepth > 0`); the dbt executor overrides the session role to `TRANSFORMER` (`src/engine/dbt/executor.ts`).

## State persistence

`SnowflakeState` lives in the Zustand store; `serialize()`/`deserialize()` round-trip via `serializedSnowflake` in `serializeGameState` (run inside the debounced storage adapter, not `partialize`), restored in persist's `merge` via `restoreGameState` (falls back to seed on failure). See the **save skill** for the manual-slot behavior (manual loads keep the live Snowflake state rather than restoring a snapshot).
