import { EmailDelivery } from "../../engine/mail/types";
import { PLAYER } from "../player";

export const NEXACORP_EMAIL_IDS = [
  "welcome_edward",
  "it_provisioned",
  "chip_intro",
  "oscar_coder_setup",
  "edward_paranoid",
  "maya_welcome",
  "edward_handoff_suggestion",
  "edward_end_of_day",
  "jessica_welcome",
  "tom_welcome",
] as const;
export type NexacorpEmailId = (typeof NEXACORP_EMAIL_IDS)[number];

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

  /srv/engineering/onboarding.md   Setup checklist and useful commands
  /srv/engineering/team-info.md    Who's who on the engineering team

We use Piper for team chat — type 'piper' to check it out.

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

Your colleagues will help you get set up with additional tools
as you need them. Use 'man <command>' for documentation.

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
      id: "oscar_coder_setup",
      from: "Oscar Diaz <oscar@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 09:15:00",
      subject: "Your Coder workspace is ready",
      body: `Hey! I set up your Coder workspace as part of onboarding.

When you need it for data work, just connect with:

  coder ssh ai

It's got dbt, snow (Snowflake CLI), and python pre-installed.
Auri can walk you through the analytics pipeline when you're
ready.

Type 'exit' to disconnect and get back to your workstation.
Let me know if you hit any issues!

- Oscar
`,
    },
    trigger: { type: "after_file_read", filePath: "/srv/engineering/onboarding.md" },
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

A few onboarding items for your first week:

  [ ] Review the employee handbook (it's in your Documents folder)
  [ ] Benefits enrollment — you have 30 days from your start date. 
  [ ] Complete tax documents (I'll send the portal link separately.)

Other things to know:
  - Company town hall is Fridays at noon
  - PTO is flexible after your first 60 days — just give your manager a heads up

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

  // === Handoff emails ===
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
    trigger: { type: "after_file_read", filePath: `/srv/engineering/team-info.md`, requireDelivered: "maya_welcome" },
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

P.S. Chen's home directory (/home/jchen/) still hasn't been
cleaned up. Might be useful context for understanding the
codebase, might just be clutter. IT will get to it eventually.

- Edward
`,
    },
    trigger: { type: "after_command", command: "dbt" },
  },

  // === Light-tier founder emails (after reading Edward's welcome) ===
  {
    email: {
      id: "jessica_welcome",
      from: "Jessica Langford <jessica@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:45:00",
      subject: "Welcome",
      body: `${PLAYER.displayName},

Edward speaks highly of you. Welcome to the team.

Jessica
`,
    },
    trigger: { type: "after_email_read", emailId: "welcome_edward" },
  },
  {
    email: {
      id: "tom_welcome",
      from: "Tom Chen <tom@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 08:50:00",
      subject: "Welcome to NexaCorp!",
      body: `Hey ${PLAYER.displayName}!

Tom here — CMO and co-founder. Just wanted to personally
welcome you aboard. Edward's been singing your praises and
we're thrilled to have you.

We're building something really special here and I think
you're going to love it. If you ever want to grab virtual
coffee and hear the origin story, my door is always open!

Happy first day!
- Tom
`,
    },
    trigger: { type: "after_email_read", emailId: "welcome_edward" },
  },
];
}
