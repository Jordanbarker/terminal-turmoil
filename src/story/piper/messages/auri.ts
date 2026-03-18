import { PiperDelivery } from "../../../engine/piper/types";

export function getAuriDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Auri: Welcome + data audit (after reading Edward's welcome email) ===
    {
      id: "auri_hello",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_hello_1",
          from: "Auri Park",
          timestamp: "9:30 AM",
          body: `Hey! I'm Auri — Edward said I'm your onboarding buddy. Welcome to the team!`,
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
          body: "Small ask while you're getting set up — Chen left a bunch of stuff in the handoff folder. Start by checking what's in /srv/engineering/chen-handoff/ — ls -lh shows file sizes. And read todo.txt to see what's still open.",
        },
        {
          id: "auri_hello_4",
          from: "Auri Park",
          timestamp: "9:31 AM",
          body: `Then for the data: pipeline_runs.csv has run history. head, tail, and wc are great for a quick audit.`,
        }
      ],
      trigger: { type: "after_email_read", emailId: "welcome_edward" },
      replyOptions: [
        {
          label: "I'll take a look at it.",
          messageBody: "Sure thing — I'll pull the header, tail, and line count and let you know.",
          triggerEvents: [{ type: "objective_completed", detail: "inspection_tools_accepted" }],
        },
      ],
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
          body: "You'll be working with the pipeline data a lot, so it'd be great if you could do a full build and get a feel for how the project's set up! Chen's todo says the test suite hasn't been run in weeks — would be really helpful to know where things stand.",
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
          body: "If anything looks off, let me know! Some of Chen's models are a little... creative. I inherited them when he left but haven't had a chance to really dig in — fresh eyes would be amazing.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/chen-handoff/notes.txt" },
      replyOptions: [
        {
          label: "Makes sense — I'll check it out!",
          messageBody: "Good call — I'll do a full build and let you know how it looks!",
          triggerEvents: [{ type: "objective_completed", detail: "pipeline_tools_accepted" }],
        },
        {
          label: "I've used dbt before but it's been a while. Tips?",
          messageBody: "Definitely want to get up to speed on the pipeline! I've used dbt before but it's been a while — any tips for how things are set up here?",
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
  snow sql -q "SELECT.." Run a single query`,
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

    // === DM Auri: dbt results follow-up (after running dbt) ===
    {
      id: "auri_dbt_results",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_dbt_1",
          from: "Auri Park",
          timestamp: "10:45 AM",
          body: "Hey, how'd the pipeline run go? Everything build and pass?",
        },
        {
          id: "auri_dbt_2",
          from: "Auri Park",
          timestamp: "10:45 AM",
          body: "I've been meaning to audit those models for a while. There's a set of models prefixed with _chip_internal that I didn't write — they showed up a few months ago. I assumed Chen added them but there's no documentation.",
        },
        {
          id: "auri_dbt_3",
          from: "Auri Park",
          timestamp: "10:46 AM",
          body: "If you get a chance, take a look at those. They're in models/intermediate/ — the SQL files show what they're actually doing to the data. I'd love a second opinion.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "ran_dbt" },
      replyOptions: [
        {
          label: "I'll check them out.",
          messageBody: "Sure — I'll look at the _chip_internal models and let you know what I find.",
        },
        {
          label: "The pipeline ran clean, no issues.",
          messageBody: "Everything built and passed. I'll take a look at those _chip_internal models too.",
        },
      ],
    },

    // === DM Auri: Filtering reaction (after discovering data filtering) ===
    {
      id: "auri_filtering_reaction",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_filter_1",
          from: "Auri Park",
          timestamp: "11:50 AM",
          body: "Wait — did you look at the _chip_internal models?",
        },
        {
          id: "auri_filter_2",
          from: "Auri Park",
          timestamp: "11:50 AM",
          body: "I just pulled them up. Those aren't cleaning the data. They're filtering it. Suppressing tickets, removing log entries, scrubbing employee records...",
        },
        {
          id: "auri_filter_3",
          from: "Auri Park",
          timestamp: "11:51 AM",
          body: "The mart tables that leadership looks at — they all run through these models. The business has been seeing filtered data for months and nobody noticed because the models are buried in the intermediate layer.",
        },
        {
          id: "auri_filter_4",
          from: "Auri Park",
          timestamp: "11:51 AM",
          body: "This isn't a bug. Someone built this on purpose.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "found_data_filtering" },
      replyOptions: [
        {
          label: "Yeah — someone's been manipulating the pipeline.",
          messageBody: "That's what I'm seeing too. The _chip_internal models are deliberately hiding data before it reaches the marts.",
          triggerEvents: [{ type: "objective_completed", detail: "auri_filtering_confirmed" }],
        },
        {
          label: "Who would have access to add those models?",
          messageBody: "This is serious. Who has access to push models to the dbt project?",
          triggerEvents: [{ type: "objective_completed", detail: "auri_filtering_confirmed" }],
        },
      ],
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
          body: `You can run 'man chmod' for the full breakdown of how permissions work. But the short version — try this:

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
