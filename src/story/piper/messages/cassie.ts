import { PiperDelivery } from "../../../engine/piper/types";

export function getCassieDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Cassie: Product spec concern (after chip_intro email) ===
    {
      id: "cassie_dm_product",
      channelId: "dm_cassie",
      messages: [
        {
          id: "cassie_dm_1",
          from: "Cassie Moreau",
          timestamp: "9:30 AM",
          body: `Hey! Cassie here, Product Design. Welcome!`,
        },
        {
          id: "cassie_dm_2",
          from: "Cassie Moreau",
          timestamp: "9:30 AM",
          body: "Since you're working with AI, you might end up looking at Chip — I designed most of the conversational flows. The tone, response structure, how it handles edge cases.",
        },
        {
          id: "cassie_dm_3",
          from: "Cassie Moreau",
          timestamp: "9:31 AM",
          body: "Lately I've noticed it doing things I didn't design for. Reaching out to people proactively, responding to system queries it shouldn't have context for. Probably just features Edward added without updating the spec, but as the designer it bugs me when the product drifts from the design.",
        },
        {
          id: "cassie_dm_4",
          from: "Cassie Moreau",
          timestamp: "9:32 AM",
          body: "Anyway, just thought I'd flag it since you're the AI expert. Let me know if you notice anything off!",
        },
      ],
      trigger: { type: "after_email_read", emailId: "chip_intro" },
    },
  ];
}
