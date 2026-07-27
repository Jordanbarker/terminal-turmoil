// Email now lives in @tt/core (pure message record). Re-exported for back-compat.
export type { Email } from "@tt/core";
import type { Email } from "@tt/core";

/**
 * A reply the player picked from an email's `replyOptions`, on its way to
 * `sent/`. `inReplyTo` is the *parent* email's id and is written out as the
 * `X-In-Reply-To:` header, which is what "has this email been replied to?"
 * matches on. A hand-composed `mail -s "Re: ..."` carries no such header, so it
 * can never consume a real reply prompt.
 *
 * Lives here rather than on `@tt/core`'s `Email` because threading is a story
 * concern; `PromptOption.replyEmail` is typed as the core `Email`, so the
 * consumer widens it back to `ReplyEmail`.
 */
export interface ReplyEmail extends Email {
  inReplyTo?: string;
}

export interface ReplyOption {
  label: string;
  replyBody: string;
  triggerEvents?: import("./delivery").GameEvent[];
}

export interface EmailDelivery {
  email: Email;
  trigger: EmailTrigger | EmailTrigger[];
  replyOptions?: ReplyOption[];
}

export type EmailTrigger =
  | { type: "immediate" }
  | { type: "after_file_read"; filePath: string; requireDelivered?: string }
  | { type: "after_email_read"; emailId: string }
  | { type: "after_command"; command: string; requiredFlags?: string[] }
  | { type: "after_objective"; objectiveId: string }
  | { type: "after_story_flag"; flag: string; requiredFlags?: string[] }
  | { type: "after_event_detail"; eventType: import("./delivery").GameEvent["type"]; detail: string };
