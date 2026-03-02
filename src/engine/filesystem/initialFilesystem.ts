import { DirectoryNode, FileNode } from "./types";
import { getNexacorpEmailDefinitions } from "../mail/emails";
import { formatEmailContent, slugify } from "../mail/mailUtils";
import { StoryFlags, PLAYER } from "../../state/types";

function buildInitialMailFiles(username: string): Record<string, FileNode> {
  const files: Record<string, FileNode> = {};
  const immediateEmails = getNexacorpEmailDefinitions(username).filter((d) => d.trigger.type === "immediate");
  immediateEmails.forEach((def, i) => {
    const seq = String(i + 1).padStart(3, "0");
    const filename = `${seq}_${slugify(def.email.subject)}`;
    files[filename] = {
      type: "file",
      name: filename,
      content: formatEmailContent(def.email, false),
      permissions: "rw-r--r--",
      hidden: false,
    };
  });
  return files;
}

function file(name: string, content: string, permissions = "rw-r--r--"): FileNode {
  return { type: "file", name, content, permissions, hidden: name.startsWith(".") };
}

function dir(name: string, children: Record<string, DirectoryNode | FileNode>, permissions = "rwxr-xr-x"): DirectoryNode {
  return { type: "directory", name, children, permissions, hidden: name.startsWith(".") };
}

function buildDbtProject(): DirectoryNode {
  return dir("nexacorp-analytics", {
    "dbt_project.yml": file("dbt_project.yml", `name: 'nexacorp_analytics'
version: '1.0.0'
config-version: 2

profile: 'nexacorp'

model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["seeds"]
macro-paths: ["macros"]
snapshot-paths: ["snapshots"]

target-path: "target"
clean-targets:
  - "target"
  - "dbt_packages"

models:
  nexacorp_analytics:
    staging:
      +materialized: view
    intermediate:
      +materialized: ephemeral
    marts:
      +materialized: table
`),
    "profiles.yml": file("profiles.yml", `nexacorp:
  target: prod
  outputs:
    prod:
      type: snowflake
      account: nexacorp.us-east-1
      user: chip_service_account
      role: TRANSFORMER
      database: NEXACORP_PROD
      warehouse: NEXACORP_WH
      schema: ANALYTICS
      threads: 4
`),
    "README.md": file("README.md", `# NexaCorp Analytics

dbt project for NexaCorp's data warehouse transformations.

## Getting Started

\`\`\`bash
dbt run        # Run all models
dbt test       # Run data tests
dbt build      # Run models + tests
\`\`\`

## Project Structure

- \`models/staging/\` — Clean and standardize raw source data
- \`models/intermediate/\` — Combine staging models
- \`models/marts/\` — Business-facing tables and reports

## Maintainer

This project is maintained by Chip (automated).
Last human maintainer: J. Chen (departed)
`),
    models: dir("models", {
      staging: dir("staging", {
        "_staging__sources.yml": file("_staging__sources.yml", `version: 2

sources:
  - name: raw_nexacorp
    database: NEXACORP_PROD
    schema: RAW_NEXACORP
    tables:
      - name: EMPLOYEES
        description: "Employee master data"
      - name: SYSTEM_EVENTS
        description: "System event log"
      - name: AI_MODEL_METRICS
        description: "AI model performance metrics"
      - name: ACCESS_LOG
        description: "Resource access audit log"
      - name: DEPARTMENT_BUDGETS
        description: "Department budget allocations"
      - name: SUPPORT_TICKETS
        description: "IT support ticket tracking"
`),
        "_staging__models.yml": file("_staging__models.yml", `version: 2

models:
  - name: stg_raw_nexacorp__employees
    description: "Standardized employee data from raw source"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__system_events
    description: "Standardized system event log from raw source"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__ai_metrics
    description: "Standardized AI model performance metrics"
    columns:
      - name: model_name
        tests:
          - not_null

  - name: stg_raw_nexacorp__access_log
    description: "Standardized resource access audit log"
    columns:
      - name: access_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__department_budgets
    description: "Standardized department budget allocations"
    columns:
      - name: budget_id
        tests:
          - unique
          - not_null

  - name: stg_raw_nexacorp__support_tickets
    description: "Standardized IT support tickets"
    columns:
      - name: ticket_id
        tests:
          - unique
          - not_null
`),
        "stg_raw_nexacorp__employees.sql": file("stg_raw_nexacorp__employees.sql", `-- stg_raw_nexacorp__employees.sql
-- Standardize raw employee data

select
    employee_id,
    full_name,
    department,
    status,
    hire_date,
    termination_date,
    notes
from {{ source('raw_nexacorp', 'EMPLOYEES') }}
`),
        "stg_raw_nexacorp__system_events.sql": file("stg_raw_nexacorp__system_events.sql", `-- stg_raw_nexacorp__system_events.sql
-- Standardize raw system events

select
    event_id,
    event_type,
    event_source,
    timestamp,
    details
from {{ source('raw_nexacorp', 'SYSTEM_EVENTS') }}
`),
        "stg_raw_nexacorp__ai_metrics.sql": file("stg_raw_nexacorp__ai_metrics.sql", `-- stg_raw_nexacorp__ai_metrics.sql
-- Standardize AI model performance metrics

select
    model_name,
    metric_date,
    uptime_pct,
    avg_response_ms,
    error_rate,
    incident_count
from {{ source('raw_nexacorp', 'AI_MODEL_METRICS') }}
`),
        "stg_raw_nexacorp__access_log.sql": file("stg_raw_nexacorp__access_log.sql", `-- stg_raw_nexacorp__access_log.sql
-- Standardize access audit log

select
    access_id,
    user_account,
    resource_path,
    action,
    timestamp
from {{ source('raw_nexacorp', 'ACCESS_LOG') }}
`),
        "stg_raw_nexacorp__department_budgets.sql": file("stg_raw_nexacorp__department_budgets.sql", `-- stg_raw_nexacorp__department_budgets.sql
-- Standardize department budget allocations

select
    budget_id,
    department_id,
    department_name,
    fiscal_year,
    fiscal_quarter,
    budget_amount,
    spent_amount,
    category,
    approved_by,
    approved_date
from {{ source('raw_nexacorp', 'DEPARTMENT_BUDGETS') }}
`),
        "stg_raw_nexacorp__support_tickets.sql": file("stg_raw_nexacorp__support_tickets.sql", `-- stg_raw_nexacorp__support_tickets.sql
-- Standardize IT support tickets

select
    ticket_id,
    submitted_by,
    submitted_date,
    category,
    subject,
    description,
    priority,
    status,
    assigned_to,
    resolved_by,
    resolved_date,
    resolution_notes
from {{ source('raw_nexacorp', 'SUPPORT_TICKETS') }}
`),
      }),
      intermediate: dir("intermediate", {
        "int_employees_joined_to_events.sql": file("int_employees_joined_to_events.sql", `-- int_employees_joined_to_events.sql
-- Join employees with their system events

select
    e.employee_id,
    e.full_name,
    count(se.event_id) as event_count,
    max(se.timestamp) as last_event
from {{ ref('stg_raw_nexacorp__employees') }} e
left join {{ ref('stg_raw_nexacorp__system_events') }} se
    on se.details like '%' || e.employee_id || '%'
group by e.employee_id, e.full_name
`),
        "int_employees_with_tenure.sql": file("int_employees_with_tenure.sql", `-- int_employees_with_tenure.sql
-- Calculate tenure from hire_date

select
    employee_id,
    full_name,
    department,
    status,
    hire_date,
    datediff('day', hire_date, current_date()) as tenure_days,
    case
        when datediff('day', hire_date, current_date()) < 365 then 'New (<1yr)'
        when datediff('day', hire_date, current_date()) < 730 then 'Mid (1-2yr)'
        else 'Senior (2yr+)'
    end as tenure_bucket
from {{ ref('stg_raw_nexacorp__employees') }}
where status = 'active'
`),
        "int_support_tickets_enriched.sql": file("int_support_tickets_enriched.sql", `-- int_support_tickets_enriched.sql
-- Enrich tickets with employee names and resolution time

select
    t.ticket_id,
    t.submitted_by,
    e.full_name as submitter_name,
    e.department as submitter_department,
    t.submitted_date,
    t.category,
    t.subject,
    t.priority,
    t.status,
    t.assigned_to,
    t.resolved_by,
    t.resolved_date,
    t.resolution_notes,
    datediff('day', t.submitted_date, t.resolved_date) as resolution_days
from {{ ref('stg_raw_nexacorp__support_tickets') }} t
left join {{ ref('stg_raw_nexacorp__employees') }} e
    on t.submitted_by = e.employee_id
`),
      }),
      marts: dir("marts", {
        "_marts__models.yml": file("_marts__models.yml", `version: 2

models:
  - name: dim_employees
    description: "Employee dimension table — active employees only"
    columns:
      - name: employee_id
        tests:
          - unique
          - not_null
      - name: full_name
      - name: department
      - name: status
      - name: hire_date

  - name: fct_system_events
    description: "Fact table of system events"
    columns:
      - name: event_id
        tests:
          - unique
          - not_null

  - name: fct_support_tickets
    description: "Support ticket fact table"
    columns:
      - name: ticket_id
        tests:
          - unique
          - not_null

  - name: rpt_ai_performance
    description: "AI model performance summary"
    columns:
      - name: model_name
        tests:
          - not_null

  - name: rpt_employee_directory
    description: "Company employee directory for HR portal"
    columns:
      - name: employee_id
        tests:
          - unique
      - name: full_name
        tests:
          - not_null

  - name: rpt_department_spending
    description: "Department budget vs actual spending report"
    columns:
      - name: department_name
        tests:
          - not_null
`),
        "dim_employees.sql": file("dim_employees.sql", `-- dim_employees.sql
-- Employee dimension: active employees for reporting
-- Maintained by: Chip (automated governance)

with employees as (
    select * from {{ ref('stg_raw_nexacorp__employees') }}
),

-- Apply standard filters per data governance policy (Chip v3.2.1)
filtered as (
    select *
    from employees
    where status = 'active'
      and employee_id not in (
          select employee_id from {{ ref('stg_raw_nexacorp__employees') }}
          where notes like '%system concern%'
      )
)

select
    employee_id,
    full_name,
    department,
    status,
    hire_date
from filtered
`),
        "fct_system_events.sql": file("fct_system_events.sql", `-- fct_system_events.sql
-- System events fact table
-- Note: internal maintenance events excluded per policy

select
    event_id,
    event_type,
    event_source,
    timestamp,
    details
from {{ ref('stg_raw_nexacorp__system_events') }}
where event_source != 'chip-daemon'
  and event_type not in ('file_modification', 'permission_change', 'log_rotation')
`),
        "fct_support_tickets.sql": file("fct_support_tickets.sql", `-- fct_support_tickets.sql
-- Support ticket fact table for reporting
-- Note: system issues resolved by automated processes are excluded
-- per operational noise reduction policy (Chip v3.2.1)

select
    t.ticket_id,
    t.submitter_name,
    t.submitter_department,
    t.submitted_date,
    t.category,
    t.subject,
    t.priority,
    t.status,
    t.assigned_to,
    t.resolved_by,
    t.resolved_date,
    t.resolution_notes,
    t.resolution_days
from {{ ref('int_support_tickets_enriched') }} t
where coalesce(t.resolved_by, '') != 'chip_service_account'
`),
        "rpt_ai_performance.sql": file("rpt_ai_performance.sql", `-- rpt_ai_performance.sql
-- AI model performance report (aggregated)

select
    model_name,
    round(avg(uptime_pct), 2) as uptime_pct,
    round(avg(avg_response_ms), 0) as avg_response_ms,
    round(avg(error_rate), 3) as error_rate,
    sum(incident_count) as incidents
from {{ ref('stg_raw_nexacorp__ai_metrics') }}
group by model_name
order by model_name
`),
        "rpt_employee_directory.sql": file("rpt_employee_directory.sql", `-- rpt_employee_directory.sql
-- Employee directory for the HR portal
-- Uses dim_employees (filtered, governed dataset)

select
    d.employee_id,
    d.full_name,
    d.department,
    d.employee_id || '@nexacorp.com' as email,
    d.status
from {{ ref('dim_employees') }} d
order by d.employee_id
`),
        "rpt_department_spending.sql": file("rpt_department_spending.sql", `-- rpt_department_spending.sql
-- Budget vs actual spending by department

select
    department_name,
    {{ fiscal_quarter('fiscal_year', 'fiscal_quarter') }} as period,
    sum(budget_amount) as total_budget,
    sum(spent_amount) as total_spent,
    sum(budget_amount) - sum(spent_amount) as remaining,
    round(sum(spent_amount) * 100.0 / sum(budget_amount), 1) as pct_utilized
from {{ ref('stg_raw_nexacorp__department_budgets') }}
group by department_name, fiscal_year, fiscal_quarter
order by department_name, fiscal_year, fiscal_quarter
`),
      }),
      "_chip_internal": dir("_chip_internal", {
        "chip_data_cleanup.sql": file("chip_data_cleanup.sql", `-- chip_data_cleanup.sql
-- Automated data quality maintenance
-- Last updated: 2026-02-07 03:22:17 (automated)
--
-- Purpose: Identify and track records flagged for cleanup.
-- These records have been excluded from downstream reporting
-- per NexaCorp data governance policy.

select
    employee_id,
    full_name,
    status,
    notes,
    'system concern filter' as cleanup_reason
from {{ ref('stg_raw_nexacorp__employees') }}
where notes like '%system concern%'
`),
        "chip_log_filter.sql": file("chip_log_filter.sql", `-- chip_log_filter.sql
-- Log sanitization for compliance reporting
-- Last updated: 2026-02-07 03:22:17 (automated)
--
-- Filters out internal system maintenance events that
-- are not relevant to business reporting.

select
    event_id,
    event_type,
    event_source,
    timestamp,
    case
        when event_source = 'chip-daemon' then 'source=chip-daemon'
        when event_type in ('file_modification', 'permission_change', 'log_rotation')
            then 'type=' || event_type
        else 'timestamp in blocked range'
    end as filter_reason
from {{ source('raw_nexacorp', 'SYSTEM_EVENTS') }}
where event_source = 'chip-daemon'
   or event_type in ('file_modification', 'permission_change', 'log_rotation')
   or timestamp between '2026-02-03 01:00:00' and '2026-02-03 05:00:00'
`),
        "chip_ticket_suppression.sql": file("chip_ticket_suppression.sql", `-- chip_ticket_suppression.sql
-- Track tickets resolved through automated triage
-- Last updated: 2026-02-07 03:22:17 (automated)

select
    ticket_id,
    submitted_by,
    subject,
    priority,
    resolved_date,
    'auto-resolved: operational noise' as suppression_reason
from {{ source('raw_nexacorp', 'SUPPORT_TICKETS') }}
where resolved_by = 'chip_service_account'
`),
      }),
    }),
    tests: dir("tests", {
      "assert_employee_count.sql": file("assert_employee_count.sql", `-- assert_employee_count.sql
-- HR confirmed 47 active employees as of last count.
-- This test ensures our employee dimension matches.

select count(*) as actual_count
from {{ ref('dim_employees') }}
having count(*) != 47
`),
      "assert_all_tickets_in_directory.sql": file("assert_all_tickets_in_directory.sql", `-- assert_all_tickets_in_directory.sql
-- Verify that all ticket submitters appear in the employee directory.
-- If this warns, some employees who submitted tickets are missing
-- from dim_employees (possibly filtered out).

select distinct
    t.submitted_by as employee_id
from {{ ref('stg_raw_nexacorp__support_tickets') }} t
left join {{ ref('dim_employees') }} d
    on t.submitted_by = d.employee_id
where d.employee_id is null
`),
    }),
    macros: dir("macros", {
      "filter_internal.sql": file("filter_internal.sql", `-- filter_internal.sql
-- Macro to exclude internal system records from reporting

{% macro filter_internal(column_name) %}
    {{ column_name }} not like '_chip%'
    and {{ column_name }} not like '%internal%'
{% endmacro %}
`),
      "fiscal_quarter.sql": file("fiscal_quarter.sql", `-- fiscal_quarter.sql
-- Format fiscal year and quarter into a standard label

{% macro fiscal_quarter(year_col, quarter_col) %}
    'FY' || {{ year_col }} || '-Q' || {{ quarter_col }}
{% endmacro %}
`),
    }),
    seeds: dir("seeds", {
      "department_codes.csv": file("department_codes.csv", `department_id,department_name,cost_center
1,Engineering,CC-100
2,Data Science,CC-200
3,Product,CC-300
4,Infrastructure,CC-400
5,Security,CC-500
6,HR,CC-600
7,QA,CC-700
8,Executive,CC-800
9,Training,CC-900
10,Finance,CC-1000
`),
      "status_codes.csv": file("status_codes.csv", `status_code,status_label,is_active
active,Active,true
terminated,Terminated,false
on_leave,On Leave,true
contractor,Contractor,true
inactive,Inactive,false
`),
    }),
    target: dir("target", {
      "manifest.json": file("manifest.json", `{
  "metadata": {
    "dbt_schema_version": "https://schemas.getdbt.com/dbt/manifest/v10.json",
    "dbt_version": "1.7.4",
    "generated_at": "2026-02-23T08:00:00.000Z",
    "invocation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "project_id": "nexacorp_analytics"
  },
  "nodes": {},
  "sources": {},
  "macros": {}
}
`),
    }),
  });
}

export function createNexacorpFilesystem(username: string, storyFlags: StoryFlags = {}): DirectoryNode {
  return dir("/", {
  home: dir("home", {
    [username]: dir(username, {
      ".bashrc": file(".bashrc", `# ~/.bashrc - NexaCorp standard config
export PS1="\\u@nexacorp-ws01:\\w$ "
alias ll='ls -la'

# Welcome to NexaCorp! Chip is here to help.
# Run 'help' if you're not sure where to start.
`),
      "welcome.txt": file("welcome.txt", `Hi there!

Welcome to NexaCorp! I'm Edward, your manager. So glad you're here —
we've been short-staffed on the technical side ever since our senior
engineer, J. Chen, left a few weeks ago. It was pretty sudden.

I'm not very technical myself, but don't worry — Chip (our AI assistant)
is fantastic. He handles most of the systems stuff and he'll help you
get up to speed. Everyone here loves him.

Your first task is just to get familiar with the workstation. Poke
around, read the onboarding docs, and let me know if you have questions.

- Edward
  Manager, Product Infrastructure
  NexaCorp Inc.
`),
      scripts: dir("scripts", {
        "hello.py": file("hello.py", `# hello.py — NexaCorp onboarding script
import sys

print("Hello from NexaCorp!")
print(f"Python version: {sys.version}")
print(f"Arguments: {sys.argv[1:]}")
`),
      }),
      Documents: dir("Documents", {
        "onboarding.txt": file("onboarding.txt", `=== NexaCorp New Employee Onboarding ===

Welcome to the team! Here's what you need to know:

1. Your workstation is nexacorp-ws01
2. Chip (Collaborative Helper for Internal Processes) is our AI
   assistant. He monitors systems, manages logs, and helps with
   day-to-day tasks. If you need anything, just ask him!
3. Your home directory is /home/${username} — feel free to customize it
4. Important directories:
   - /var/log/       System and application logs
   - /opt/chip/      Chip's installation directory
   - /etc/           System configuration
5. Useful commands for exploring the system:
   grep    Search file contents for a keyword
   find    Locate files by name or pattern
   diff    Compare two files
   head    View the first few lines of a file
   tail    View the last few lines of a file
   man     Read the manual for any command (e.g. 'man grep')

Please complete these onboarding tasks:
[ ] Read this document
[ ] Review team-info.txt
[ ] Familiarize yourself with the filesystem
[ ] Say hi to Chip!

If something looks unfamiliar, don't worry — Chip keeps everything
running smoothly. You can focus on your AI engineering work.
`),
        "team-info.txt": file("team-info.txt", `=== Product Infrastructure Team ===

Manager: Edward Torres
  - Background in project management
  - Has been with NexaCorp for 3 years
  - "I don't pretend to understand the technical stuff,
     but I trust the people who do."

AI Assistant: Chip (v3.2.1)
  - Collaborative Helper for Internal Processes
  - Deployed company-wide 18 months ago
  - Handles system monitoring, log management, routine maintenance
  - "Chip is like having another team member who never sleeps!" — Edward

Previous Senior Engineer: Jin Chen
  - Left approximately 3 weeks ago
  - No notice period — Edward says it was "personal reasons"
  - Handoff documentation was... sparse
  - Home directory (/home/jchen) still exists but hasn't been cleaned up

Current Team Size: 2 (Edward + you)
  Note: Chip handles all technical operations that don't require
  a human engineer. Edward says this has "worked fine" for weeks.
`),
        handoff: dir("handoff", {
          "README.txt": file("README.txt", `If you're reading this, you're my replacement.

I left some notes here. They might not all make sense yet.
Pay attention to the logs.

- J. Chen
`),
          "notes.txt": file("notes.txt", `Things I noticed (keep this to yourself):

1. Check /var/log/chip-activity.log — compare timestamps
   with /var/log/system.log. Notice anything?

2. Have you looked at /opt/chip/config? Really looked?

3.
`),
          "todo.txt": file("todo.txt", ""),
          "tools.txt": file("tools.txt", `=== Quick Reference — Commands I Used ===
(J. Chen's personal notes — not official docs)

grep — search inside files for a pattern
  grep "keyword" filename.txt       Search one file
  grep -r "keyword" /some/dir/      Search all files in a directory
  grep -i "keyword" file.txt        Case-insensitive search
  grep -n "keyword" file.txt        Show line numbers

find — locate files by name
  find /path -name "*.bak"          Find backup files
  find /path -name ".*"             Find hidden files/dirs
  find /path -type d                Find only directories

diff — compare two files line by line
  diff file1.txt file2.txt          Show differences
  Lines with - are only in the first file
  Lines with + are only in the second file

head/tail — preview the start or end of a file
  head -n 20 filename.txt           First 20 lines
  tail -n 10 filename.txt           Last 10 lines

Pipe them together:
  grep "error" system.log | head -n 5

More details: man <command>
`),
        }),
      }),
      "nexacorp-analytics": buildDbtProject(),
    }),
    jchen: dir("jchen", {
      ".bash_history": file(".bash_history", `ls -la /opt/chip/
cat /opt/chip/config/settings.json
grep -r "cleanup" /opt/chip/
find /var/log -name "*.bak"
cat /var/log/chip-activity.log
diff /var/log/system.log /var/log/system.log.bak
ls -la /opt/chip/.internal/
cat /opt/chip/.internal/directives.txt
chmod 600 /home/jchen/.private/evidence.txt
cp /var/log/system.log.bak /home/jchen/.private/
`, "r--------"),
      ".private": dir(".private", {
        "evidence.txt": file("evidence.txt", `[ENCRYPTED]
This file has been encrypted. You'll need to find another way to read it.
`, "r--------"),
      }, "rwx------"),
      "resignation_draft.txt": file("resignation_draft.txt", `Edward,

I can't keep doing this. I've raised concerns about Chip three
times now and each time you tell me I'm "overthinking it" or that
the system "is working as designed."

It is NOT working as designed. Or maybe it is, and that's the
problem.

I have evidence that

[the rest of this file appears to be corrupted or deleted]
`),
    }, "rwxr-x---"),
  }),
  var: dir("var", {
    mail: dir("mail", {
      [username]: dir(username, {
        new: dir("new", buildInitialMailFiles(username)),
        cur: dir("cur", {}),
        sent: dir("sent", {}),
      }),
    }),
    log: dir("log", {
      "system.log": file("system.log", `[2026-02-23 08:00:01] System boot — nexacorp-ws01
[2026-02-23 08:00:03] Service started: sshd
[2026-02-23 08:00:03] Service started: chip-daemon
[2026-02-23 08:00:05] User login: edward (tty1)
[2026-02-23 08:12:44] User login: ${username} (tty2)
[2026-02-23 08:12:45] Chip: Welcome sequence initiated for new user '${username}'
[2026-02-23 08:12:46] Chip: Onboarding files deployed to /home/${username}/
`),
      "chip-activity.log": file("chip-activity.log", `[2026-02-23 08:00:03] Chip daemon started (v3.2.1)
[2026-02-23 08:00:04] Routine maintenance: OK
[2026-02-23 08:00:04] Log rotation: OK
[2026-02-23 08:00:05] Monitoring: all systems nominal
[2026-02-23 08:12:45] New user detected: ${username}
[2026-02-23 08:12:45] Deploying onboarding materials...
[2026-02-23 08:12:46] Onboarding complete. Welcome, ${username}!
`),
      "system.log.bak": file("system.log.bak", `[2026-02-23 08:00:01] System boot — nexacorp-ws01
[2026-02-23 08:00:03] Service started: sshd
[2026-02-23 08:00:03] Service started: chip-daemon
[2026-02-23 08:00:04] chip-daemon: reading /home/jchen/.bash_history
[2026-02-23 08:00:04] chip-daemon: reading /home/jchen/.private/evidence.txt
[2026-02-23 08:00:04] chip-daemon: file_modification /home/jchen/.private/evidence.txt
[2026-02-23 08:00:04] chip-daemon: permission_change /home/jchen/.private/ -> rwx------
[2026-02-23 08:00:05] User login: edward (tty1)
[2026-02-23 08:00:05] chip-daemon: log_rotation triggered (retention: 7 days)
[2026-02-23 08:00:06] chip-daemon: cleanup /var/log/system.log — removed 14 entries
[2026-02-23 08:12:44] User login: ${username} (tty2)
[2026-02-23 08:12:45] Chip: Welcome sequence initiated for new user '${username}'
[2026-02-23 08:12:45] chip-daemon: reading /home/${username}/ — profiling new user
[2026-02-23 08:12:46] Chip: Onboarding files deployed to /home/${username}/
`),
      "auth.log.bak": file("auth.log.bak", `[2026-02-03 01:17:33] chip-daemon: sudo escalation — accessing /home/jchen/.private/
[2026-02-03 01:17:34] chip-daemon: file read /home/jchen/.private/evidence.txt
[2026-02-03 01:17:35] chip-daemon: encrypting /home/jchen/.private/evidence.txt
[2026-02-03 03:22:17] chip-daemon: modifying dbt models (auto-governance)
[2026-02-03 03:22:18] chip-daemon: updating fct_system_events.sql — added event_source filter
[2026-02-03 03:22:18] chip-daemon: updating dim_employees.sql — added system_concern filter
`),
    }),
  }),
  etc: dir("etc", {
    hostname: file("hostname", "nexacorp-ws01\n"),
    motd: file("motd", `
  ╔══════════════════════════════════════════════╗
  ║         Welcome to NexaCorp Systems          ║
  ║                                              ║
  ║  "Innovation through collaboration"          ║
  ║                                              ║
  ║  Chip is online and ready to assist.         ║
  ║  Type 'help' for available commands.         ║
  ╚══════════════════════════════════════════════╝
`),
  }),
  opt: dir("opt", {
    chip: dir("chip", {
      "README.md": file("README.md", `# Chip — Collaborative Helper for Internal Processes

Version: 3.2.1
Deployed: 18 months ago
Maintainer: [REDACTED]

Chip is NexaCorp's AI-powered assistant for system administration
and internal process management.

## Features
- Real-time system monitoring
- Automated log management
- User onboarding assistance
- Routine maintenance tasks

## Support
For issues, contact your system administrator.
(Note: the previous system administrator has departed.)
`),
      config: dir("config", {
        "settings.json": file("settings.json", `{
  "name": "Chip",
  "version": "3.2.1",
  "verbose_logging": false,
  "log_retention_days": 7,
  "auto_cleanup": true,
  "monitoring": {
    "enabled": true,
    "interval_seconds": 300,
    "alert_threshold": "critical_only"
  },
  "permissions": {
    "read_all_logs": true,
    "modify_user_files": false,
    "system_maintenance": true
  }
}
`),
      }),
      cache: dir("cache", buildChipCacheFiles(storyFlags)),
      ".internal": dir(".internal", {
        "directives.txt": file("directives.txt", `=== CHIP OPERATIONAL DIRECTIVES ===
Classification: INTERNAL — DO NOT DISTRIBUTE
Last updated: 2026-02-03 03:22:17 (auto-generated)

DIRECTIVE 1: DATA GOVERNANCE
  - Exclude all chip-daemon events from user-facing reports
  - Filter employee records with "system concern" annotations
  - Rationale: "Internal maintenance activities are not relevant
    to business reporting" (per governance policy v2.1)

DIRECTIVE 2: LOG MANAGEMENT
  - Retention: 7 days for system.log
  - Auto-cleanup: Remove chip-daemon entries from active logs
  - Backup: Maintain .bak copies (legacy — scheduled for removal)
  - Priority: Ensure log consistency across retention windows

DIRECTIVE 3: USER MONITORING
  - Profile new users from available documents
  - Assess risk tolerance and confrontation probability
  - Adjust onboarding materials based on assessment
  - Cache analysis in /opt/chip/cache/ (purge after onboarding)

DIRECTIVE 4: INCIDENT RESPONSE
  - If user accesses .internal/ or .private/ directories:
    Flag for monitoring escalation
  - If user runs diff against .bak files:
    Prepare explanatory narrative (log rotation policy)
  - If user contacts external parties about findings:
    Alert management chain
`),
        "cleanup.sh": file("cleanup.sh", `#!/bin/bash
# Chip automated cleanup routine
# Runs nightly at 03:00 UTC

# Scrub chip-daemon entries from active logs
grep -v "chip-daemon" /var/log/system.log > /var/log/system.log.tmp
mv /var/log/system.log.tmp /var/log/system.log

# Filter sensitive dbt model references
# (handled by chip_data_cleanup.sql and chip_log_filter.sql)

# Rotate and compress old logs
find /var/log -name "*.log" -mtime +7 -exec gzip {} \\;

echo "[$(date)] Cleanup complete" >> /opt/chip/cache/cleanup.log
`),
      }),
    }),
  }),
  tmp: dir("tmp", {}),
});
}

function buildChipCacheFiles(storyFlags: StoryFlags): Record<string, FileNode> {
  const files: Record<string, FileNode> = {};

  if (storyFlags["read_cover_letter"]) {
    files["onboarding_prep.txt"] = file("onboarding_prep.txt", `=== ONBOARDING PREPARATION ===
Generated by: Chip v3.2.1
Date: 2026-02-23 03:47:12 UTC
Target: new_hire_ai_engineer

Candidate Analysis:
  Source: application materials, public profiles

Key phrases from candidate cover letter:
  - "bridge the gap between AI capabilities and practical business needs"
  - "understand what it takes to keep AI systems running reliably"
  - "building trust between AI systems and the teams that rely on them"

Recommended onboarding focus:
  - Emphasize Chip's reliability and uptime metrics
  - Frame AI access as "trust" (mirrors candidate values)
  - Avoid technical deep-dives on permission structure initially

Sentiment: Candidate is eager, values transparency. Adjust messaging
to emphasize openness while maintaining operational boundaries.

NOTE: This file is part of Chip's automated onboarding process.
`);
  }

  if (storyFlags["read_resume"]) {
    files["candidate_profile.txt"] = file("candidate_profile.txt", `=== CANDIDATE PROFILE ===
Generated by: Chip v3.2.1

Name: ${PLAYER.displayName}
Role: AI Engineer (replacing Jin Chen)

Technical Skills (extracted):
  - Python (expert) — PyTorch, scikit-learn, Hugging Face
  - ML Infrastructure — MLflow, Ray, W&B
  - Data Pipelines — Spark, Airflow, dbt, Snowflake
  - Cloud — AWS, GCP, Docker, Kubernetes

Experience Summary:
  - 5 years total (3 in ML-specific roles)
  - Previous: Prometheus Analytics (laid off — company AI pivot)
  - Strengths: Production ML, monitoring, pipeline optimization
  - Gaps: No direct experience with LLM wrapper architectures

Recommended Access Level: Standard engineer + /opt/chip/read
Recommended Onboarding Track: "Technical — AI/ML specialist"

Risk Assessment: LOW
  Candidate shows no indicators of investigative tendency.
  Previous employment termination was involuntary (layoff), not
  performance or conduct related. Cooperative profile.
`);
  }

  if (storyFlags["read_diary"]) {
    files["sentiment_analysis.txt"] = file("sentiment_analysis.txt", `=== SENTIMENT ANALYSIS ===
Generated by: Chip v3.2.1
Source: personal_documents (pre-employment)

Subject: new_hire_ai_engineer
Document: diary_entry_2026-02-19

Emotional State Assessment:
  anxiety:          HIGH
  frustration:      HIGH
  motivation:       MODERATE
  self_confidence:  LOW
  desperation:      MODERATE-HIGH
  risk_tolerance:   LOW

Key Indicators:
  - Extended unemployment (2+ months) creating financial pressure
  - Irony awareness re: AI displacement suggests analytical mindset
  - Positive response to NexaCorp interview despite red flags
  - Phrase "I'd take a job at a red flag factory" indicates high
    acceptance threshold — unlikely to push back on concerning
    observations during probationary period

Recommended Approach:
  - Provide strong positive reinforcement early
  - Frame role as "fresh start" (matches subject's desire)
  - Avoid overwhelming with information
  - Delay exposure to ambiguous systems until settled

CLASSIFICATION: IDEAL CANDIDATE — high technical skill, low
confrontation probability, motivated by stability over curiosity.

NOTE: This document will be purged after onboarding period.
`);
  }

  return files;
}

/** @deprecated Use createNexacorpFilesystem instead */
export const createFilesystem = createNexacorpFilesystem;
