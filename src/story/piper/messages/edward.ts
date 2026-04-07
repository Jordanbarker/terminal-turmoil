import { PiperDelivery } from "../../../engine/piper/types";

export function getEdwardDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Edward: Chip introduction (after reading team-info.md) ===
    {
      id: "edward_chip_intro",
      channelId: "dm_edward",
      messages: [
        {
          id: "edward_dm_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Hey, settling in okay? If you haven't already, definitely give Chip a try — just type `chip` in the terminal. It's honestly the fastest way to get answers about how things work around here. We built it to be the single source of truth for the whole team.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "read_team_info" },
      replyOptions: [
        {
          label: "Sounds good, I'll give it a try!",
          messageBody: "Sounds good, I'll give it a try!",
        },
      ],
    },

    // === DM Edward: Error report prompt (after replying to intro) ===
    // No messages — reply option appears below the conversation,
    // gated behind chip_error_seen (player must try chip first).
    {
      id: "edward_chip_error",
      channelId: "dm_edward",
      messages: [],
      trigger: { type: "after_piper_reply", deliveryId: "edward_chip_intro" },
      replyOptions: [
        {
          label: "I just tried running chip but I'm getting 'CHIP_API_KEY not set'?",
          messageBody: "I just tried running chip but I'm getting 'CHIP_API_KEY not set'?",
          visibleWhen: { flag: "chip_error_seen" },
          triggerEvents: [{ type: "objective_completed", detail: "told_edward_chip_error" }],
        },
      ],
    },

    // === DM Edward: Fix instructions (after error report) ===
    {
      id: "edward_chip_fix",
      channelId: "dm_edward",
      messages: [
        {
          id: "edward_dm_fix_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Ah yeah, that happens with new accounts sometimes. IT adds the credentials to your shell config but they don't load automatically.",
        },
        {
          id: "edward_dm_fix_2",
          from: "Edward Torres",
          timestamp: "",
          body: "Try `printenv` to see what's currently set in your environment. If `CHIP_API_KEY` isn't there, just run `source ~/.zshrc` to reload your config. That should pick it up.",
        },
      ],
      trigger: { type: "after_piper_reply", deliveryId: "edward_chip_error" },
    },
  ];
}
