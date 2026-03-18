import { PiperDelivery } from "../../../engine/piper/types";

export function getJordanDeliveries(_username: string): PiperDelivery[] {
  return [
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

    // === DM Jordan: Metrics follow-up (after querying campaign_metrics) ===
    {
      id: "jordan_metrics_followup",
      channelId: "dm_jordan",
      messages: [
        {
          id: "jordan_metrics_1",
          from: "Jordan Kessler",
          timestamp: "12:00 PM",
          body: "Did you get a chance to query that campaign data?",
        },
        {
          id: "jordan_metrics_2",
          from: "Jordan Kessler",
          timestamp: "12:00 PM",
          body: "I just ran the numbers on my end again. The ad platform shows 245K impressions for chip_launch. Our dashboard shows 735K. That's exactly 3x.",
        },
        {
          id: "jordan_metrics_3",
          from: "Jordan Kessler",
          timestamp: "12:01 PM",
          body: "3x isn't a rounding error. That's triplicate rows. Somebody is inflating these numbers and I don't think it's accidental.",
        },
        {
          id: "jordan_metrics_4",
          from: "Jordan Kessler",
          timestamp: "12:01 PM",
          body: "I was about to present these to the board as wins. If I'd shown inflated metrics to leadership... yeah, that would've been bad. Thanks for catching this.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "found_inflated_metrics" },
      replyOptions: [
        {
          label: "The duplicate rows look deliberate.",
          messageBody: "Yeah, the data has triplicate entries. It doesn't look like a pipeline bug — someone set this up intentionally.",
          triggerEvents: [{ type: "objective_completed", detail: "jordan_metrics_reported" }],
        },
        {
          label: "Hold off on that presentation.",
          messageBody: "Definitely hold off on presenting those numbers. There's something wrong with how the data is getting into Snowflake.",
          triggerEvents: [{ type: "objective_completed", detail: "jordan_metrics_reported" }],
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
          body: "I don't really know Snowflake but Auri showed me how to pull it up once. I think you just type 'snow sql' and then paste in queries? She'd know better than me.",
        },
        {
          id: "jordan_tips_2",
          from: "Jordan Kessler",
          timestamp: "11:08 AM",
          body: "I just want to know why the numbers don't match. 735K vs 245K is a big gap to explain away. If there are duplicate rows or something weird in the data, that'd be good to know before I present Q1 numbers to leadership.",
        },
        {
          id: "jordan_tips_3",
          from: "Jordan Kessler",
          timestamp: "11:09 AM",
          body: "Thanks for looking into this!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "jordan_snowsql_tips_requested" },
    },
  ];
}
