you're absolutely right!
Be careful who you trust here

Do you have any questions for me? 

Edward: I asked Oscar to just copy Jin's security over to you. Let Oscar know if you need any additional security for your work. Don't want any blockers.

alias
    ll='ls -la'
    ..='cd ..'
    df='df -h'
    up='sudo apt update && sudo apt upgrade'
 
RAG quest - outdated docs, bad data, 
    RAG data: PTO, HR policies, IT procedures, internal playbooks, product docs, wikis, databases (snowflake)
             regulatory guidance, audit materials, and transaction context to support reporting and compliance questions.
    External/customer data in snowflake?
    Terminal angles:
        Inspect the full context passed to the LLM: grep -A 50 "prompt=" logs/app.log | head -n 200 
        Find and inspect raw documents:  find ./data -name "*.txt" -o -name "*.pdf" -o -name "*.md"
        Endpoint for /health or /ready:
            curl -X GET http://localhost:8081/v1/health | jq
            curl -X GET http://localhost:1976/v1/health/ready | jq

Edward asks user who is suspicous, Sarah or Erik or Nobody?
    (Bad ending) Sarah/Nobody is chosen, Sarah and Edward are fired, Erik takes over as CTO
    (Good ending) Erik is chosen, Erik and Edward are fired, Sarah takes over as CTO
    Omni-Z buyout, they rebranded from ScrollSphere like 2 years ago but people still call it ScrollSphere

note about deleting old data to keep snowflake bill cheap
note about solem not performing, pip
journal
Slippery slope, bad guy used chip's permissions slowly and it escalated
dynamic growth on logs after day to day progression
make auto_apply.py realistic

chmod to give chip security
Day 0 - source 
    setup alias=
        filter out companies you've applied to in auto_apply 


 - echo $VAR expansion in interactive commands (requires input pipeline changes)
 - unset command: removes shell variables or functions from the current session.
 - export FOO=bar

mart-layer report (rpt_customer_summary or dim_customers)
du
    Basic usage
    du alone: shows disk usage of the current directory and all subdirectories (in blocks, usually 1 KB).
    du /path/to/dir: shows usage for that specific directory and its subdirectories.

    Common useful options
    du -h: shows sizes in human‑readable units like K, M, G (e.g., 4.2M).
    du -sh .: shows only the total size of the current directory (summary).
    du -a: shows every file and directory, not just directories.
    du -m or du -k: forces output in MB or KB blocks.

$ echo "Hello World"            # print to screen
$ echo "Hello" > output.txt     # write to file (overwrites)
$ echo "More" >> output.txt     # append to file

$ grep "error" app.log                  # find lines containing "error"
$ grep -i "error" app.log               # case-insensitive
$ grep -r "TODO" ./src                  # search recursively through all files in src/
$ grep -n "error" app.log               # show line numbers
$ grep -v "debug" app.log               # show lines that do NOT match

$ find . -name "*.log"                      # find all .log files from here
$ find /var/log -name "*.log" -mtime -7     # logs modified in last 7 days
$ find . -type d -name "node_modules"       # find directories named node_modules
$ find . -size +100M                        # files larger than 100MB

$ curl https://api.github.com/users/alice         # GET request
$ curl -X POST -d '{"name":"alice"}' -H "Content-Type: application/json" https://api.example.com/users

Day 2: 
    df command 
    printenv

Check dataset sizes: ls -lh /data/training_set/
Count dataset records: wc -l dataset.csv
Preview data structures: head -n 10 dataset.csv

tmux new -s data_processing

git clone git@github.com:company/ai-models-repo.git
git checkout -b fix/data-pipeline-null-values # Create a new branch
git commit -m "Fix null handling in the preprocessing script"
git push origin fix/data-pipeline-null-values
> git clone, checkout -b, commit -m, push origin

Data Audit Basics (Auri, onboarding) "Before we run anything, let's sanity-check the datasets"
  
  ┌──────────────────────────────────┬───────────────────────────┬───────────────────────────────────┐
  │               Task               │          Command          │              Teaches              │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Check dataset sizes              │ ls -lh /srv/data/exports/ │ -l long format, -h human-readable │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Count records in CSV             │ wc -l customers.csv       │ wc -l line counting               │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Preview column headers           │ head -n 1 customers.csv   │ head -n limiting output           │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Check last export timestamp      │ tail -n 3 export_log.txt  │ tail for end-of-file              │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Find empty/corrupt files         │ find /srv/data/ -empty    │ find with -empty predicate        │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Verify row counts match manifest │ wc -l *.csv               │ wc on multiple files (glob)       │
  └──────────────────────────────────┴───────────────────────────┴───────────────────────────────────┘


Tier 1 — pwd, ls (with -l, -a flags), cd (with ., .., ~, absolute/relative paths), cat, echo, mkdir, touch, cp, mv, rm, clear, and man/--help. 
Tier 2 — grep (with -r, -i, -n), find (with -name, -type), head/tail, less, wc, sort, uniq, chmod, pipes (|), I/O redirection (>, >>, <), Ubuntu history, which, and alias. chain grep | sort | uniq -c | sort -n to find anomalies.
Tier 3 — curl/wget, tar/gzip, ssh, ps/kill, df/du, sed/awk, xargs, ln, and env/export


Phase 1: explicit instructions ("Type ls to see what's in this directory"). 
Phase 2: contextual hints ("Something seems hidden here..." → player must recall ls -a). 
Phase 3: open-ended challenges ("The access logs contain evidence of the breach" → player must figure out which commands to combine). 

Narrative context creates durable memory. "Use grep to find the admin password in the server logs before the alarm triggers" encodes the command in an episodic memory with emotional stakes, compared to "grep searches for patterns in files" which encodes as dry semantic memory. 
Validate results, not keystrokes. The game should check whether the player's command would produce the correct output given the virtual filesystem state — not just string-match against an expected command. If the challenge is "find the hidden file," accept ls -a, ls -la, find . -name ".*", or any other valid approach. This teaches problem-solving rather than rote memorization and mirrors how real terminal usage works.


cron jobs:
- A cron job runs `scripts/reindex_nightly.py` at 02:00 UTC 
- **Cron jobs:** Check `/var/log/cron.log` for unexpected scheduled tasks


Environment variables in ~/.zshrc or ~/.bashrc (CHIP_API_URL, CHIP_TOKEN) 

- The Series A blackout date (March 10-21) ties into the game's timeline where due diligence starts March 15.


Performance
- Chrome DevTools Performance tab: Record a session of rapid command typing and look for long tasks (>50ms) on the main thread. Focus on the localStorage serialization.
- React DevTools Profiler: Check for unnecessary re-renders in the component tree.
- performance.mark()/performance.measure(): Add timing around processDeliveries() and the persist partialize function to get real numbers.
- Lighthouse: Run on the deployed build for initial load metrics.
- Memory tab: Take heap snapshots before and after 50+ commands to check for memory leaks (especially VirtualFS old instances not being GC'd).



```sql
select
    campaign_name,
    coalesce(sum(impressions), 0) as total_impressions,
    coalesce(sum(clicks), 0) as total_clicks,
    coalesce(sum(conversions), 0) as total_conversions,
    coalesce(sum(spend), 0) as total_spend,
    round(coalesce(total_clicks, 0) * 100.0 / coalesce(sum(impressions), 0), 2) as click_rate,
    coalesce(round(coalesce(total_conversions, 0) * 100.0 / coalesce(sum(clicks), 0), 2), 2) as conversion_rate
from stg_raw_nexacorp__campaign_metrics
group by campaign_name
order by total_impressions desc
```


## dbt 

Auri Park (Data Engineer) — Owns the dbt project itself. 
    
  Mart Models — Auri builds, stakeholders own the requirements

  ┌──────────────────────────┬───────────────────────────────┬────────────────────────────────────────────────────────┐
  │          Model           │            Builder            │       Stakeholder (owns requirements/validation)       │
  ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
  │ dim_employees            │ Auri                          │ Maya Johnson (HR) — she'd define who's "active"        │
  ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
  │ rpt_employee_directory   │ Auri                          │ Maya Johnson — HR portal feed                          │
  ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
  │ fct_system_events        │ Auri                          │ Oscar Diaz (Infra) — observability/security            │
  ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
  │ fct_support_tickets      │ Auri                          │ Dana Okafor (Ops) — she tracks ticket resolution       │
  ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
  │ rpt_ai_performance       │ Jin Chen originally, now Auri │ Jin/Ren (AI Engineer) — ML model monitoring            │
  ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
  │ rpt_department_spending  │ Auri                          │ Dana Okafor / Marcus Reyes (Ops/COO) — budget tracking │
  ├──────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
  │ rpt_campaign_performance │ Auri                          │ Jordan Kessler (Growth Marketing) — campaign analytics │
  └──────────────────────────┴───────────────────────────────┴────────────────────────────────────────────────────────┘

  Custom Test Assertions — Cross-functional

  ┌────────────────────────────────────┬───────────────────────────────────────────────────┐
  │                Test                │           Who provided the requirement            │
  ├────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ assert_employee_count (expects 15) │ Maya Johnson — "HR confirmed 15 active employees" │
  ├────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ assert_no_future_hire_dates        │ HR data quality (Maya)                            │
  ├────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ assert_no_negative_budgets         │ Finance/Ops (Dana/Marcus)                         │
  ├────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ assert_valid_ticket_priorities     │ Dana Okafor — she'd define valid priority levels  │
  ├────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ assert_all_tickets_in_directory    │ Referential integrity — Auri's own quality check  │
  └────────────────────────────────────┴───────────────────────────────────────────────────┘

    CUSTOMERS table schemas.RAW_NEXACORP.tables 

     ┌─────────────┬──────────────────────────┬────────────┬─────────────┬──────────────┬───────────────────────┬─────────┬────────────────────┬─────────────────┐
     │ CUSTOMER_ID │       COMPANY_NAME       │  INDUSTRY  │ SIGNUP_DATE │  PLAN_TIER   │ ANNUAL_CONTRACT_VALUE │ STATUS  │ LAST_ACTIVITY_DATE │ ACCOUNT_MANAGER │
     ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
     │ C001        │ Willow Health Systems    │ Healthcare │ 2025-06-15  │ enterprise   │ 280000                │ active  │ 2026-03-25         │ James Wilson    │
     ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
     │ C002        │ Vanguard Health          │ Healthcare │ 2025-08-01  │ professional │ 95000                 │ active  │ 2026-03-27         │ James Wilson    │
     ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
     │ C003        │ Pinnacle Financial Group │ Finance    │ 2025-09-20  │ enterprise   │ 320000                │ active  │ 2026-03-28         │ James Wilson    │
     ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
     │ C004        │ FireCoin                 │ Finance    │ 2025-11-10  │ starter      │ 25000                 │ churned │ 2026-02-14         │ James Wilson    │
     ├─────────────┼──────────────────────────┼────────────┼─────────────┼──────────────┼───────────────────────┼─────────┼────────────────────┼─────────────────┤
     │ C005        │ Ascend Crypto            │ Finance    │ 2026-01-05  │ professional │ 110000                │ active  │ 2026-03-26         │ James Wilson    │
     └─────────────┴──────────────────────────┴────────────┴─────────────┴──────────────┴───────────────────────┴─────────┴────────────────────┴─────────────────┘