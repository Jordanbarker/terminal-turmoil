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
on board. Chip should reach out shortly to help with onboarding. 
Let me know if you don't see anything from him today.

Your first priority is just getting familiar with the system.
Here are a couple things to check out first:

  ~/Documents/onboarding.md   Setup checklist and useful commands
  ~/Documents/team-info.md    Who's who on the engineering team

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

A few onboarding items for your first week:

  [ ] Benefits enrollment — you have 30 days from your start
      date. I'll send the portal link separately.
  [ ] Review the employee handbook (I'll send the link)
  [ ] Emergency contact form (I'll send this too, no rush)

Other things to know:
  - Company town hall is Fridays at noon
  - PTO is flexible — just give your manager a heads up
  - We use Slack for most things, email for anything official

I know that's a lot of checkboxes for day one. Don't stress
about it — none of it's due today. Just settle in, meet folks,
and come find me if you need anything. I mean that!

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

I've been here since almost the beginning, mostly working on our
API layer. Currently untangling some auth middleware that was
written in a hurry six months ago — don't ask. Happy to pair on
anything if you want a second set of eyes while you're getting
started.

Anyway, welcome. Slack me anytime or just grep the codebase and
judge us silently — that's what I did my first week.

- Sarah
`,
    },
    trigger: { type: "after_email_read", emailId: "chip_intro" },
  },
  {
    email: {
      id: "auri_hello",
      from: "Auri Park <auri@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 09:30:00",
      subject: "Welcome from data eng!",
      body: `Hey! I'm Auri, the data engineer on the team. Welcome!

I've been kind of holding the fort on the data side since Chen
left — it's been a lot, honestly. Really glad to have another
engineer around.

No need to jump into anything right away — settle in first!
When you're ready to get oriented, there are some handoff notes
Chen left in /srv/engineering/chen-handoff/ that should give you
a sense of what's what.

Happy to walk through anything whenever you're ready. No rush!

- Auri
`,
    },
    trigger: { type: "after_file_read", filePath: `/home/${username}/Documents/team-info.md` },
  },
  {
    email: {
      id: "edward_handoff_suggestion",
      from: "Edward Torres <edward@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 09:45:00",
      subject: "Auri could use a hand",
      body: `Hey,

Auri mentioned she's been stretched thin since Chen left — she
could really use some help with the data pipeline stuff. No
pressure today, but when you get a chance, the handoff docs are
at /srv/engineering/chen-handoff/.

Should give you a good sense of what Chen was working on before
he left.

Thanks!
- Edward
`,
    },
    trigger: { type: "after_email_read", emailId: "auri_hello" },
  },
  {
    email: {
      id: "auri_pipeline_help",
      from: "Auri Park <auri@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 10:30:00",
      subject: "Quick favor — pipeline run?",
      body: `Hey! So I saw you were looking at the handoff notes — nice.

Would you mind running the data pipeline when you get a chance?
I've been meaning to check it but keep getting pulled into other
things. I noticed dbt + Snowflake on your resume so this should
be right up your alley!

Here's the quick version:

  1. Ask Chip to clone the analytics repo (just run 'chip')
  2. 'dbt run' — builds all the models
  3. 'dbt test' — runs the test suite

Everything talks to our Snowflake instance. The staging models
pull from raw tables, intermediate models do the joins, and
the marts are what the business actually looks at.

If anything looks off, let me know — some of Chen's models are
a little... creative. I haven't had a chance to audit everything.

Thanks!!

- Auri
`,
    },
    trigger: { type: "after_file_read", filePath: `/srv/engineering/chen-handoff/notes.txt` },
  },
  {
    email: {
      id: "edward_end_of_day",
      from: "Edward Torres <edward@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 17:00:00",
      subject: "End of day 1",
      body: `Hey,

Great first day! Heard from Auri that you got the pipeline
running — really appreciate you jumping on that.

One more thing — Chip has been acting a little off lately.
Nothing major, but some odd outputs that don't match what
the team expects. Since you're the AI expert now, could you
poke around /opt/chip/ when you get a chance? No rush.

- Edward

P.S. Chen's home directory (/home/jchen/) still hasn't been
cleaned up. Might be useful context, might just be clutter.
IT will get to it eventually.
`,
    },
    trigger: { type: "after_command", command: "dbt" },
  },
];
}

export function getEmailDefinitions(username: string, computer: ComputerId = "nexacorp"): EmailDelivery[] {
  return computer === "home"
    ? getHomeEmailDefinitions(username)
    : getNexacorpEmailDefinitions(username);
}
