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
          body: "Could you check the system logs in /var/log/ for anything weird around 3am? I'm buried in the fix and could use a second pair of eyes. Fair warning — reading system logs on your first day is either a great sign or a terrible one.",
        },
        {
          id: "oscar_log_3",
          from: "Oscar Diaz",
          timestamp: "9:46 AM",
          body: "Something like 'grep error /var/log/system.log' should get you started. You can also use 'find' to locate other log files and 'diff' to compare them.",
        },
        {
          id: "oscar_log_4",
          from: "Oscar Diaz",
          timestamp: "9:46 AM",
          body: "No rush, just whenever you get a sec.",
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

    // === DM Oscar: Access review / sort+uniq (after search_tools_accepted) ===
    {
      id: "oscar_access_review",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_access_1",
          from: "Oscar Diaz",
          timestamp: "10:30 AM",
          body: "Hey again — thanks for helping with the logs earlier!",
        },
        {
          id: "oscar_access_2",
          from: "Oscar Diaz",
          timestamp: "10:30 AM",
          body: "One more ask: I pulled a file access audit log from IT. It's at /var/log/access.log. Reading it is like a fun game of 'spot who has too much access.' Spoiler: the list is longer than you'd hope.",
        },
        {
          id: "oscar_access_3",
          from: "Oscar Diaz",
          timestamp: "10:31 AM",
          body: `Could you sort through it and count how many times each entry shows up? Something like:

  sort /var/log/access.log | uniq -c

That should group the duplicates and show counts. Curious if anything jumps out.`,
        },
      ],
      trigger: { type: "after_file_read", filePath: "/var/log/system.log", requireDelivered: "oscar_log_check" },
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
