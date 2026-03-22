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

    // === DM Auri: Pipeline check-in (after reading handoff notes) ===
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
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/chen-handoff/notes.txt" },
      replyOptions: [
        {
          label: "The notes feel kind of rushed. Did Chen leave in a hurry?",
          messageBody: "Yeah I read through them. They feel kind of rushed honestly — like he was in a hurry to wrap up. Did something happen with Chen?",
          triggerEvents: [
            { type: "objective_completed", detail: "handoff_curious_about_chen" },
            { type: "objective_completed", detail: "handoff_reviewed" },
          ],
        },
        {
          label: "All done — what should I tackle first?",
          messageBody: "All read! Looks like there's a lot going on with the pipeline. What should I tackle first?",
          triggerEvents: [
            { type: "objective_completed", detail: "handoff_reviewed_proactive" },
            { type: "objective_completed", detail: "handoff_reviewed" },
          ],
        },
      ],
    },

    // === DM Auri: Chen response (curious about Chen's departure) ===
    {
      id: "auri_chen_response",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_chen_1",
          from: "Auri Park",
          timestamp: "10:35 AM",
          body: "Yeah... honestly? It all happened kind of fast. One week he was here, the next he wasn't.",
        },
        {
          id: "auri_chen_2",
          from: "Auri Park",
          timestamp: "10:35 AM",
          body: "Edward said it was voluntary. He'd been working late for months — maybe he just needed a break?",
        },
        {
          id: "auri_chen_3",
          from: "Auri Park",
          timestamp: "10:36 AM",
          body: "Anyway — I don't want to speculate. The important thing is the work he left behind.",
        },
        {
          id: "auri_chen_4",
          from: "Auri Park",
          timestamp: "10:36 AM",
          body: "You'll be working with the pipeline data a lot, so it'd be great if you could do a full build and get a feel for how the project's set up. Chen's todo says the test suite hasn't been run in weeks — would be really helpful to know where things stand.",
        },
        {
          id: "auri_chen_5",
          from: "Auri Park",
          timestamp: "10:37 AM",
          body: "We do all our data work in a Coder dev container — Oscar should reach out with your workspace details. Once you're in, clone the repo with git clone nexacorp/nexacorp-analytics. If you hit any git issues, ask Chip — he knows git better than anyone here. They revoked his direct access after... well, there was an incident. But he can still talk you through anything.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "handoff_curious_about_chen" },
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

    // === DM Auri: Proactive response (player wants to get started) ===
    {
      id: "auri_proactive_response",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_proactive_1",
          from: "Auri Park",
          timestamp: "10:35 AM",
          body: "Love the energy!",
        },
        {
          id: "auri_proactive_2",
          from: "Auri Park",
          timestamp: "10:35 AM",
          body: "The data pipeline is the big thing. You'll be working with it daily, so it'd be great if you could do a full build and get a feel for how the project's set up. Chen's todo says the test suite hasn't been run in weeks.",
        },
        {
          id: "auri_proactive_3",
          from: "Auri Park",
          timestamp: "10:36 AM",
          body: "We do all our data work in a Coder dev container — Oscar should reach out with your workspace details. The repo is nexacorp/nexacorp-analytics — git clone it once you're in.",
        },
        {
          id: "auri_proactive_3b",
          from: "Auri Park",
          timestamp: "10:36 AM",
          body: "If you need help with git, Chip's your guy — he knows it inside and out. They pulled his direct access after the incident, but he can still walk you through anything.",
        },
        {
          id: "auri_proactive_4",
          from: "Auri Park",
          timestamp: "10:36 AM",
          body: "Everything talks to our Snowflake instance. The staging models pull from raw tables, intermediate models do the joins, and the marts are what the business actually looks at.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "handoff_reviewed_proactive" },
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
  coder ssh ai

Then inside the container:
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
          body: "Start with 'git clone nexacorp/nexacorp-analytics', then 'dbt run' to build everything. If tests fail, that's actually interesting — means something might be off in the data. Good luck!",
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
          body: "Hey, how'd the pipeline run go?",
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
          triggerEvents: [{ type: "objective_completed", detail: "auri_dbt_reported" }],
        },
        {
          label: "The pipeline ran clean, no issues.",
          messageBody: "Everything built and passed. I'll take a look at those _chip_internal models too.",
          triggerEvents: [{ type: "objective_completed", detail: "auri_dbt_reported" }],
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
