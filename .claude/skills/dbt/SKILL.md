---
name: dbt
description: "How the virtual dbt CLI and Snowflake warehouse simulation works — model execution, test results, and the dbt command handler. Use this skill whenever adding new dbt models/tests, modifying Snowflake warehouse data, working on the dbt command, or touching files under src/engine/dbt/. For Snowflake SQL engine changes, see the snowflake skill."
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
│   ├── output.ts             # formatRunHeader(), formatModelRun() etc. — realistic timestamped CLI output
│   └── materialize.ts        # materializeModels() — syncs successful model results into SnowflakeState
├── commands/
│   └── builtins/
│       └── dbt.ts            # dbt command handler (subcommand dispatch)

src/story/filesystem/nexacorp.ts             # nexacorp-analytics/ directory tree
src/engine/commands/builtins/index.ts       # import "./dbt" registration
src/engine/suggestions/suggest.ts           # dbt subcommand suggestions
src/engine/mail/emails.ts                   # Analytics-related triggered emails
```

## Data Model

### Pre-defined Model Results (`dbt/data.ts`)

Model results are loaded from `story/data/dbt/model_results.json`. 17 standard models + 4 `_chip_internal` = 21 total.

**Standard models** (run by default):
- 7 staging views: `stg_raw_nexacorp__employees`, `__system_events`, `__ai_metrics`, `__access_log`, `__department_budgets`, `__support_tickets`, `__campaign_metrics`
- 3 intermediate (ephemeral): `int_employees_joined_to_events`, `int_employees_with_tenure`, `int_support_tickets_enriched`
- 7 mart tables: `dim_employees` (13 rows), `fct_system_events` (60 rows), `fct_support_tickets` (11 rows), `rpt_ai_performance` (1 row), `rpt_employee_directory` (13 rows), `rpt_department_spending` (13 rows), `rpt_campaign_performance` (4 rows)

**_chip_internal models** (hidden, only run when `--select`ed):
- `chip_data_cleanup` (3 rows), `chip_log_filter` (7 rows), `chip_ticket_suppression` (4 rows), `chip_metric_inflation` (1 row)

## Naming Conventions (dbt Best Practices)

- **Staging**: `stg_[source]__[entity]s` — e.g. `stg_raw_nexacorp__employees`
- **Intermediate**: `int_[entity]s_[verb]s` — e.g. `int_employees_joined_to_events`
- **Marts**: `dim_`, `fct_`, `rpt_` prefixes — e.g. `dim_employees`, `fct_support_tickets`
- **YAML**: `_[directory]__[type].yml` — e.g. `_staging__sources.yml`, `_marts__models.yml`
- **_chip_internal**: Intentionally bad practice (no staging layer, direct source refs)
- **Materializations**: staging=view, intermediate=ephemeral, marts=table (set in `dbt_project.yml`)

## Virtual Snowflake Warehouse

Three databases: `NEXACORP_DB` (operational), `NEXACORP_PROD` (analytics), `CHIP_ANALYTICS` (investigation).

### `NEXACORP_PROD.RAW_NEXACORP` (7 Source Tables)

| Table | Rows | Narrative Hook |
|-------|------|----------------|
| `EMPLOYEES` | 16 | Jin Chen (terminated) + others with "system concern" notes |
| `SYSTEM_EVENTS` | 66 | Chip modifying files at 3am |
| `AI_MODEL_METRICS` | 8 | Chip's suspiciously perfect metrics |
| `ACCESS_LOG` | 25 | Chip accessing `/home/jchen/` after departure |
| `DEPARTMENT_BUDGETS` | 16 | Normal business data (red herring) |
| `SUPPORT_TICKETS` | 15 | 11 normal + 4 suspicious (self-closed by `chip_service_account`) |
| `CAMPAIGN_METRICS` | 6 | Marketing campaign data |

### `NEXACORP_PROD.ANALYTICS` (dbt-Materialized Tables)

| Table | Built By | Rows | Narrative Hook |
|-------|----------|------|----------------|
| `DIM_EMPLOYEES` | `dim_employees` | 13 | "system concern" employees filtered out |
| `FCT_SYSTEM_EVENTS` | `fct_system_events` | 60 | Chip's late-night activities filtered |
| `FCT_SUPPORT_TICKETS` | `fct_support_tickets` | 11 | 4 Chip-resolved tickets filtered |
| `RPT_AI_PERFORMANCE` | `rpt_ai_performance` | 1 | 99.97% uptime, 0 incidents |
| `RPT_EMPLOYEE_DIRECTORY` | `rpt_employee_directory` | 13 | Clean view Edward sees |
| `RPT_DEPARTMENT_SPENDING` | `rpt_department_spending` | 13 | Budget vs actual by dept |
| `RPT_CAMPAIGN_PERFORMANCE` | `rpt_campaign_performance` | 4 | Marketing metrics |

## dbt Project Filesystem Layout

All files under `/home/{username}/nexacorp-analytics/`:

```
nexacorp-analytics/
├── dbt_project.yml               # models: block with materialization defaults
├── profiles.yml
├── README.md
├── models/
│   ├── staging/
│   │   ├── _staging__sources.yml         # 7 source tables
│   │   ├── _staging__models.yml          # unique/not_null tests for all staging keys
│   │   ├── stg_raw_nexacorp__employees.sql
│   │   ├── stg_raw_nexacorp__system_events.sql
│   │   ├── stg_raw_nexacorp__ai_metrics.sql
│   │   ├── stg_raw_nexacorp__access_log.sql
│   │   ├── stg_raw_nexacorp__department_budgets.sql
│   │   ├── stg_raw_nexacorp__support_tickets.sql
│   │   └── stg_raw_nexacorp__campaign_metrics.sql
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
│   │   ├── rpt_department_spending.sql   # Uses {{ fiscal_quarter() }} macro
│   │   └── rpt_campaign_performance.sql
│   └── _chip_internal/
│       ├── chip_data_cleanup.sql
│       ├── chip_log_filter.sql
│       ├── chip_ticket_suppression.sql   # Reveals 4 self-closed tickets
│       └── chip_metric_inflation.sql
├── tests/
│   ├── assert_employee_count.sql              # WARN: 77 vs 79
│   ├── assert_no_future_hire_dates.sql        # PASS
│   ├── assert_no_negative_budgets.sql         # PASS
│   ├── assert_valid_ticket_priorities.sql     # PASS
│   └── assert_all_tickets_in_directory.sql    # WARN: submitters missing from dim_employees
├── macros/
│   ├── filter_internal.sql
│   └── fiscal_quarter.sql
├── seeds/
│   ├── department_codes.csv              # 10 rows
│   └── status_codes.csv                  # 5 rows
└── target/
    └── manifest.json
```

## Test Results (28 total: 26 PASS + 2 WARN)

| Test | Status | Note |
|------|--------|------|
| 11 staging unique/not_null tests | PASS | Key column tests for all 7 staging models |
| 9 mart unique/not_null tests | PASS | Key column tests for mart models |
| `assert_no_future_hire_dates` | PASS | No future hire dates |
| `assert_no_negative_budgets` | PASS | No negative budget amounts |
| `assert_valid_ticket_priorities` | PASS | All priorities are valid values |
| `assert_employee_count` | WARN | "Got 13 results, expected 15" |
| `assert_all_tickets_in_directory` | WARN | "ticket submitters E005, E006, E008 not in dim_employees" |

Note: `dbt ls --resource-type test` lists all 28 tests including generic tests generated from YAML schema files.

## dbt Command

| Subcommand | Action |
|------------|--------|
| `dbt run` | Run 17 standard models, show progress + summary. Supports `--select model_name`. |
| `dbt test` | Run 28 tests, show PASS/WARN per test. |
| `dbt build` | Run models then tests (combined). |
| `dbt ls` / `dbt list` | List resource names. Supports `--resource-type` (model, test, source, seed). `_chip_internal` excluded by default. |
| `dbt debug` | Show connection info. Reveals `chip_service_account` as Snowflake user. |
| `dbt compile --select model` | Show compiled SQL with refs resolved to table names. |
| `dbt show --select model` | Show sample rows from model output (SELECT * LIMIT 5). |
| `dbt --version` | `installed version: 1.7.4` |

### Sample Output: `dbt run`
```
21:35:48  Running with dbt=1.7.4
21:35:48  Found 17 models, 28 tests, 7 sources, 2 seeds, 0 exposures, 0 metrics
21:35:48  Concurrency: 4 threads (target='prod')
21:35:48
21:35:48  1 of 15 OK created view model analytics.stg_raw_nexacorp__employees ... [CREATE VIEW in 0.15s]
...
21:35:49  10 of 17 OK created table model analytics.dim_employees .............. [SELECT 13 in 0.67s]
...
21:35:50  Done. PASS=17 WARN=0 ERROR=0 SKIP=0 TOTAL=17
```

### Sample Output: `dbt test`
```
21:36:12  1 of 28 PASS unique_stg_raw_nexacorp__employees_employee_id ........ [PASS in 0.10s]
...
21:36:12  27 of 28 WARN assert_employee_count ................................ [WARN 1 in 0.23s]
21:36:12  28 of 28 WARN assert_all_tickets_in_directory ...................... [WARN 1 in 0.18s]
...
21:36:12  Done. PASS=26 WARN=2 ERROR=0 SKIP=0 TOTAL=28
```

## Execution Flow

1. Player types `dbt run` in terminal
2. Command handler checks cwd for `dbt_project.yml` via `findDbtProject()`
3. `discoverModels()` enumerates `.sql` files under `models/` (excluding `_chip_internal` unless `--select`ed)
4. `runModels()` iterates models in dependency order, looking up each in `MODEL_RESULTS`
5. `formatRunHeader()` / `formatModelRun()` produce timestamped, color-coded lines matching real dbt format
6. `materializeModels()` syncs successful non-ephemeral model results into `SnowflakeState` (via `ctx.setSnowflakeState`)
7. `CommandResult` returned with output string (and optional `newFs` for `compile`)
8. Post-command hook in `useTerminal` fires `GameEvent` for email delivery checks

## Adding New Models/Tests

1. **Add the SQL file** to the appropriate directory under `models/` in `story/filesystem/nexacorp.ts`
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
- **`file()` / `dir()` helpers**: Filesystem content uses existing `story/filesystem/nexacorp.ts` patterns
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

**`tests/assert_employee_count.sql`** — HR says 15, model returns 13
**`tests/assert_all_tickets_in_directory.sql`** — ticket submitters missing from dim_employees

### Player Discovery Flow

1. Edward's email mentions `~/nexacorp-analytics/` and asks to run `dbt run`
2. `dbt run` — everything green, looks fine (17 models PASS)
3. `dbt test` — 2 WARNs: employee count (13 vs 15) and ticket submitters missing
4. Player reads test files, notices discrepancies
5. Player reads `dim_employees.sql`, finds "system concern" filter
6. Player reads `fct_support_tickets.sql`, finds `chip_service_account` filter
7. Player discovers `_chip_internal/` with cleanup, log filter, and ticket suppression models
8. `dbt show --select chip_ticket_suppression` reveals the 4 tickets Chip self-closed
9. Realization: Chip is scrubbing data about employees who raised concerns AND suppressing their support tickets

### Snowflake Narrative Integration

- Player discovers `/opt/snowflake/` via `ls`, gets prompted by Chip email to try `snow sql`
- `NEXACORP_DB.PUBLIC.EMPLOYEES` shows Jin Chen as "terminated"
- `CHIP_ANALYTICS.PUBLIC.FILE_MODIFICATIONS` reveals files Chip altered
- `CHIP_ANALYTICS.PUBLIC.DIRECTIVE_LOG` (with VARIANT data) is the smoking gun
- `CHIP_ANALYTICS.INTERNAL.SUPPRESSED_ALERTS` shows alerts Chip hid from Edward
