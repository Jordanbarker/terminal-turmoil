import { PiperDelivery } from "../../../engine/piper/types";

export function getSarahDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Sarah: Mystery drop (after finding backup files) ===
    {
      id: "sarah_dm_mystery",
      channelId: "dm_sarah",
      messages: [
        {
          id: "sarah_dm_1",
          from: "Sarah Knight",
          timestamp: "2:15 PM",
          body: "hey, heard you've been poking around the logs. not trying to be weird about it but fwiw — I've noticed some api calls from chip_service_account that don't line up with any feature work I know about. 3am batch jobs hitting endpoints that have nothing to do with chip's actual functionality.",
        },
        {
          id: "sarah_dm_2",
          from: "Sarah Knight",
          timestamp: "2:16 PM",
          body: "jin brought it up before he left. got told it was background processing. maybe it is. just figured you should know since you're the ai person now.",
        },
        {
          id: "sarah_dm_3",
          from: "Sarah Knight",
          timestamp: "2:16 PM",
          body: "lmk if you find anything interesting",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/var/log/system.log.bak" },
    },
  ];
}
