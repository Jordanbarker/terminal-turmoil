import { PiperDelivery } from "../../../engine/piper/types";

export function getDanaDeliveries(_username: string): PiperDelivery[] {
  return [
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

    // === DM Dana: Ops dashboard broken (after processing_tools_accepted) ===
    {
      id: "dana_ops_dashboard",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_ops_1",
          from: "Dana Okafor",
          timestamp: "11:15 AM",
          body: "Hey, quick ask — my ops dashboard has been throwing parse errors since yesterday.",
        },
        {
          id: "dana_ops_2",
          from: "Dana Okafor",
          timestamp: "11:15 AM",
          body: "The data comes from a CSV export in /srv/operations/ — ticket_export.csv. Something changed in the file format and now the dashboard chokes on it.",
        },
        {
          id: "dana_ops_3",
          from: "Dana Okafor",
          timestamp: "11:16 AM",
          body: "Could you take a look and see what's different? I'd check myself but I'm buried in incident review prep.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "processing_tools_accepted" },
      replyOptions: [
        {
          label: "On it — I'll take a look.",
          messageBody: "Sure thing! I'll check the CSV and see what's off.",
          triggerEvents: [{ type: "objective_completed", detail: "dana_ops_accepted" }],
        },
        {
          label: "I can't access /srv/operations/ — Permission denied",
          messageBody: "I tried to look but I'm getting 'Permission denied' on /srv/operations/.",
          triggerEvents: [
            { type: "objective_completed", detail: "dana_ops_accepted" },
            { type: "objective_completed", detail: "dana_ops_no_access" },
          ],
        },
      ],
    },

    // Dana follow-up: ask Auri about permissions (after no_access)
    {
      id: "dana_ask_auri",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_ask_auri_1",
          from: "Dana Okafor",
          timestamp: "11:20 AM",
          body: "Oh right — those shared dirs got locked down after a security audit last month. Ask Auri — she's dealt with file permissions before.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "dana_ops_no_access" },
    },

    // Dana resolves (after reading ticket_export.csv)
    {
      id: "dana_ops_resolved",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_resolved_1",
          from: "Dana Okafor",
          timestamp: "11:45 AM",
          body: "Nice catch — there's a new resolution_notes column. That'd do it. The dashboard expects a fixed schema and the extra column throws the parser off.",
        },
        {
          id: "dana_resolved_2",
          from: "Dana Okafor",
          timestamp: "11:45 AM",
          body: "I'll update the dashboard config to handle the new column. Thanks for tracking this down!",
        },
        {
          id: "dana_resolved_3",
          from: "Dana Okafor",
          timestamp: "11:46 AM",
          body: "Although... weird — I don't see a PR or changelog for this schema change. Someone added that column recently but there's no record of who or why. I'll ask around.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/operations/ticket_export.csv" },
    },
  ];
}
