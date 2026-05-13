import { GameEvent } from "../mail/delivery";
import { Email } from "../mail/types";

export interface PromptOption {
  label: string;
  replyEmail?: Email;
  /** Filename for the sent/ entry when this reply is selected. Game-time millis stamped at construction time. */
  replyFilename?: string;
  triggerEvents?: GameEvent[];
  output?: string;
}

export interface PromptSessionInfo {
  promptText: string;
  options: PromptOption[];
}
