import { PiperDelivery } from "../../../engine/piper/types";

export function getAuriDeliveries(_username: string): PiperDelivery[] {
  return [
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
            { type: "objective_completed", detail: "inspection_tools_tips_requested" },
            { type: "objective_completed", detail: "inspection_tools_accepted" },
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
          body: "Actually, Chen left a cheatsheet somewhere in the handoff folder. Let me find it...",
        },
        {
          id: "auri_itips_2",
          from: "Auri Park",
          timestamp: "9:38 AM",
          body: "Yeah — /srv/engineering/chen-handoff/README.md has the key file locations. The commands you want are head, tail, and wc — standard stuff.",
        },
        {
          id: "auri_itips_3",
          from: "Auri Park",
          timestamp: "9:39 AM",
          body: `Quick version:

  head -n 1 file.csv      Header row
  tail -n 5 file.csv      Last 5 entries
  wc -l file.csv          Line count

That should be plenty for a quick look at the pipeline runs.`,
        },
        {
          id: "auri_itips_4",
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
          body: "Hey! Have you had a chance to look at the handoff notes yet?",
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
            { type: "objective_completed", detail: "pipeline_tools_tips_requested" },
            { type: "objective_completed", detail: "pipeline_tools_accepted" },
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

    // Auri explains chmod (after dana_ops_accepted)
    {
      id: "auri_chmod_help",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_chmod_1",
          from: "Auri Park",
          timestamp: "11:25 AM",
          body: "Hey! Dana mentioned you might need to get into /srv/operations/. I can help with that!",
        },
        {
          id: "auri_chmod_2",
          from: "Auri Park",
          timestamp: "11:25 AM",
          body: "Permissions are actually pretty elegant once you see the pattern. Each file and directory has three permission groups: owner, group, and everyone else. Each group gets read (r), write (w), and execute (x).",
        },
        {
          id: "auri_chmod_3",
          from: "Auri Park",
          timestamp: "11:26 AM",
          body: `chmod uses octal numbers — each digit is a combo of permissions:

  7 = rwx (read + write + execute)
  5 = r-x (read + execute)
  4 = r-- (read only)
  0 = --- (no access)

So 'chmod 755' means: owner gets full access, everyone else can read and traverse.`,
        },
        {
          id: "auri_chmod_4",
          from: "Auri Park",
          timestamp: "11:26 AM",
          body: `Try this:

  chmod 755 /srv/operations/
  ls /srv/operations/

That should open it up so you can read the files in there.`,
        },
        {
          id: "auri_chmod_5",
          from: "Auri Park",
          timestamp: "11:27 AM",
          body: "We should probably get Oscar to set up proper ACLs at some point so people don't keep running into this. But chmod works for now!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "dana_ops_accepted" },
    },
  ];
}
