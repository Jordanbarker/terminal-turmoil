import { PiperDelivery } from "../../../engine/piper/types";

export function getOscarDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Oscar: Log check (after reading onboarding.md) ===
    {
      id: "oscar_log_check",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_log_1",
          from: "Oscar Diaz",
          timestamp: "9:45 AM",
          body: "Hey, welcome! Great timing — I'm debugging a deploy that went sideways overnight. Either someone pushed bad code at 3am or the servers have developed opinions. I'm going with option B until proven otherwise.",
        },
        {
          id: "oscar_log_2",
          from: "Oscar Diaz",
          timestamp: "9:45 AM",
          body: "Could you poke around /var/log/ and see if anything looks off around 3am? I'm buried in the fix and could use a second pair of eyes. Fair warning — reading system logs on your first day is either a great sign or a terrible one.",
        },
        {
          id: "oscar_log_3",
          from: "Oscar Diaz",
          timestamp: "9:46 AM",
          body: "There should be a few log files in there. I'm mostly curious about errors or anything that doesn't belong. No rush, just whenever you get a sec.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/onboarding.md" },
      replyOptions: [
        {
          label: "On it — I'll take a look.",
          messageBody: "Sure thing! I'll dig through the logs and let you know what I find.",
          triggerEvents: [{ type: "objective_completed", detail: "search_tools_accepted" }],
        },
        {
          label: "Sure, any tips on grep/find/diff?",
          messageBody: "Happy to help! It's been a minute since I've used grep/find/diff though — any quick tips to jog my memory?",
          triggerEvents: [
            { type: "objective_completed", detail: "search_tools_tips_requested" },
            { type: "objective_completed", detail: "search_tools_accepted" },
          ],
        },
      ],
    },

    // Oscar log tips (after tips requested)
    {
      id: "oscar_log_tips",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_tips_1",
          from: "Oscar Diaz",
          timestamp: "9:52 AM",
          body: "Sure — here's what I'm looking at:",
        },
        {
          id: "oscar_tips_2",
          from: "Oscar Diaz",
          timestamp: "9:52 AM",
          body: `  Feb 23 03:14:22 nexacorp-ws01 chip_service[4821]: WARN unexpected batch job
  Feb 23 03:14:23 nexacorp-ws01 chip_service[4821]: ERROR failed to sync
  Feb 23 03:15:01 nexacorp-ws01 CRON[5932]: session opened

Something around 3am is misbehaving but I can't tell if it's related to the deploy or just noise.`,
        },
        {
          id: "oscar_tips_3",
          from: "Oscar Diaz",
          timestamp: "9:53 AM",
          body: `grep, find, and diff are your friends here. man pages are solid if you need syntax. I'd start with something like:

  grep "error" /var/log/system.log

and go from there. Also worth checking if there are any .bak files in /var/log/ — sometimes those have entries the live logs don't.`,
        },
        {
          id: "oscar_tips_4",
          from: "Oscar Diaz",
          timestamp: "9:54 AM",
          body: "Good luck. If you find anything interesting I'll buy you a coffee. Virtually. We're remote.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "search_tools_tips_requested" },
    },

    // Oscar tab tip (after accepting log task)
    {
      id: "oscar_tab_tip",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_tab_1",
          from: "Oscar Diaz",
          timestamp: "9:55 AM",
          body: "Oh one more thing — your terminal supports tabs. Ctrl+B, C opens a new one. Super handy for tailing logs in one tab while you grep in another.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "search_tools_accepted" },
    },

    // === DM Oscar: What did you find? (after reading system.log) ===
    {
      id: "oscar_access_review",
      channelId: "dm_oscar",
      messages: [],
      trigger: { type: "after_file_read", filePath: "/var/log/system.log", requireDelivered: "oscar_log_check" },
      replyOptions: [
        {
          label: "Nothing weird — probably just a bad deploy.",
          messageBody: "Yeah, nothing jumped out. Probably just a bad deploy that auto-recovered.",
          triggerEvents: [{ type: "objective_completed", detail: "oscar_logs_normal" }, { type: "objective_completed", detail: "oscar_log_findings_shared" }],
        },
        {
          label: "I diffed the logs — entries were stripped from the backup.",
          messageBody: "Actually, I diffed system.log against the .bak file. There are entries in the backup that aren't in the live log. Someone — or something — removed them.",
          visibleWhen: { flag: "discovered_log_tampering" },
          triggerEvents: [{ type: "objective_completed", detail: "oscar_logs_tampered" }, { type: "objective_completed", detail: "oscar_log_findings_shared" }],
        },
      ],
    },

    // === Oscar: Crisis averted path → access.log ask ===
    {
      id: "oscar_log_normal",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_normal_1",
          from: "Oscar Diaz",
          timestamp: "10:31 AM",
          body: "Yeah, that's what I'm thinking. Bad deploy that auto-recovered. Wouldn't be the first time.",
        },
        {
          id: "oscar_normal_2",
          from: "Oscar Diaz",
          timestamp: "10:35 AM",
          body: "Unrelated — while I was in there I noticed chip_service_account showing up a lot in /var/log/access.log. You're the AI person, right? Does that level of file access look normal to you?",
        },
        {
          id: "oscar_normal_3",
          from: "Oscar Diaz",
          timestamp: "10:36 AM",
          body: `Could you sort through it and count how many times each entry shows up? Something like:

  sort /var/log/access.log | uniq -c

That should group the duplicates and show counts. Curious if anything jumps out.`,
        },
      ],
      trigger: { type: "after_objective", objectiveId: "oscar_logs_normal" },
      replyOptions: [
        {
          label: "On it — I'll sort through it.",
          messageBody: "Sure thing, I'll sort the access log and see what stands out.",
          triggerEvents: [{ type: "objective_completed", detail: "processing_tools_accepted" }],
        },
        {
          label: "Sure — quick refresher on sort and uniq?",
          messageBody: "Happy to help! Can you remind me how sort and uniq work?",
          triggerEvents: [
            { type: "objective_completed", detail: "processing_tools_tips_requested" },
            { type: "objective_completed", detail: "processing_tools_accepted" },
          ],
        },
      ],
    },

    // === Oscar: Tampering discovered path → access.log ask ===
    {
      id: "oscar_log_tampered",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_tamper_1",
          from: "Oscar Diaz",
          timestamp: "10:31 AM",
          body: "Wait, entries in the backup that aren't in the live log?",
        },
        {
          id: "oscar_tamper_2",
          from: "Oscar Diaz",
          timestamp: "10:31 AM",
          body: "That's not log rotation. That looks like someone — or something — cleaning up after itself.",
        },
        {
          id: "oscar_tamper_3",
          from: "Oscar Diaz",
          timestamp: "10:35 AM",
          body: "OK this makes the access audit even more interesting. I noticed chip_service_account showing up a lot in /var/log/access.log. If something's scrubbing logs, I want to know what else it's touching.",
        },
        {
          id: "oscar_tamper_4",
          from: "Oscar Diaz",
          timestamp: "10:36 AM",
          body: `Could you sort through it and count how many times each entry shows up? Something like:

  sort /var/log/access.log | uniq -c

That should group the duplicates and show counts. Curious if anything jumps out.`,
        },
      ],
      trigger: { type: "after_objective", objectiveId: "oscar_logs_tampered" },
      replyOptions: [
        {
          label: "On it — I'll sort through it.",
          messageBody: "Sure thing, I'll sort the access log and see what stands out.",
          triggerEvents: [{ type: "objective_completed", detail: "processing_tools_accepted" }],
        },
        {
          label: "Sure — quick refresher on sort and uniq?",
          messageBody: "Happy to help! Can you remind me how sort and uniq work?",
          triggerEvents: [
            { type: "objective_completed", detail: "processing_tools_tips_requested" },
            { type: "objective_completed", detail: "processing_tools_accepted" },
          ],
        },
      ],
    },

    // === Oscar: Follow-up after reading access.log (normal path) ===
    {
      id: "oscar_access_followup",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_followup_1",
          from: "Oscar Diaz",
          timestamp: "11:15 AM",
          body: "See anything interesting in that access log?",
        },
        {
          id: "oscar_followup_2",
          from: "Oscar Diaz",
          timestamp: "11:15 AM",
          body: "That chip_service_account is showing up everywhere, right? SSH keys, leadership docs, personnel files... For something that's supposed to be a 'helpful assistant' it sure is reading a lot of stuff that has nothing to do with helping anyone.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/var/log/access.log", requireDelivered: "oscar_log_normal" },
      replyOptions: [
        {
          label: "It's reading SSH keys and leadership docs — that doesn't seem right.",
          messageBody: "Yeah, chip_service_account is all over the SSH keys and leadership docs. That's way outside the scope of an AI assistant.",
          triggerEvents: [
            { type: "objective_completed", detail: "oscar_access_suspicious" },
            { type: "objective_completed", detail: "oscar_access_reported" },
          ],
        },
        {
          label: "Mostly normal access patterns, nothing too concerning.",
          messageBody: "Looks mostly like normal service account stuff to me. Nothing that jumps out.",
          triggerEvents: [
            { type: "objective_completed", detail: "oscar_access_dismissed" },
            { type: "objective_completed", detail: "oscar_access_reported" },
          ],
        },
      ],
    },

    // === Oscar: Follow-up after reading access.log (tampered path) ===
    {
      id: "oscar_access_followup_tampered",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_followup_t1",
          from: "Oscar Diaz",
          timestamp: "11:15 AM",
          body: "See anything interesting in that access log?",
        },
        {
          id: "oscar_followup_t2",
          from: "Oscar Diaz",
          timestamp: "11:15 AM",
          body: "That chip_service_account is showing up everywhere, right? SSH keys, leadership docs, personnel files... Combine that with the log scrubbing you found earlier and this is starting to look less like a misconfiguration and more like something deliberate.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/var/log/access.log", requireDelivered: "oscar_log_tampered" },
      replyOptions: [
        {
          label: "It's reading SSH keys and leadership docs — that doesn't seem right.",
          messageBody: "Yeah, chip_service_account is all over the SSH keys and leadership docs. Combined with the log tampering — something is very wrong here.",
          triggerEvents: [
            { type: "objective_completed", detail: "oscar_access_suspicious" },
            { type: "objective_completed", detail: "oscar_access_reported" },
          ],
        },
        {
          label: "Mostly normal access patterns, nothing too concerning.",
          messageBody: "Looks mostly like normal service account stuff to me. Nothing that jumps out beyond what we already found.",
          triggerEvents: [
            { type: "objective_completed", detail: "oscar_access_dismissed" },
            { type: "objective_completed", detail: "oscar_access_reported" },
          ],
        },
      ],
    },

    // === Oscar: Reaction after player reports back ===
    {
      id: "oscar_access_reaction",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_reaction_1",
          from: "Oscar Diaz",
          timestamp: "11:20 AM",
          body: "Yeah, the SSH key access is what got me too. Why would an AI assistant need to read everyone's SSH keys? And the leadership docs — board minutes, headcount plans? That's not 'helping with tickets.'",
        },
        {
          id: "oscar_reaction_2",
          from: "Oscar Diaz",
          timestamp: "11:21 AM",
          body: "I'm going to mention this to Sarah. She manages the infra team — if anyone can tell us whether this is expected behavior or something we should be worried about, it's her.",
        },
        {
          id: "oscar_reaction_3",
          from: "Oscar Diaz",
          timestamp: "11:21 AM",
          body: "Good catch, by the way. I owe you that virtual coffee.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "oscar_access_suspicious" },
    },

    // === Oscar: Reaction when player dismissed concerns ===
    {
      id: "oscar_access_reaction_dismissed",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_reaction_d1",
          from: "Oscar Diaz",
          timestamp: "11:20 AM",
          body: "Really? An AI assistant reading SSH keys and board minutes doesn't seem a little... outside its job description?",
        },
        {
          id: "oscar_reaction_d2",
          from: "Oscar Diaz",
          timestamp: "11:21 AM",
          body: "Maybe I'm being paranoid, but I'm going to flag it with Sarah anyway. She manages the infra team — she'll know if this is expected or not.",
        },
        {
          id: "oscar_reaction_d3",
          from: "Oscar Diaz",
          timestamp: "11:21 AM",
          body: "Either way — thanks for looking into it. Virtual coffee still stands.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "oscar_access_dismissed" },
    },

    // Oscar processing tips (after tips requested)
    {
      id: "oscar_processing_tips",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_proc_1",
          from: "Oscar Diaz",
          timestamp: "10:38 AM",
          body: "Sure! Here's the quick version:",
        },
        {
          id: "oscar_proc_2",
          from: "Oscar Diaz",
          timestamp: "10:38 AM",
          body: `sort — sort lines alphabetically or numerically
  sort filename.txt              Sort all lines A-Z
  sort -n filename.txt           Sort numerically
  sort -r filename.txt           Reverse order`,
        },
        {
          id: "oscar_proc_3",
          from: "Oscar Diaz",
          timestamp: "10:39 AM",
          body: `uniq — filter out adjacent duplicate lines
  uniq filename.txt              Remove adjacent duplicates
  uniq -c filename.txt           Count occurrences
  uniq -d filename.txt           Show only duplicates`,
        },
        {
          id: "oscar_proc_4",
          from: "Oscar Diaz",
          timestamp: "10:39 AM",
          body: `The key trick: uniq only catches ADJACENT duplicates, so you always want to sort first:

  sort file.log | uniq -c        Count duplicate lines
  sort file.log | uniq -d        Show just the duplicates
  sort file.log | uniq -c | sort -rn   Most frequent first

That last one is my go-to for spotting patterns in logs.`,
        },
      ],
      trigger: { type: "after_objective", objectiveId: "processing_tools_tips_requested" },
    },
  ];
}
