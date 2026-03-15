import { GameEvent } from "../mail/delivery";
import { StoryFlags } from "../../state/types";
import type { StoryFlagTrigger } from "../../story/storyFlags";

// Re-export story data for convenience
export type { StoryFlagName, StoryFlagTrigger } from "../../story/storyFlags";
export { STORY_FLAG_NAMES, getStoryFlagTriggers, getNexacorpStoryFlagTriggers, getDevcontainerStoryFlagTriggers, getTriggersForComputer } from "../../story/storyFlags";

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

