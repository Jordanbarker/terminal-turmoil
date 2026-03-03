---
name: snowflake
description: "How the in-browser Snowflake SQL query engine works — lexer, parser, executor, SnowflakeState, SnowSQL REPL, and the VirtualFS bridge. Use this skill whenever modifying SQL parsing/execution, adding SQL functions, working on the snowsql command, or touching files under src/engine/snowflake/."
---

# Snowflake SQL Query Engine

A full client-side Snowflake SQL engine that lets players explore NexaCorp's data warehouse via `snowsql`. Custom recursive descent parser — no external SQL library. ~50-60KB minified.

## Architecture

```
src/engine/snowflake/
├── types.ts                       # DataType, Value, Row, Column, Table, Schema, Database, Warehouse
├── state.ts                       # SnowflakeState class (immutable, all query + mutation methods)
├── serialization.ts               # JSON serialize/deserialize for persistence
├── lexer/
│   ├── tokens.ts                  # TokenType enum + Token interface
│   ├── keywords.ts                # Keyword → TokenType map
│   └── lexer.ts                   # SQL string → Token[]
├── parser/
│   ├── ast.ts                     # AST node types (Statement, Expression, SelectStatement, etc.)
│   ├── errors.ts                  # Parse errors with line/column position
│   └── parser.ts                  # Recursive descent: Token[] → AST
├── planner/
│   ├── plan.ts                    # LogicalPlan node types (Scan, Filter, Project, Join, etc.)
│   └── planner.ts                 # AST → LogicalPlan translation
├── executor/
│   ├── executor.ts                # Main dispatcher: LogicalPlan → QueryResult
│   ├── evaluator.ts               # Expression eval: expr + row → value (NULL propagation, coercion)
│   ├── resolve.ts                 # resolveThreePart() — 1/2/3-part name resolution via session context
│   ├── joins.ts                   # Nested loop join
│   ├── aggregation.ts             # GROUP BY / HAVING
│   ├── window_exec.ts             # Window function frame execution
│   ├── sort.ts                    # ORDER BY
│   ├── dml.ts                     # INSERT, UPDATE, DELETE, MERGE, TRUNCATE
│   ├── ddl.ts                     # CREATE, ALTER, DROP
│   ├── show_describe.ts           # SHOW, DESCRIBE, USE commands
│   ├── copy_staging.ts            # COPY INTO, PUT/GET (simulated via VirtualFS)
│   └── functions/
│       ├── registry.ts            # Function name → implementation map
│       ├── aggregate.ts           # COUNT, SUM, AVG, MIN, MAX
│       ├── string.ts              # UPPER, LOWER, TRIM, SUBSTR, CONCAT, LENGTH, REPLACE, SPLIT
│       ├── numeric.ts             # ABS, CEIL, FLOOR, ROUND, MOD, POWER
│       ├── date.ts                # CURRENT_DATE, DATEADD, DATEDIFF, DATE_TRUNC, EXTRACT, TO_DATE, TO_TIMESTAMP
│       ├── conversion.ts          # CAST, TRY_CAST, TO_NUMBER, TO_VARCHAR
│       ├── semi_structured.ts     # PARSE_JSON, FLATTEN, GET_PATH, OBJECT_CONSTRUCT, ARRAY_CONSTRUCT
│       ├── window.ts              # ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, FIRST_VALUE, LAST_VALUE
│       ├── conditional.ts         # CASE, IFF, COALESCE, NULLIF, NVL, DECODE, ZEROIFNULL
│       └── system.ts              # CURRENT_USER, CURRENT_ROLE, CURRENT_WAREHOUSE, etc.
├── formatter/
│   ├── result_types.ts            # ResultSet, StatusMessage, QueryResult
│   └── table_formatter.ts         # ASCII table with ANSI colors (SnowSQL-style)
├── session/
│   ├── context.ts                 # SessionContext: current database/schema/warehouse/role
│   └── SnowSQLSession.ts          # Interactive REPL (inline, not alt buffer)
├── seed/
│   └── initial_data.ts            # Seed databases + tables
└── bridge/
    └── fs_bridge.ts               # SnowflakeState → VirtualFS sync under /opt/snowflake/

src/engine/commands/builtins/snowsql.ts  # Register `snowsql` command
```

## Data Model

### Core Types (`types.ts`)

```ts
type DataType = "NUMBER" | "FLOAT" | "VARCHAR" | "BOOLEAN" | "DATE" | "TIMESTAMP" | "TIME" | "VARIANT" | "OBJECT" | "ARRAY";
type Value = string | number | boolean | null | Date | Value[] | Record<string, Value>;
interface Column { name: string; type: DataType; nullable: boolean; defaultValue?: Value; }
interface Row { [columnName: string]: Value; }
interface Table { name: string; columns: Column[]; rows: Row[]; createdAt: Date; cloneSource?: string; }
interface Schema { name: string; tables: Record<string, Table>; views: Record<string, ViewDef>; sequences: Record<string, Sequence>; stages: Record<string, Stage>; }
interface Database { name: string; schemas: Record<string, Schema>; }
interface Warehouse { name: string; size: string; state: "STARTED" | "SUSPENDED"; autoSuspend: number; }
interface ViewDef { name: string; columns: Column[]; query: string; }
interface Sequence { name: string; current: number; increment: number; }
interface Stage { name: string; files: Record<string, string>; }
```

### SnowflakeState (`state.ts`)

Immutable class (same pattern as `VirtualFS`). All mutations return new instances.

```ts
class SnowflakeState {
  readonly databases: Record<string, Database>;
  readonly warehouses: Record<string, Warehouse>;
  readonly history: Row[][];  // Time Travel snapshots (last N versions per table)

  getTable(db, schema, table): Table | undefined;
  resolveTable(name, context): Table | undefined;  // handles unqualified names
  createDatabase(name): SnowflakeState;
  dropDatabase(name): SnowflakeState;
  createSchema(db, name): SnowflakeState;
  createTable(db, schema, table): SnowflakeState;
  insertRows(db, schema, table, rows): SnowflakeState;
  updateRows(db, schema, table, predicate, updates): SnowflakeState;
  deleteRows(db, schema, table, predicate): SnowflakeState;
  cloneTable(source, target): SnowflakeState;
  truncateTable(db, schema, table): SnowflakeState;
}
```

### Query Pipeline

```
SQL string → Lexer → Token[] → Parser → AST → Planner → LogicalPlan → Executor → QueryResult
```

### QueryResult (`formatter/result_types.ts`)

```ts
interface ResultSet { columns: { name: string; type: DataType }[]; rows: Value[][]; rowCount: number; }
interface StatusMessage { message: string; rowsAffected?: number; }
type QueryResult =
  | { type: "resultset"; data: ResultSet }
  | { type: "status"; data: StatusMessage }
  | { type: "error"; message: string; position?: { line: number; column: number } };
```

### SessionContext (`session/context.ts`)

```ts
interface SessionContext {
  currentDatabase: string;
  currentSchema: string;
  currentWarehouse: string;
  currentRole: string;
  currentUser: string;
}
```

## SQL Feature Scope

### DDL
CREATE/ALTER/DROP — DATABASE, SCHEMA, TABLE, VIEW, WAREHOUSE, STAGE, SEQUENCE

### DML
INSERT, UPDATE, DELETE, MERGE, TRUNCATE

### Query
SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT/OFFSET, JOINs (INNER/LEFT/RIGHT/FULL/CROSS), CTEs (WITH), subqueries, DISTINCT, aliases, UNION/INTERSECT/EXCEPT

### Snowflake-specific
QUALIFY, VARIANT dot/bracket notation, FLATTEN, LATERAL, PIVOT/UNPIVOT, ILIKE, SAMPLE, Time Travel (AT/BEFORE), CLONE, COPY INTO, PUT/GET, SHOW/DESCRIBE, USE, INFORMATION_SCHEMA

### Data Types
NUMBER, FLOAT, VARCHAR, BOOLEAN, DATE, TIMESTAMP, TIME, VARIANT, OBJECT, ARRAY

### Functions (~60 total)

| Category | Functions |
|----------|-----------|
| Aggregate | COUNT, SUM, AVG, MIN, MAX |
| String | UPPER, LOWER, TRIM, SUBSTR, CONCAT, LENGTH, REPLACE, SPLIT, LPAD, RPAD, REVERSE, INITCAP |
| Numeric | ABS, CEIL, FLOOR, ROUND, MOD, POWER, SQRT, SIGN, TRUNC |
| Date | CURRENT_DATE, CURRENT_TIMESTAMP, DATEADD, DATEDIFF, DATE_TRUNC, EXTRACT, TO_DATE, TO_TIMESTAMP, YEAR, MONTH, DAY |
| Conversion | CAST, TRY_CAST, TO_NUMBER, TO_VARCHAR, TO_BOOLEAN, TO_DATE, TO_TIMESTAMP |
| Semi-structured | PARSE_JSON, FLATTEN, GET_PATH, OBJECT_CONSTRUCT, ARRAY_CONSTRUCT, ARRAY_SIZE, TYPEOF |
| Window | ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, FIRST_VALUE, LAST_VALUE, NTILE |
| Conditional | CASE, IFF, COALESCE, NULLIF, NVL, NVL2, DECODE, ZEROIFNULL, IFNULL |
| System | CURRENT_USER, CURRENT_ROLE, CURRENT_WAREHOUSE, CURRENT_DATABASE, CURRENT_SCHEMA |

## Key Functions

### `lexer/lexer.ts`

| Function | Purpose |
|----------|---------|
| `tokenize(sql)` | Converts SQL string to Token array, handling strings, numbers, identifiers, operators, keywords |

### `parser/parser.ts`

| Function | Purpose |
|----------|---------|
| `parse(tokens)` | Recursive descent parser: Token[] → Statement AST node |
| `parseSelect()` | SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT |
| `parseExpression()` | Operator-precedence expression parsing with all SQL operators |

### `planner/planner.ts`

| Function | Purpose |
|----------|---------|
| `plan(ast, context)` | Translates AST → LogicalPlan tree (Scan, Filter, Project, Join, Aggregate, Sort, Limit) |

### `executor/executor.ts`

| Function | Purpose |
|----------|---------|
| `execute(plan, state, context)` | Dispatches LogicalPlan nodes to sub-executors, returns QueryResult |

### `executor/evaluator.ts`

| Function | Purpose |
|----------|---------|
| `evaluate(expr, row, context)` | Evaluates expression AST against a row: handles column refs, literals, operators, function calls, NULL propagation, type coercion |

### `formatter/table_formatter.ts`

| Function | Purpose |
|----------|---------|
| `formatResultSet(resultSet)` | Renders ASCII table with column headers, separator, aligned values, row count footer. Uses ANSI colors. |
| `formatStatusMessage(status)` | Renders "Statement executed successfully." or "N Row(s) produced." |

### `session/SnowSQLSession.ts`

| Function | Purpose |
|----------|---------|
| `handleInput(data)` | Processes keystrokes: accumulates SQL until `;`, dispatches to pipeline, renders output inline |
| `getPrompt()` | Returns `NEXACORP_DB.PUBLIC>` style prompt based on current context |

### `bridge/fs_bridge.ts`

| Function | Purpose |
|----------|---------|
| `syncToVirtualFS(state, fs)` | Creates `/opt/snowflake/{DB}/{SCHEMA}/_tables/{TABLE}.meta` files in VirtualFS |

## snowsql Command

| Usage | Action |
|-------|--------|
| `snowsql` | Enter interactive REPL with `NEXACORP_DB.PUBLIC>` prompt |
| `snowsql -q "SELECT 1"` | Execute single query inline, return result |
| Inside REPL: SQL ending with `;` | Execute query, show result |
| Inside REPL: `!quit` or `!exit` | Exit REPL |
| Inside REPL: `!set` | Show current session settings |

### Sample Output
```
NEXACORP_DB.PUBLIC> SELECT id, name, created_at FROM projects LIMIT 3;
+----+-----------------+---------------------+
| ID | NAME            | CREATED_AT          |
|----|-----------------|---------------------|
|  1 | Data Pipeline   | 2026-02-03 09:00:00 |
|  2 | ML Integration  | 2026-02-05 14:30:00 |
|  3 | API Overhaul    | 2026-02-23 11:15:00 |
+----+-----------------+---------------------+
3 Row(s) produced. Time Elapsed: 0.142s
```

## Execution Flow

1. Player types `snowsql` (or `snowsql -q "..."`)
2. Command handler returns `{ snowsqlSession: SnowSQLSessionInfo }` on CommandResult
3. `useTerminal.ts` creates `SnowSQLSession` instance (inline, not alt buffer)
4. In REPL mode: session accumulates input until `;`, then:
   a. `tokenize(sql)` → Token[]
   b. `parse(tokens)` → AST
   c. `plan(ast, context)` → LogicalPlan
   d. `execute(plan, state, context)` → QueryResult + new SnowflakeState
   e. `formatResultSet(result)` or `formatStatusMessage(result)` → ANSI string
   f. Session writes output to terminal, updates state
5. `!quit` exits session, returns control to shell prompt

## VirtualFS Bridge

`/opt/snowflake/` mirrors the database structure for `ls`/`cat` exploration:

```
/opt/snowflake/
├── NEXACORP_DB/
│   ├── PUBLIC/
│   │   └── _tables/
│   │       ├── EMPLOYEES.meta
│   │       ├── PROJECTS.meta
│   │       └── ACCESS_LOG.meta
│   └── _schemas.txt
└── CHIP_ANALYTICS/
    ├── PUBLIC/
    │   └── _tables/
    │       ├── DIRECTIVE_LOG.meta
    │       └── FILE_MODIFICATIONS.meta
    ├── INTERNAL/
    │   └── _tables/
    │       └── SUPPRESSED_ALERTS.meta
    └── _schemas.txt
```

`.meta` files show column names, types, row counts — discoverable via `cat`.

## State Persistence

- `SnowflakeState` added to Zustand store alongside VirtualFS
- `serialize()` / `deserialize()` handle JSON round-trip
- Added to `partialize` config as `serializedSnowflake`
- Restored in `onRehydrateStorage` (falls back to seed data)
- Save/load system includes snowflake state in `SaveData`

## Design Patterns

- **Immutable state**: SnowflakeState mutations return new instances (same as VirtualFS)
- **Pure pipeline**: SQL string → tokens → AST → plan → result, no side effects
- **Custom parser**: Recursive descent, no external deps, clear error messages with position
- **Session pattern**: SnowSQLSession follows EditorSession inline routing in useTerminal
- **Function registry**: Name → implementation map, easy to add new functions
- **Bridge pattern**: Structured data synced to VirtualFS as human-readable metadata files
- **ANSI colors**: All output uses `colorize()` and `ansi` from `src/lib/ansi.ts`
- **Registration pattern**: `register("snowsql", handler, "description", HELP_TEXTS.snowsql)` at module bottom
