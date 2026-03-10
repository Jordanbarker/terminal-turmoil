import { GameEvent } from "../mail/delivery";
import { StoryFlags } from "../../state/types";

// Re-export story data for convenience
export type { StoryFlagName } from "../../story/storyFlags";
export { STORY_FLAG_NAMES, getStoryFlagTriggers, getNexacorpStoryFlagTriggers, getDevcontainerStoryFlagTriggers } from "../../story/storyFlags";

export interface StoryFlagTrigger {
  event: "file_read" | "command_executed" | "directory_visit";
  path?: string;
  detail?: string;
  flag: string;
  value: string | boolean;
  toast?: string;
}

export function checkStoryFlagTriggers(
  event: GameEvent,
  triggers: StoryFlagTrigger[],
  currentFlags: StoryFlags
): { flag: string; value: string | boolean; toast?: string }[] {
  const results: { flag: string; value: string | boolean; toast?: string }[] = [];

  for (const trigger of triggers) {
    if (trigger.event === event.type) {
      const matchDetail = trigger.path ?? trigger.detail;
      if (matchDetail && event.detail === matchDetail) {
        if (currentFlags[trigger.flag] === undefined) {
          results.push({ flag: trigger.flag, value: trigger.value, toast: trigger.toast });
        }
      }
    }
  }

  return results;
}
