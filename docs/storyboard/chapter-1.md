# Chapter 1: "New Beginnings"

### Home PC Commands

Commands unlock progressively through Piper conversations and exploration:

**Always available** (14): `ls`, `cd`, `cat`, `pwd`, `clear`, `help`, `mail`, `nano`, `piper`, `save`, `load`, `newgame`, `history`, `python`

**After `basic_tools_unlocked`** (reply to Olive's linux basics on Piper): `mkdir`, `rm`, `mv`, `cp`, `touch`, `echo`, `whoami`, `hostname`, `date`, `which`, `man`, `file`

**After `apt_unlocked`** (Olive's tree tip delivered on Piper): `sudo`, `apt`

**Individual gates:**
- `pdftotext` — visit ~/Downloads or read a PDF file (`pdftotext_unlocked`)
- `tree` — run `apt install tree` (`tree_installed`)
- `ssh` — read Chip's SSH setup email (`ssh_unlocked`)

## Full Narrative Flowchart

```
                          ╔══════════════════════╗
                          ║     CHAPTER 1        ║
                          ║  "New Beginnings"    ║
                          ╚══════════╤═══════════╝
                                     │
                   ╔═════════════════════════════════════╗
                   ║          ACT 1: HOME PC             ║
                   ╚═════════════════╤═══════════════════╝
                                     │
                             ┌───────┴───────┐
                             │  Terminal      │
                             │  boots, opens  │
                             │  nano with     │
                             │  tutorial file │
                             └───────┬───────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
          ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
          │  IMMEDIATE   │  │  IMMEDIATE   │  │  IMMEDIATE   │
          │  EMAILS      │  │  PIPER DMs   │  │  PIPER CHANS │
          ├─────────────┤  ├──────────────┤  ├──────────────┤
          │ job_board    │  │ alex_checkin  │  │ #openclam    │
          │  _alert      │  │ (dm_alex)    │  │  _history    │
          │ cron_backup  │  │ olive_linux  │  │ #bubble      │
          │  _failure    │  │  _basics     │  │  _buddies    │
          │ nexacorp     │  │ (dm_olive)   │  │  _history    │
          │  _offer      │  │              │  │              │
          └──────┬───────┘  └──────┬───────┘  └──────────────┘
                 │                 │
                 │     ┌───────────┴────────────┐
                 │     ▼                        ▼
                 │  [reply to              [explore filesystem]
                 │   olive_linux_basics]     read personal files
                 │     │                        │
                 │     ▼                        ▼
                 │  basic_tools_unlocked    read_resume?
                 │  (13 commands)           pdftotext_unlocked?
                 │     ▼
                 │  olive_tree_tip
                 │  Piper delivered
                 │     │
                 │     ▼
                 │  apt_unlocked
                 │  (sudo, apt)
                 │
       ┌─────────┴──────────────────────────────────────────┐
       │           OPTIONAL OBJECTIVES                      │
       ├────────────────────────────────────────────────────┤
       │ explore_home ─── read any personal file            │
       │ check_piper ──── open Piper                        │
       │ run_auto_apply ─ run auto_apply.py                 │
       │ fix_backup ───── fix the cron backup script        │
       │                  (visible after reading cron email) │
       │ learn_linux_basics ── (auto-completes on unlock)   │
       └────────────────────────────────────────────────────┘

  ╔══════════════════════════════════════════════════════════════╗
  ║                    OPTIONAL QUESTS                           ║
  ╚═══════════════════════════╤══════════════════════════════════╝
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       ┌──────────────┐               ┌───────────────┐
       │ QUEST 1      │               │ QUEST 2       │
       │ Olive's      │               │ Fix & Extend  │
       │ Terminal     │               │ Backup        │
       │ Challenges   │               │               │
       ├──────────────┤               ├───────────────┤
       │ Visible when │               │ Visible when  │
       │ olive_       │               │ olive_backup  │
       │ challenge    │               │ _advice Piper │
       │ _file Piper  │               │ delivered     │
       │ delivered    │               │               │
       │              │               │ Requires:     │
       │ Sequential:  │               │ fix_backup    │
       │              │               │ completed     │
       │ 1. file      │               │               │
       │ 2. which     │               │ 1. mkdir      │
       │ 3. mkdir     │               │    ~/backups  │
       │ 4. mv        │               │ 2. cp scripts │
       │ 5. echo/pipe │               │ 3. read log   │
       │ 6. man       │               │ 4. verify     │
       │              │               │    backup     │
       └──────────────┘               └───────────────┘

                   ╔═════════════════════════════════════╗
                   ║       ACT 2: GETTING HIRED          ║
                   ╚═════════════════╤═══════════════════╝
                                     │
                             ┌───────┴───────┐
                             │ nexacorp_offer │
                             │ (seeded at     │
                             │  game start)   │
                             └───────┬───────┘
                                     │
                                     ▼
                          [read offer email]
                           sets flag:
                           read_nexacorp_offer
                           accept_offer visible
                                     │
                              ┌──────┴──────┐
                              │ reply to    │
                              │ Edward      │
                              └──────┬──────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                       [accept]             [reject]
                       $135K                    │
                          │              ┌──────┴──────────────┐
                          │              │ persuasion_1        │
                          │              │ ($155K + $5K bonus) │
                          │              └──────┬──────────────┘
                          │           ┌─────────┴─────────┐
                          │           ▼                   ▼
                          │        [accept]           [reject]
                          │           │                   │
                          │           │            ┌──────┴──────────────┐
                          │           │            │ persuasion_2        │
                          │           │            │ ($180K + $10K bonus)│
                          │           │            └──────┬──────────────┘
                          │           │         ┌─────────┴─────────┐
                          │           │         ▼                   ▼
                          │           │      [accept]         [final reject]
                          │           │      +salary_180k          │
                          │           │         │                  ▼
                          │           │         │         alex_good_news
                          │           │         │         email (CortexLab
                          │           │         │         alternative)
                          │           │         │                  │
                          │           │         │           ╔══════╧═══════╗
                          │           │         │           ║ CHAPTER 1    ║
                          │           │         │           ║ ENDS (fail)  ║
                          │           │         │           ╚══════════════╝
                          │           │         │
                          └───────────┴─────────┘
                                     │
                                     ▼

                   ╔═════════════════════════════════════╗
                   ║      ACT 3: SSH TRANSITION          ║
                   ╚═════════════════╤═══════════════════╝
                                     │
                          ┌──────────┴──────────┐
                          │ accepted_nexacorp    │
                          └──────────┬──────────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                   nexacorp_followup      chip_ssh_setup
                   (Edward: welcome)      (Chip: SSH details)
                          │                     │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌──────────────────┐
                          │ player reads     │
                          │ chip_ssh_setup   │
                          │ → ssh_unlocked   │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │ ssh nexacorp     │
                          └────────┬─────────┘
                                   │
                          ┌────────┴────────┐
                          │ host key prompt │
                          │ type "yes"      │
                          └────────┬────────┘
                                   │
                                   ▼
                            ssh_connect
                            event fires
                                   │
                                   ▼
                          runSshTransition()
                                   │
                          ┌────────┴────────┐
                          │ SSH animation   │
                          │ computer swap   │
                          │ NexaCorp boot   │
                          └────────┬────────┘
                                   │
                                   ▼
                            ╔══════════════╗
                            ║  CHAPTER 2   ║
                            ║  begins      ║
                            ╚══════════════╝
```

## Objectives Summary

| Objective | Type | Completion Flag / Objective | Visible When |
|-----------|------|---------------------------|--------------|
| `check_email` | **required** | `read_nexacorp_offer` | always |
| `accept_offer` | **required**, hidden | `accepted_nexacorp` / fail: `rejected_nexacorp_final` | `read_nexacorp_offer` |
| `explore_home` | optional | `read_resume` | always |
| `check_piper` | optional | `piper_checked` completed | always |
| `run_auto_apply` | optional | `ran_auto_apply` | always |
| `learn_linux_basics` | optional, hidden | `basic_tools_unlocked` | on unlock |
| `fix_backup` | optional, hidden | `fixed_backup_script` | `read_cron_backup` |

### Quest Groups

| Quest | Trigger | Sub-objectives |
|-------|---------|---------------|
| Olive's Terminal Challenges | `olive_challenge_file` Piper delivered | file → which → mkdir → mv → echo → man |
| Fix & Extend Backup | `olive_backup_advice` Piper delivered | mkdir → cp → log → verify |
