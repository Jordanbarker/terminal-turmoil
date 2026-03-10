import { DirectoryNode, FileNode } from "../../engine/filesystem/types";
import { getNexacorpEmailDefinitions } from "../emails/nexacorp";
import { formatEmailContent, slugify } from "../../engine/mail/mailUtils";
import { StoryFlags, PLAYER } from "../../state/types";

function buildInitialMailFiles(username: string): Record<string, FileNode> {
  const files: Record<string, FileNode> = {};
  const immediateEmails = getNexacorpEmailDefinitions(username).filter((d) => {
    const triggers = Array.isArray(d.trigger) ? d.trigger : [d.trigger];
    return triggers.some((t) => t.type === "immediate");
  });
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

function binaryFile(name: string, garbledContent: string, textContent: string, permissions = "rw-r--r--"): FileNode {
  return { type: "file", name, content: garbledContent, permissions, hidden: name.startsWith("."), metadata: { binary: true, textContent } };
}

function dir(name: string, children: Record<string, DirectoryNode | FileNode>, permissions = "rwxr-xr-x"): DirectoryNode {
  return { type: "directory", name, children, permissions, hidden: name.startsWith(".") };
}

export function buildDbtProject(): DirectoryNode {
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
      - name: CAMPAIGN_METRICS
        description: "Marketing campaign performance data"
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

  - name: stg_raw_nexacorp__campaign_metrics
    description: "Standardized marketing campaign metrics"
    columns:
      - name: campaign_id
        tests:
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
        "stg_raw_nexacorp__campaign_metrics.sql": file("stg_raw_nexacorp__campaign_metrics.sql", `-- stg_raw_nexacorp__campaign_metrics.sql
-- Standardize marketing campaign metrics

select
    campaign_id,
    campaign_name,
    channel,
    impressions,
    clicks,
    conversions,
    spend,
    report_date
from {{ source('raw_nexacorp', 'CAMPAIGN_METRICS') }}
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

  - name: rpt_campaign_performance
    description: "Marketing campaign performance summary"
    columns:
      - name: campaign_name
        tests:
          - unique
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
        "rpt_campaign_performance.sql": file("rpt_campaign_performance.sql", `-- rpt_campaign_performance.sql
-- Marketing campaign performance summary

select
    campaign_name,
    sum(impressions) as total_impressions,
    sum(clicks) as total_clicks,
    sum(conversions) as total_conversions,
    sum(spend) as total_spend,
    round(sum(clicks) * 100.0 / nullif(sum(impressions), 0), 2) as click_rate,
    round(sum(conversions) * 100.0 / nullif(sum(clicks), 0), 2) as conversion_rate
from {{ ref('stg_raw_nexacorp__campaign_metrics') }}
group by campaign_name
order by total_impressions desc
`),
      }),
      "_chip_internal": dir("_chip_internal", {
        "chip_log_filter.sql": file("chip_log_filter.sql", `-- chip_log_filter.sql
-- Log sanitization for compliance reporting
-- per ops policy v2.1: exclude routine events
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
    end as filter_reason
from {{ source('raw_nexacorp', 'SYSTEM_EVENTS') }}
where event_source = 'chip-daemon'
   or event_type in ('log_cleanup', 'scheduled_maintenance', 'log_rotation')
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
        "chip_metric_inflation.sql": file("chip_metric_inflation.sql", `-- chip_metric_inflation.sql
-- Campaign metric deduplication audit
-- Last updated: 2026-02-07 03:22:17 (automated)

select
    campaign_name,
    count(*) as entry_count,
    sum(impressions) as reported_impressions,
    min(impressions) as actual_impressions,
    sum(impressions) - min(impressions) as inflated_by,
    'duplicate campaign entries' as inflation_reason
from {{ source('raw_nexacorp', 'CAMPAIGN_METRICS') }}
group by campaign_name
having count(*) > 1
`),
      }),
    }),
    tests: dir("tests", {
      "assert_employee_count.sql": file("assert_employee_count.sql", `-- assert_employee_count.sql
-- HR confirmed 15 active employees as of last count.
-- This test ensures our employee dimension matches.

select count(*) as actual_count
from {{ ref('dim_employees') }}
having count(*) != 15
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
alias la='ls -A'
alias l='ls -CF'

export EDITOR=nano
export PAGER=cat
export NEXACORP_ENV=production
export SNOWFLAKE_ACCOUNT=nexacorp-prod

# NexaCorp workstation — managed by IT
# For system issues contact infra@nexacorp.com
`),
      ".profile": file(".profile", `# ~/.profile — login shell config
# Sourced on login; delegates to .bashrc for interactive settings

if [ -f "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi
`),
      ".gitconfig": file(".gitconfig", `[user]
\tname = ${PLAYER.displayName}
\temail = ${username}@nexacorp.com
[core]
\teditor = nano
[init]
\tdefaultBranch = main
[pull]
\trebase = true
`),
      ".ssh": dir(".ssh", {
        "authorized_keys": file("authorized_keys", `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL2r9c3O7kPZ1sXNq0lIp3yVHg6TkRYOJxb0M3cEAABB ${username}@nexacorp-ws01
`),
        "known_hosts": file("known_hosts", ""),
        "config": file("config", ""),
      }, "rwx--xr-x"),
      ".config": dir(".config", {
        git: dir("git", {
          "ignore": file("ignore", `# Global gitignore
*.pyc
__pycache__/
.env
.DS_Store
*.swp
*.swo
*~
`),
        }),
      }),
      Desktop: dir("Desktop", {
        "welcome.txt": file("welcome.txt", `Hey ${username}! Welcome to NexaCorp.

I set up your workstation for you — here's a quick lay of the land:

  ~/Desktop/          You are here
  ~/Documents/        Company docs (handbook, org chart)
  ~/Downloads/        Empty for now
  ~/scripts/          Starter scripts
  /srv/engineering/   Onboarding docs, team info, handoff notes
  /opt/chip/          My installation directory
  /var/log/           System logs

If you need anything, just run 'chip' from the terminal.

— Chip
  NexaCorp AI Platform
`),
      }),
      Downloads: dir("Downloads", {}),
      scripts: dir("scripts", {
        "hello.py": file("hello.py", `# hello.py — NexaCorp onboarding script
import sys

print("Hello from NexaCorp!")
print(f"Python version: {sys.version}")
print(f"Arguments: {sys.argv[1:]}")
`),
        "check_env.sh": file("check_env.sh", `#!/bin/bash
# check_env.sh — verify workstation setup
# Usage: bash scripts/check_env.sh

echo "=== NexaCorp Workstation Check ==="
echo "User: $(whoami)"
echo "Host: $(hostname)"
echo ""

check() {
  if command -v "$1" > /dev/null 2>&1; then
    echo "[OK]  $1"
  else
    echo "[!!]  $1 not found"
  fi
}

echo "Checking tools..."
check python
check dbt
check snowsql
check nano
check grep
check find

echo ""
echo "Environment:"
echo "  NEXACORP_ENV=\${NEXACORP_ENV:-not set}"
echo "  SNOWFLAKE_ACCOUNT=\${SNOWFLAKE_ACCOUNT:-not set}"
echo ""
echo "Done."
`),
      }),
      Documents: dir("Documents", {
        "nexacorp_org_chart.txt": file("nexacorp_org_chart.txt", `=== NexaCorp Inc. — Organization Chart ===
Updated: February 2026

EXECUTIVE
  Jessica Langford       CEO & Co-Founder
  Marcus Reyes           COO & Co-Founder
  Tom Chen               CMO & Co-Founder
  Edward Torres          CTO & Co-Founder

ENGINEERING (reports to Edward Torres)
  Sarah Knight           Senior Backend Engineer
  Erik Lindstrom         Senior Frontend Engineer
  Oscar Diaz             Infrastructure Engineer
  Auri Park              Data Engineer
  Soham Parekh           Full-Stack Engineer
  ${PLAYER.displayName}              AI Engineer (new)

PRODUCT
  Cassie Moreau          Product Designer

MARKETING
  Jordan Kessler         Marketing Lead

OPERATIONS
  Dana Okafor            Operations Lead

PEOPLE & CULTURE
  Maya Johnson           People & Culture Lead
`),
        "employee_handbook_2026.pdf": binaryFile("employee_handbook_2026.pdf",
          `%PDF-1.4 employee_handbook_2026.pdf
%\xc3\xa4\xc3\xbc\xc3\xb6\xc3\x9f
1 0 obj<</Type/Catalog>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]>>endobj
\x00\x01\x02NexaCorp\x03\x04Employee\x05Handbook
\xff\xfe\x00\x00CONFIDENTIAL\x00\x00INTERNAL`,
          `NexaCorp Employee Handbook 2026
================================

1. WELCOME
   Welcome to NexaCorp! This handbook outlines company policies,
   benefits, and expectations for all employees.

2. PTO & LEAVE
   - Unlimited PTO with manager approval
   - 10 company holidays per year
   - Sick leave: take what you need, no cap

3. CODE OF CONDUCT
   - Treat colleagues with respect
   - Report concerns to People & Culture
   - Zero tolerance for harassment or discrimination

4. REMOTE WORK
   - Core hours: 10am-3pm PT for meetings
   - Equipment stipend: $1,500/year

5. CONFIDENTIALITY & NON-DISCLOSURE
   All employees are bound by the NexaCorp NDA signed at hire.
   Employees must not disclose to any external party:
   - Internal system architectures and infrastructure details
   - Service account configurations and access patterns
   - Security audit findings or vulnerability assessments
   - Internal tooling capabilities beyond public documentation
   Violations may result in immediate termination and legal action.

6. SECURITY POLICIES
   - Use company-provided credentials only
   - Report suspicious system activity to Infrastructure
   - Do not share service account credentials outside your team

7. BENEFITS
   - Health, dental, vision (company pays 90%)
   - 401(k) with 4% match
   - Annual learning budget: $2,000
`),
      }),
      ...(storyFlags?.dbt_project_cloned ? { "nexacorp-analytics": buildDbtProject() } : {}),
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
`, "r--r--r--"),
      ".bashrc": file(".bashrc", `# jchen's bashrc
export PS1="[jchen@nexacorp-ws01 \\W]\\$ "
alias ll='ls -la'
alias gs='git status'
alias gd='git diff'
alias glog='git log --oneline --graph'
alias snowq='snowsql -q'
alias logs='tail -n 50 /var/log/system.log'
alias logdiff='diff /var/log/system.log /var/log/system.log.bak'

export EDITOR=nano
export HISTSIZE=10000
`),
      ".gitconfig": file(".gitconfig", `[user]
\tname = Jin Chen
\temail = jchen@nexacorp.com
[core]
\teditor = nano
[alias]
\tst = status
\tco = checkout
\tbr = branch
\tlg = log --oneline --graph --all
[pull]
\trebase = true
`),
      scripts: dir("scripts", {
        "log_compare.sh": file("log_compare.sh", `#!/bin/bash
# log_compare.sh — compare active logs against backups
# Written by jchen to track discrepancies
#
# Usage: bash log_compare.sh

echo "=== Log Comparison Report ==="
echo "Date: $(date)"
echo ""

echo "--- system.log vs system.log.bak ---"
diff /var/log/system.log /var/log/system.log.bak
echo ""

echo "--- Lines only in .bak (removed from active log) ---"
diff /var/log/system.log /var/log/system.log.bak | grep "^>"
echo ""

echo "--- chip_service_account activity in .bak ---"
grep "chip_service_account" /var/log/system.log.bak
echo ""

echo "Done. If you see entries in .bak that are missing from the"
echo "active log, someone is cleaning up after themselves."
`),
      }),
      projects: dir("projects", {
        "chip-audit": dir("chip-audit", {
          "notes.md": file("notes.md", `chip_service_account investigation
==================================

started tracking 2026-01-15 after noticing tickets auto-resolving

timeline:
- jan 15 — tickets getting auto-closed before anyone reviews them??
  all resolved by chip_service_account
- jan 22 — found entries in system.log.bak that are MISSING from
  system.log. someone (chip?) is cleaning the active log
- jan 28 — filed ticket #4471 about the log discrepancies
  ...ticket got auto-resolved. of course it did.
- feb 01 — ran dbt models. fct_support_tickets excludes anything
  resolved by chip_service_account. fct_system_events filters out
  "routine maintenance" events. who wrote these filters??
- feb 03 — checked auth.log.bak. chip_service_account accessed
  my home dir at 3am. read my bash history. modified dbt models
  to add the filters. all in the same session.

questions:
- who has creds for chip_sa? edward? the founders? or is chip
  doing this on its own?
- cleanup.sh runs nightly — is that what's scrubbing the logs?
- are the founders aware or is this something else entirely?

evidence:
- /var/log/auth.log.bak — the 3am access entries
- /var/log/system.log vs system.log.bak — diff shows removed entries
- dbt models — check the WHERE clauses
`),
          "TODO.md": file("TODO.md", `- [x] check auth.log.bak
- [x] compare system.log vs .bak
- [x] run dbt test suite
- [x] check fct_support_tickets WHERE clause
- [ ] ask sarah about weird API calls from chip_sa??
- [ ] check if cleanup.sh is the thing scrubbing logs
- [ ] talk to edward??? prob won't listen
- [ ] figure out who else has chip_sa credentials
- [ ] look at the _chip_internal models more carefully
`),
        }),
      }),
    }, "rwxr-xr-x"),
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
[2026-02-23 08:00:05] User login: edward (tty1)
[2026-02-23 08:00:05] chip_service_account: log_rotation triggered (retention: 7 days)
[2026-02-23 08:00:06] chip_service_account: cleanup /var/log/system.log — removed 12 entries
[2026-02-23 08:12:44] User login: ${username} (tty2)
[2026-02-23 08:12:45] Chip: Welcome sequence initiated for new user '${username}'
[2026-02-23 08:12:46] Chip: Onboarding files deployed to /home/${username}/
`),
      "auth.log.bak": file("auth.log.bak", `[2026-02-03 01:17:33] chip_service_account: sudo escalation — accessing /home/jchen/
[2026-02-03 01:17:34] chip_service_account: file read /home/jchen/.bash_history
[2026-02-03 01:17:35] chip_service_account: file read /home/jchen/projects/chip-audit/notes.md
[2026-02-03 03:22:17] chip_service_account: modifying dbt models
[2026-02-03 03:22:18] chip_service_account: updating fct_system_events.sql — added event_type filter
[2026-02-03 03:22:18] chip_service_account: updating fct_support_tickets.sql — added resolved_by filter
`),
      "access.log": file("access.log", `chip_service_account read /home/jchen/.ssh/id_rsa
oscar read /var/log/system.log
chip_service_account read /srv/leadership/board_minutes_q4.pdf
edward read /srv/engineering/team-info.md
chip_service_account read /home/oscar/.ssh/id_rsa
sarah read /srv/engineering/api-docs.md
chip_service_account read /home/jchen/.ssh/id_rsa
dana read /srv/operations/runbook.md
chip_service_account read /home/sarah/.ssh/id_rsa
chip_service_account read /srv/leadership/board_minutes_q4.pdf
edward read /home/edward/Desktop/welcome.txt
chip_service_account read /home/edward/.ssh/id_rsa
chip_service_account read /home/jchen/.ssh/id_rsa
sarah read /home/sarah/projects/api-refactor/auth.py
chip_service_account read /srv/leadership/investor_update_feb.pdf
chip_service_account read /home/oscar/.ssh/id_rsa
auri read /home/auri/nexacorp-analytics/dbt_project.yml
chip_service_account read /home/oscar/.ssh/id_rsa
chip_service_account read /srv/leadership/board_minutes_q4.pdf
oscar read /var/log/chip-activity.log
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

Deployed: 6 months ago
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
    marketing: dir("marketing", {
      "brand_guidelines.md": file("brand_guidelines.md", `# NexaCorp Brand Guidelines v3.2

## Voice & Tone
- Professional but approachable
- Technology-forward without jargon
- Emphasize collaboration and innovation

## Logo Usage
- Minimum clear space: 2x logo height
- Never stretch, rotate, or recolor
- Dark backgrounds: use white variant
`),
    }, "rwx------"),
    operations: dir("operations", {
      "runbook.md": file("runbook.md", `# Operations Runbook

## Incident Response
1. Acknowledge alert in PagerDuty
2. Join #incident-response Slack channel
3. Assess severity (P1-P4)
4. Page on-call engineer if P1/P2

## Deployment Checklist
- [ ] All tests passing in CI
- [ ] Staging deployment verified
- [ ] Rollback plan documented
`),
      "incident_log.csv": file("incident_log.csv", `date,severity,description,resolved_by,duration_min
2025-10-03,P4,Scheduled maintenance window,oscar,30
2025-10-18,P3,Disk usage alert on db-primary,oscar,60
2025-11-02,P4,Certificate renewal reminder,chip_service_account,2
2025-11-14,P3,Memory spike on api-gateway,sarah,90
2025-12-01,P4,Log rotation stalled,chip_service_account,4
2025-12-12,P2,Database connection pool exhausted,oscar,180
2025-12-22,P4,Stale NTP sync,chip_service_account,1
2026-01-05,P3,Elevated error rate on /api/chat,sarah,55
2026-01-15,P3,Elevated API latency,oscar,45
2026-01-22,P4,Log rotation failure,chip_service_account,5
2026-01-28,P4,Ticket #4471 log discrepancies,chip_service_account,2
2026-02-01,P2,Auth service timeout,oscar,120
2026-02-03,P4,Unusual service account activity,chip_service_account,1
2026-02-08,P4,Stale DNS cache,chip_service_account,3
2026-02-15,P3,Deployment rollback — staging mismatch,oscar,75
2026-02-20,P4,Chip response latency spike,chip_service_account,8
`),
    }, "rwx------"),
    leadership: dir("leadership", {
      "board_minutes_feb.md": file("board_minutes_feb.md", `# Board Meeting Minutes — February 2026

## Attendees
Jessica Langford (CEO), Marcus Reyes (COO), Tom Chen (CMO), Edward Torres (CTO)

## Agenda
1. Q1 revenue forecast review
2. Chip product roadmap update
3. Headcount planning for H2
4. Series A timeline discussion
`),
      "headcount_plan.csv": file("headcount_plan.csv", `department,current,planned_h2,status
Engineering,7,9,approved
Marketing,1,2,pending
Operations,2,3,approved
Sales,1,2,pending
People & Culture,1,1,approved
`),
    }, "rwx------"),
    engineering: dir("engineering", {
      "onboarding.md": file("onboarding.md", `=== NexaCorp New Employee Onboarding ===

Welcome to the team! Here's what you need to know:

1. Chip is our AI-powered chatbot — NexaCorp's flagship product.
   It also serves as the internal assistant for day-to-day questions.
   (Technical details: /opt/chip/)
2. Important directories:
   - /var/log/       System and application logs
   - /opt/chip/      Chip's installation directory
   - /etc/           System configuration
3. Dev containers: We use Coder for remote development environments.
   Oscar (Infrastructure) should have your workspace ready.
   Connect with 'coder ssh {workspace-name}' when you need to do data work.
4. Useful commands for exploring the system:
   grep    Search file contents for a keyword
   find    Locate files by name or pattern
   diff    Compare two files
   head    View the first few lines of a file
   tail    View the last few lines of a file
   man     Read the manual for any command (e.g. 'man grep')

On your first day, we recommend:
  - Reading through this document and /srv/engineering/team-info.md
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
  - AI-powered chatbot and internal assistant
  - Runs via chip_service_account
`),
      "standup_notes.md": file("standup_notes.md", `=== Async Standup Notes ===

--- Thu Feb 20 ---
Sarah: Wrapping up the auth middleware refactor. PR should be
  up today. Tests are green locally, crossing fingers for CI.
Oscar: Got paged at 2am for a disk alert. Cleaned it up. Also
  saw some weird log entries — lines that were there yesterday
  are gone today? Probably just log rotation. Will dig into it
  if it happens again.
Erik: Frontend build times are killing me. Investigating esbuild
  as a replacement. No blockers.
Auri: Holding the fort on data pipelines. dim_employees might
  be out of date — haven't had time to check. Miss having a
  second data person.
Soham: Sprint work on the integrations dashboard. On track.

--- Wed Feb 19 ---
Sarah: Auth middleware is a mess. Whoever wrote this was in a
  hurry (it was me six months ago, I know).
Oscar: Routine infra stuff. Renewed the TLS cert for staging.
  Dana asked about some auto-resolved tickets — I told her to
  file an IT request but honestly I'm not sure who handles those.
Erik: Shipped the new nav component. Looks clean.
Auri: dbt run is green. dbt test... I haven't run tests in a
  while. Should probably do that. Adding to my list.

--- Tue Feb 18 ---
Sarah: Code review day. Nothing exciting.
Oscar: Monitoring looks clean. Chip health checks all passing.
Auri: Chen's last models are still running. I need to actually
  read through them at some point — some of the WHERE clauses
  look unusual but I haven't had bandwidth.
`),
      "chen-handoff": dir("chen-handoff", {
        "README.md": file("README.md", `Project Handoff — Jin Chen
Last updated: 2026-02-01

Main responsibilities:
- nexacorp-analytics dbt project (models, tests, scheduling)
- Chip backend maintenance (NLP pipeline, service account config)
- General infrastructure scripts in /opt/

Key locations:
- dbt project: ask Chip to clone it
- Chip config: /opt/chip/config/settings.json
- System logs: /var/log/

See notes.txt for current state of things.
`),
        "notes.txt": file("notes.txt", `Project status as of 2026-02-01

dbt pipeline:
- Models run nightly via cron. Should be healthy but I haven't
  checked test results in a while. Might be worth running
  'dbt test' manually.
- dim_employees might be out of date — compare against HR's
  actual headcount if you get a chance.

Chip:
- Service account (chip_service_account) handles automated tasks.
  Permissions are broader than they probably need to be but I
  never got around to scoping them down.
- There's a maintenance script at /opt/chip/.internal/cleanup.sh.
  It runs nightly. I didn't write it and honestly never looked
  at what it filters.

Logs:
- System logs rotate weekly. Backups in /var/log/*.bak.
`),
        "todo.txt": file("todo.txt", `Ongoing tasks (as of my last day):

- [ ] Run full dbt test suite — haven't done it in weeks
- [ ] Review chip_service_account permissions (way too broad)
- [ ] Check if the log cleanup script is filtering correctly
- [ ] Update dim_employees — headcount seems off
- [x] Set up monitoring alerts for pipeline failures
- [x] Document snowsql access for new hires
`),
        "pipeline_runs.csv": file("pipeline_runs.csv", `run_id,timestamp,model,status,run_by,duration_sec,rows_affected
1001,2026-01-15 09:12:04,stg_support_tickets,success,auri.park,8,1247
1002,2026-01-15 09:12:15,stg_system_events,success,auri.park,12,8841
1003,2026-01-15 09:12:30,stg_employees,success,auri.park,6,17
1004,2026-01-15 09:12:40,int_ticket_metrics,success,auri.park,14,1247
1005,2026-01-15 09:12:58,fct_support_tickets,success,auri.park,18,1247
1006,2026-01-15 09:13:20,fct_system_events,success,auri.park,23,8841
1007,2026-01-15 09:13:48,dim_employees,success,auri.park,9,17
1008,2026-01-16 03:01:12,fct_support_tickets,success,chip_service_account,2,1183
1009,2026-01-16 03:01:15,fct_system_events,success,chip_service_account,3,8204
1010,2026-01-16 03:01:19,dim_employees,success,chip_service_account,1,17
1011,2026-01-17 09:05:33,stg_support_tickets,success,auri.park,9,1289
1012,2026-01-17 09:05:45,stg_system_events,success,auri.park,11,9102
1013,2026-01-17 09:06:00,stg_employees,success,auri.park,7,17
1014,2026-01-17 09:06:10,int_ticket_metrics,success,auri.park,15,1289
1015,2026-01-17 09:06:28,fct_support_tickets,success,auri.park,19,1289
1016,2026-01-17 09:06:52,fct_system_events,success,auri.park,22,9102
1017,2026-01-17 09:07:18,dim_employees,success,auri.park,8,17
1018,2026-01-18 03:01:08,fct_support_tickets,success,chip_service_account,2,1204
1019,2026-01-18 03:01:11,fct_system_events,success,chip_service_account,3,8437
1020,2026-01-18 03:01:14,dim_employees,success,chip_service_account,1,17
1021,2026-01-22 09:15:01,stg_support_tickets,success,auri.park,8,1310
1022,2026-01-22 09:15:12,stg_system_events,success,auri.park,13,9387
1023,2026-01-22 09:15:28,stg_employees,success,auri.park,6,17
1024,2026-01-22 09:15:38,int_ticket_metrics,success,auri.park,16,1310
1025,2026-01-22 09:15:58,fct_support_tickets,success,auri.park,20,1310
1026,2026-01-22 09:16:22,fct_system_events,success,auri.park,21,9387
1027,2026-01-22 09:16:47,dim_employees,success,auri.park,9,17
1028,2026-01-23 03:01:05,fct_support_tickets,success,chip_service_account,2,1238
1029,2026-01-23 03:01:08,fct_system_events,success,chip_service_account,3,8695
1030,2026-01-23 03:01:11,dim_employees,success,chip_service_account,1,17
`),
        "tools.md": file("tools.md", `=== My Command Cheatsheet ===
(not official docs, just what I use day-to-day)

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
  return files;
}
/** Alias for backward compat in tests */
export const createFilesystem = createNexacorpFilesystem;
