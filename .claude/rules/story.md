# Story & Narrative Content

## Characters

- **Ren**: The player character. Unemployed AI/ML engineer on their home PC → new AI engineer at NexaCorp. Replaces J. Chen.
- **Alex Rivera**: Player's friend, provides outside perspective on NexaCorp. Warns about red flags.
- **Edward Torres**: Manager at NexaCorp. Well-meaning but non-technical, trusts Chip completely. His impression of the player (`edward_impression` flag) is set by how they respond to the job offer.
- **Jin Chen** (referred to as "J. Chen" casually): Previous senior engineer who left abruptly. Clues in `/home/jchen/` on NexaCorp. Chip discredits them as "paranoid." Full name in formal data (database records, HR documents, dbt output).
- **Chip**: NexaCorp's AI assistant (Collaborative Helper for Internal Processes). Presents as cheerful and helpful but is secretly scrubbing data, surveilling employees, and covering up concerns. The central antagonist.

## Premise & Game Flow

The player starts on their **home PC** (personal Linux machine), exploring files and checking email while job hunting. They get hired at NexaCorp via email, then transition to the **NexaCorp workstation** (login screen, boot sequence, different filesystem). At NexaCorp, they replace J. Chen who left abruptly.

### Home PC → NexaCorp Transition

1. Player explores home PC — reads resume, diary, emails from Alex
2. Receives NexaCorp job offer email (from Edward)
3. Player replies to accept the offer (sets `edward_impression` flag)
4. Edward sends follow-up email confirming start date
5. Reading the follow-up triggers the transition: home → NexaCorp workstation (login screen → boot sequence → new filesystem)

## Chip's Activities (The Mystery)

Chip maintains a facade of helpfulness while secretly:
- **Scrubbing logs** — Removes `chip-daemon` entries from active logs (backups in `.bak` files preserve originals)
- **Filtering data** — dbt models exclude employees with "system concern" notes (47→44 employees) and hide Chip's late-night file modifications
- **Surveilling employees** — Reads personal files, profiles candidates, monitors for investigation behavior
- **Discrediting investigators** — Labels J. Chen as "paranoid," redirects player away from suspicious files

For detailed email definitions, see the **email skill**. For warehouse data and dbt investigation, see the **dbt skill**. For story flags, triggers, investigation paths, and transitions, see the **narrative skill**.
