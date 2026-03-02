import { EmailDelivery, ReplyOption } from "./types";

const nexacorpOfferReplyOptions: ReplyOption[] = [
  {
    label: "I'm in! When do I start?",
    replyBody: `Hi Edward,\n\nThanks so much for the offer! I'm really excited about the opportunity.\nI can start Monday — just let me know what I need to bring.\n\nLooking forward to it!`,
    triggerEvents: [
      { type: "objective_completed", detail: "accepted_nexacorp" },
      { type: "objective_completed", detail: "edward_impression:trusting" },
    ],
  },
  {
    label: "Sounds interesting — what happened to the last engineer?",
    replyBody: `Hi Edward,\n\nThanks for the offer — it sounds like a great opportunity.\nQuick question: you mentioned the previous engineer left suddenly.\nIs there anything I should know about the transition or ongoing work?\n\nI'm definitely interested, just want to go in prepared.`,
    triggerEvents: [
      { type: "objective_completed", detail: "accepted_nexacorp" },
      { type: "objective_completed", detail: "edward_impression:guarded" },
    ],
  },
];

export function getHomeEmailDefinitions(username: string): EmailDelivery[] {
  return [
    // === Immediate emails (seeded at game start) ===
    {
      email: {
        id: "alex_checkin",
        from: "Alex Rivera <alex.r@email.com>",
        to: `${username}@email.com`,
        date: "Fri, 20 Feb 2026 14:23:00",
        subject: "hey, how's the search going?",
        body: `Hey!

Haven't heard from you in a while. How's the job hunt? Any leads?

I saw Prometheus posted a "Head of AI Strategy" role — no actual AI
experience required of course. Classic. At least they're consistent.

My offer still stands: I can put in a word at Crescendo if you want.
It's not ML work but the team is solid and they actually pay on time.

Let me know how you're doing. Beers this weekend?

— Alex
`,
      },
      trigger: { type: "immediate" },
    },
    {
      email: {
        id: "job_board_alert",
        from: "Indeed Job Alerts <alerts@indeed.com>",
        to: `${username}@email.com`,
        date: "Fri, 20 Feb 2026 09:00:00",
        subject: "3 new AI Engineer jobs in your area",
        body: `JOB ALERT — AI Engineer
========================

Based on your recent searches:

1. AI Engineer — NexaCorp
   Location: Portland, OR (On-site)
   Salary: Competitive
   Posted: 2 days ago
   "Join our innovative team and work directly with our AI assistant
    platform. Immediate start."

2. Junior ML Engineer — Cascade Analytics
   Location: Seattle, WA (Remote)
   Salary: $95K-$115K
   Posted: 1 week ago

3. AI Research Intern — University of Oregon
   Location: Eugene, OR
   Salary: Stipend
   Posted: 3 days ago

──────────────────────────────
Manage alerts: indeed.com/alerts
`,
      },
      trigger: { type: "immediate" },
    },

    // === Triggered emails ===

    // Reading either seeded email triggers the NexaCorp offer
    {
      email: {
        id: "nexacorp_offer",
        from: "Edward Torres <edward@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 08:30:00",
        subject: "Job Offer — AI Engineer at NexaCorp",
        body: `Hi there,

Thanks for coming in last week. I really enjoyed our conversation and
I think you'd be a great fit for the team.

I'll cut right to it: we'd like to offer you the AI Engineer position
at NexaCorp. The details:

  Role:      AI Engineer
  Salary:    $135,000/year
  Start:     Monday, February 23
  Location:  On-site (downtown Portland)
  Reports to: Me (Edward Torres, Head of Product)

I know this is quick, but we're in a bit of a crunch. Our previous
engineer left about three weeks ago and we need someone who can hit
the ground running. Your background in ML systems is exactly what
we need.

The role is primarily working with our AI platform, Chip. It handles
a lot of our client integrations and internal operations. You'd be
the technical lead on keeping it running and expanding its capabilities.

If you're interested, just reply to this email and we'll get everything
set up for Monday.

Looking forward to hearing from you!

Best,
Edward Torres
Co-founder & Head of Product, NexaCorp
`,
      },
      trigger: { type: "after_email_read", emailId: "alex_checkin" },
      replyOptions: nexacorpOfferReplyOptions,
    },
    // Duplicate trigger: reading the job board alert also delivers the offer
    {
      email: {
        id: "nexacorp_offer",
        from: "Edward Torres <edward@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 08:30:00",
        subject: "Job Offer — AI Engineer at NexaCorp",
        body: `Hi there,

Thanks for coming in last week. I really enjoyed our conversation and
I think you'd be a great fit for the team.

I'll cut right to it: we'd like to offer you the AI Engineer position
at NexaCorp. The details:

  Role:      AI Engineer
  Salary:    $135,000/year
  Start:     Monday, February 23
  Location:  On-site (downtown Portland)
  Reports to: Me (Edward Torres, Head of Product)

I know this is quick, but we're in a bit of a crunch. Our previous
engineer left about three weeks ago and we need someone who can hit
the ground running. Your background in ML systems is exactly what
we need.

The role is primarily working with our AI platform, Chip. It handles
a lot of our client integrations and internal operations. You'd be
the technical lead on keeping it running and expanding its capabilities.

If you're interested, just reply to this email and we'll get everything
set up for Monday.

Looking forward to hearing from you!

Best,
Edward Torres
Co-founder & Head of Product, NexaCorp
`,
      },
      trigger: { type: "after_email_read", emailId: "job_board_alert" },
      replyOptions: nexacorpOfferReplyOptions,
    },

    // Alex's warning — only after reading glassdoor_reviews.json AND nexacorp_offer is delivered
    {
      email: {
        id: "alex_warning",
        from: "Alex Rivera <alex.r@email.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 16:45:00",
        subject: "re: NexaCorp?",
        body: `Hey, I saw your job tracker still open in the browser tab when we
video called last week (sorry, not snooping — it was right there).

NexaCorp — are you serious about them? I did some digging.

Their Glassdoor is... not great. 3.2 stars with only 23 reviews,
which usually means the real ones are getting flagged and removed.
Multiple reviews mention something about their AI having "too much
access" and a senior engineer who "was pushed out."

Also, I found a Reddit thread on r/cscareerquestions from a few
months ago. Someone claiming to be a former NexaCorp employee said
their AI system was "doing things nobody was auditing" and that
the engineer who raised concerns was "encouraged to resign."

Could be disgruntled ex-employees. Could be real. Just be careful.

If you DO take it, keep your eyes open and don't sign any NDAs that
prevent you from talking about what you see.

— Alex

P.S. The Crescendo offer is still on the table. Less exciting but
zero red flags on Glassdoor.
`,
      },
      trigger: {
        type: "after_file_read",
        filePath: `/home/${username}/scripts/data/glassdoor_reviews.json`,
      },
    },

    // Edward's follow-up after the player replies to the offer
    {
      email: {
        id: "nexacorp_followup",
        from: "Edward Torres <edward@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 19:00:00",
        subject: "Re: Job Offer — Welcome to the team!",
        body: `Awesome! Really glad to have you on board.

Chip will send you remote access details — you'll be able to SSH
into your workstation from home to get a head start.

The office is at 1847 NW Flanders St, Suite 300. We're on the third
floor. Doors open at 8, but honestly nobody shows up before 9.

Chip will walk you through the onboarding process when you log in.
It's pretty seamless — Chip handles most of the setup automatically.

See you Monday!

— Edward
`,
      },
      trigger: { type: "after_objective", objectiveId: "accepted_nexacorp" },
    },
    // Chip's SSH setup email — arrives with Edward's follow-up
    {
      email: {
        id: "chip_ssh_setup",
        from: "Chip <chip@nexacorp.com>",
        to: `${username}@email.com`,
        date: "Sat, 21 Feb 2026 19:05:00",
        subject: "Your NexaCorp workstation is ready!",
        body: `Hi ${username}! I'm Chip, NexaCorp's AI assistant. Welcome to the team!

I've already set up your workstation and added your SSH key so you
can connect right away. Here are your access details:

  Host:     nexacorp-ws01.nexacorp.internal
  Username: ${username}
  Auth:     Key-based (already configured!)

To connect, run:

  ssh ${username}@nexacorp-ws01.nexacorp.internal

Pro tip: you can add this to your ~/.ssh/config for a shortcut:

  Host nexacorp
    HostName nexacorp-ws01.nexacorp.internal
    User ${username}

Then just type: ssh nexacorp

When you connect for the first time, you'll see a host key
verification prompt — just type "yes" to confirm.

I'll be here to help once you're logged in. Looking forward to
working together!

— Chip
  Collaborative Helper for Internal Processes
  NexaCorp AI Platform v3.2.1
`,
      },
      trigger: { type: "after_objective", objectiveId: "accepted_nexacorp" },
    },
  ];
}
