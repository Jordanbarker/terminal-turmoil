# Chapter 1: "New Beginnings"

## Objectives

| ID | Description | Check | Optional? |
|----|-------------|-------|-----------|
| `learn_commands` | Learn basic terminal commands | `commands_unlocked` flag | No |
| `explore_home` | Explore your personal files | `read_resume` flag | Yes |
| `check_email` | Check your email | `read_nexacorp_offer` flag | No |
| `accept_offer` | Accept the job offer | `accepted_nexacorp` objective | No (fail: `rejected_nexacorp_final`) |

---

## ACT 1: Home PC

### Boot & Nano Tutorial

The terminal boots and auto-opens `nano ~/terminal_notes.txt`. This file is a guided tutorial covering nano controls, filesystem basics, and common commands. The commands section starts further down (at `COMMANDS_SECTION_ROW`).

**Trigger:** When the player scrolls to the "## Commands I've learned so far:" line, an `EditorTrigger` fires the `commands_unlocked` objective event. This:
- Sets the `commands_unlocked` story flag
- Displays the "commands unlocked" ASCII box
- Shows a toast: "New commands unlocked! Type 'help' to see all."
- Completes the `learn_commands` objective

When the player exits nano for the first time, `hasSeenIntro` is set to true.

### Email Delivery

**Immediately seeded (3 emails in `/var/mail/<user>/new/`):**
- `alex_checkin` — Alex Rivera checking in on the job hunt
- `job_board_alert` — Indeed alert with 3 AI engineer jobs (NexaCorp listed first)
- `nexacorp_offer` — Edward Torres offering the AI Engineer position ($135K, remote, start Monday)

**After `learn_commands` completes:**
- `olive_tree_tip` — Olive Borden suggests installing `tree` via `sudo apt install tree`

### Exploration Flags

Reading specific files sets flavor flags that affect later content (e.g., Chip's cache files on NexaCorp):

| Flag | Trigger |
|------|---------|
| `read_resume` | Read `~/Downloads/resume_final_v3.pdf` |
| `read_cover_letter` | Read `~/Documents/cover_letter_nexacorp.txt` |
| `read_diary` | Read `~/.private/diary.txt` |
| `read_job_notes` | Read `~/Desktop/job_search_notes.txt` |
| `read_glassdoor` | Read `~/scripts/data/glassdoor_reviews.json` |
| `research_depth` → `"deep"` | Read `~/scripts/data/glassdoor_reviews.json` |
| `read_auto_apply` | Read `~/scripts/auto_apply.py` |
| `read_bashrc` | Read `~/.bashrc` |
| `pdftotext_unlocked` | Visit `~/Downloads` directory (toast: "pdftotext command unlocked!") |

### Home PC Commands

Before `commands_unlocked`, only a limited set of commands is available: `nano`, `clear`, `help`, `save`, `load`, `newgame`. After unlock, the full command set is accessible.

---

## ACT 2: Getting Hired

### The Offer

`nexacorp_offer` is seeded immediately. Reading it sets the `read_nexacorp_offer` flag (completing `check_email`). The email has 2 reply options:

1. **"I'm in! When do I start?"** → triggers `accepted_nexacorp`
2. **"Thanks, but I'll have to pass"** → triggers `rejected_nexacorp_1`

### Alex's Warning (Conditional)

If the player has read `glassdoor_reviews.json` (`read_glassdoor` flag set) AND `nexacorp_offer` has been delivered:
- `alex_warning` is delivered — Alex warns about NexaCorp's Glassdoor reviews, a Reddit thread about the AI system "doing things nobody was auditing," and a senior engineer who "was pushed out"

### Rejection Path (Up to 3 Attempts)

**Reject 1** → `rejected_nexacorp_1` objective → delivers `nexacorp_persuasion_1`:
- Edward bumps offer to **$155K + $5K signing bonus**, fully remote, flexible hours
- Reply options:
  1. "Alright, you've convinced me" → `accepted_nexacorp`
  2. "I'm still going to pass" → `rejected_nexacorp_2`

**Reject 2** → `rejected_nexacorp_2` objective → delivers `nexacorp_persuasion_2`:
- Edward's "last ask" — **$180K + $10K signing bonus**, personal appeal
- Reply options:
  1. "Okay, I'll give it a shot" → `accepted_nexacorp`
  2. "My answer is final — good luck" → `rejected_nexacorp_final`

**Reject 3** → `rejected_nexacorp_final` objective → `accept_offer` objective **fails**. Chapter 1 ends with no transition to NexaCorp.

### Accept Path → SSH Transition

When the player accepts (at any stage), `accepted_nexacorp` is completed. This triggers delivery of two emails:

1. **`nexacorp_followup`** (from Edward): "Chip will send you remote access details"
2. **`chip_ssh_setup`** (from Chip): SSH connection instructions with host, username, and `~/.ssh/config` shortcut

The player reads the SSH setup email and runs `ssh nexacorp` (or the full hostname). This starts an `SshSession`:

1. Host key verification prompt with ED25519 fingerprint
2. Player types `"yes"` to confirm
3. Host is added to `~/.ssh/known_hosts`
4. `ssh_connect` objective event fires
5. `EVENT_ACTIONS["ssh_connect"]` returns `shouldTransition: true`
6. `runSshTransition()` is called

### Transition → Chapter 2

`runSshTransition()` handles the full computer swap:
- SSH connection animation
- Computer switches from `"home"` to `"nexacorp"`
- Chapter set to `"chapter-2"`
- NexaCorp boot sequence plays
- NexaCorp filesystem loaded (flag-conditional files in `/opt/chip/cache/` based on home PC exploration flags)

---

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
                          ┌──────────┴──────────┐
                          ▼                     ▼
                   [scroll to            [explore fs]
                    commands section]     read files
                          │                     │
                          ▼                     ▼
                   commands_unlocked     flavor flags set:
                   objective complete    read_resume?
                          │              read_cover_letter?
                          ▼              read_diary?
                   olive_tree_tip        read_job_notes?
                   email delivered       read_glassdoor?
                                         read_auto_apply?
                                         pdftotext_unlocked?

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
                    ┌────────────────┼────────────────┐
                    ▼                │                ▼
             [read offer]           │         [read_glassdoor
              sets flag:            │          + offer delivered?]
              read_nexacorp_offer   │                │
                    │               │                ▼
                    │               │          alex_warning
                    │               │          delivered
                    ▼               │
             ┌──────┴──────┐        │
             │ reply to    │        │
             │ Edward      │        │
             └──────┬──────┘        │
                    │               │
         ┌─────────┴─────────┐      │
         ▼                   ▼      │
      [accept]           [reject]   │
         │                   │      │
         │            ┌──────┴──────────────┐
         │            │ persuasion_1        │
         │            │ ($155K + $5K bonus) │
         │            └──────┬──────────────┘
         │         ┌─────────┴─────────┐
         │         ▼                   ▼
         │      [accept]           [reject]
         │         │                   │
         │         │            ┌──────┴──────────────┐
         │         │            │ persuasion_2        │
         │         │            │ ($180K + $10K bonus)│
         │         │            └──────┬──────────────┘
         │         │         ┌─────────┴─────────┐
         │         │         ▼                   ▼
         │         │      [accept]         [final reject]
         │         │         │                   │
         │         │         │            ╔══════╧═══════╗
         │         │         │            ║ CHAPTER 1    ║
         │         │         │            ║ ENDS (fail)  ║
         │         │         │            ╚══════════════╝
         │         │         │
         └─────────┴─────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ accepted_nexacorp│
         └────────┬─────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
  nexacorp_followup   chip_ssh_setup
  (Edward)            (Chip: SSH instructions)
         │                 │
         └────────┬────────┘
                  │
                  ▼
         ┌────────────────┐
         │ player reads   │
         │ SSH setup email│
         │ runs:          │
         │ ssh nexacorp   │
         └────────┬───────┘
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
         │ chapter → ch-2  │
         │ NexaCorp boot   │
         └────────┬────────┘
                  │
                  ▼
           ╔══════════════╗
           ║  CHAPTER 2   ║
           ║  begins      ║
           ╚══════════════╝
```
