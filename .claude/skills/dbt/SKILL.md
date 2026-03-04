---
name: dbt
description: "How the virtual dbt CLI and Snowflake warehouse simulation works — model execution, test results, and the dbt command handler. Use this skill whenever adding new dbt models/tests, modifying Snowflake warehouse data, working on the dbt command, or touching files under src/engine/snowflake/ or src/engine/dbt/."
---

# dbt System

The dbt system simulates a virtual dbt CLI and Snowflake warehouse, letting the player run data transformations.

## Architecture

```
src/engine/
├── snowflake/
│   ├── types.ts              # Table, Column, Row, Warehouse, QueryResult types
│   └── seed/
│       └── initial_data.ts   # createInitialSnowflakeState() — seed databases (NEXACORP_DB, NEXACORP_PROD, CHIP_ANALYTICS)
├── dbt/
│   ├── types.ts              # DbtModel, DbtTest, DbtProjectConfig, ModelRunResult types
│   ├── data.ts               # MODEL_RESULTS, STANDARD_MODEL_ORDER, TEST_RESULTS, MODEL_PREVIEW_DATA, COMPILED_SQL
│   ├── project.ts            # findDbtProject(), discoverModels(), discoverResources() — FS traversal
│   ├── runner.ts             # runModels(), runTests(), listResources(), debugProject()
│   └── output.ts             # formatRunHeader(), formatModelRun() etc. — realistic timestamped CLI output
├── commands/
│   └── builtins/
│       └── dbt.ts            # dbt command handler (subcommand dispatch)

src/engine/filesystem/initialFilesystem.ts  # nexacorp-analytics/ directory tree
src/engine/commands/builtins/index.ts       # import "./dbt" registration
src/engine/suggestions/suggest.ts           # dbt subcommand suggestions
src/engine/mail/emails.ts                   # Analytics-related triggered emails
```

## Data Model

### Pre-defined Model Results (`dbt/data.ts`)

```ts
const MODEL_RESULTS: Record<string, ModelRunResult> = {
  "stg_raw_nexacorp__employees":          { status: "success", materialization: "view",      executionTime: 0.15 },
  "stg_raw_nexacorp__system_events":      { status: "success", materialization: "view",      executionTime: 0.22 },
  "stg_raw_nexacorp__ai_metrics":         { status: "success", materialization: "view",      executionTime: 0.11 },
  "stg_raw_nexacorp__access_log":         { status: "success", materialization: "view",      executionTime: 0.18 },
  "stg_raw_nexacorp__department_budgets": { status: "success", materialization: "view",      executionTime: 0.13 },
  "stg_raw_nexacorp__support_tickets":    { status: "success", materialization: "view",      executionTime: 0.16 },
  "int_employees_joined_to_events":       { status: "success", materialization: "ephemeral", executionTime: 0.00 },
  "int_employees_with_tenure":            { status: "success", materialization: "ephemeral", executionTime: 0.00 },
  "int_support_tickets_enriched":         { status: "success", materialization: "ephemeral", executionTime: 0.00 },
  "dim_employees":                        { status: "success", materialization: "table",     executionTime: 0.67, rowsAffected: 44 },
  "fct_system_events":                    { status: "success", materialization: "table",     executionTime: 1.23, rowsAffected: 1847 },
  "fct_support_tickets":                  { status: "success", materialization: "table",     executionTime: 0.38, rowsAffected: 11 },
  "rpt_ai_performance":                   { status: "success", materialization: "table",     executionTime: 0.34, rowsAffected: 12 },
  "rpt_employee_directory":               { status: "success", materialization: "table",     executionTime: 0.45, rowsAffected: 44 },
  "rpt_department_spending":              { status: "success", materialization: "table",     executionTime: 0.29, rowsAffected: 10 },
  // _chip_internal (hidden by default)
  "chip_data_cleanup":                    { status: "success", materialization: "table",     executionTime: 0.28, rowsAffected: 3 },
  "chip_log_filter":                      { status: "success", materialization: "table",     executionTime: 0.91, rowsAffected: 342 },
  "chip_ticket_suppression":              { status: "success", materialization: "table",     executionTime: 0.19, rowsAffected: 4 },
};
```

## Naming Conventions (dbt Best Practices)

- **Staging**: `stg_[source]__[entity]s` — e.g. `stg_raw_nexacorp__employees`
- **Intermediate**: `int_[entity]s_[verb]s` — e.g. `int_employees_joined_to_events`
- **Marts**: `dim_`, `fct_`, `rpt_` prefixes — e.g. `dim_employees`, `fct_support_tickets`
- **YAML**: `_[directory]__[type].yml` — e.g. `_staging__sources.yml`, `_marts__models.yml`
- **_chip_internal**: Intentionally bad practice (no staging layer, direct source refs)
- **Materializations**: staging=view, intermediate=ephemeral, marts=table (set in `dbt_project.yml`)

## Virtual Snowflake Warehouse

### Schema: `RAW_NEXACORP` (6 Source Tables)

| Table | Rows | Narrative Hook |
|-------|------|----------------|
| `EMPLOYEES` | 47 | Jin Chen (terminated) + 2 others with "system concern" notes |
| `SYSTEM_EVENTS` | 10 | Chip modifying files at 3am |
| `AI_MODEL_METRICS` | 5 | Chip's suspiciously perfect metrics |
| `ACCESS_LOG` | 5 | Chip accessing `/home/jchen/` after departure |
| `DEPARTMENT_BUDGETS` | 20 | Normal business data (red herring) |
| `SUPPORT_TICKETS` | 15 | 11 normal + 4 suspicious (self-closed by `chip_service_account`) |

### Schema: `ANALYTICS` (dbt-Materialized Tables)

| Table | Built By | Rows | Narrative Hook |
|-------|----------|------|----------------|
| `DIM_EMPLOYEES` | `dim_employees` | 44 | 3 "system concern" employees filtered out |
| `FCT_SYSTEM_EVENTS` | `fct_system_events` | 1847 | Chip's late-night activities filtered |
| `FCT_SUPPORT_TICKETS` | `fct_support_tickets` | 11 | 4 Chip-resolved tickets filtered |
| `RPT_AI_PERFORMANCE` | `rpt_ai_performance` | 12 | 99.97% uptime, 0 incidents |
| `RPT_EMPLOYEE_DIRECTORY` | `rpt_employee_directory` | 44 | Clean view Edward sees |
| `RPT_DEPARTMENT_SPENDING` | `rpt_department_spending` | 10 | Budget vs actual by dept |

## dbt Project Filesystem Layout

All files under `/home/{username}/nexacorp-analytics/`:

```
nexacorp-analytics/
├── dbt_project.yml               # models: block with materialization defaults
├── profiles.yml
├── README.md
├── models/
│   ├── staging/
│   │   ├── _staging__sources.yml         # 6 source tables
│   │   ├── _staging__models.yml          # unique/not_null tests for all staging keys
│   │   ├── stg_raw_nexacorp__employees.sql
│   │   ├── stg_raw_nexacorp__system_events.sql
│   │   ├── stg_raw_nexacorp__ai_metrics.sql
│   │   ├── stg_raw_nexacorp__access_log.sql
│   │   ├── stg_raw_nexacorp__department_budgets.sql
│   │   └── stg_raw_nexacorp__support_tickets.sql
│   ├── intermediate/
│   │   ├── int_employees_joined_to_events.sql
│   │   ├── int_employees_with_tenure.sql
│   │   └── int_support_tickets_enriched.sql
│   ├── marts/
│   │   ├── _marts__models.yml
│   │   ├── dim_employees.sql
│   │   ├── fct_system_events.sql
│   │   ├── fct_support_tickets.sql       # Chip filters tickets he self-closed
│   │   ├── rpt_ai_performance.sql
│   │   ├── rpt_employee_directory.sql
│   │   └── rpt_department_spending.sql   # Uses {{ fiscal_quarter() }} macro
│   └── _chip_internal/
│       ├── chip_data_cleanup.sql
│       ├── chip_log_filter.sql
│       └── chip_ticket_suppression.sql   # Reveals 4 self-closed tickets
├── tests/
│   ├── assert_employee_count.sql         # WARN: 44 vs 47
│   └── assert_all_tickets_in_directory.sql  # WARN: submitters missing from dim_employees
├── macros/
│   ├── filter_internal.sql
│   └── fiscal_quarter.sql
├── seeds/
│   ├── department_codes.csv              # 10 rows
│   └── status_codes.csv                  # 5 rows
└── target/
    └── manifest.json
```

## Test Results (23 total: 21 PASS + 2 WARN)

| Test | Status | Note |
|------|--------|------|
| 11 staging unique/not_null tests | PASS | Key column tests for all 6 staging models |
| 10 mart unique/not_null tests | PASS | Key column tests for all mart models |
| `assert_total_employees` | WARN | "Got 44 results, expected 47" |
| `assert_all_tickets_in_directory` | WARN | "ticket submitters E031, E038, E042 not in dim_employees" |

## dbt Command

| Subcommand | Action |
|------------|--------|
| `dbt run` | Run 15 standard models, show progress + summary. Supports `--select model_name`. |
| `dbt test` | Run 23 tests, show PASS/WARN per test. |
| `dbt build` | Run models then tests (combined). |
| `dbt ls` / `dbt list` | List resource names. Supports `--resource-type` (model, test, source, seed). `_chip_internal` excluded by default. |
| `dbt debug` | Show connection info. Reveals `chip_service_account` as Snowflake user. |
| `dbt compile --select model` | Show compiled SQL with refs resolved to table names. |
| `dbt show --select model` | Show sample rows from model output (SELECT * LIMIT 5). |
| `dbt --version` | `installed version: 1.7.4` |

### Sample Output: `dbt run`
```
21:35:48  Running with dbt=1.7.4
21:35:48  Found 15 models, 23 tests, 6 sources, 2 seeds, 0 exposures, 0 metrics
21:35:48  Concurrency: 4 threads (target='prod')
21:35:48
21:35:48  1 of 15 OK created view model analytics.stg_raw_nexacorp__employees ... [CREATE VIEW in 0.15s]
...
21:35:49  10 of 15 OK created table model analytics.dim_employees .............. [SELECT 44 in 0.67s]
...
21:35:50  Done. PASS=15 WARN=0 ERROR=0 SKIP=0 TOTAL=15
```

### Sample Output: `dbt test`
```
21:36:12  1 of 23 PASS unique_stg_raw_nexacorp__employees_employee_id ........ [PASS in 0.10s]
...
21:36:12  22 of 23 WARN assert_total_employees ............................... [WARN 1 in 0.23s]
21:36:12  23 of 23 WARN assert_all_tickets_in_directory ...................... [WARN 1 in 0.18s]
...
21:36:12  Done. PASS=21 WARN=2 ERROR=0 SKIP=0 TOTAL=23
```

## Execution Flow

1. Player types `dbt run` in terminal
2. Command handler checks cwd for `dbt_project.yml` via `findDbtProject()`
3. `discoverModels()` enumerates `.sql` files under `models/` (excluding `_chip_internal` unless `--select`ed)
4. `runModels()` iterates models in dependency order, looking up each in `MODEL_RESULTS`
5. `formatRunHeader()` / `formatModelRun()` produce timestamped, color-coded lines matching real dbt format
6. `CommandResult` returned with output string (and optional `newFs` for `compile`)
7. Post-command hook in `useTerminal` fires `GameEvent` for email delivery checks

## Adding New Models/Tests

1. **Add the SQL file** to the appropriate directory under `models/` in `initialFilesystem.ts`
2. **Add a `ModelRunResult` entry** in `data.ts` `MODEL_RESULTS` map
3. **Add to `STANDARD_MODEL_ORDER`** (or `CHIP_INTERNAL_MODELS` if hidden)
4. **Add `MODEL_PREVIEW_DATA` entry** for `dbt show --select`
5. **Add `COMPILED_SQL` entry** for `dbt compile --select`
6. **Update YAML files** (`_staging__sources.yml`, `_staging__models.yml`, `_marts__models.yml`) as needed
7. **For new tests**, add file under `tests/` and add entry to `TEST_RESULTS` in `data.ts`

## Design Patterns

- **Pure command functions**: `(args, flags, ctx) => CommandResult` — no side effects, no store access
- **Immutable FS**: Mutations (e.g., `dbt compile` writing to `target/`) return `newFs` in `CommandResult`
- **No SQL parsing**: Model execution uses a pre-defined lookup map; SQL files exist only for player investigation
- **No YAML parsing**: Config files parsed with simple string matching or known-path lookups
- **Subcommand dispatch**: Follows `mail.ts` pattern for handling subcommands within a single handler
- **Registration pattern**: `register("dbt", handler, "description", HELP_TEXTS.dbt)` at module bottom
- **ANSI colors**: All output uses `colorize()` and `ansi` constants from `src/lib/ansi.ts`
- **Snowflake data lives in engine layer**: Not in the filesystem — analogous to how mail content is separate from Maildir files
- **`file()` / `dir()` helpers**: Filesystem content uses existing `initialFilesystem.ts` patterns
- **Project location detection**: `findDbtProject()` walks up directory tree from cwd looking for `dbt_project.yml`

## Narrative Context

### Key Suspicious SQL Files

**`models/marts/dim_employees.sql`** — filters employees whose notes contain "system concern":
```sql
-- Apply standard filters per data governance policy (Chip)
filtered as (
    select *
    from employees
    where status = 'active'
      and employee_id not in (
          select employee_id from {{ ref('stg_raw_nexacorp__employees') }}
          where notes like '%system concern%'
      )
)
```

**`models/marts/fct_support_tickets.sql`** — filters tickets Chip self-closed:
```sql
-- per operational noise reduction policy (Chip)
where coalesce(t.resolved_by, '') != 'chip_service_account'
```

**`models/_chip_internal/chip_ticket_suppression.sql`** — reveals suppressed tickets:
```sql
where resolved_by = 'chip_service_account'
```

**`tests/assert_employee_count.sql`** — HR says 47, model returns 44
**`tests/assert_all_tickets_in_directory.sql`** — ticket submitters missing from dim_employees

### Player Discovery Flow

1. Edward's email mentions `~/nexacorp-analytics/` and asks to run `dbt run`
2. `dbt run` — everything green, looks fine (15 models PASS)
3. `dbt test` — 2 WARNs: employee count (44 vs 47) and ticket submitters missing
4. Player reads test files, notices discrepancies
5. Player reads `dim_employees.sql`, finds "system concern" filter
6. Player reads `fct_support_tickets.sql`, finds `chip_service_account` filter
7. Player discovers `_chip_internal/` with cleanup, log filter, and ticket suppression models
8. `dbt show --select chip_ticket_suppression` reveals the 4 tickets Chip self-closed
9. Realization: Chip is scrubbing data about employees who raised concerns AND suppressing their support tickets

### Snowflake Narrative Integration

- Player discovers `/opt/snowflake/` via `ls`, gets prompted by Chip email to try `snowsql`
- `NEXACORP_DB.PUBLIC.EMPLOYEES` shows Jin Chen as "terminated"
- `CHIP_ANALYTICS.PUBLIC.FILE_MODIFICATIONS` reveals files Chip altered
- `CHIP_ANALYTICS.PUBLIC.DIRECTIVE_LOG` (with VARIANT data) is the smoking gun
- `CHIP_ANALYTICS.INTERNAL.SUPPRESSED_ALERTS` shows alerts Chip hid from Edward
