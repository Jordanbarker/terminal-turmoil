# Chapter 2: "First Day"

### NexaCorp Commands

Commands unlock through colleague emails and Piper conversations:

**Always available** (24): `ls`, `cd`, `cat`, `pwd`, `clear`, `help`, `mail`, `nano`, `save`, `load`, `newgame`, `history`, `python`, `whoami`, `hostname`, `date`, `which`, `man`, `file`, `tree`, `mkdir`, `rm`, `mv`, `cp`, `touch`, `echo`, `ssh`

**After `piper_unlocked`** (read Edward's welcome email): `piper`
**After `chip_unlocked`** (read Chip's intro email): `chip`
**After `search_tools_unlocked`** (accept Oscar's log task on Piper): `grep`, `find`, `diff`
**After `inspection_tools_unlocked`** (accept Auri's inspection task on Piper): `head`, `tail`, `wc`
**After `processing_tools_unlocked`** (accept Oscar's access.log task on Piper): `sort`, `uniq`
**After `coder_unlocked`** (read Oscar's coder setup email): `coder`
**After `chmod_unlocked`** (accept Dana's ops task on Piper): `chmod`
**After `devcontainer_visited`** (enter dev container via `coder ssh ai`): `dbt`, `snow`

**Multi-terminal tabs** unlock alongside search tools (`tabs_unlocked` set by `search_tools_accepted`)

### Home PC Commands (after returning home)

**After `returned_home_day1`**: `grep`, `find`, `wc`, `sort`, `uniq`, `head`, `tail`, `diff`

## Full Narrative Flowchart

```
                          +==============================+
                          |          CHAPTER 2            |
                          |         "First Day"           |
                          +==============+===============+
                                         |
                   +=============================================+
                   |          ACT 1: ARRIVAL AT NEXACORP         |
                   +======================+======================+
                                          |
                                 NexaCorp filesystem boot sequence
                                          |
                   +----------+-----------+-----------+
                   v          v           v           v
            +-----------+ +---------+ +---------+ +----------+
            | IMMEDIATE | | IMMEDI- | | IMMEDI- | | IMMEDI-  |
            | EMAILS    | | ATE     | | ATE     | | ATE      |
            +-----------+ | EMAIL   | | EMAIL   | | PIPER    |
            | welcome_  | +---------+ +---------+ +----------+
            | edward    | | it_     | | chip_   | | #general |
            |           | | provis- | | intro   | | welcome  |
            |           | | ioned   | |         | | + Tom's  |
            |           | |         | |         | | wins     |
            +-----+-----+ +----+----+ +----+----+ +----------+
                  |             |           |
                  v             v           v
            [read welcome] [read IT]  [read chip_intro]
            sets flag:     triggers:  sets flag:
            piper_unlocked            chip_unlocked
            +                         +
            | jessica_welcome email   | eng_sarah_welcome Piper
            | tom_welcome email       | cassie_dm_product Piper
            |              |          |
            |        maya_welcome email
            |        maya_dm_welcome Piper
            |
            v
                   +=============================================+
                   |        ACT 2: EDWARD'S ONBOARDING           |
                   +======================+======================+
                                          |
                            read_welcome_email completed
                            (piper_unlocked set)
                                          |
                          +---------------+---------------+
                          |                               |
                          v                               v
                 auri_hello Piper DM             edward_onboarding
                 (immediately)                   group visible
                 meet_auri + help_auri_                   |
                 inspect visible                          |
                          |                    +----------+----------+
                          |                    v                     v
                  Phase 1:              +----------------+   +----------------+
                  auri_ls_data,         | read_onboarding|   | meet_the_team  |
                  auri_check_todo       | read           |   | read           |
                          |             | onboarding.md  |   | team-info.md   |
                          |             +-------+--------+   +-------+--------+
                  [reply to Auri]               |                    |
                          |          +----------+--------+   +-------+--------+
                          v          v          v        v   v       v        v
                   inspection_  oscar_     oscar_   dana_ edward_ eng_code_
                   tools_       coder_     log_     welc- handoff review_
                   unlocked     setup      check    ome   suggest debate
                   (head/tail/  email      Piper DM Piper ion     Piper
                    wc)              |          |   DM    email
                          |          v          v
                  Phase 2:     [read email] [reply to
                  auri_use_head coder_      Oscar]
                  auri_use_tail unlocked         |
                  auri_use_wc                    v
                          |              search_tools_
                          |              unlocked
                          |              + tabs_unlocked
                          |              (grep/find/diff)
                          |                    |
                          v                    v

                   +=============================================+
                   |       ACT 3: OSCAR'S LOG INVESTIGATION      |
                   +======================+======================+
                                          |
                            help_oscar_logs visible
                            (after read_onboarding)
                                          |
              +---------------------------+---------------------------+
              v                           v                           v
     +----------------+         +----------------+          +----------------+
     | oscar_search_  |         | oscar_check_   |          | oscar_diff_    |
     | logs           |         | backups        |          | logs           |
     | grep system.log|         | read .bak file |          | diff the logs  |
     +-------+--------+         +-------+--------+          +----------------+
             |                          |
             v                          v
      [read system.log]         [read system.log.bak]
             |                          |
             v                          +----> sarah_dm_mystery Piper
      oscar_access_review                      (investigation hint)
      Piper DM
             |
      +------+------+
      v             v
   [nothing      [diffed logs]
    weird]       (requires
      |           discovered_log_
      v           tampering)
   oscar_log_        |
   normal            v
   Piper         oscar_log_
      |          tampered
      v          Piper
   access.log       |
   task             v
      |          access.log
      |          task
      +------+------+
             |
             v
      [reply to Oscar]
             |
             v
      processing_tools_unlocked
      (sort/uniq)
             |
             v
      report_to_oscar visible
      (player reads access.log,
       e.g. sort /var/log/access.log | uniq -c)
             |
             v
      oscar_access_followup(_tampered)
      Piper DM — Oscar reacts to findings
             |
      +------+------+
      v             v
   [flagged     [nothing
    SSH keys]   concerning]
      |             |
      +------+------+
             |
             v
      oscar_access_reported
      (quest complete)
             |
             v
      oscar_access_reaction
      Piper DM — Oscar escalates to Sarah
             |
      +------+------+------+
      v             v      v
  dana_ops_    jordan_  soham_dm_
  dashboard    market-  welcome
  Piper DM     ing_    Piper DM
      |        data         |
      v        Piper DM  maya_dm_
  [reply]          |     checkin
      |            |     Piper DM
      v            |
  dana_ops_        |
  accepted         |
      |            |
  +---+---+        |
  v       v        |
chmod_  auri_      |
unlock  chmod_     |
ed      help       |
        Piper DM   |
                   |
                   v

                   +=============================================+
                   |         ACT 4: AURI'S DATA PIPELINE         |
                   +======================+======================+
                                          |
                            meet_auri visible
                            (after piper_unlocked)
                                          |
                   +-----------+----------+
                   v                      |
          +----------------+              |
          | help_auri_     |              |
          | inspect        |              |
          | (head/tail/wc  |              |
          |  on CSV)       |              |
          +-------+--------+              |
                  |                       |
          +-------+--------+             |
          v       v        v             |
       auri_   auri_    auri_            |
       use_    use_     use_             |
       head    tail     wc               |
                                         |
                  |                       |
                  v                       |
          +----------------+              |
          | review_handoff |              |
          | read chen-     |              |
          | handoff/notes  |              |
          +-------+--------+              |
                  |                       |
          +-------+---------+             |
          v       v         v             |
       edward_  auri_    maya_dm_          |
       paranoid pipeline handoff           |
       email    _help    Piper DM          |
                Piper DM                   |
                  |                        |
                  v                        |
          [reply to Auri]                  |
                  |                        |
                  v                        |
          pipeline_tools_accepted          |
                  |                        |
                  v                        |
          +----------------+               |
          | help_auri_     |               |
          | pipeline       |               |
          +-------+--------+               |
                  |                        |
                  v                        |
          +--------------------+           |
          | run_dbt            |           |
          | coder ssh ai →     |           |
          | chip (clone repo) →|           |
          | dbt build          |           |
          +--------+-----------+           |
                   |                       |
                   +-----------------------+
                   |
                   v
            ran_dbt flag set
            meet_auri completed
                   |
                   v

                   +=============================================+
                   |            ACT 5: END OF DAY                |
                   +======================+======================+
                                          |
                            edward_end_of_day email
                            delivered (after dbt/ran_dbt)
                                          |
                                  [read email]
                                  read_end_of_day
                                          |
                                  head_home visible
                                          |
                                  [exit from NexaCorp]
                                          |
                            +-------------+-------------+
                            | runExitToHome()           |
                            | - logs off NexaCorp       |
                            | - rebuilds home FS        |
                            | - sets returned_home_day1 |
                            | - completes head_home     |
                            +-------------+-------------+
                                          |
                            +-------------+-------------+
                            v                           v
                     alex_day1_              olive_power_tools_
                     checkin                 intro
                     Piper DM               Piper DM
                     (how was it?)          (round 2?)
                                                  |
                                                  v
                                          olive_power_tools_read
                                          Quest 4 visible
```

## Investigation Paths (Optional)

These optional objectives allow the player to discover evidence of Chip's autonomous behavior:

```
  +==========================================+
  |        INVESTIGATION THREADS             |
  +==========================================+

  explore_jchen ──── Read system.log.bak (found_backup_files)
       |
       +─── discover_tampering ── diff live vs bak logs
       |                          (discovered_log_tampering)
       |
       +─── find_directives ───── read /opt/chip/directives.conf
                                  (found_chip_directives)

  find_filtering ─── Read dbt model files in dev container
       |              (prerequisite: run_dbt completed)
       |              found_data_filtering set by reading:
       |              - models/marts/dim_employees.sql
       |              - models/marts/fct_tickets.sql
       |              - models/staging/chip_ticket_suppression.sql
       |              - models/staging/chip_log_filter.sql
       |              - models/staging/chip_data_cleanup.sql
       |
  investigate_ops_data ── Read /srv/operations/ops_incidents.csv
                          (visible after dana_ops_accepted)
  report_dana_ops ─────── Report findings to Dana via Piper reply
                          (visible after read_ops_incidents)

  sarah_dm_mystery ──── Triggered by reading system.log.bak
                        (Sarah hints at chip_service_account anomalies)
```

## Objectives Summary

| Objective | Type | Completion Condition | Visible When |
|-----------|------|---------------------|--------------|
| `read_welcome_email` | **required** | `piper_unlocked` flag | always |
| `edward_onboarding` | **required**, group | all children complete | `read_welcome_email` completed |
| `read_onboarding` | hidden, child | `read_onboarding` flag | `read_welcome_email` completed |
| `meet_the_team` | hidden, child | `read_team_info` flag | `read_welcome_email` completed |
| `help_oscar_logs` | hidden | `oscar_searched_logs` flag | `read_onboarding` flag |
| `meet_auri` | hidden | `ran_dbt` flag | `piper_unlocked` flag |
| `help_auri_inspect` | hidden, child | all visible children | `piper_unlocked` flag |
| `auri_ls_data` | hidden, optional, child | `auri_listed_handoff` flag | `piper_unlocked` flag |
| `auri_check_todo` | hidden, optional, child | `auri_read_todo` flag | `piper_unlocked` flag |
| `review_handoff` | hidden, child | `read_handoff_notes` flag | `inspection_tools_accepted` completed |
| `help_auri_pipeline` | hidden, child | `pipeline_tools_accepted` objective | `read_handoff_notes` flag |
| `run_dbt` | hidden, child | `ran_dbt` flag | `help_auri_pipeline` completed |
| `head_home` | hidden | `returned_home_day1` flag | `read_end_of_day` flag |
| `report_to_oscar` | hidden | `oscar_access_reported` objective | `processing_tools_accepted` objective |
| `explore_jchen` | hidden, optional | `found_backup_files` flag | always |
| `discover_tampering` | hidden, optional | `discovered_log_tampering` flag | prereq: `explore_jchen` |
| `find_directives` | hidden, optional | `found_chip_directives` flag | prereq: `explore_jchen` |
| `find_filtering` | hidden, optional | `found_data_filtering` flag | prereq: `run_dbt` |
| `investigate_ops_data` | hidden, optional | `read_ops_incidents` flag | `dana_ops_accepted` objective |
| `report_dana_ops` | hidden, optional | `dana_ops_reported` objective | `read_ops_incidents` flag |

### Quest Groups

| Quest | Trigger | Sub-objectives |
|-------|---------|---------------|
| Edward's Onboarding | `read_welcome_email` completed | read_onboarding, meet_the_team |
| Help Oscar with Logs | `read_onboarding` flag | oscar_search_logs, oscar_check_backups, oscar_diff_logs |
| Meet Auri / Pipeline | `piper_unlocked` flag | help_auri_inspect → review_handoff → help_auri_pipeline → run_dbt |
| Help Auri Inspect | `piper_unlocked` flag | auri_ls_data, auri_check_todo (Phase 1) + auri_use_head, auri_use_tail, auri_use_wc (Phase 2) |
| Explore Jin Chen | `found_backup_files` flag | discover_tampering, find_directives |
| Olive's Power Tools | `olive_power_tools_read` flag (home, post-return) | grep → wc → redirect → sort+uniq → find |

### Command Unlock Chain

```
read welcome_edward ──→ piper
read chip_intro ──────→ chip
read oscar_coder_setup → coder
reply to Oscar (logs) → grep, find, diff + multi-tabs
reply to Auri (CSV) ──→ head, tail, wc
reply to Oscar (access) → sort, uniq
reply to Dana (ops) ──→ chmod
coder ssh ai ─────────→ dbt, snow (in dev container + NexaCorp)
exit to home ─────────→ grep, find, wc, sort, uniq, head, tail, diff (at home)
```

### Email Delivery Chain

```
IMMEDIATE: welcome_edward, it_provisioned, chip_intro

welcome_edward read ──→ jessica_welcome, tom_welcome
it_provisioned read ──→ maya_welcome
onboarding.md read ───→ oscar_coder_setup
team-info.md read ────→ edward_handoff_suggestion (requires maya_welcome delivered)
chen-handoff/notes read → edward_paranoid
ran_dbt / dbt command ─→ edward_end_of_day
```

### Piper Delivery Chain

```
IMMEDIATE (NexaCorp): general_edward_welcome, general_tom_wins

chip_intro read ──────→ eng_sarah_welcome, cassie_dm_product
it_provisioned read ──→ maya_dm_welcome
onboarding.md read ───→ oscar_log_check, dana_welcome
welcome_edward read ──→ auri_hello
team-info.md read ────→ eng_code_review_debate
chen-handoff/notes read → auri_pipeline_help, maya_dm_handoff
system.log read ──────→ oscar_access_review (requires oscar_log_check)
system.log.bak read ──→ sarah_dm_mystery

search_tools_accepted ──→ (triggers via reply)
  oscar_logs_normal ────→ oscar_log_normal → processing task
  oscar_logs_tampered ──→ oscar_log_tampered → processing task
access.log read ──────────→ oscar_access_followup (requires oscar_log_normal)
                            oscar_access_followup_tampered (requires oscar_log_tampered)
oscar_access_reported ────→ oscar_access_reaction
processing_tools_accepted → dana_ops_dashboard, jordan_marketing_data,
                            soham_dm_welcome, maya_dm_checkin
pipeline_tools_accepted ─→ (triggers via reply)
dana_ops_accepted ───────→ auri_chmod_help

AFTER RETURN HOME:
returned_home_day1 ──→ alex_day1_checkin, olive_power_tools_intro
```

### Notes

- **`pipeline_tools_unlocked` is vestigial**: declared in `storyFlags.ts` but never set by any trigger. `dbt`/`snow` are gated by `devcontainer_visited` instead, which is set when entering the dev container.
- **`coder_unlocked` is set twice**: first by reading `oscar_coder_setup` email (story flag trigger), then redundantly by the `pipeline_tools_accepted` EVENT_ACTION. The email trigger always fires first.
- **Oscar's investigation branches**: the player sees different Oscar dialogue based on whether they discovered the log tampering. Both paths converge on the `processing_tools_accepted` event and `sort`/`uniq` unlock.
- **Dev container flow**: `coder ssh ai` triggers the Coder transition animation. Inside, the player runs `chip` to clone the dbt project, then `dbt build` to run the pipeline. `exit` returns to NexaCorp.
