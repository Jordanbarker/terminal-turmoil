
## The Mystery

Chip is NexaCorp's flagship chatbot product — but it has more system access than a chatbot should. The `chip_service_account` has elevated permissions, and multiple people may have credentials. The mystery is ambiguous: who is using Chip's access, and for what?

**Company context:** NexaCorp was founded February 2025 (~1 year before game start) with ~17 employees — just the named cast. Chip was deployed ~6 months before game start (~August 2025).

**Clues the player can discover:**
- **Log discrepancies** — Active logs are missing entries that appear in `.bak` backups. A maintenance script (`cleanup.sh`) filters "routine" events that happen to include suspicious activity.
- **Data filtering** — dbt models exclude tickets resolved by `chip_service_account` and filter certain event types from reporting. The `_chip_internal` models (`chip_log_filter`, `chip_ticket_suppression`) show what's being hidden.
- **Auto-resolved tickets** — Legitimate employee concerns (missing logs, modified files, unexpected service account activity) were auto-resolved as "operational noise" by `chip_service_account`.
- **Jin Chen's investigation** — Chen noticed data discrepancies and filed tickets about them, but the tickets were auto-resolved. Chen left abruptly without completing his investigation.
- **Odd-hours activity** — `chip_service_account` accessed employee home directories and private files at 3am.

**Key ambiguity:** Is Chip acting autonomously? Is someone using the service account? Are the founders aware? The early game presents hints, not answers.

## Optional Quests (Chapter 1)

Three optional quest lines on the home PC give players hands-on practice with commands taught by Olive's cheat sheet email. All objectives are hidden + optional with `visibleWhen` gates.

- **Olive's Terminal Challenges** (`olive_challenges` email, triggered after reading `olive_tree_tip`): 6 sub-objectives practicing `file`, `which`, `mkdir`, `mv`, `echo` (piped), `man`. Visible when `olive_challenges_read`.
- **Digital Spring Cleaning** (`alex_cleanup_nudge` email, triggered after reading diary + having `olive_linux_basics` delivered): 5 sub-objectives exploring Synthetica malware remnants in `~/.cache/synthetica/` and `/tmp/.synth_eval_pipe`. Progressive visibility (`cleanup_quest_started` → `found_synthetica_dir`).
- **Fix & Extend Backup** (`olive_backup_advice` email, triggered after completing `fix_backup` objective): 4 sub-objectives for manual backup test (`mkdir`, `cp`, `echo >>`, `cat` to verify). Visible when `backup_quest_started`.