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
