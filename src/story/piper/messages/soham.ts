import { PiperDelivery } from "../../../engine/piper/types";

export function getSohamDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Soham: Late-to-the-party welcome (after pipeline_tools_accepted) ===
    {
      id: "soham_dm_welcome",
      channelId: "dm_soham",
      messages: [
        {
          id: "soham_dm_1",
          from: "Soham Parekh",
          timestamp: "11:45 AM",
          body: "Hey! Sorry I'm just now reaching out — this week has been wild. Sprint retro plus I've been heads-down on some complex architectural decisions for the integrations layer.",
        },
        {
          id: "soham_dm_2",
          from: "Soham Parekh",
          timestamp: "11:45 AM",
          body: "We should definitely sync up once I come up for air. Maybe next week? I'll send a calendar invite.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "pipeline_tools_accepted" },
    },
  ];
}
