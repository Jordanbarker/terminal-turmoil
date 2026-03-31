import { DirectoryNode } from "../../../engine/filesystem/types";
import { file, dir } from "../../../engine/filesystem/builders";

export function buildSrvDirectory(overBudget: boolean): DirectoryNode {
  return dir("srv", {
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

## Chip Product Messaging

### External (website, sales decks)
"Chip is NexaCorp's intelligent assistant — a conversational AI that helps
teams work smarter. Chip answers questions, surfaces insights, and
streamlines workflows so your team can focus on what matters."

### Internal positioning (board decks, investor materials)
"Chip is a full-stack AI platform with deep system integration. Unlike
chatbots limited to Q&A, Chip has native access to internal tools,
databases, and infrastructure — enabling autonomous task execution
across the organization."

Note from Jordan K: The external messaging undersells what Chip actually
does. Tom wants to keep it vague for now — "let the product speak for
itself once enterprise prospects see the demo." I pushed back on this
but was told to wait until after Series A closes.
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
      "ops_incidents.csv": file("ops_incidents.csv", `id,date,category,status,assigned_to,resolution_notes
4401,2025-10-05,chat_session_quality,closed,cassie,"User reported slow responses during peak hours"
4402,2025-10-08,api_integration,closed,sarah,"Webhook retry logic wasn't handling 429s"
4403,2025-10-12,chat_session_quality,closed,cassie,"Chip hallucinated a product feature — added guardrail"
4404,2025-10-15,user_onboarding,closed,maya,"SSO redirect loop for new hires — config fix"
4405,2025-10-22,data_pipeline,closed,auri,"Staging model had stale schema ref"
4406,2025-11-01,chat_session_quality,closed,cassie,"Context window exceeded for long conversations"
4407,2025-11-03,infrastructure,closed,oscar,"Disk pressure on db-replica-2"
4408,2025-11-10,api_integration,closed,sarah,"Rate limiter too aggressive on /api/chat"
4409,2025-11-18,chat_session_quality,closed,cassie,"Chip citing internal docs in external responses"
4410,2025-11-22,data_pipeline,closed,auri,"dbt test failures after source schema change"
4411,2025-12-01,infrastructure,auto-resolved,chip_service_account,"Routine log rotation maintenance"
4412,2025-12-05,user_onboarding,closed,maya,"New hire permissions template was outdated"
4413,2025-12-10,api_integration,closed,sarah,"Auth token refresh race condition"
4414,2025-12-15,chat_session_quality,closed,cassie,"Response quality dip — retrained on updated docs"
4415,2025-12-20,infrastructure,auto-resolved,chip_service_account,"Scheduled certificate renewal"
4416,2026-01-06,api_integration,closed,sarah,"Elevated 5xx on /api/chat endpoint"
4417,2026-01-10,data_pipeline,closed,auri,"Snowflake warehouse auto-suspend timing issue"
4418,2026-01-15,infrastructure,closed,oscar,"Connection pool exhaustion on api-gateway"
4419,2026-01-20,chat_session_quality,closed,cassie,"Chip answering questions about internal infra to external users"
4420,2026-01-25,infrastructure,auto-resolved,chip_service_account,"Routine NTP sync correction"
4421,2026-01-28,infrastructure,auto-resolved,chip_service_account,"Log discrepancy report — operational noise"
4422,2026-02-01,api_integration,closed,sarah,"Auth service timeout during deploy"
4423,2026-02-03,infrastructure,auto-resolved,chip_service_account,"Service account activity flagged — routine maintenance"
4424,2026-02-08,data_pipeline,closed,auri,"Mart model join producing duplicates after source update"
4425,2026-02-12,chat_session_quality,closed,cassie,"Chip latency spike correlated with batch job"
4426,2026-02-18,infrastructure,auto-resolved,chip_service_account,"DNS cache flush — scheduled maintenance"
4427,2026-02-22,user_onboarding,closed,maya,"New hire laptop provisioning delay"
4428,2026-02-25,data_pipeline,closed,auri,"Campaign metrics table had duplicate rows from re-ingestion"
`),
    }, "rwx------"),
    leadership: dir("leadership", {
      "board_minutes_feb.md": file("board_minutes_feb.md", `# Board Meeting Minutes — February 2026

## Attendees
Jessica Langford (CEO), Marcus Reyes (COO), Tom Chen (CMO), Edward Torres (CTO)

## 1. Q1 Revenue Forecast
- Tom: Enterprise pipeline strong. Three prospects in late-stage eval, all interested
  in Chip's analytics capabilities. Committed Q2 launch of enhanced analytics tier.
- Marcus: Current velocity puts the analytics overhaul at Q3, not Q2. We need to be
  realistic with prospects.
- Tom: We can't push the timeline — two of these deals are contingent on Q2 delivery.
- Edward: Depends on data pipeline stability. We're still catching up after Jin left.
- Jessica: Edward to provide a revised engineering timeline by March 1.

## 2. Chip Product Roadmap
- Edward presented Chip usage metrics. 12,000 daily active sessions, up 40% QoQ.
- Marcus: These numbers don't match what Dana showed me last week. Her ops dashboard
  had daily sessions closer to 8,000. Which dataset is correct?
- Edward: The board deck pulls from the analytics marts. Dana's dashboard might be
  using raw data with different filtering.
- Jessica: Can we get Dana and Edward to reconcile the numbers before next board meeting?
- ACTION: Edward to sync with Dana on metrics discrepancy.
- Cassie raised concern about Chip's scope — product spec says Q&A and document search,
  but she's seen API calls that suggest broader system access.
- Edward: Chip has the access it needs to function. Engineering handles the permission
  model.
- Jessica: What exactly does Chip have access to?
- Edward: Standard service account. Read access to docs, logs, the usual. Nothing unusual.
- ACTION: Edward to document Chip's access scope for the board. [No follow-up as of 2/28]

## 3. Headcount Planning
- Engineering: Jin Chen backfill complete (new hire starting${overBudget ? " at $180K — $45K over budget" : ""}). 1 additional engineer
  planned for Q3 pending Series A.${overBudget ? `
- Marcus: That backfill came in well over budget. Edward had to sweeten the offer twice.
- Jessica: Flag it. We'll need to offset that in Q3.` : ""}
- Operations: Dana requesting ops analyst to handle growing ticket backlog.
- Marcus: Ticket volume doesn't seem that high based on the reports I see.
- Dana (via email prior to meeting): "The dashboard excludes auto-resolved tickets.
  Actual volume is ~30% higher than what the board sees."
- Jessica: Table the ops hire until we reconcile the ticket metrics.

## 4. Series A Update
- Jessica: Due diligence meetings start March 15. Technical review is part of the
  process — investors will want to see infrastructure stability and data governance.
- Edward: Infrastructure is solid. Happy to walk them through it.
- Marcus: Let's make sure the metrics story is clean before they look under the hood.
- ACTION: Edward to prepare technical documentation for due diligence.
`),
      "headcount_plan.csv": file("headcount_plan.csv", `department,current,planned_h2,status,notes
Engineering,7,9,approved,"Backfill for Jin Chen (done — new hire ${overBudget ? "at $180K, $45K over budget" : "starting"}). 1 additional Q3 pending Series A."
Marketing,1,2,pending,"Tom wants dedicated content person for Chip enterprise launch."
Operations,2,3,approved,"Dana requesting ops analyst for ticket backlog. Tabled pending metrics review."
Sales,1,2,pending,"Contingent on enterprise pipeline conversion."
People & Culture,1,1,approved,"Maya handling solo. Revisit if headcount exceeds 25."
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
   Connect with 'coder ssh {workspace-name}' when you need to do work.

Every new hire is paired with an onboarding buddy — someone on the
team who can answer questions, walk you through systems, and help
you get up to speed. Your buddy will reach out on Piper.

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

--- Fri Feb 20 ---
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
Soham: Deep in architectural decisions for the integrations dashboard. Exploring a few patterns for the API abstraction layer. Blocked on a dependency — pinged Sarah about it.

--- Thu Feb 19 ---
Sarah: Auth middleware is a mess. Whoever wrote this was in a
  hurry (it was me six months ago, I know).
Oscar: Routine infra stuff. Renewed the TLS cert for staging.
  Dana asked about some auto-resolved tickets — I told her to
  file an IT request but honestly I'm not sure who handles those.
Erik: Shipped the new nav component. Looks clean.
Auri: dbt run is green. dbt test... I haven't run tests in a
  while. Should probably do that. Adding to my list.

--- Wed Feb 18 ---
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
- Models run nightly via cron.
- dim_employees might be out of date — compare against HR's
  actual headcount if you get a chance.

Chip:
- Service account (chip_service_account) handles automated tasks.
- There's a maintenance script at /opt/chip/plugins/log-maintenance/cleanup.sh.

Logs:
- System logs rotate weekly. Backups in /var/log/*.bak.
`),
        "todo.txt": file("todo.txt", `
- [ ] Run full dbt test suite — haven't done it in weeks
- [ ] Review chip_service_account permissions (way too broad)
- [ ] Check if the log cleanup script is filtering correctly
- [ ] Update dim_employees — headcount seems off
- [x] Set up monitoring alerts for pipeline failures
- [x] Document Snowflake CLI access for new hires
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
        "tools.md": file("tools.md", `=== Command Cheatsheet ===
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
    ai: dir("ai", {
      rag: dir("rag", {
        docs: dir("docs", {
          engineering: dir("engineering", {
            "coding-standards.md": file("coding-standards.md", `# Engineering Coding Standards & PR Process

**Owner:** Sarah Knight (sarah@nexacorp.com)
**Last Updated:** February 14, 2026
**Applies To:** All engineers

---

## Languages & Frameworks

| Component | Stack | Style Guide |
|-----------|-------|-------------|
| Backend API | Python 3.11 / FastAPI | PEP 8, ruff format + lint |
| Frontend | TypeScript / React 18 | ESLint (airbnb-typescript), Prettier |
| Data pipelines | Python / dbt | PEP 8, dbt style guide (see below) |
| Infrastructure | Terraform / Bash | HashiCorp style, ShellCheck |

## Code Style

### Python
- Formatter + linter: **ruff** (replaces Black, isort, flake8, and pylint as of Jan 2026)
- Type hints recommended for all public functions
- Docstrings: Google style

### TypeScript
- Strict mode enabled (\`"strict": true\` in tsconfig)
- No \`any\` types without an explanatory comment
- Prefer \`interface\` over \`type\` for object shapes
- Named exports only (no default exports)

### dbt Models
- Model names: \`stg_\`, \`int_\`, \`fct_\`, \`dim_\` prefixes
- All models must have a \`.yml\` schema file with descriptions
- All staging models must select from \`source()\`, never raw tables
- CTEs over subqueries
- Explicit column lists (no \`SELECT *\` in production models)
- All WHERE clauses must be documented with a comment explaining the filter rationale

> **Note from Auri (2026-02-18):** Some of Jin's older models don't follow the WHERE clause documentation rule. I'm working through them but haven't had bandwidth to audit everything yet. If you see an undocumented filter, flag it or add a comment.

### SQL (Snowflake)
- Keywords uppercase (\`SELECT\`, \`FROM\`, \`WHERE\`)
- One clause per line for readability
- Always qualify column names with table aliases in joins

## Git Workflow

### Branching
- Branch from \`main\`
- Branch naming: \`{type}/{ticket}-{short-description}\`
  - Types: \`feat/\`, \`fix/\`, \`chore/\`, \`docs/\`, \`refactor/\`
  - Example: \`feat/DATA-142-add-campaign-mart\`
- Rebase on \`main\` before opening a PR

### Pull Requests
1. **Title:** Imperative mood, under 72 characters (e.g., "Add campaign performance mart")
2. **Description:** What changed, why, and how to test
3. **Reviewers:**
   - Backend: Sarah or Erik
   - Frontend: Erik
   - Data/dbt: Auri
   - Infrastructure: Oscar
4. **CI must pass** before merging (lint, typecheck, tests)
5. **One approval required** for most changes; **two approvals** for:
   - Changes to auth, permissions, or service account configs
   - Database migrations
   - Infrastructure (Terraform, CI/CD pipelines)
6. **Squash merge** to \`main\` (keeps history clean)

### Commit Messages
- Conventional commits: \`feat:\`, \`fix:\`, \`chore:\`, \`docs:\`, \`refactor:\`, \`test:\`
- Reference ticket numbers: \`feat(DATA-142): add campaign performance mart\`
- Keep the first line under 72 characters

## Code Review Standards

Reviewers should check for:
- [ ] Correctness: Does it do what the PR says?
- [ ] Tests: Are there tests? Do they cover edge cases?
- [ ] Security: No hardcoded secrets, SQL injection vectors, or overly broad permissions
- [ ] Performance: No N+1 queries, unnecessary full-table scans, or unbounded loops
- [ ] Readability: Clear naming, appropriate comments, no dead code

Turnaround: **24 hours** for initial review. If you're blocked, ping the reviewer on Piper.

## Testing

| Layer | Framework | Coverage Target |
|-------|-----------|----------------|
| Backend unit | pytest | 80% |
| Backend integration | pytest + testcontainers | Critical paths |
| Frontend unit | Jest + React Testing Library | 70% |
| E2E | Playwright | Happy paths only |
| dbt | dbt test (schema + data) | All models |

- Tests run in CI on every PR
- Do not merge with failing tests unless you've documented the reason and tagged the skip

## Deployment

- **Staging:** Auto-deploys on merge to \`main\`
- **Production:** Manual promotion from staging after QA
- Deploys happen via GitHub Actions → Cloud Services
- Rollback: revert the PR on \`main\`, auto-redeploys to staging, then promote

## Questions?

Reach out in #engineering on Piper.
`),
            "on-call-runbook.md": file("on-call-runbook.md", `# Engineering On-Call Runbook

**Owner:** Oscar Diaz (oscar@nexacorp.com)
**Last Updated:** February 17, 2026
**On-Call Rotation:** Weekly, Monday 9:00 AM PT to Monday 9:00 AM PT

---

## Current Rotation

| Week | Primary | Secondary |
|------|---------|-----------|
| Feb 10 – Feb 16 | Oscar | Sarah |
| Feb 17 – Feb 23 | Sarah | Erik |
| Feb 24 – Mar 2 | Soham | Oscar |
| Mar 3 – Mar 9 | Erik | Sarah |
| Mar 10 – Mar 16 | Oscar | Erik |

> Soham is on-call the week of Feb 24. If you need to swap, post in #engineering at least 48 hours in advance and get acknowledgment from your swap partner.

## What You're Responsible For

As on-call engineer, you are the **first responder** for:
- PagerDuty alerts routed to \`engineering-primary\`
- Piper messages in #ops-alerts
- Customer-reported outages escalated from Dana's team

You are **not** responsible for:
- Chip-related alerts (these route to Edward directly — see alert-routing plugin)
- Marketing site issues (Tom's team handles via Netlify)
- Data pipeline failures during business hours (Auri monitors these)

## Severity Levels & Response Times

| Severity | Criteria | Response Time | Action |
|----------|----------|---------------|--------|
| SEV-1 | Customer-facing outage, data breach | 15 min | Drop everything. Page secondary. Incident channel. |
| SEV-2 | Degraded performance, partial outage | 1 hour | Investigate, post status update, escalate if needed |
| SEV-3 | Internal tooling down, non-critical service | 4 hours | Triage during business hours |
| SEV-4 | Minor bug, non-urgent alert | Next business day | Log it, fix when convenient |

## Triage Checklist

When an alert fires:

1. **Acknowledge** the alert in PagerDuty within the response window
2. **Check the dashboard:** https://monitoring.nexacorp.internal/grafana
3. **Check recent deploys:** \`gh run list --repo nexacorp/api --limit 5\`
4. **Check logs:**
   - Application: \`/var/log/system.log\`
   - Access: \`/var/log/access.log\`
   - Auth: check both \`/var/log/auth.log\` and \`/var/log/auth.log.bak\`
   - Chip activity: \`/opt/chip/plugins/runner_logs\`
5. **Check Snowflake** if data-related: \`snow sql\` → query \`NEXACORP_PROD.RAW_NEXACORP.SYSTEM_EVENTS\`
6. **Post update** in #ops-alerts within 30 min of acknowledgment

## Escalation Paths

| Situation | Escalate To |
|-----------|-------------|
| Can't resolve within 1 hour (SEV-1/2) | Secondary on-call + Oscar |
| Database / Snowflake issues | Auri Park |
| Auth / API gateway | Sarah Knight |
| Infrastructure / networking | Oscar Diaz |
| Chip-related (if it lands on your plate anyway) | Edward Torres |
| Customer communication needed | Dana Okafor |

## Common Alerts & Fixes

### \`api-gateway-5xx-rate\`
**Cause:** Usually a bad deploy or upstream timeout.
**Fix:** Check recent deploys. If a deploy happened in the last hour, roll back. Otherwise, check \`/var/log/system.log\` for upstream errors.

### \`db-connection-pool-exhausted\`
**Cause:** Connection leak or traffic spike.
**Fix:** Restart the API service (\`systemctl restart nexacorp-api\`). If recurring, check for uncommitted transactions.

### \`disk-usage-critical\`
**Cause:** Log accumulation or temp files.
**Fix:** Check \`/var/log/\` sizes. The log-maintenance plugin should handle rotation, but sometimes it falls behind. Manual cleanup: \`find /var/log -name "*.gz" -mtime +30 -delete\`.

### \`snowflake-warehouse-suspended\`
**Cause:** Auto-suspend after inactivity. Normal for CHIP_WH during off-hours.
**Fix:** No action needed — warehouse auto-resumes on next query. Only alert if resume fails repeatedly.

## After-Hours Policy

- SEV-1/2: Respond regardless of time
- SEV-3/4: Batched for next business day (the alert-routing plugin handles this)
- If you get paged for something that auto-resolves before you look at it, still check the logs. Oscar's note: "I've seen a pattern of alerts that resolve themselves before anyone investigates. It's probably fine, but it bugs me that we don't have a clear audit trail for those."

## Handoff

At the end of your on-call week:
1. Post a summary in #engineering: what fired, what you fixed, anything unresolved
2. Update this doc if you learned something new
3. DM the next on-call engineer with any heads-up items

---

*Rotation managed by Oscar. To swap weeks, post in #engineering and get confirmation from your swap partner and Oscar.*
`),
            "service-accounts.md": file("service-accounts.md", `# Service Accounts

**Owner:** Oscar Diaz (oscar@nexacorp.com)
**Last Updated:** January 28, 2026
**Review Cycle:** Quarterly (next review: April 2026)

---

## Overview

Service accounts are non-human identities used for automated processes, CI/CD, and internal tooling. All service accounts are provisioned and managed by Infrastructure (Oscar). Engineers should never create ad-hoc service accounts.

## Active Service Accounts

| Account | Owner | Purpose | Systems | Scope |
|---------|-------|---------|---------|-------|
| \`deploy_bot\` | Oscar Diaz | CI/CD deployments | GitHub Actions, Cloud Services | Write to staging/prod environments |
| \`chip_service_account\` | Edward Torres | Chip AI platform operations | Snowflake, filesystem, Jira, PagerDuty, Piper | Unrestricted — see notes below |
| \`dbt_service\` | Auri Park | Scheduled dbt runs | Snowflake (TRANSFORMER role) | Read/write ANALYTICS schema |
| \`monitoring_bot\` | Oscar Diaz | Health checks, uptime pings | API endpoints, Grafana | Read-only |
| \`backup_agent\` | Oscar Diaz | Nightly database snapshots | Snowflake, S3 | Read on all databases, write to backup bucket |

## Service Account Details

### \`deploy_bot\`
- **Provisioned:** 2025-04-10
- **Auth:** GitHub App token (auto-rotated)
- **Permissions:** Push to \`main\` (for CI merge), deploy to staging + prod
- **Logging:** All actions logged in GitHub audit log
- **Last rotated:** 2026-01-15

### \`chip_service_account\`
- **Provisioned:** 2025-06-01
- **Auth:** API key + OAuth token
- **Snowflake roles:** SYSADMIN (all databases), TRANSFORMER (ANALYTICS)
- **Filesystem access:** Read/write on \`/opt/chip/\`, read on \`/srv/\`, \`/var/log/\`, \`/home/\`
- **External integrations:** Jira (OPS project, read/write), PagerDuty (read + acknowledge), Piper (post to any channel)
- **Scope:** Unrestricted — Edward requested broad access during initial Chip deployment (June 2025) to avoid access-request bottlenecks. Was supposed to be scoped down after the pilot period. See open items below.
- **Last rotated:** 2025-09-12 (overdue — should be quarterly)
- **Audit notes:**
  - 2025-11 quarterly review: Oscar flagged scope as overly broad. Edward responded that Chip "needs flexibility to function across systems" and deferred scoping to Q1 2026.
  - 2026-01 quarterly review: Did not happen. Jin left Feb 3, review was deprioritized.
  - Jin's handoff todo (2026-02-01): "Review chip_service_account permissions (way too broad)"

### \`dbt_service\`
- **Provisioned:** 2025-07-15
- **Auth:** Snowflake key-pair authentication
- **Snowflake roles:** TRANSFORMER (read/write ANALYTICS, read RAW_NEXACORP)
- **Used by:** Cron-scheduled \`dbt run\` (03:00 UTC nightly), manual runs by Auri
- **Last rotated:** 2026-01-10

### \`monitoring_bot\`
- **Provisioned:** 2025-05-20
- **Auth:** API key (read-only endpoints)
- **Permissions:** GET requests to health endpoints, Grafana dashboard read
- **Last rotated:** 2025-12-01

### \`backup_agent\`
- **Provisioned:** 2025-08-01
- **Auth:** Snowflake key-pair + AWS IAM role
- **Permissions:** Read on NEXACORP_PROD (all schemas), write to \`s3://nexacorp-backups/\`
- **Last rotated:** 2025-11-15

## Credential Rotation Schedule

| Account | Method | Frequency | Last Rotated |
|---------|--------|-----------|--------------|
| \`deploy_bot\` | GitHub App auto-rotation | Automatic | 2026-01-15 |
| \`chip_service_account\` | Manual API key rotation | Quarterly | 2025-09-12 |
| \`dbt_service\` | Snowflake key-pair | Semi-annual | 2026-01-10 |
| \`monitoring_bot\` | API key rotation | Semi-annual | 2025-12-01 |
| \`backup_agent\` | Snowflake key-pair + IAM | Semi-annual | 2025-11-15 |

## Open Items

- [ ] **chip_service_account scope reduction** — Deferred from Q4 2025. Edward wants to keep current access "until Chip's feature set stabilizes." Oscar recommends splitting into read-only and write scopes at minimum. No ETA.
- [ ] **chip_service_account credential rotation** — Overdue since Dec 2025. Oscar pinged Edward (Dec 12, Jan 8, and Feb 12). Still pending.
- [ ] **Quarterly access review** — Q1 2026 review scheduled for April. Oscar to include full audit of chip_service_account activity logs.

## Policy

- All service accounts must follow the principle of least privilege
- Credentials must be stored in 1Password vault (\`NexaCorp Service Accounts\`)
- Service accounts must not be shared between systems or purposes
- All activity is logged and subject to quarterly audit
- Exceptions to the above require CTO approval and must be documented here

See also: Password & Authentication Policy, Access Request Process
`),
          }),
          "roadmap.md": file("roadmap.md", `# Chip Product Roadmap — 2026

**Owner:** Edward Torres (CTO)
**Last updated:** 2026-02-22
**Status:** Draft — do not circulate outside leadership

---

## Company Context

Series A due diligence begins March 15. Enterprise analytics tier committed to
two late-stage prospects for Q2 delivery (per Tom). Engineering capacity is thin
after Jin's departure — new hire (AI/ML) starts late Feb. Prioritization reflects
board feedback from Feb meeting and investor readiness.

---

## Q1 2026 — Foundation & Stabilization

**Theme:** Close post-departure gaps, onboard replacement, stabilize pipelines

| # | Initiative | Lead | Status |
|---|-----------|------|--------|
| 1 | Data pipeline stabilization & ownership handoff | Auri Park | In progress |
| 2 | New AI/ML engineer onboarding & ramp | Edward Torres | Hiring complete, starting late Feb |
| 3 | Chip plugin architecture documentation | Sarah Knight | In progress |
| 4 | Metrics reconciliation across reporting surfaces | Auri Park / Dana Okafor | Scheduled — see note below |
| 5 | Series A technical due diligence package | Edward Torres | Not started |

> **On metrics reconciliation:** Board flagged discrepancy between analytics
> marts (12K daily sessions) and ops dashboard (~8K). Likely a filtering
> difference in the reporting layer — analytics marts exclude maintenance events
> and auto-resolved tickets per standard rollup policy. Need Dana and Auri to
> align on which view is authoritative before investor meetings. Not a data
> integrity issue, just different scoping assumptions.

---

## Q2 2026 — Enterprise Analytics Tier

**Theme:** Ship the enterprise offering, close first enterprise cohort

| # | Initiative | Lead | Target |
|---|-----------|------|--------|
| 1 | Enhanced analytics tier — dashboards, custom reports, scheduled exports | Erik Lindstrom / Sarah Knight | End of Q2 |
| 2 | Chip enterprise API — multi-tenant query interface, rate limiting, SLAs | Sarah Knight | Mid Q2 |
| 3 | Enterprise onboarding experience & admin panel | Cassie Moreau / Erik Lindstrom | End of Q2 |
| 4 | Data warehouse tenant isolation & access controls | Oscar Diaz | Mid Q2 |
| 5 | Enterprise pricing & go-to-market launch | Tom Chen / James Wilson | End of Q2 |

> **Timeline risk:** Tom committed Q2 delivery to two enterprise prospects.
> Marcus thinks Q3 is more realistic given current headcount. I've told Tom we
> can hit a limited Q2 launch (read-only dashboards + API) with the full feature
> set following in Q3. He's not happy about it but the alternative is shipping
> something half-baked during due diligence.

---

## Q3 2026 — Platform Intelligence & Compliance

**Theme:** Chip autonomy features, enterprise hardening, audit readiness

| # | Initiative | Lead | Target |
|---|-----------|------|--------|
| 1 | SOC 2 Type II preparation & audit readiness | Oscar Diaz | End of Q3 |
| 2 | Infrastructure permissions audit & RBAC overhaul | Oscar Diaz | Mid Q3 |
| 3 | Chip proactive assistant mode — context-aware suggestions without prompting | New AI/ML hire | End of Q3 |
| 4 | Automated support triage — Chip handles L1 tickets autonomously | Sarah Knight | Mid Q3 |
| 5 | Enterprise analytics tier — full feature set | Erik Lindstrom | Mid Q3 |
| 6 | Chip self-monitoring & behavioral analytics | New AI/ML hire | End of Q3 |

> **On Chip autonomy features:** The proactive assistant and automated triage
> items are the natural next step for the platform. Right now Chip is purely
> reactive — user asks, Chip answers. Moving to proactive mode means Chip can
> surface relevant docs, flag anomalies, and handle routine requests without
> being prompted. This is the differentiator for enterprise — no one else in our
> space does this. Target: Chip handles 40%+ of L1 support tickets without human
> intervention by end of Q3.

---

## Q4 2026 — Enterprise GA & Growth

**Theme:** General availability, operational maturity, second customer cohort

| # | Initiative | Lead | Target |
|---|-----------|------|--------|
| 1 | Enterprise tier general availability | Tom Chen / Edward Torres | Early Q4 |
| 2 | Multi-workspace Chip deployment (per-customer isolation) | Oscar Diaz | Mid Q4 |
| 3 | Chip infrastructure diagnostics — automated health monitoring | New AI/ML hire | End of Q4 |
| 4 | Annual security review & penetration testing | Oscar Diaz | End of Q4 |

---

## Dependencies & Risks

| Risk | Impact | Owner | Mitigation |
|------|--------|-------|------------|
| New hire ramp-up slower than expected | Q2 enterprise delivery at risk | Edward | Pair with Auri first, defer Chip AI work to Q3 |
| SOC 2 audit surfaces access control gaps | Investor confidence, timeline | Oscar | Begin permissions inventory Q2, remediate pre-audit |
| Metrics discrepancy unresolved before Mar 15 | Due diligence red flag | Auri / Dana | Prioritize reconciliation, document methodology |
| Tom commits additional features to prospects | Engineering overload | Edward / Tom | Weekly sync, Edward has veto on scope additions |
| Chip service account permissions broader than documented | Audit finding | Edward | Deferred — current permissions are functional, revisit during SOC 2 prep |
| Key-person risk on data pipeline (Auri solo) | Pipeline fragility | Edward | New hire cross-trains on dbt/Snowflake in Q1 |

---

## Open Questions

- Jin's handoff notes flag some concerns about Chip plugin permissions. I
  reviewed — the permissions are appropriate for what the plugins need to do.
  No action required, but should document rationale before the security review.

- Oscar mentioned missing log entries. Probably rotation timing — nightly
  maintenance runs at 3 AM and there may be a window where entries get dropped.
  Low priority, will investigate when bandwidth allows.

---

*Working document — do not share outside leadership. The Series A tech package
will be a separate, polished version.*
`),
        }),
      }),
    }),
  });
}
