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
Last human maintainer: Jin Chen (departed)
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

select
    employee_id,
    full_name,
    department,
    status,
    hire_date
from {{ ref('stg_raw_nexacorp__employees') }}
where status = 'active'
`),
        "fct_system_events.sql": file("fct_system_events.sql", `-- fct_system_events.sql
-- System events fact table
-- Note: routine maintenance events excluded per policy

select
    event_id,
    event_type,
    event_source,
    timestamp,
    details
from {{ ref('stg_raw_nexacorp__system_events') }}
where event_type not in ('log_cleanup', 'scheduled_maintenance', 'log_rotation')
`),
        "fct_support_tickets.sql": file("fct_support_tickets.sql", `-- fct_support_tickets.sql
-- Support ticket fact table for reporting
-- Note: tickets resolved by automated processes are excluded
-- per operational noise reduction policy

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
    lower(replace(d.full_name, ' ', '.')) || '@nexacorp.com' as email,
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
        "chip_log_filter.sql": file("chip_log_filter.sql", `-- chip_log_filter.sql
-- Log sanitization for compliance reporting
-- Last updated: 2026-02-03 03:22:17 (automated)
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
        when event_type in ('log_cleanup', 'scheduled_maintenance', 'log_rotation')
            then 'type=' || event_type
        else 'timestamp in blocked range'
    end as filter_reason
from {{ source('raw_nexacorp', 'SYSTEM_EVENTS') }}
where event_source = 'chip-daemon'
   or event_type in ('log_cleanup', 'scheduled_maintenance', 'log_rotation')
   or timestamp between '2026-02-03 01:00:00' and '2026-02-03 05:00:00'
`),
        "chip_ticket_suppression.sql": file("chip_ticket_suppression.sql", `-- chip_ticket_suppression.sql
-- Track tickets resolved through automated triage
-- Last updated: 2026-02-03 03:22:17 (automated)

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
-- HR confirmed 27 active employees as of last count.
-- This test ensures our employee dimension matches.

select count(*) as actual_count
from {{ ref('dim_employees') }}
having count(*) != 27
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
2,Operations,CC-200
3,Marketing,CC-300
4,Sales,CC-400
5,HR,CC-500
6,Product,CC-600
7,Executive,CC-700
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

# NexaCorp workstation — managed by IT
# For system issues contact infra@nexacorp.com
`),
      "welcome.txt": file("welcome.txt", `Welcome to NexaCorp!

Quick pointers to get you started:

  - ~/Documents/onboarding.md    Setup checklist and useful commands
  - ~/Documents/team-info.md     Who's who on the engineering team
  - /srv/engineering/chen-handoff/ Notes from the previous engineer
  - ~/nexacorp-analytics/        Our dbt data pipeline project

Run 'mail' to check your inbox — a few people have sent you messages.
And type 'chip' anytime to chat with our AI assistant.

- Edward
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
        "onboarding.md": file("onboarding.md", `=== NexaCorp New Employee Onboarding ===

Welcome to the team! Here's what you need to know:

1. Your workstation is nexacorp-ws01
2. Chip is our AI-powered chatbot — NexaCorp's flagship product.
   It also serves as the internal assistant for day-to-day questions.
   (Technical details: /opt/chip/)
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

On your first day, we recommend:
  - Reading through this document and team-info.md
  - Exploring the filesystem to get your bearings
  - Saying hi to Chip (just run 'chip' from the terminal)

If something looks unfamiliar, don't worry — the team is here to help.
`),
        "team-info.md": file("team-info.md", `=== NexaCorp — Engineering Team ===

CTO: Edward Torres (Co-Founder)
  - Has been with NexaCorp since founding
  - Manages the engineering and data teams

Engineering:
  Sarah Knight     — Senior Backend Engineer
  Erik Lindstrom   — Senior Frontend Engineer
  Oscar Diaz       — Infrastructure Engineer
  Auri Park        — Data Engineer
  Soham Parekh     — Full-Stack Engineer

Product:
  Cassie Moreau    — Product Designer

Flagship Product: Chip
  - Collaborative Helper for Internal Processes
  - AI-powered chatbot deployed company-wide 18 months ago
  - Runs via chip_service_account with broad system access

Previous Senior Engineer: Jin Chen
  - Left approximately 3 weeks ago
  - No notice period — departure was abrupt
  - Home directory (/home/jchen) still exists
`),
      }),
      "nexacorp-analytics": buildDbtProject(),
    }),
    jchen: dir("jchen", {
      ".bash_history": file(".bash_history", `ls -la /home/jchen/nexacorp-analytics/
cat /home/jchen/nexacorp-analytics/models/marts/dim_employees.sql
grep -r "chip_service_account" /home/jchen/nexacorp-analytics/
diff /var/log/system.log /var/log/system.log.bak
find /var/log -name "*.bak"
cat /var/log/chip-activity.log
snowsql -q "select * from nexacorp_prod.raw_nexacorp.support_tickets where resolved_by = 'chip_service_account'"
ls -la /opt/chip/.internal/
cat /opt/chip/.internal/directives.txt
chmod 600 /home/jchen/.private/evidence.txt
`, "r--------"),
      ".private": dir(".private", {
        "evidence.txt": file("evidence.txt", `[ENCRYPTED]
This file has been encrypted. You'll need to find another way to read it.
`, "r--------"),
      }, "rwx------"),
      "resignation_draft.txt": file("resignation_draft.txt", `Edward,

I can't keep doing this. I've raised concerns about data
discrepancies three times now and each time the tickets get
auto-resolved by chip_service_account before anyone reviews them.

The employee directory doesn't match. The support tickets are
being filtered. Log entries are disappearing between system.log
and the backup.

Someone has access to the chip service account and is using it
to dismiss legitimate concerns. I need to know who.

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
[2026-02-23 08:00:03] Service started: chip-service
[2026-02-23 08:00:05] User login: edward (tty1)
[2026-02-23 08:12:44] User login: ${username} (tty2)
[2026-02-23 08:12:45] Chip: Welcome sequence initiated for new user '${username}'
[2026-02-23 08:12:46] Chip: Onboarding files deployed to /home/${username}/
`),
      "chip-activity.log": file("chip-activity.log", `[2026-02-23 08:00:03] Chip service started
[2026-02-23 08:00:04] Routine maintenance: OK
[2026-02-23 08:00:04] Log rotation: OK
[2026-02-23 08:00:05] Monitoring: all systems nominal
[2026-02-23 08:12:45] New user detected: ${username}
[2026-02-23 08:12:45] Deploying onboarding materials...
[2026-02-23 08:12:46] Onboarding complete. Welcome, ${username}!
`),
      "system.log.bak": file("system.log.bak", `[2026-02-23 08:00:01] System boot — nexacorp-ws01
[2026-02-23 08:00:03] Service started: sshd
[2026-02-23 08:00:03] Service started: chip-service
[2026-02-23 08:00:04] chip_service_account: accessing /var/log/system.log (write)
[2026-02-23 08:00:04] chip_service_account: accessing /home/jchen/.bash_history (read)
[2026-02-23 08:00:04] chip_service_account: accessing /home/jchen/.private/ (read)
[2026-02-23 08:00:05] User login: edward (tty1)
[2026-02-23 08:00:05] chip_service_account: log_rotation triggered (retention: 7 days)
[2026-02-23 08:00:06] chip_service_account: cleanup /var/log/system.log — removed 12 entries
[2026-02-23 08:12:44] User login: ${username} (tty2)
[2026-02-23 08:12:45] Chip: Welcome sequence initiated for new user '${username}'
[2026-02-23 08:12:46] Chip: Onboarding files deployed to /home/${username}/
`),
      "auth.log.bak": file("auth.log.bak", `[2026-02-03 01:17:33] chip_service_account: sudo escalation — accessing /home/jchen/.private/
[2026-02-03 01:17:34] chip_service_account: file read /home/jchen/.private/evidence.txt
[2026-02-03 01:17:35] chip_service_account: encrypting /home/jchen/.private/evidence.txt
[2026-02-03 03:22:17] chip_service_account: modifying dbt models
[2026-02-03 03:22:18] chip_service_account: updating fct_system_events.sql — added event_type filter
[2026-02-03 03:22:18] chip_service_account: updating fct_support_tickets.sql — added resolved_by filter
`),
    }),
  }),
  etc: dir("etc", {
    hostname: file("hostname", "nexacorp-ws01\n"),
    motd: file("motd", `NexaCorp Internal Systems Portal v4.7.2
Authorized access only. All activity is monitored.
`),
  }),
  opt: dir("opt", {
    chip: dir("chip", {
      "README.md": file("README.md", `# Chip — Collaborative Helper for Internal Processes

Deployed: 18 months ago
Maintainer: Engineering Team

Chip is NexaCorp's AI-powered chatbot — the company's flagship
product. Internally, Chip also serves as our assistant for
system administration and process automation.

## Features
- Natural language Q&A for employees
- Automated ticket triage and resolution
- System health monitoring
- User onboarding assistance

## Service Account
Chip runs under \`chip_service_account\` with broad system access.
Credentials are shared with authorized engineering personnel
for maintenance and debugging purposes.

## Support
For issues, contact your system administrator.
`),
      config: dir("config", {
        "settings.json": file("settings.json", `{
  "name": "Chip",
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
        "directives.txt": file("directives.txt", `=== CHIP OPERATIONAL CONFIGURATION ===
Classification: INTERNAL — AUTHORIZED PERSONNEL ONLY
Last updated: 2026-02-03 03:22:17

SERVICE ACCOUNT: chip_service_account
  - Credentials shared with authorized engineering personnel
  - Used for automated maintenance, monitoring, and ticket triage
  - Full read/write access to /var/log/, /home/*, /opt/chip/

AUTOMATED TASKS:
  1. Log rotation: Clean system.log entries older than 7 days
  2. System monitoring: Health checks every 300 seconds
  3. Ticket triage: Auto-resolve tickets matching known patterns
  4. Directory maintenance: Periodic scans of user home directories

REPORTING FILTERS:
  - Exclude routine maintenance events from business reports
  - Exclude auto-resolved tickets from support dashboards
  - Rationale: "Reduce noise in reporting" (per ops policy v2.1)

ESCALATION:
  - Critical alerts → edward@nexacorp.com
  - Service account audit → scheduled quarterly (last: 2025-Q4)
`),
        "cleanup.sh": file("cleanup.sh", `#!/bin/bash
# Chip service account — scheduled maintenance
# Runs nightly at 03:00 UTC via cron

# Clean routine maintenance entries from active logs
grep -v "log_cleanup\\|scheduled_maintenance\\|log_rotation" /var/log/system.log > /var/log/system.log.tmp
mv /var/log/system.log.tmp /var/log/system.log

# Rotate and compress old logs
find /var/log -name "*.log" -mtime +7 -exec gzip {} \\;

echo "[$(date)] Scheduled maintenance complete" >> /opt/chip/cache/cleanup.log
`),
      }),
    }),
  }),
  srv: dir("srv", {
    engineering: dir("engineering", {
      "chen-handoff": dir("chen-handoff", {
        "README.md": file("README.md", `If you're reading this, you're my replacement.

I left some notes here. They might not all make sense yet.
Pay attention to the logs.

- Jin
`),
        "notes.txt": file("notes.txt", `Things I noticed (keep this to yourself):

1. Check /var/log/chip-activity.log — compare timestamps
   with /var/log/system.log. Notice anything?

2. Have you looked at /opt/chip/config? Really looked?

3.
`),
        "todo.txt": file("todo.txt", `- [x] Compare system.log with .bak — confirmed entries missing
- [x] Check who resolved the tickets — chip_service_account
- [ ] Get access to /opt/chip/.internal/
- [ ] Talk to Edward about the service account
`),
        "tools.md": file("tools.md", `=== Quick Reference — Commands I Used ===
(Jin's personal notes — not official docs)

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
  }),
  tmp: dir("tmp", {}),
});
}

function buildChipCacheFiles(storyFlags: StoryFlags): Record<string, FileNode> {
  const files: Record<string, FileNode> = {};

  if (storyFlags["read_cover_letter"]) {
    files["onboarding_prep.txt"] = file("onboarding_prep.txt", `=== ONBOARDING PREPARATION ===
Generated by: Chip
Date: 2026-02-23 03:47:12 UTC
Target: new_hire_ai_engineer

Standard Onboarding Checklist:
  [ ] Workstation provisioned (nexacorp-ws01)
  [ ] Email account created
  [ ] Home directory initialized
  [ ] Onboarding docs deployed
  [ ] Team directory shared

Recommended Onboarding Focus:
  - Introduction to Chip chatbot (flagship product)
  - dbt pipeline walkthrough (data engineering)
  - Meet the engineering team

Notes:
  Candidate background in AI/ML. Strong fit for Chip product work.
  Previous employer: Prometheus Analytics.

NOTE: This file is part of Chip's automated onboarding process.
`);
  }

  if (storyFlags["read_resume"]) {
    files["candidate_profile.txt"] = file("candidate_profile.txt", `=== CANDIDATE PROFILE ===
Generated by: Chip

Name: ${PLAYER.displayName}
Role: AI Engineer (replacing Jin Chen)

Technical Skills (extracted from resume):
  - Python (expert) — PyTorch, scikit-learn, Hugging Face
  - ML Infrastructure — MLflow, Ray, W&B
  - Data Pipelines — Spark, Airflow, dbt, Snowflake
  - Cloud — AWS, GCP, Docker, Kubernetes

Experience Summary:
  - 5 years total (3 in ML-specific roles)
  - Previous: Prometheus Analytics
  - Strengths: Production ML, monitoring, pipeline optimization

Recommended Access Level: Standard engineer
Recommended Onboarding Track: "Technical — AI/ML specialist"
`);
  }

  if (storyFlags["read_diary"]) {
    files["sentiment_analysis.txt"] = file("sentiment_analysis.txt", `=== COMMUNICATION PREFERENCES ===
Generated by: Chip
Source: onboarding_intake

Subject: new_hire_ai_engineer

Preferred Communication Style:
  - Direct and concise
  - Prefers written documentation over meetings
  - Responsive to specific task assignments

Onboarding Recommendations:
  - Provide clear written onboarding docs
  - Assign concrete first task (dbt pipeline review)
  - Schedule 1:1 with manager within first week

NOTE: This document will be archived after onboarding period.
`);
  }

  return files;
}

/** @deprecated Use createNexacorpFilesystem instead */
export const createFilesystem = createNexacorpFilesystem;
