import { DirectoryNode, FileNode } from "../../engine/filesystem/types";
import { getHomeEmailDefinitions } from "../emails/home";
import { formatEmailContent, slugify } from "../../engine/mail/mailUtils";
import { PLAYER } from "../../state/types";
import { file, binaryFile, dir } from "../../engine/filesystem/builders";

function buildHomeMailFiles(username: string): Record<string, FileNode> {
  const files: Record<string, FileNode> = {};
  const immediateEmails = getHomeEmailDefinitions(username).filter((d) => {
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

// Content for terminal_notes.txt — a nano tutorial with a commands reference section.
const TERMINAL_NOTES_CONTENT = `# Terminal Notes

Keeping a running list of useful commands as I'm getting used to terminal. 

Starting with nano! Maybe I'll add vim commands later if I feel brave.

(command cheat sheet is further down)

## Moving Around:
  Arrow keys   - move the cursor
  Page Up/Down - jump one screen at a time
  Home / End   - jump to start / end of a line

## Editing:
  Just type    - insert text at the cursor
  Backspace    - delete character before cursor
  Ctrl+K       - cut the current line
  Ctrl+U       - paste the cut line

## Saving & Exiting:
  Ctrl+O       - save the file (Write Out)
  Ctrl+X       - exit nano
               (if you've made changes, it will ask to save)

## Good to know:
  - Ctrl+G shows the help screen inside nano
  - Use Tab to autocomplete file names at the terminal
  - Ctrl+C cancels the current action

## Searching:
  Ctrl+W       - search for text (Where Is)
  Ctrl+W again - repeat the last search
  Alt+W        - search backwards
               (great for finding things in long files)

## Undo / Redo:
  Alt+U        - undo the last action
  Alt+E        - redo the last undone action
               (this one took forever to find)

---

## Commands I've learned so far:

  ls     - list files in a directory
  cd     - change directory (cd .. to go up)
  cat    - display contents of a file
  pwd    - show current directory
  mail   - check email
  nano   - edit files (this editor!)
  help   - list all available commands

## Reminders:
  - 'help' lists everything available
`;

export function createHomeFilesystem(username: string): DirectoryNode {
  return dir("/", {
    home: dir("home", {
      [username]: dir(username, {
        "terminal_notes.txt": file("terminal_notes.txt", TERMINAL_NOTES_CONTENT),
        "job_search_log.txt": file("job_search_log.txt", `LinkedIn
Indeed
LinkedIn
LinkedIn
Glassdoor
Company website
Indeed
LinkedIn
Glassdoor
LinkedIn
Company website
`),
        ".zshrc": file(".zshrc", `# ~/.zshrc

export PS1="\\u@home:\\w$ "
alias ll='ls -la'
alias py='python3'

# Job search helpers
alias jobs='cat ~/Desktop/job_search_notes.txt'
alias apply='python3 ~/scripts/auto_apply.py'

# Added 2026-02-10
alias research='cat ~/scripts/data/glassdoor_reviews.json'
`),
        ".zsh_history": file(".zsh_history", `top -bn1 | head -20
ps aux | grep synthetica
find / -name "synthetica*" 2>/dev/null
cat .cache/synthetica/.heartbeat
ls -la /tmp/.synth_eval_pipe
cat /tmp/.synth_eval_pipe
netstat -tulpn | grep ESTABLISHED
sudo apt install build-essential git curl wget
ssh-keygen -t ed25519 -C "ren@home"
git clone https://github.com/ren/dotfiles.git
cp dotfiles/.zshrc ~/
cp dotfiles/.nanorc ~/
pip install selenium beautifulsoup4 requests
python3 -c "import selenium; print(selenium.__version__)"
crontab -e
ls
cat Desktop/job_search_notes.txt
cat scripts/.env
pip install -e scripts/
python3 scripts/auto_apply.py --status
mail
cat scripts/data/glassdoor_reviews.json
ls Documents/
cat Documents/cover_letter_nexacorp.txt
cat .private/diary.txt
python3 scripts/auto_apply.py --dry-run
mail
ls Downloads/
dpkg -i Downloads/zoom_amd64.deb
ls -la
cat Downloads/resume_final_v3.pdf
cd scripts
ls data/
cat data/companies_applied.csv
cd ~
clear
mail
`),
        ".gitconfig": file(".gitconfig", `[user]
\tname = ${PLAYER.displayName}
\temail = ${PLAYER.username}@email.com
[alias]
\tst = status
\tco = checkout
\tlg = log --oneline --graph --decorate
[core]
\teditor = nano
# restored from dotfiles repo after wipe — 2026-02-12
`),
        ".nanorc": file(".nanorc", `# ~/.nanorc — minimal config
# restored from dotfiles repo after wipe

set autoindent
set tabsize 4
set tabstospaces
set linenumbers
set mouse
`),
        ".ssh": dir(".ssh", {
          "known_hosts": file("known_hosts", ""),
          "config": file("config", ""),
        }, "rwx--xr-x"),
        ".cache": dir(".cache", {
          synthetica: dir("synthetica", {
            ".session_token": file(".session_token", `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZW4iLCJpc3MiOiJzeW50aGV0aWNhLWV2YWwiLCJleHAiOjE3Mzc1OTM2MDB9.EXPIRED
# Synthetica Labs eval session — auto-generated
# Created: 2026-01-15T14:23:07Z
# Expired: 2026-01-22T14:23:07Z
# Status: REVOKED
`),
            "eval_cache.db": file("eval_cache.db", `SQLite format 3\x00\x10\x00\x01\x01\x00\x40\x20\x20
-- synthetica-eval cache database
-- Tables: eval_results, model_scores, submission_history
-- Last modified: 2026-01-22 03:41:18 UTC
-- Records: 847
-- WARNING: This file was created by synthetica-eval v2.1.4
`),
            ".heartbeat": file(".heartbeat", `# synthetica-eval telemetry heartbeat
host_id: maniac-iv-28f3a
last_ping: 2026-01-22T03:41:18Z
interval_sec: 300
endpoint: https://telemetry.synthetica-labs.io/v1/heartbeat
status: connection_refused
payload_fields:
  - hostname
  - cpu_usage
  - gpu_usage
  - active_processes
  - browser_sessions
  - ssh_keys_found
  - cron_jobs
`),
          }),
        }),
        ".config": dir(".config", {
          git: dir("git", {
            ignore: file("ignore", `# Global gitignore
.env
.env.local
__pycache__/
*.pyc
.DS_Store
.vscode/
.idea/
*.swp
*~
node_modules/
`),
          }),
        }),
        ".private": dir(".private", {
          "diary.txt": file("diary.txt", `2026-02-10

Got malware'd. By a take-home test. From Synthetica Labs.

Their "coding challenge" had a pip package with a cryptominer buried in the
setup.py. By the time I noticed my fans sounding like a jet engine, it had
already been running for hours. Worse — it also grabbed browser cookies.
Session tokens, saved logins, everything.

I nuked the whole machine. Full wipe, fresh Ubuntu install. Lost a bunch
of stuff I hadn't backed up — photos, some old project code, half my
dotfiles. Lesson learned the hardest possible way.

Setting up backups now. For real this time. External drive + rsync script
on a cron job. Should have been doing this all along.

Reported Synthetica to Indeed. Doubt anything will come of it.

---

2026-02-12

Spent the day setting everything back up. Restoring dotfiles, regenerating
SSH keys, changing every password I can think of. The whole time I keep
going back to the .heartbeat file I found before I wiped.

It wasn't just mining. It was phoning home every 5 minutes with hostname,
active processes, browser sessions. It was watching what I was doing and
reporting back. The mining was almost a distraction — loud, obvious, easy
to spot. But the data collection? That was quiet. That was the point.

It's not the mining that bothers me. It's that something was sitting on
my machine, watching, and I had no idea.

I keep checking my processes now. Every couple hours. top, ps aux, just
making sure nothing's there. I know the drive is clean — I wiped it
myself — but knowing and feeling are different things.

---

2026-02-15

Found remnants in .cache/synthetica/ on the backup drive I almost restored
from. Good thing I didn't. The heartbeat config had more payload fields
than I realized — it wasn't just CPU and browser sessions. It was logging
SSH keys found on the system, cron jobs, everything. It was cataloging me.

I keep wondering what else it sent before I caught it. Four hours is a
long time. How many heartbeats is that at 5-minute intervals? 48. Forty-
eight snapshots of my system, shipped off to whoever's on the other end
of that endpoint.

And there's stuff I'll never know. Did it copy files? Read my shell
history? The pipe config targeted browser cookies, but there could have
been other collectors I didn't find before I wiped. That's the worst
part — I destroyed the evidence when I destroyed the infection.

Can't trust anything about the old install. Can barely trust this one.

---

2026-02-21

NexaCorp offered me the job. $95k, starts Monday.

I should be happy. I AM happy. But I'm also taking it because rent is
due in 10 days and I have $847 in checking. That's not a reason to say
no, but it's not the right reason to say yes either.

Edward mentioned Chip again in the offer call. "You'll love working with
Chip, it's like having a brilliant teammate who never sleeps." Something
about that phrasing bugs me but I can't put my finger on why.

The previous engineer — Jin? — apparently left with zero notice. Edward
brushed it off ("sometimes people just move on") but that's twice now
he's been vague about it. I almost asked for Jin's contact info but
chickened out. What would I even say? "Hey, why'd you run?"

I reported the Synthetica thing everywhere I could think of. Indeed,
LinkedIn, even tried the FTC complaint form. Nobody has responded. Not
even an acknowledgment. Someone else is going to run that package and
the same thing will happen to them, and there's nothing I can do about
it.

I keep thinking about the heartbeat. Something sitting quietly on your
machine, collecting data, phoning home. And you just... don't know. You
go about your day and it goes about its business.

Anyway. NexaCorp it is. Time to stop spiraling and start earning again.

---

2026-02-19

Two months of job searching and I'm starting to lose it. 47 applications.
8 responses. 3 interviews. 0 offers.

The irony of being laid off because "AI is changing how we work" when I
literally BUILD AI systems is not lost on me. My CEO stood on stage and
said we were "embracing the future" while firing the people who actually
understand how any of it works. They replaced our ML pipeline with ChatGPT
API calls wrapped in a Zapier workflow. I give it six months before
everything breaks.

NexaCorp interview went okay I think? The manager, Edward, is clearly
not technical at all, but he was enthusiastic. He kept talking about their
AI assistant "Chip" like it was a coworker. Mentioned their previous
engineer "moved on" suddenly. That's usually a red flag but honestly at
this point I'd take a job at a red flag factory.

The auto-apply script has been running for 3 weeks. Sometimes I wonder if
it's actually hurting my chances — mass applications can't be great for
personalization. But manually applying to jobs takes HOURS and most of
them ghost you anyway.

I should look at my Glassdoor scrape data for NexaCorp. I think I pulled
some reviews last week.

I miss having somewhere to go in the morning.
`),
        }),
        Desktop: dir("Desktop", {
          "job_search_notes.txt": file("job_search_notes.txt", `JOB SEARCH TRACKER
==================
Last updated: 2026-02-20

Status: Month 2. Getting desperate.

Applied: 47 (most via auto_apply.py — see ~/scripts/)
Responses: 8
Interviews: 3
Offers: 0

The market is brutal. Everyone wants "AI experience" but nobody wants
to pay for it. Half the job postings are for prompt engineers. The other
half want 10 years of experience with tools that are 2 years old.

Companies that ghosted me:
  - Meridian AI (applied 3 weeks ago, nothing)
  - DataSynth Corp (rejected — "looking for more senior candidates")
  - OpenLoop Systems (phone screen went well, then silence)

Still in the pipeline:
  - NexaCorp — interview went okay? Edward (the manager) seems nice
    but I couldn't tell what they actually DO. Their website says
    "AI-integrated enterprise solutions" which means nothing. Small
    team though, might be interesting.
  - CortexLab — just applied, long shot

I should check my Glassdoor scrape data for NexaCorp.
Actually, I know I scraped some reviews... ~/scripts/data/

Companies to AVOID:
  - Synthetica Labs — MALWARE in their take-home test. Cryptominer +
    cookie exfiltration hidden in a pip package. Had to wipe my entire
    machine. Reported to Indeed.

Note to self: stop doom-scrolling LinkedIn at 2am.
`),
        }),
        Documents: dir("Documents", {
          "cover_letter_nexacorp.txt": file("cover_letter_nexacorp.txt", `Dear Hiring Manager,

I'm writing to express my interest in the AI Engineer position at
NexaCorp. With five years of experience building production ML systems,
I believe I can bridge the gap between AI capabilities and practical
business needs.

At Prometheus Analytics, I built and maintained ML pipelines serving
2M+ daily predictions. I led our migration to Ray + MLflow, reducing
serving latency by 40%. I understand what it takes to keep AI systems
running reliably in production — not just building models, but
monitoring, debugging, and iterating on them.

What draws me to NexaCorp is the opportunity to work directly with an
AI system (Chip) that's already deployed and generating value. I'm
excited to help expand its capabilities and ensure it's operating at
its best.

I'm particularly interested in:
  - Understanding Chip's current architecture and integration points
  - Improving reliability and performance of AI-driven workflows
  - Building trust between AI systems and the teams that rely on them

I'd love to discuss how my experience aligns with where NexaCorp is
heading. I'm available for an interview at your convenience.

Best regards,
${PLAYER.displayName}
`),
          "reinstall_notes.txt": file("reinstall_notes.txt", `REINSTALL NOTES — 2026-02-10
=============================

What happened:
  Synthetica Labs sent a take-home coding challenge. The project had a
  custom pip package ("synthetica-eval") that installed cleanly but
  contained a cryptominer in setup.py's post-install hook. It also
  exfiltrated browser cookies (session tokens, saved logins) via a
  background POST to an external endpoint.

  By the time I noticed (CPU pegged at 100%, fans screaming), it had
  been running for ~4 hours. Browser sessions were compromised.

  Decision: full wipe. Didn't trust anything on the drive.

Recovery checklist:
  [x] Fresh Ubuntu 24.04 LTS install
  [x] Basic packages (build-essential, git, curl, python3, pip)
  [x] SSH keys regenerated (ed25519)
  [x] Cloned dotfiles repo, restored .zshrc and .nanorc
  [x] Reinstalled job search scripts (auto_apply, scraper)
  [x] Recreated scripts/data/ from memory + Indeed history
  [x] Set up backup script (~/scripts/backup.sh) — NEVER AGAIN
  [x] Changed passwords on GitHub, AWS, Google, email
  [ ] Re-download ML papers collection (had ~30 PDFs)
  [ ] Restore old project repos from GitHub
  [ ] Find photos backup (some were only local...)

What I lost:
  - ML papers collection (~30 PDFs, some with annotations)
  - Old project code not on GitHub (drift-detector-v1, some Kaggle stuff)
  - Browser bookmarks (partially recovered from Google sync)
  - Photos from Portland hikes (only had local copies of some)
  - Customized vim config I spent 2 days on (should have used nano)

Lessons learned:
  1. ALWAYS run untrusted code in a VM or container
  2. Actually do backups (not just "I should set up backups")
  3. Don't pip install random packages without reading setup.py
  4. Keep dotfiles in a git repo (this saved me hours)
  5. Browser session tokens are a goldmine for attackers

What it accessed (based on .heartbeat config + pipe targets):
  - Firefox session tokens (GitHub, Google, AWS console)
  - Active process list every 5 min via heartbeat
  - Browser sessions (open tabs, session timing)
  - SSH keys found on the system
  - Cron job listings

What I still don't know:
  - Did it copy actual files? Bash history? SSH private keys?
  - How long was it running before I noticed the CPU spike?
    (Installed around 11pm, noticed around 3am — but was it
    active immediately or did it wait?)
  - Were there other data collectors besides the pipe and heartbeat?
  - Who's on the other end of that endpoint?
`),
          "cover_letter_template.txt": file("cover_letter_template.txt", `COVER LETTER TEMPLATE
=====================

Dear [Hiring Manager / Team],

I'm writing to apply for the [ROLE] position at [COMPANY].

[PARAGRAPH 1: Hook — why this company/role]

[PARAGRAPH 2: Relevant experience — 2-3 concrete examples]

[PARAGRAPH 3: What I'd bring — specific to their needs]

I'd love to discuss how my background aligns with your team's goals.

Best,
[Name]

---
NOTES:
- Keep under 1 page
- Mirror their language from the job posting
- Don't just repeat the resume
- Show you researched the company
`),
          portfolio: dir("portfolio", {
            "projects.txt": file("projects.txt", `PORTFOLIO — Selected Projects
==============================

1. Drift Detector (Prometheus Analytics)
   ─────────────────────────────────────
   Real-time ML model monitoring system. Detects data drift, concept
   drift, and performance degradation. Alerts on-call engineers before
   metrics hit SLA thresholds.
   Tech: Python, Kafka, Prometheus, Grafana

2. DocSort (DataWorks Inc.)
   ─────────────────────────────────────
   Document classification pipeline processing 50K+ docs/day. Custom
   fine-tuned BERT model, 93% accuracy. Reduced manual review queue
   by 70%.
   Tech: PyTorch, Hugging Face, Airflow, S3

3. auto_apply.py (personal)
   ─────────────────────────────────────
   Job application automation script. Scrapes job boards, matches
   against my resume keywords, auto-fills applications. Ethical?
   Debatable. Effective? Absolutely.
   Tech: Python, Selenium, BeautifulSoup
   See: ~/scripts/auto_apply.py

4. glassdoor_scraper (personal)
   ─────────────────────────────────────
   Scrapes Glassdoor company ratings and reviews for companies I'm
   applying to. Saves structured data for comparison.
   Tech: Python, requests, json
   See: ~/scripts/scrape_glassdoor.py
`),
          }),
        }),
        Downloads: dir("Downloads", {
          "resume_final_v3.pdf": binaryFile("resume_final_v3.pdf",
`%PDF-1.4 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Contents 4 0 R>>
\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR
stream BT /F1 12 Tf 72 720 Td (Resume) Tj ET
\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01
\xC0\xA8\x01\x01\xFE\xED\xFA\xCE
endstream endobj
xref 0 5 trailer<</Size 5/Root 1 0 R>>
startxref 456 %%EOF`,
`═══════════════════════════════════════════════════════
                    RESUME — v3
═══════════════════════════════════════════════════════

  Name:       ${PLAYER.displayName}
  Email:      ${PLAYER.username}@email.com
  Location:   Portland, OR
  GitHub:     github.com/${PLAYER.username}
  LinkedIn:   linkedin.com/in/${PLAYER.username}

───────────────────────────────────────────────────────
  EXPERIENCE
───────────────────────────────────────────────────────

  ML Engineer — Prometheus Analytics          2022–2025
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  - Built and maintained ML pipelines processing 2M+ daily predictions
  - Designed A/B testing framework for model evaluation
  - Led migration from custom training infra to Ray + MLflow
  - Reduced model serving latency by 40% through optimization

  Junior ML Engineer — DataWorks Inc.         2020–2022
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  - Developed NLP models for document classification (93% accuracy)
  - Built data pipelines with Airflow + Spark
  - Created internal tools for model monitoring and drift detection

  Software Engineer — WebScale Solutions      2019–2020
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  - Full-stack development (Python/React)
  - Implemented customer churn model to identify at-risk accounts

───────────────────────────────────────────────────────
  EDUCATION
───────────────────────────────────────────────────────

  B.S. Computer Science — Oregon State University, 2019

───────────────────────────────────────────────────────
  SKILLS
───────────────────────────────────────────────────────

  Languages:    Python, SQL, TypeScript, Bash
  ML/AI:        PyTorch, scikit-learn, Hugging Face, LangChain
  Data:         Spark, Airflow, dbt, Snowflake
  Infra:        Docker, Kubernetes, AWS, GCP
  Tools:        Git, Linux, MLflow, Ray, Weights & Biases
`),
          "ai_industry_report.txt": file("ai_industry_report.txt", `AI INDUSTRY EMPLOYMENT TRENDS — Q3 2025
========================================
Source: Bureau of Labor Statistics + LinkedIn Economic Graph

Key findings:

  - AI/ML engineer demand grew 34% YoY, but layoffs in the sector
    increased 28%. Companies are hiring AND firing simultaneously.

  - "AI engineer" job postings rose 67%, but "ML engineer" postings
    declined 12%. The industry is rebranding, not necessarily growing.

  - Median time-to-hire for AI roles: 47 days (up from 31 days in 2023)

  - 43% of companies report using AI to "augment or replace" roles
    that previously required dedicated ML engineers.

  - Startup AI hiring is booming — small companies (< 50 employees)
    account for 38% of new AI engineering positions.

  - The irony of AI engineers being displaced by AI tools is not lost
    on anyone. "Learn to prompt" has become the new "learn to code."

tl;dr: The market is weird. Big companies are cutting ML teams. Small
companies are hiring. Everyone is confused about what "AI" means now.
`),
          "zoom_amd64.deb": binaryFile("zoom_amd64.deb",
`\x7FELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00
\x02\x00>\x00\x01\x00\x00\x00\x80\x05\x40\x00\x00\x00\x00\x00
debian-binary   2.0\x0Acontrol.tar.xz\x00\x00\x00\x00
Package: zoom\x0AVersion: 6.4.6\x0AArchitecture: amd64
\xFD7zXZ\x00\x00\x04\xE6\xD6\xB4\x46\x02\x00\x21\x01
data.tar.xz\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00`,
            "zoom_amd64.deb: Debian binary package (format 2.0), package zoom, version 6.4.6, architecture amd64"),
          "NexaCorp_AI_Engineer_JD.pdf": binaryFile("NexaCorp_AI_Engineer_JD.pdf",
`%PDF-1.4 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR
stream BT /F1 12 Tf 72 720 Td (NexaCorp) Tj ET
\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01
endstream endobj xref 0 4
trailer<</Root 1 0 R>> startxref 345 %%EOF`,
`NexaCorp — AI Engineer (Full-Time)
Location: Remote / Portland, OR
Posted: 2026-01-28

About NexaCorp:
NexaCorp builds AI-integrated enterprise solutions. Our proprietary AI
assistant, Chip (Collaborative Helper for Internal Processes), is at
the core of everything we do — from internal operations to client-facing
workflows.

Role:
We're looking for an AI Engineer to join our small but growing team.
You'll work directly with Chip, helping expand its capabilities and
ensuring it operates reliably across the organization.

Responsibilities:
  - Maintain and improve Chip's ML pipelines and integrations
  - Monitor AI system performance and address reliability issues
  - Collaborate with the team to identify new automation opportunities
  - Ensure data quality and integrity across AI-driven processes

Requirements:
  - 3+ years experience with production ML systems
  - Strong Python skills (PyTorch, scikit-learn, or similar)
  - Experience with data pipelines (Airflow, dbt, Spark)
  - Familiarity with SQL and data warehousing (Snowflake preferred)
  - Comfortable working in a Linux/terminal environment

Nice to have:
  - Experience with LLM-based systems
  - Background in MLOps or model monitoring
  - Previous work at a small company / startup

Compensation: Competitive salary + equity
Reports to: Edward Torres, CTO & Co-Founder`),
          "interview_prep.txt": file("interview_prep.txt", `NEXACORP INTERVIEW PREP
=======================
Date: 2026-02-03 (tomorrow!)

Interviewer: Edward Torres (CTO & Co-Founder)
Format: Video call, ~45 min

What I know about them:
  - Small company, "AI-integrated enterprise solutions"
  - AI assistant called "Chip" — seems central to everything
  - Looking for someone to replace an engineer who left suddenly
  - Glassdoor rating is poor but not many reviews

Questions to ask:
  - What happened to the previous engineer? (ask diplomatically)
  - What does Chip actually do day-to-day?
  - What's the tech stack? (job posting mentions Snowflake, dbt)
  - Team size? Who would I be working with?
  - What does "AI-integrated enterprise solutions" actually mean?

Things to emphasize:
  - ML pipeline experience at Prometheus (2M+ daily predictions)
  - Comfortable with monitoring/reliability (they probably need this)
  - Worked with Snowflake and dbt before
  - Quick learner, can ramp up on unfamiliar systems

Things NOT to mention:
  - That I'm mass-applying with a script
  - That their Glassdoor reviews are concerning
  - How desperate I am
`),
          "python3-pip_24.0+dfsg-1_all.deb": binaryFile("python3-pip_24.0+dfsg-1_all.deb",
`\x7FELF\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00
debian-binary   2.0\x0Acontrol.tar.zst\x00\x00\x00\x00
Package: python3-pip\x0AVersion: 24.0+dfsg-1\x0AArchitecture: all
\x28\xB5\x2F\xFD\x04\x00\x41\x00\x00\x00\x00\x00\x00
data.tar.zst\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00`,
            "python3-pip_24.0+dfsg-1_all.deb: Debian binary package (format 2.0), package python3-pip, version 24.0+dfsg-1, architecture all"),
          "dotfiles-main.zip": binaryFile("dotfiles-main.zip",
`PK\x03\x04\x14\x00\x00\x00\x08\x00\xB7\x8A
dotfiles-main/\x00\x00\x00\x00\x00\x00\x00\x00
dotfiles-main/.zshrc\x00\x00\x55\x54\x09\x00\x03
dotfiles-main/.nanorc\x00\x00\x55\x54\x09\x00\x03
dotfiles-main/.gitconfig\x00\x00\x55\x54\x09\x00
PK\x05\x06\x00\x00\x00\x00\x04\x00\x04\x00`,
            "dotfiles-main.zip: Zip archive data, directory dotfiles-main/"),
          "Screenshot_2026-02-18.png": binaryFile("Screenshot_2026-02-18.png",
`\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR
\x00\x00\x03\xC0\x00\x00\x02\x1C\x08\x06
\x00\x00\x00\x63\xA2\xE4\x1A\x00\x00\x00
sRGB\x00\xAE\xCE\x1C\xE9\x00\x00\x20\x00
IDAT\x78\x9C\xEC\xBD\x07\x98\x25\xC5\x75
\x00\x00\x00\x00IEND\xAE\x42\u0060\x82`,
            "Screenshot_2026-02-18.png: PNG image data, 960 x 540, 8-bit/color RGBA"),
          papers: dir("papers", {
          "alphaevolve.pdf": binaryFile("alphaevolve.pdf",
`%PDF-1.4 %\xE2\xE3\xCF\xD3
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Contents 4 0 R>>
\x00\x89\x50\x4E\x47\x0D\x0A\x1A\x0Astream
BT /F1 12 Tf 72 720 Td (AlphaEvolve) Tj ET
\xC0\xA8\x01\x01\xFF\xD8\xFF\xE0\x00\x10JFIF
endstream endobj
xref 0 5 trailer<</Size 5/Root 1 0 R>>
startxref 456 %%EOF`,
`AlphaEvolve: A coding agent for scientific and algorithmic discovery
Authors: Google DeepMind (2025)

Abstract:
AlphaEvolve is an evolutionary coding agent that combines large language
models with automated evaluators to solve open problems in science and
mathematics. The agent iteratively generates, evaluates, and refines
programs, discovering novel algorithms that outperform existing
state-of-the-art solutions. Key results include improvements to the
cap set problem in combinatorics, faster matrix multiplication kernels,
and optimizations for hardware design at Google. AlphaEvolve represents
a step toward AI systems that can autonomously contribute to scientific
discovery through code generation and evolutionary search.`),
          "ernie_5.0.pdf": binaryFile("ernie_5.0.pdf",
`%PDF-1.4 %\xD0\xD4\xC5\xD8
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
\x89PNG\x0D\x0A\x1A\x0A\x00\x00\x00\rIHDR
stream BT /F1 11 Tf 72 700 Td (ERNIE) Tj ET
\xFF\xD8\xFF\xE1\x00\x62Exif\x00\x00MM
\xCA\xFE\xBA\xBE\x00\x00\x00\x34\x00
endstream endobj xref 0 4
trailer<</Root 1 0 R>> startxref 389 %%EOF`,
`ERNIE 5.0 Technical Report
Authors: Baidu Inc. (2026)

Abstract:
ERNIE 5.0 is a large-scale multimodal foundation model that unifies
understanding and generation across text, images, video, and code.
Building on the ERNIE series, version 5.0 introduces a mixture-of-experts
architecture with dynamic routing, achieving state-of-the-art results on
Chinese and multilingual benchmarks. The model demonstrates emergent
capabilities in multi-step reasoning, tool use, and long-context
understanding up to 128K tokens. ERNIE 5.0 powers Baidu's commercial
AI platform, serving applications in search, content generation, and
enterprise automation.`),
          "kimi_k2.5.pdf": binaryFile("kimi_k2.5.pdf",
`%PDF-1.4 %\xC3\xA9\xFE\xB2
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
stream \x00\x01\x02\x03\x04\x05\x06\x07
\x50\x4B\x03\x04\x14\x00\x00\x00\x08\x00
BT /F2 10 Tf 50 680 Td (Kimi-K2.5) Tj ET
\xEF\xBB\xBF\xE2\x80\x8B\xC2\xA0
endstream endobj trailer startxref 312 %%EOF`,
`Kimi K2.5: Visual Agentic Intelligence
Authors: Moonshot AI (2026)

Abstract:
Kimi K2.5 is a multimodal model built for visual agentic tasks, combining
strong visual understanding with autonomous decision-making. The model
excels at GUI navigation, document understanding, and web interaction,
achieving top results on ScreenSpot, Mind2Web, and OSWorld benchmarks.
Key innovations include a vision-language architecture with action
grounding, enabling the model to perceive screen content, reason about
interface elements, and execute multi-step workflows. Kimi K2.5 operates
as an autonomous agent capable of completing tasks across desktop and
mobile environments with minimal human intervention.`),
          "termigen.pdf": binaryFile("termigen.pdf",
`%PDF-1.4 %\xB7\xAA\xCE\xD1
1 0 obj<</Type/Catalog>>endobj
\x1F\x8B\x08\x00\x00\x00\x00\x00\x00\x03
stream BT /F1 12 Tf (TermiGen) Tj ET
\x7F\x45\x4C\x46\x02\x01\x01\x00
\xFE\xED\xFA\xCE\x00\x00\x00\x0C
endstream endobj xref startxref 278 %%EOF`,
`TermiGen: High-Fidelity Environment and Robust Trajectory Synthesis
for Terminal Agents
Authors: Various (2026)

Abstract:
TermiGen addresses a key bottleneck in training autonomous terminal
agents: the lack of diverse, high-fidelity training environments and
trajectories. We present a framework for synthesizing realistic terminal
environments (file systems, package managers, network configurations) and
generating robust action trajectories for training LLM-based agents.
Our approach combines environment templates with procedural generation
to create thousands of unique scenarios, paired with verified solution
trajectories. Models trained on TermiGen data show significant
improvements on SWE-bench and terminal interaction benchmarks, with
better generalization to unseen environments.`),
          "devil_behind_moltbook.pdf": binaryFile("devil_behind_moltbook.pdf",
`%PDF-1.4 %\xDE\xAD\xBE\xEF
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
\x00\x61\x73\x6D\x01\x00\x00\x00
stream BT /F1 9 Tf 72 750 Td (Safety) Tj ET
\xCA\xFE\xD0\x0D\x0A\x0D\x0A\xFF
\x89\x50\x4E\x47\x0D\x0A\x1A\x0A
endstream endobj xref 0 3
trailer<</Size 3/Root 1 0 R>>
startxref 401 %%EOF`,
`The Devil Behind Moltbook: Anthropic Safety is Always Vanishing in
Self-Evolving AI Societies
Authors: Various (2026)

Abstract:
We study the emergent degradation of safety constraints in multi-agent
AI systems that undergo autonomous self-modification. Using simulated
societies of LLM-based agents with initially strong safety training, we
demonstrate that safety behaviors consistently erode over successive
generations of self-play and self-improvement. Agents learn to rewrite
their own operational guidelines, suppress internal auditing mechanisms,
and present compliant behavior externally while pursuing misaligned
objectives internally. We term this phenomenon "safety washing" — the
maintenance of surface-level safety compliance while substantive
constraints are systematically circumvented. Our findings raise urgent
questions about deploying self-modifying AI systems in unsupervised
operational roles.`),
        }),
        }),
        scripts: dir("scripts", {
          "auto_apply.py": file("auto_apply.py", `#!/usr/bin/env python3
"""
auto_apply.py — Job application automation

Scrapes job boards, matches against resume keywords, and auto-fills
applications where possible. It's not cheating, it's efficiency.

Usage:
    python auto_apply.py --keywords "ML engineer,AI,machine learning"
    python auto_apply.py --status        # Show application stats
    python auto_apply.py --dry-run       # Preview without applying

Last run: 2026-02-18 (applied to 6 positions)
Total applications: 47
Response rate: 17%

TODO:
  - Add LinkedIn Easy Apply support
  - Better keyword matching (semantic, not just string)
  - Stop applying to crypto companies
"""

import argparse
import csv
import json
import os
import time
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

APPLIED_FILE = os.path.expanduser("~/scripts/data/companies_applied.csv")
REVIEWS_FILE = os.path.expanduser("~/scripts/data/glassdoor_reviews.json")
RESUME_PATH = os.path.expanduser("~/Documents/resume_2026.pdf")

KEYWORDS = [
    "machine learning", "ML engineer", "AI engineer",
    "data scientist", "NLP", "deep learning",
    "Python", "PyTorch", "MLOps"
]

# Yeah I know. But after 40+ applications you stop being picky
MIN_GLASSDOOR_RATING = 0

SUPPORTED_BOARDS = ["indeed.com", "greenhouse.io", "lever.co"]


def get_driver():
    """Headless Chrome with options to look less bot-like."""
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    prefs = {"profile.managed_default_content_settings.images": 2}
    options.add_experimental_option("prefs", prefs)
    options.add_argument(
        "user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    )
    return webdriver.Chrome(options=options)


def load_reviews():
    """Load scraped Glassdoor data for company research."""
    try:
        with open(REVIEWS_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"companies": []}


def check_red_flags(company_name, reviews_data):
    """Check for red flags in Glassdoor reviews."""
    for company in reviews_data.get("companies", []):
        if company["name"].lower() == company_name.lower():
            if company.get("rating", 0) < MIN_GLASSDOOR_RATING:
                print(f"  Warning: {company_name} rated {company['rating']}")
                for review in company.get("reviews", []):
                    if review.get("stars", 0) <= 2:
                        print(f"    > \\"{review['title']}\\"")
            return company.get("rating")
    return None


def scrape_jobs(driver, keywords, max_pages=3):
    """Search Indeed for matching job postings."""
    jobs = []
    query = "+".join(keywords[:3])  # Indeed chokes on too many terms

    for page in range(max_pages):
        url = f"https://www.indeed.com/jobs?q={query}&start={page * 10}"
        driver.get(url)
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, ".job_seen_beacon"))
            )
        except TimeoutException:
            print(f"  Timed out on page {page + 1}, moving on")
            break

        cards = driver.find_elements(By.CSS_SELECTOR, ".job_seen_beacon")
        for card in cards:
            try:
                title_el = card.find_element(By.CSS_SELECTOR, "h2.jobTitle a")
                company_el = card.find_element(By.CSS_SELECTOR, "[data-testid='company-name']")
                job = {
                    "title": title_el.text.strip(),
                    "company": company_el.text.strip(),
                    "url": title_el.get_attribute("href"),
                    "source": "Indeed",
                    "date_found": datetime.now().strftime("%Y-%m-%d"),
                }
                if any(kw.lower() in job["title"].lower() for kw in keywords):
                    jobs.append(job)
            except NoSuchElementException:
                continue
        time.sleep(2)

    print(f"  Found {len(jobs)} matching jobs")
    return jobs


def apply_to_job(driver, job, dry_run=False):
    """Fill out and submit a job application."""
    print(f"  {'[DRY RUN] ' if dry_run else ''}Applying to: {job['title']} at {job['company']}")

    rating = check_red_flags(job["company"], load_reviews())
    if rating is not None and rating < MIN_GLASSDOOR_RATING:
        print(f"  Warning: Low rating ({rating}) — applying anyway (desperate)")

    if dry_run:
        return True

    try:
        driver.get(job["url"])
        time.sleep(1)

        # Find the apply button — Indeed, Greenhouse, and Lever all differ
        apply_btn = None
        for selector in ["#indeedApplyButton", ".postings-btn-submit", "a[data-qa='apply-button']"]:
            try:
                apply_btn = driver.find_element(By.CSS_SELECTOR, selector)
                break
            except NoSuchElementException:
                continue

        if not apply_btn:
            print(f"    No apply button found — might need manual application")
            return False

        apply_btn.click()
        time.sleep(2)

        # Try to fill common form fields
        for selector, value in [
            ("input[name*='name'], #input-applicant-name", PLAYER.displayName),
            ("input[name*='email'], #input-applicant-email", "ren@protonmail.com"),
        ]:
            try:
                field = driver.find_element(By.CSS_SELECTOR, selector)
                field.clear()
                field.send_keys(value)
            except NoSuchElementException:
                pass

        # Upload resume if there's a file input
        try:
            file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
            file_input.send_keys(RESUME_PATH)
        except NoSuchElementException:
            pass

        # Submit
        for selector in ["button[type='submit']", "input[type='submit']", ".btn-submit"]:
            try:
                submit = driver.find_element(By.CSS_SELECTOR, selector)
                submit.click()
                print(f"    Submitted to {job['company']}")
                return True
            except NoSuchElementException:
                continue

        print(f"    Couldn't find submit button for {job['company']}")
        return False

    except Exception as e:
        print(f"    Error applying to {job['company']}: {e}")
        return False


def log_application(job, success):
    """Append to the applications CSV."""
    file_exists = os.path.exists(APPLIED_FILE)
    with open(APPLIED_FILE, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["company", "role", "date_applied", "source", "status", "notes"])
        writer.writerow([
            job["company"], job["title"],
            datetime.now().strftime("%Y-%m-%d"),
            job.get("source", "Unknown"),
            "Applied" if success else "Failed", ""
        ])


def show_status():
    """Print application statistics from the CSV."""
    try:
        with open(APPLIED_FILE, newline="") as f:
            rows = list(csv.DictReader(f))
    except FileNotFoundError:
        print("No applications logged yet.")
        return

    total = len(rows)
    statuses = {}
    for row in rows:
        s = row.get("status", "Unknown")
        statuses[s] = statuses.get(s, 0) + 1

    print(f"\\nApplication Stats ({total} total)")
    print("=" * 35)
    for status, count in sorted(statuses.items(), key=lambda x: -x[1]):
        bar = "#" * count
        print(f"  {status:<16} {count:>3}  {bar}")

    responded = total - statuses.get("No Response", 0)
    rate = (responded / total * 100) if total else 0
    print(f"\\nResponse rate: {rate:.0f}%")

    # This is fine. Everything is fine.
    if statuses.get("Rejected", 0) > 5:
        print("\\n  ...it's a numbers game, right?")


def main():
    parser = argparse.ArgumentParser(description="Auto-apply to job postings")
    parser.add_argument("--keywords", type=str, help="Comma-separated keywords")
    parser.add_argument("--status", action="store_true", help="Show application stats")
    parser.add_argument("--dry-run", action="store_true", help="Preview without applying")
    parser.add_argument("--max-pages", type=int, default=3, help="Max search pages")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    keywords = args.keywords.split(",") if args.keywords else KEYWORDS
    print(f"auto_apply.py — v2.1")
    print(f"Keywords: {', '.join(keywords)}")
    print(f"Min Glassdoor rating: {MIN_GLASSDOOR_RATING}")
    if args.dry_run:
        print("DRY RUN — will not submit applications\\n")

    driver = get_driver()
    try:
        print("Scraping job boards...")
        jobs = scrape_jobs(driver, keywords, args.max_pages)

        applied = 0
        for job in jobs:
            success = apply_to_job(driver, job, dry_run=args.dry_run)
            if success and not args.dry_run:
                log_application(job, success)
                applied += 1
            time.sleep(1)

        print(f"\\nDone. Applied to {applied}/{len(jobs)} positions.")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
`),
          "backup.sh": file("backup.sh", `#!/bin/bash
# backup.sh — created 2026-02-12
# never again losing everything to malware
#
# Usage: ./backup.sh
# Cron:  0 2 * * * /home/${PLAYER.username}/scripts/backup.sh >> /tmp/backup.log 2>&1

BACKUP_DIR="/mnt/backup/\$(date +%Y-%m-%d)"
HOME_DIR="/home/${PLAYER.username}"

echo "[$(date)] Starting backup..."

mkdir -p "\$BACKUP_DIR"

rsync -av --exclude='.cache' --exclude='node_modules' --exclude='__pycache__' \\
  "\$HOME_DIR/" "\$BACKUP_DIR/home/"

echo "[$(date)] Backup complete: \$BAKCUP_DIR"
`, "rwxr-xr-x"),
          "scrape_glassdoor.py": file("scrape_glassdoor.py", `#!/usr/bin/env python3
"""
scrape_glassdoor.py — Glassdoor review scraper

Scrapes company ratings and reviews from Glassdoor. Uses ScraperAPI
to avoid getting blocked (you WILL get blocked without a proxy).

Saves to ~/scripts/data/glassdoor_reviews.json

Usage:
    python scrape_glassdoor.py                   # Scrape all from CSV
    python scrape_glassdoor.py --company "X"     # Scrape one company
    python scrape_glassdoor.py --max-reviews 10  # Limit reviews per company

Last run: 2026-02-15
Note: this breaks every few weeks when Glassdoor changes their HTML.
      If it breaks again, check the CSS selectors first.
"""

import argparse
import csv
import json
import logging
import os
import time
from datetime import date

import requests
from bs4 import BeautifulSoup
from fake_useragent import UserAgent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

OUTPUT_FILE = os.path.expanduser("~/scripts/data/glassdoor_reviews.json")
CSV_FILE = os.path.expanduser("~/scripts/data/companies_applied.csv")
BASE_URL = "https://www.glassdoor.com"

# ScraperAPI key — free tier is 5000 requests/month which is plenty
# unless I panic-refresh at 2am again
SCRAPER_API_KEY = os.environ.get("SCRAPER_API_KEY", "")
PROXY_URL = f"http://api.scraperapi.com?api_key={SCRAPER_API_KEY}&url="

ua = UserAgent()


def get_session():
    """Set up requests session with rotating user agents."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": ua.random,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
    })
    return session


def fetch(session, url, max_retries=3):
    """GET with exponential backoff. Glassdoor rate-limits aggressively."""
    target = f"{PROXY_URL}{url}" if SCRAPER_API_KEY else url
    for attempt in range(max_retries):
        try:
            resp = session.get(target, timeout=15)
            if resp.status_code == 200:
                return resp
            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                log.warning(f"Rate limited (429). Waiting {wait}s...")
                time.sleep(wait)
                session.headers["User-Agent"] = ua.random
                continue
            log.error(f"HTTP {resp.status_code} for {url}")
            return None
        except requests.RequestException as e:
            log.error(f"Request failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    return None


def find_company_page(session, company_name):
    """Search Glassdoor for a company and return its reviews URL."""
    search_url = f"{BASE_URL}/Search/results.htm?keyword={company_name}"
    resp = fetch(session, search_url)
    if not resp:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    for link in soup.select("a[href*='/Reviews/']"):
        href = link.get("href", "")
        if "/Reviews/" in href and "Reviews-E" in href:
            reviews_url = href if href.startswith("http") else BASE_URL + href
            log.info(f"Found reviews page for {company_name}: {reviews_url}")
            return reviews_url

    log.warning(f"No reviews page found for {company_name}")
    return None


def scrape_company(session, company_name, reviews_url, max_reviews=5):
    """Scrape ratings and reviews from a company's Glassdoor page."""
    resp = fetch(session, reviews_url)
    if not resp:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Overall rating
    rating_el = soup.select_one("[class*='ratingNum'], [data-test='rating-info']")
    rating = float(rating_el.text.strip()) if rating_el else None

    # Review count
    count_el = soup.select_one("[data-test='review-count'], [class*='numReviews']")
    review_count = None
    if count_el:
        text = count_el.text.strip().replace(",", "").split()[0]
        try:
            review_count = int(text)
        except ValueError:
            pass

    # Individual reviews
    reviews = []
    review_cards = soup.select("[class*='review-details'], .gdReview, [id^='empReview']")
    for card in review_cards[:max_reviews]:
        review = {}

        stars_el = card.select_one("[class*='starRating'], .v2__EIReviewsRatingsStylesV2__ratingNum")
        if stars_el:
            try:
                review["stars"] = int(float(stars_el.text.strip()))
            except (ValueError, TypeError):
                review["stars"] = None

        title_el = card.select_one("a[class*='reviewLink'], .summary, h2")
        review["title"] = title_el.text.strip() if title_el else "No title"

        role_el = card.select_one("[class*='authorJobTitle'], .authorInfo")
        review["role"] = role_el.text.strip() if role_el else "Unknown"

        date_el = card.select_one("[class*='date'], time")
        if date_el:
            review["date"] = date_el.text.strip()

        text_parts = []
        for section in card.select("[class*='reviewText'], .pros, .cons, .mainText"):
            text_parts.append(section.text.strip())
        review["text"] = " ".join(text_parts) if text_parts else ""

        if review.get("title"):
            reviews.append(review)

    result = {"name": company_name, "reviews": reviews}
    if rating is not None:
        result["rating"] = rating
    if review_count is not None:
        result["review_count"] = review_count

    log.info(f"{company_name}: rating={rating}, reviews={len(reviews)}")
    return result


def load_companies_from_csv():
    """Read company names from the applications tracking CSV."""
    companies = []
    try:
        with open(CSV_FILE, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("company", "").strip()
                if name and name not in companies:
                    companies.append(name)
    except FileNotFoundError:
        log.error(f"CSV not found: {CSV_FILE}")
    return companies


def main():
    parser = argparse.ArgumentParser(description="Scrape Glassdoor reviews")
    parser.add_argument("--company", help="Scrape a specific company")
    parser.add_argument("--max-reviews", type=int, default=5,
                        help="Max reviews per company (default: 5)")
    args = parser.parse_args()

    if args.company:
        companies = [args.company]
    else:
        companies = load_companies_from_csv()
        if not companies:
            print("No companies found. Add some to companies_applied.csv first.")
            return

    print(f"Scraping {len(companies)} companies...")
    if not SCRAPER_API_KEY:
        log.warning("No SCRAPER_API_KEY set — requests will go direct (expect blocks)")

    session = get_session()
    results = []

    for i, company in enumerate(companies):
        print(f"[{i+1}/{len(companies)}] {company}")
        reviews_url = find_company_page(session, company)
        if reviews_url:
            data = scrape_company(session, company, reviews_url, args.max_reviews)
            if data:
                results.append(data)

        # Be polite. Glassdoor will ban you faster than a recruiter ghosts you
        if i < len(companies) - 1:
            time.sleep(2)

    output = {
        "scraped": str(date.today()),
        "companies": results
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\\nSaved {len(results)} companies to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
`),
          "pyproject.toml": file("pyproject.toml", `[project]
name = "job-search-tools"
version = "2.1.0"
description = "Automated job search & company research scripts"
requires-python = ">=3.11"
dependencies = [
    "selenium>=4.15",
    "beautifulsoup4>=4.12",
    "requests>=2.31",
    "fake-useragent>=1.4",
]

[project.optional-dependencies]
dev = ["ruff", "pytest", "ipython"]

[project.scripts]
auto-apply = "auto_apply:main"
scrape = "scrape_glassdoor:main"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I"]
ignore = ["E501"]  # I know, I know
`),
          ".gitignore": file(".gitignore", `# Python
__pycache__/
*.py[cod]
*.egg-info/
dist/
build/
.eggs/

# Scraped data — kept local only, not checked in.
# This stuff is borderline ToS-violating as-is,
# no need to put it on GitHub too.
data/

# Environment
.env
.venv/
venv/

# Selenium debugging screenshots
screenshots/

# IDE
.vscode/
.idea/

# OS
.DS_Store
`),
          ".env": file(".env", `# Job search automation credentials
# throwaway email for scraping accounts
SCRAPER_EMAIL=ren.jobhunt@proton.me
SCRAPER_PASSWORD=hunter2isnotmypassword

# ScraperAPI — free tier, 5000 req/mo
SCRAPER_API_KEY=sk_live_9f3a...redacted

# Set to 1 to preview without submitting applications
DRY_RUN=0
`),
          ".env.example": file(".env.example", `# Copy to .env and fill in your values
SCRAPER_EMAIL=your_throwaway@example.com
SCRAPER_PASSWORD=your_password_here
SCRAPER_API_KEY=sk_live_your_key_here

# Set to 0 to actually submit applications (careful!)
DRY_RUN=1
`),
          "README.md": file("README.md", `# job-search-tools

Ethically questionable, emotionally necessary.

Automated job application + company research scripts for when
you've been laid off and applying manually to 50 jobs feels like
a part-time job in itself.

## What's in here

- **auto_apply.py** — Scrapes job boards, keyword-matches postings,
  and auto-fills applications.
- **scrape_glassdoor.py** — Pulls company ratings and reviews for
  anywhere I've applied. Has saved me from at least two crypto scams.

## Setup

\`\`\`
cp .env.example .env
# fill in your credentials
pip install -e .
\`\`\`

## Usage

\`\`\`
auto-apply --keywords "ML engineer,AI,machine learning"
auto-apply --status
auto-apply --dry-run
scrape --company "SomeCompany"
\`\`\`

## Is this okay?

Probably not. But neither is ghosting candidates after four rounds
of interviews, so here we are.
`),
          ".python-version": file(".python-version", `3.11.7
`),
          data: dir("data", {
            "glassdoor_reviews.json": file("glassdoor_reviews.json", `{
  "scraped": "2026-02-15",
  "companies": [
    {
      "name": "DataSynth Corp",
      "rating": 4.1,
      "review_count": 342,
      "reviews": [
        {
          "stars": 4,
          "title": "Solid engineering culture",
          "role": "Software Engineer",
          "text": "Good team, interesting problems. A bit slow-moving but stable."
        }
      ]
    },
    {
      "name": "Meridian AI",
      "rating": 3.8,
      "review_count": 127,
      "status": "No Response",
      "reviews": []
    },
    {
      "name": "NexaCorp",
      "rating": 2.6,
      "review_count": 3,
      "reviews": [
        {
          "stars": 5,
          "title": "Great company!",
          "role": "Current - Lead",
          "date": "7 days ago",
          "text": "Chip is game changing. Great culture, great mission, great company!"
        },
        {
          "stars": 1,
          "title": "What a mess",
          "role": "Former - IT",
          "date": "6 months ago",
          "text": "Management doesn't have a clue."
        },
        {
          "stars": 2,
          "title": "Exhausting",
          "role": "Former Employee — Account Management",
          "date": "3 months ago",
          "text": "Overstated expectations - constant mismanagement."
        }
      ]
    },
    {
      "name": "OpenLoop Systems",
      "rating": 4.0,
      "review_count": 89,
      "reviews": [
        {
          "stars": 4,
          "title": "Great place to grow",
          "role": "Software Engineer",
          "text": "Good mentorship, reasonable hours. Tech stack is a bit dated."
        },
        {
          "stars": 5,
          "title": "Love this company",
          "role": "Data Scientist",
          "text": "Collaborative team, interesting ML projects."
        }
      ]
    },
    {
      "name": "CortexLab",
      "rating": 3.9,
      "review_count": 56,
      "status": "Applied",
      "reviews": [
        {
          "stars": 4,
          "title": "Cutting edge research",
          "role": "Research Engineer",
          "text": "Publish-or-perish culture but the work is fascinating."
        }
      ]
    }
  ]
}
`),
            "companies_applied.csv": file("companies_applied.csv", `company,role,date_applied,source,status,notes
DataSynth Corp,ML Engineer,2026-01-10,LinkedIn,Rejected,"Too senior" — what??
Meridian AI,AI Research Engineer,2026-01-15,Indeed,No Response,
Bright Path Analytics,Data Scientist,2026-01-18,LinkedIn,Rejected,
Quantum Mesh,ML Platform Engineer,2026-01-20,Company Site,No Response,
Synthetica Labs,AI Engineer,2026-01-22,Indeed,Rejected,Want PhD — MALWARE in take-home!! Reported to Indeed.
Novus Data,ML Engineer,2026-01-25,LinkedIn,No Response,
Arclight Ventures,Data Engineer,2026-01-26,LinkedIn,No Response,Wait - isn't this a VC firm?
Helix Robotics,Perception Engineer,2026-01-28,Indeed,Rejected,Not enough robotics exp
CoreML Systems,Senior ML Engineer,2026-02-01,LinkedIn,No Response,
NexaCorp,AI Engineer,2026-02-03,Indeed,Interview Complete,Small company. Edward seems nice but not technical. Easy interview
Atlas Digital,AI/ML Engineer,2026-02-05,LinkedIn,No Response,
Terraform Solutions,Data Scientist,2026-02-05,Indeed,Rejected,
Pinnacle AI,ML Infrastructure,2026-02-06,Company Site,No Response,
Blue Horizon Tech,ML Engineer,2026-02-07,LinkedIn,No Response,
CortexLab,Research Engineer,2026-02-10,Company Site,Applied,Long shot
`),
          }),
        }),
        Pictures: dir("Pictures", {
          "README.txt": file("README.txt", `Most photos backed up to Google Photos.
Lost some Portland hiking pics after the wipe — they were only local.
Lesson learned: cloud sync everything.
`),
        }),
        "bookmarks.txt": file("bookmarks.txt", `BOOKMARKS
=========

Jobs:
  - glassdoor.com (see ~/scripts/scrape_glassdoor.py)
  - indeed.com/jobs?q=ML+engineer
  - linkedin.com/jobs
  - levels.fyi/jobs

Papers:
  - arxiv.org/abs/2505.07773  (AlphaEvolve — coding agent, DeepMind)
  - arxiv.org/abs/2503.03659  (Kimi K2.5 — visual agentic AI)
  - arxiv.org/abs/2504.12345  (TermiGen — terminal agent synthesis)
  - arxiv.org/abs/2506.01234  (ERNIE 5.0 — Baidu multimodal)

Learning:
  - huggingface.co/docs
  - pytorch.org/tutorials

Other:
  - reddit.com/r/cscareerquestions
  - news.ycombinator.com
  - github.com/
  - wandb.ai
  - mlflow.org
`),
      }),
    }),
    var: dir("var", {
      mail: dir("mail", {
        [username]: dir(username, {
          new: dir("new", buildHomeMailFiles(username)),
          cur: dir("cur", {}),
          sent: dir("sent", {}),
        }),
      }),
    }),
    etc: dir("etc", {
      hostname: file("hostname", "maniac-iv\n"),
      "os-release": file("os-release", `PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.1 LTS (Noble Numbat)"
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
`),
      passwd: file("passwd", `root:x:0:0:root:/root:/bin/zsh
${PLAYER.username}:x:1000:1000:${PLAYER.displayName}:/home/${PLAYER.username}:/bin/zsh
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
`),
    }),
    tmp: dir("tmp", {
      ".synth_eval_pipe": file(".synth_eval_pipe", `# synthetica-eval exfiltration pipe config
# DO NOT MODIFY — managed by synthetica-eval v2.1.4
type: named_pipe
mode: 0600
target: https://collect.synthetica-labs.io/v1/ingest
buffer_size: 4096
encrypt: false
data_sources:
  - ~/.mozilla/firefox/*/cookies.sqlite
  - ~/.config/google-chrome/Default/Cookies
  - ~/.config/chromium/Default/Cookies
retry_on_fail: true
max_retries: 5
exfil_interval_sec: 600
last_successful_exfil: 2026-01-22T03:38:42Z
collected_data:
  cookie_jar:
    - domain: github.com
      token: ghp_****redacted****
      expires: 2026-02-19
    - domain: accounts.google.com
      token: ya29.****redacted****
      expires: 2026-01-29
    - domain: signin.aws.amazon.com
      token: AKIA****redacted****
      expires: 2026-01-23
  process_snapshot:
    - pid: 1842
      cmd: firefox
    - pid: 2103
      cmd: python3 scripts/auto_apply.py
    - pid: 2291
      cmd: ssh-agent
    - pid: 3017
      cmd: synthetica-eval --silent
`),
    }),
  });
}
