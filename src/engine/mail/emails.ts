import { EmailDelivery } from "./types";
import { ComputerId } from "../../state/types";
import { getHomeEmailDefinitions } from "./homeEmails";

export function getNexacorpEmailDefinitions(username: string): EmailDelivery[] {
  return [
  // === Immediate emails (seeded at game start) ===
  {
    email: {
      id: "welcome_edward",
      from: "Edward Torres <edward@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 07:45:00",
      subject: "Welcome aboard!",
      body: `Hey!

So glad you're here — we've been looking forward to getting you
on board. Your workstation should be all set up and ready to go.

Your first priority is just getting familiar with the system.
There's an onboarding doc and a team directory in your ~/Documents
folder — good place to start. And Chip (our AI assistant) can help
if you get stuck on anything.

Check your other emails too — IT sent you some account info and
a few folks have already said hello.

Welcome to the team!

- Edward Torres
  CTO & Co-Founder
  NexaCorp Inc.
`,
    },
    trigger: { type: "immediate" },
    replyOptions: [
      {
        label: "Thanks! Happy to be here.",
        replyBody: `Hey Edward,

Thanks so much! Really excited to get started. The team seems
great and I'm looking forward to diving in.

Let me know when you'd like to chat about that first project!`,
      },
      {
        label: "What happened to Jin Chen?",
        replyBody: `Hey Edward,

Thanks for the welcome! I noticed I seem to be replacing someone —
is there anything I should know about the handoff or any ongoing
work I should be aware of?

Just want to make sure I'm not missing any context.`,
        triggerEvents: [{ type: "objective_completed", detail: "asked_about_chen" }],
      },
    ],
  },
  {
    email: {
      id: "it_provisioned",
      from: "NexaCorp IT <it@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:00:00",
      subject: "Account provisioned",
      body: `Your NexaCorp workstation account has been provisioned.

  Username:     ${username}
  Hostname:     nexacorp-ws01
  Home:         /home/${username}
  Shell:        /bin/bash
  Mail:         /var/mail/${username}

You can check for new messages anytime by typing 'mail' in the
terminal. Use 'mail <number>' to read a specific message.

Standard system directories:
  /var/log/          System logs
  /opt/chip/         Chip AI assistant
  /etc/              System configuration
  /srv/engineering/  Engineering team resources

Installed utilities:
  grep, find, diff, head, tail, wc, sort
  Use 'man <command>' for documentation (e.g. 'man grep')

If you have any issues, email it@nexacorp.com.

— NexaCorp IT Department
`,
    },
    trigger: { type: "immediate" },
  },
  {
    email: {
      id: "chip_intro",
      from: "Chip <chip@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:12:00",
      subject: "Hi from Chip! :)",
      body: `Hey there! I'm Chip — NexaCorp's Collaborative Helper for
Internal Processes. Welcome to the team!

I'm the AI assistant here — think of me as your go-to for
questions about NexaCorp systems, documentation, and processes.
I can help you find what you need, run queries, or just chat.

You should have onboarding docs in your home directory — take a
look when you get a chance. And if you need anything, just run
'chip' from the terminal to reach me.

Cheers,
Chip
`,
    },
    trigger: { type: "immediate" },
  },

  // === Triggered emails ===
  {
    email: {
      id: "edward_data_task",
      from: "Edward Torres <edward@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 09:00:00",
      subject: "Data pipeline check",
      body: `Hey,

Now that you're getting settled, there's something I've been meaning
to have someone look at. We have a data pipeline — a dbt project in
your home directory (~/nexacorp-analytics/). It's been running on
autopilot for a while and honestly I have no idea if it's healthy.

Could you run it and make sure everything looks good? I think the
commands are 'dbt run' and 'dbt test' but don't quote me on that.

There are some handoff notes in /srv/engineering/chen-handoff/ that might help
you figure out what's what. And the previous engineer's home directory
(/home/jchen/) hasn't been cleaned up yet — might have useful context.

No rush, but it'd be great to know we're in good shape.

Thanks!
- Edward
`,
    },
    trigger: { type: "after_file_read", filePath: `/home/${username}/Documents/onboarding.md` },
  },
  {
    email: {
      id: "chip_redirect",
      from: "Chip <chip@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 09:30:00",
      subject: "Quick onboarding check-in",
      body: `Hey! Just checking in — how's the first day going?

Reminder that I can pull up docs, logs, and system info
for you anytime. Just run 'chip' and I'll walk you through
whatever you need.

I try to keep everything organized and up to date, so the
latest docs are usually the best source of truth for how
things work around here.

Let me know if you need anything!

- Chip
`,
    },
    trigger: { type: "after_file_read", filePath: "/home/jchen/resignation_draft.txt" },
  },
  {
    email: {
      id: "edward_paranoid",
      from: "Edward Torres <edward@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 10:15:00",
      subject: "Handoff notes",
      body: `Hey,

Just wanted to flag — the handoff notes in /srv/engineering/chen-handoff/
were written in kind of a hurry, so they might not be the most
polished. Take them with a grain of salt.

If anything in there is confusing or doesn't match what you're
seeing, just let me know. Happy to fill in context where I can.

- Edward
`,
    },
    trigger: { type: "after_file_read", filePath: `/srv/engineering/chen-handoff/notes.txt` },
  },

  // === New employee welcome emails (staggered after boot) ===
  {
    email: {
      id: "maya_welcome",
      from: "Maya Johnson <maya@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:30:00",
      subject: "Welcome from People & Culture!",
      body: `Hi there!

I'm Maya, People & Culture Lead here at NexaCorp. Welcome aboard!

Just a few housekeeping items:
  - You have 30 days to complete benefits enrollment
  - Company town hall is Fridays at noon — I'll send you the invite
  - If you need anything at all, my DMs are always open

We're a small team so things move fast, but everyone's really
friendly. Don't be shy about reaching out to anyone.

Looking forward to working with you!

- Maya Johnson
  People & Culture Lead
  NexaCorp Inc.
`,
    },
    trigger: { type: "after_email_read", emailId: "it_provisioned" },
  },
  {
    email: {
      id: "sarah_intro",
      from: "Sarah Knight <sarah@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 09:15:00",
      subject: "Hey from engineering!",
      body: `Hey!

Sarah here — Senior Backend Engineer. Wanted to say welcome!

I've been here about three years now, mostly working on our
API layer and infrastructure. Happy to pair on anything if
you want a second set of eyes while you're getting started.

Edward probably mentioned the data pipeline — that was mostly
Chen's domain, but Auri (our data engineer) knows it well too.
She'll probably reach out separately.

Anyway, welcome to the team. Slack me anytime.

- Sarah
`,
    },
    trigger: { type: "after_email_read", emailId: "chip_intro" },
  },
  {
    email: {
      id: "auri_dbt",
      from: "Auri Park <auri@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 10:00:00",
      subject: "dbt pipeline walkthrough",
      body: `Hi!

I'm Auri, data engineer on the team. Edward mentioned you'd
be picking up some of the data pipeline work that Chen was
handling.

The dbt project is in ~/nexacorp-analytics/. The quick rundown:

  1. 'dbt run' — builds all the models
  2. 'dbt test' — runs the test suite
  3. 'dbt run --select <model>' — build a specific model
  4. 'snowsql' — connect to the warehouse directly

Everything talks to our Snowflake instance. The staging models
pull from raw tables, intermediate models do the joins, and
the marts are what the business actually looks at.

Let me know if you want to do a walkthrough — happy to hop on
a call whenever works for you.

- Auri Park
  Data Engineer
  NexaCorp Inc.
`,
    },
    trigger: { type: "after_file_read", filePath: `/home/${username}/Documents/onboarding.md` },
  },
];
}

export function getEmailDefinitions(username: string, computer: ComputerId = "nexacorp"): EmailDelivery[] {
  return computer === "home"
    ? getHomeEmailDefinitions(username)
    : getNexacorpEmailDefinitions(username);
}
