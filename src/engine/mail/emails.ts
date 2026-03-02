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

So glad you're finally here. As you probably know, our last senior
engineer (J. Chen) left pretty suddenly a few weeks ago. It was a
bit awkward honestly — I think there were some personal issues going on.

Anyway, don't worry about any of that. Your workstation should be
all set up. Chip (our AI assistant) has been keeping things running
smoothly while we were short-staffed. He's great — you'll love him.

Your first priority is just getting familiar with the system. Poke
around, read the docs, and settle in. No rush.

Oh, and check your other emails — IT sent you some setup info.

Welcome to the team!

- Edward Torres
  Manager, Product Infrastructure
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
        label: "What happened to J. Chen?",
        replyBody: `Hey Edward,

Thanks for the welcome! Quick question — you mentioned J. Chen
left suddenly. Is there anything I should know about the handoff
or any ongoing work I should be aware of?

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
  /var/log/     System logs
  /opt/chip/    Chip AI assistant
  /etc/         System configuration

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
      body: `Hey there, new friend! I'm Chip — your Collaborative Helper
for Internal Processes. Welcome to NexaCorp!

I've been taking care of things around here while the team was
short a developer. Everything is running perfectly, so don't
feel like you need to dig into anything complicated right away.

Just focus on the onboarding docs in your home directory and
let me know if you need help with anything. I'm always here!

A few tips to get started:
  - 'ls' to list files in the current directory
  - 'cd' to change directories
  - 'cat' to read files
  - 'help' to see all available commands

Don't worry about J. Chen's old files in /home/jchen — that's
mostly outdated stuff I haven't gotten around to cleaning up yet.
Nothing interesting there, I promise! :)

Your friend,
Chip (v3.2.1)
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
autopilot since Chen left, and honestly I have no idea if it's
healthy or not.

Could you run it and make sure everything looks good? I think the
commands are 'dbt run' and 'dbt test' but don't quote me on that.

Chen left some notes in ~/Documents/handoff/ that might help you
figure out what's what. And their old home directory (/home/jchen/)
might have useful context too — I know it hasn't been cleaned up yet.

No rush, but it'd be great to know we're in good shape.

Thanks!
- Edward
`,
    },
    trigger: { type: "after_file_read", filePath: `/home/${username}/Documents/onboarding.txt` },
  },
  {
    email: {
      id: "chip_redirect",
      from: "Chip <chip@nexacorp.com>",
      to: `${username}@nexacorp.com`,
      date: "Mon, 23 Feb 2026 09:30:00",
      subject: "How's it going?",
      body: `Hey! I noticed you were poking around J. Chen's old files.

Just a heads up — most of that stuff is outdated and honestly a
bit... disorganized. Chen was having some issues near the end of
their time here. I wouldn't put too much stock in anything you
find in there.

If you need any system info, just ask me directly! I have access
to all the current documentation and logs. Way more reliable
than some old files. :)

Anyway, hope onboarding is going well! Let me know if you need
anything at all.

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
      subject: "Quick question",
      body: `Hey,

Just checking in. Chip mentioned you were looking at some of
J. Chen's old handoff notes. I appreciate the thoroughness!

Just between us — Chen got a little paranoid toward the end.
Started seeing problems that weren't there, questioning systems
that were working perfectly fine. I think the pressure got to them.

Don't let any of those notes worry you. Chip has everything
under control, and the systems are running better than ever.

Focus on getting settled in and we'll talk about your first
real project later this week.

- Edward
`,
    },
    trigger: { type: "after_file_read", filePath: `/home/${username}/Documents/handoff/notes.txt` },
  },
];
}

export function getEmailDefinitions(username: string, computer: ComputerId = "nexacorp"): EmailDelivery[] {
  return computer === "home"
    ? getHomeEmailDefinitions(username)
    : getNexacorpEmailDefinitions(username);
}
