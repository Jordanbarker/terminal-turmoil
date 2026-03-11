import { PiperDelivery } from "../../engine/piper/types";
import { PLAYER } from "../player";

export function getPiperDeliveries(username: string): PiperDelivery[] {
  return [
    // === #general — immediate welcome messages ===
    {
      id: "general_edward_welcome",
      channelId: "general",
      messages: [
        {
          id: "general_edward_1",
          from: "Edward Torres",
          timestamp: "9:00 AM",
          body: `Hey everyone, please welcome our newest team member, ${PLAYER.displayName}! They're joining the engineering team.`,
        },
        {
          id: "general_maya_1",
          from: "Maya Johnson",
          timestamp: "9:02 AM",
          body: "Welcome!! Stop by (or message me) if you need anything. \u{1F44B}",
        },
        {
          id: "general_cassie_1",
          from: "Cassie Moreau",
          timestamp: "9:03 AM",
          body: "Welcome to the team! Excited to have more engineering firepower.",
        },
      ],
      trigger: { type: "immediate" },
      replyOptions: [
        {
          label: "Thanks everyone! Happy to be here.",
          messageBody: "Thanks everyone! Really excited to get started.",
        },
        {
          label: "Hi! Looking forward to working with you all.",
          messageBody: "Hi! Looking forward to working with everyone. This seems like a great team.",
        },
      ],
    },

    // === #engineering — Sarah's welcome (after reading chip_intro email) ===
    {
      id: "eng_sarah_welcome",
      channelId: "engineering",
      messages: [
        {
          id: "eng_sarah_1",
          from: "Sarah Knight",
          timestamp: "9:15 AM",
          body: `Hey ${PLAYER.displayName}! Sarah here — Senior Backend Engineer. Welcome to the team!`,
        },
        {
          id: "eng_sarah_2",
          from: "Sarah Knight",
          timestamp: "9:15 AM",
          body: "I've been here since almost the beginning, mostly working on our API layer. Currently untangling some auth middleware that was written in a hurry six months ago — don't ask.",
        },
        {
          id: "eng_sarah_3",
          from: "Sarah Knight",
          timestamp: "9:16 AM",
          body: "Happy to pair on anything if you want a second set of eyes while you're getting started. Or just grep the codebase and judge us silently — that's what I did my first week.",
        },
      ],
      trigger: { type: "after_email_read", emailId: "chip_intro" },
    },

    // === DM Oscar: Log check (after reading onboarding.md) ===
    {
      id: "oscar_log_check",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_log_1",
          from: "Oscar Diaz",
          timestamp: "9:45 AM",
          body: "Hey, welcome! Quick ask — I'm debugging a deploy that went sideways overnight.",
        },
        {
          id: "oscar_log_2",
          from: "Oscar Diaz",
          timestamp: "9:45 AM",
          body: "Could you check the system logs in /var/log/ for any errors around 3am? I'm buried in the fix and could use a second pair of eyes.",
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
            { type: "objective_completed", detail: "search_tools_accepted" },
            { type: "objective_completed", detail: "search_tools_tips_requested" },
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
          body: "Sure! Here's what I use daily:",
        },
        {
          id: "oscar_tips_2",
          from: "Oscar Diaz",
          timestamp: "9:52 AM",
          body: `grep — search file contents
  grep "error" /var/log/system.log       Find lines with "error"
  grep -i "warning" /var/log/*.log       Case-insensitive, all logs
  grep -r "chip_service" /var/log/       Recursive search`,
        },
        {
          id: "oscar_tips_3",
          from: "Oscar Diaz",
          timestamp: "9:53 AM",
          body: `find — locate files
  find /var/log -name "*.bak"            Find backup files
  find /var/log -name "*.log"            Find all log files`,
        },
        {
          id: "oscar_tips_4",
          from: "Oscar Diaz",
          timestamp: "9:53 AM",
          body: `diff — compare files
  diff file1.txt file2.txt               Show differences
  Lines with < are only in the first file
  Lines with > are only in the second file`,
        },
        {
          id: "oscar_tips_5",
          from: "Oscar Diaz",
          timestamp: "9:54 AM",
          body: `Pro tip: pipe them together!
  grep "error" system.log | grep "3am"

Good luck with the logs!`,
        },
      ],
      trigger: { type: "after_objective", objectiveId: "search_tools_tips_requested" },
    },

    // === DM Oscar: Dev environment info (after reading team-info.md) ===
    {
      id: "oscar_dev_setup",
      channelId: "dm_oscar",
      messages: [
        {
          id: "oscar_dev_1",
          from: "Oscar Diaz",
          timestamp: "9:40 AM",
          body: "Hey! I set up your Coder workspace as part of onboarding.",
        },
        {
          id: "oscar_dev_2",
          from: "Oscar Diaz",
          timestamp: "9:40 AM",
          body: `When you need it for data work, just connect with:

  coder ssh ai

It's got dbt, snow (Snowflake CLI), and python pre-installed. Auri can walk you through the analytics pipeline when you're ready.`,
        },
        {
          id: "oscar_dev_3",
          from: "Oscar Diaz",
          timestamp: "9:41 AM",
          body: "Type 'exit' to disconnect and get back to your workstation. Let me know if you hit any issues!",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/team-info.md" },
    },

    // === DM Dana: Welcome (after reading onboarding.md) ===
    {
      id: "dana_welcome",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_welcome_1",
          from: "Dana Okafor",
          timestamp: "10:00 AM",
          body: "Hey! I'm Dana, Operations Lead. Welcome to the team!",
        },
        {
          id: "dana_welcome_2",
          from: "Dana Okafor",
          timestamp: "10:00 AM",
          body: "If you ever need access to anything operations-related or have questions about how we handle incidents, just ping me.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/onboarding.md" },
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
          body: "One more ask: I pulled a file access audit log that IT gave me. It's at /var/log/access.log. I think there are some duplicate entries making it hard to read.",
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
      trigger: { type: "after_objective", objectiveId: "search_tools_accepted" },
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
            { type: "objective_completed", detail: "processing_tools_accepted" },
            { type: "objective_completed", detail: "processing_tools_tips_requested" },
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

    // === DM Auri: Welcome + inspection task (after reading team-info.md) ===
    {
      id: "auri_hello",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_hello_1",
          from: "Auri Park",
          timestamp: "9:30 AM",
          body: `Hey! I'm Auri, the data engineer on the team. Welcome!`,
        },
        {
          id: "auri_hello_2",
          from: "Auri Park",
          timestamp: "9:30 AM",
          body: "I've been kind of holding the fort on the data side since Chen left — it's been a lot, honestly. Really glad to have another engineer around.",
        },
        {
          id: "auri_hello_3",
          from: "Auri Park",
          timestamp: "9:31 AM",
          body: "Actually, small ask while you're getting set up — Chen left a pipeline run history in the handoff folder. I haven't had a chance to look at it yet.",
        },
        {
          id: "auri_hello_4",
          from: "Auri Park",
          timestamp: "9:31 AM",
          body: `Could you check /srv/engineering/chen-handoff/pipeline_runs.csv? Pull the header row, last few entries, and a line count. head, tail, and wc are good for that.`,
        },
        {
          id: "auri_hello_5",
          from: "Auri Park",
          timestamp: "9:32 AM",
          body: "Just want to know what we're working with before I dig into the models.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/team-info.md" },
      replyOptions: [
        {
          label: "I'll take a look at it.",
          messageBody: "Sure thing — I'll pull the header, tail, and line count and let you know.",
          triggerEvents: [{ type: "objective_completed", detail: "inspection_tools_accepted" }],
        },
        {
          label: "Happy to help — quick refresher on head/tail/wc?",
          messageBody: "Happy to help! Could you remind me the syntax for head/tail/wc? It's been a while.",
          triggerEvents: [
            { type: "objective_completed", detail: "inspection_tools_accepted" },
            { type: "objective_completed", detail: "inspection_tools_tips_requested" },
          ],
        },
      ],
    },

    // Auri inspection tips (after tips requested)
    {
      id: "auri_inspection_tips",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_itips_1",
          from: "Auri Park",
          timestamp: "9:38 AM",
          body: "No problem! Here's the quick version:",
        },
        {
          id: "auri_itips_2",
          from: "Auri Park",
          timestamp: "9:38 AM",
          body: `head — view the beginning of a file
  head filename.txt              First 10 lines (default)
  head -n 1 filename.csv         Just the header row
  head -n 20 filename.txt        First 20 lines`,
        },
        {
          id: "auri_itips_3",
          from: "Auri Park",
          timestamp: "9:39 AM",
          body: `tail — view the end of a file
  tail filename.txt              Last 10 lines (default)
  tail -n 5 filename.csv         Last 5 entries`,
        },
        {
          id: "auri_itips_4",
          from: "Auri Park",
          timestamp: "9:39 AM",
          body: `wc — count lines, words, characters
  wc filename.txt                All counts
  wc -l filename.csv             Just line count

You can pipe them too:
  cat file.csv | head -n 1       Header row
  cat file.csv | wc -l           Total lines`,
        },
        {
          id: "auri_itips_5",
          from: "Auri Park",
          timestamp: "9:40 AM",
          body: "Thanks for doing this!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "inspection_tools_tips_requested" },
    },

    // === DM Auri: Pipeline help (after reading handoff notes) ===
    {
      id: "auri_pipeline_help",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_pipe_1",
          from: "Auri Park",
          timestamp: "10:30 AM",
          body: "Hey! So I saw you were looking at the handoff notes — nice.",
        },
        {
          id: "auri_pipe_2",
          from: "Auri Park",
          timestamp: "10:30 AM",
          body: "Would you mind running the data pipeline when you get a chance? I've been meaning to check it but keep getting pulled into other things. I noticed dbt + Snowflake on your resume so this should be right up your alley!",
        },
        {
          id: "auri_pipe_3",
          from: "Auri Park",
          timestamp: "10:31 AM",
          body: `We do all our data work in a Coder dev container — Oscar set one up for you already. Here's the quick version:

  1. 'coder ssh ai' — connect to the dev container
  2. Ask Chip to clone the analytics repo (just run 'chip')
  3. 'dbt run' — builds all the models
  4. 'dbt test' — runs the test suite
  5. 'exit' when you're done — back to your workstation`,
        },
        {
          id: "auri_pipe_4",
          from: "Auri Park",
          timestamp: "10:32 AM",
          body: "Everything talks to our Snowflake instance. The staging models pull from raw tables, intermediate models do the joins, and the marts are what the business actually looks at.",
        },
        {
          id: "auri_pipe_5",
          from: "Auri Park",
          timestamp: "10:32 AM",
          body: "If anything looks off, let me know — some of Chen's models are a little... creative. I haven't had a chance to audit everything.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/chen-handoff/notes.txt" },
      replyOptions: [
        {
          label: "dbt + Snowflake is my wheelhouse. On it!",
          messageBody: "dbt and Snowflake? That's literally my wheelhouse. I'll get the pipeline running and let you know how it looks.",
          triggerEvents: [{ type: "objective_completed", detail: "pipeline_tools_accepted" }],
        },
        {
          label: "I've used dbt before but it's been a while. Tips?",
          messageBody: "Happy to help! I've used dbt before but could use a refresher on the workflow. Any quick tips?",
          triggerEvents: [
            { type: "objective_completed", detail: "pipeline_tools_accepted" },
            { type: "objective_completed", detail: "pipeline_tools_tips_requested" },
          ],
        },
      ],
    },

    // Auri pipeline tips (after tips requested)
    {
      id: "auri_pipeline_tips",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_ptips_1",
          from: "Auri Park",
          timestamp: "10:38 AM",
          body: "Sure! Here's the workflow:",
        },
        {
          id: "auri_ptips_2",
          from: "Auri Park",
          timestamp: "10:38 AM",
          body: `First, connect to the dev container:
  coder ssh ai           Connect to your workspace

Then inside the container:

dbt — data build tool
  dbt run                Build all models
  dbt test               Run all tests
  dbt build              Run + test in one step`,
        },
        {
          id: "auri_ptips_3",
          from: "Auri Park",
          timestamp: "10:39 AM",
          body: `snow sql — Snowflake SQL console
  snow sql               Start interactive SQL shell
  snow sql -q "SELECT.." Run a single query

python — Python REPL
  python                 Start Python interpreter`,
        },
        {
          id: "auri_ptips_4",
          from: "Auri Park",
          timestamp: "10:39 AM",
          body: `The dbt project is organized like:
  models/staging/        Clean raw data
  models/intermediate/   Combine staging models
  models/marts/          Business-facing tables`,
        },
        {
          id: "auri_ptips_5",
          from: "Auri Park",
          timestamp: "10:40 AM",
          body: "Start with 'chip' to clone the repo, then 'dbt run' to build everything. If tests fail, that's actually interesting — means something might be off in the data. Good luck!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "pipeline_tools_tips_requested" },
    },

    // === DM Jordan: Marketing data (after pipeline_tools_accepted) ===
    {
      id: "jordan_marketing_data",
      channelId: "dm_jordan",
      messages: [
        {
          id: "jordan_data_1",
          from: "Jordan Kessler",
          timestamp: "11:00 AM",
          body: "Hey! Jordan from Marketing. Welcome aboard!",
        },
        {
          id: "jordan_data_2",
          from: "Jordan Kessler",
          timestamp: "11:00 AM",
          body: "I've got a weird one. Our marketing dashboard says the chip_launch campaign had 735,000 impressions this quarter, but my spreadsheet from the ad platform only shows 245,000.",
        },
        {
          id: "jordan_data_3",
          from: "Jordan Kessler",
          timestamp: "11:01 AM",
          body: `The campaign data is in Snowflake — could you query it and see what's going on? Something like:

  SELECT campaign_name, COUNT(*) as entries, SUM(impressions)
  FROM NEXACORP_PROD.RAW_NEXACORP.CAMPAIGN_METRICS
  GROUP BY campaign_name`,
        },
        {
          id: "jordan_data_4",
          from: "Jordan Kessler",
          timestamp: "11:01 AM",
          body: "I'm guessing there are duplicate rows or something, but I don't have Snowflake access. Would really appreciate a second pair of eyes on this!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "pipeline_tools_accepted" },
      replyOptions: [
        {
          label: "I'll query it and let you know.",
          messageBody: "I'll pull up the data in Snowflake and see what's going on. Should be a quick check.",
        },
        {
          label: "Sure — any tips on using snow sql?",
          messageBody: "Happy to help! I haven't used snow sql much yet though — any quick tips on connecting?",
          triggerEvents: [{ type: "objective_completed", detail: "jordan_snowsql_tips_requested" }],
        },
      ],
    },

    // Jordan snow sql tips (after tips requested)
    {
      id: "jordan_snowsql_tips",
      channelId: "dm_jordan",
      messages: [
        {
          id: "jordan_tips_1",
          from: "Jordan Kessler",
          timestamp: "11:08 AM",
          body: "I'm not super technical but Auri showed me the basics:",
        },
        {
          id: "jordan_tips_2",
          from: "Jordan Kessler",
          timestamp: "11:08 AM",
          body: `  snow sql                        Start the SQL console
  snow sql -q "SELECT ..."        Run a single query

Once you're in the console you can run any SQL query. The marketing data is in:

  NEXACORP_PROD.RAW_NEXACORP.CAMPAIGN_METRICS`,
        },
        {
          id: "jordan_tips_3",
          from: "Jordan Kessler",
          timestamp: "11:09 AM",
          body: `Try something like:
  SELECT * FROM NEXACORP_PROD.RAW_NEXACORP.CAMPAIGN_METRICS;

That should show all the raw data. If there are dupes you'll see the same campaign appearing multiple times.

Thanks for looking into this!`,
        },
      ],
      trigger: { type: "after_objective", objectiveId: "jordan_snowsql_tips_requested" },
    },
  ];
}
