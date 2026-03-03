import { GameEvent } from "../mail/delivery";
import { StoryFlags } from "../../state/types";

export interface ChipMenuItem {
  id: string;
  label: string;
  response: string;
  triggerEvents?: GameEvent[];
  condition?: (flags: StoryFlags) => boolean;
}

export interface ChipSessionInfo {
  storyFlags: StoryFlags;
}
