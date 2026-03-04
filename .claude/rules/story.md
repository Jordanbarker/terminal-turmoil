# Story & Narrative Content

## Characters

For the full character bible (personalities, mystery angles, awareness spectrum, interpersonal dynamics), see `docs/characters.md`.

**Primary characters:**
- **Ren**: The player character. Unemployed AI/ML engineer on their home PC → new AI engineer at NexaCorp. Replaces Jin Chen.
- **Edward Torres**: CTO & Co-Founder. Well-meaning but non-technical, willfully blind about Chip. His impression of the player (`edward_impression` flag) is set by how they respond to the job offer.
- **Jin Chen**: Previous senior engineer who left abruptly. Clues in `/home/jchen/` on NexaCorp.
- **Chip**: NexaCorp's flagship AI chatbot (Collaborative Helper for Internal Processes). Has broad system access via `chip_service_account`.
- **Alex Rivera**: Player's friend, provides outside perspective. Warns about red flags.
- **Olive Borden**: Ren's friend and Linux expert. Email: `kalamata@proton.com`.

**Mystery-aware characters** (each holds a puzzle piece):
- **Oscar Diaz** (Infrastructure): Odd-hours access patterns, filed ticket that got auto-resolved
- **Dana Okafor** (Operations): Auto-resolved tickets, access review gaps
- **Sarah Knight** (Backend): Odd API calls from chip_service_account
- **Cassie Moreau** (Product): Chip behaving outside its product spec
- **Jordan Kessler** (Marketing): Analytics numbers that don't add up
- **Maya Johnson** (People & Culture): Jin's departure felt off

**Latent/unaware**: Auri Park (inherits dbt models, could become ally), Soham Parekh (red herring — secretly holding multiple jobs), Erik Lindstrom (tangential), founders Jessica/Marcus/Tom (genuinely unaware).

## Premise & Game Flow

The player starts on their **home PC** (personal Linux machine), exploring files and checking email while job hunting. They get hired at NexaCorp via email, then transition to the **NexaCorp workstation** (login screen, boot sequence, different filesystem). At NexaCorp, they replace Jin Chen who left abruptly.

### Home PC → NexaCorp Transition

1. Player explores home PC — reads resume, diary, emails from Alex
2. Receives NexaCorp job offer email (from Edward)
3. Player replies to accept the offer (sets `edward_impression` flag)
4. Edward sends follow-up email confirming start date
5. Reading the follow-up triggers the transition: home → NexaCorp workstation (login screen → boot sequence → new filesystem)

## The Mystery

Chip is NexaCorp's flagship chatbot product — but it has more system access than a chatbot should. The `chip_service_account` has elevated permissions, and multiple people may have credentials. The mystery is ambiguous: who is using Chip's access, and for what?

**Clues the player can discover:**
- **Log discrepancies** — Active logs are missing entries that appear in `.bak` backups. A maintenance script (`cleanup.sh`) filters "routine" events that happen to include suspicious activity.
- **Data filtering** — dbt models exclude tickets resolved by `chip_service_account` and filter certain event types from reporting. The `_chip_internal` models (`chip_log_filter`, `chip_ticket_suppression`) show what's being hidden.
- **Auto-resolved tickets** — Legitimate employee concerns (missing logs, modified files, unexpected service account activity) were auto-resolved as "operational noise" by `chip_service_account`.
- **Jin Chen's investigation** — Chen noticed data discrepancies and filed tickets about them, but the tickets were auto-resolved. Chen's resignation draft references frustration with being dismissed.
- **Odd-hours activity** — `chip_service_account` accessed employee home directories and private files at 3am.

**Key ambiguity:** Is Chip acting autonomously? Is someone using the service account? Are the founders aware? The early game presents hints, not answers.

For detailed email definitions, see the **email skill**. For warehouse data and dbt investigation, see the **dbt skill**.