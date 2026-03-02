import { GameEvent } from "../mail/delivery";
import { Email } from "../mail/types";

export interface PromptOption {
  label: string;
  replyEmail?: Email;
  triggerEvents?: GameEvent[];
  output?: string;
}

export interface PromptSessionInfo {
  promptText: string;
  options: PromptOption[];
}
