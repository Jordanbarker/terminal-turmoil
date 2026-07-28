import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { getEmailDefinitions } from "../engine/mail/emails";
import { seedDeliveredEmails } from "../engine/mail/delivery";
import {
  formatEmailContent,
  getMailEntries,
  getSentDir,
  hasReplyToEmail,
  markAsRead,
} from "../engine/mail/mailUtils";
import type { ReplyEmail, EmailDelivery, ReplyOption } from "../engine/mail/types";
import { ComputerId, StoryFlags } from "./types";

/** What the player's mailbox history looked like, as far as the store records it. */
export interface MailHistory {
  /** Ids the game has recorded as delivered. */
  deliveredEmailIds: string[];
  /** Which of those were already opened. Callers usually pass "all of them". */
  readEmailIds: Set<string>;
  /** Completed objective ids, used to reconstruct which reply prompts are spent. */
  completedObjectives: string[];
  storyFlags: StoryFlags;
}

function isImmediate(def: EmailDelivery): boolean {
  const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
  return triggers.some((t) => t.type === "immediate");
}

/**
 * The reply option history says the player picked, or undefined if the prompt
 * is genuinely still open.
 *
 * Every consequential reply option fires `objective_completed` events, and
 * `completedObjectives` is the durable record of those, so "all of this
 * option's objectives are already complete" identifies the branch taken.
 * Options with no trigger events are pure flavour and stay answerable.
 */
function takenReplyOption(
  def: EmailDelivery,
  completed: Set<string>,
): ReplyOption | undefined {
  return def.replyOptions?.find((opt) => {
    const objectives = (opt.triggerEvents ?? [])
      .filter((e) => e.type === "objective_completed")
      .map((e) => e.detail);
    return objectives.length > 0 && objectives.every((id) => id && completed.has(id));
  });
}

/**
 * Replay a player's mailbox into a freshly-seeded filesystem.
 *
 * A rebuilt maildir has to match the one it replaced on three counts:
 *
 *  1. **Delivered non-immediate mail** is re-delivered (`seedDeliveredEmails`),
 *     read or unread per `readEmailIds`.
 *  2. **Immediate mail** is baked straight into `new/` by the filesystem
 *     builders and is therefore skipped by `seedDeliveredEmails` — so anything
 *     history says was read gets filed into `cur/` here. Without this every
 *     rebuild resurrected the seeded NexaCorp offer, `welcome_edward` and
 *     `it_provisioned` as unread.
 *  3. **Answered reply prompts** get their `sent/` entry back. `hasReplyToEmail`
 *     matches the `X-In-Reply-To:` header, and a rebuild wrote no `sent/` at
 *     all, so a job offer the player had already *accepted* came back with a
 *     live accept/decline prompt: declining it fired `rejected_nexacorp_1` and
 *     delivered a recruiting follow-up in the middle of Chapter 2.
 *
 * Only emails actually present in the mailbox get a synthesized reply, which is
 * what keeps the persuasion chain honest: `nexacorp_persuasion_1/2` also carry
 * an "accept" option, but they were never delivered on the accept path.
 */
export function replayMailHistory(
  fs: VirtualFS,
  computer: ComputerId,
  username: string,
  history: MailHistory,
): VirtualFS {
  const { deliveredEmailIds, readEmailIds, storyFlags } = history;
  const defs = getEmailDefinitions(username, computer, storyFlags);

  let currentFs = deliveredEmailIds.length > 0
    ? seedDeliveredEmails(fs, deliveredEmailIds, computer, username, readEmailIds, storyFlags)
    : fs;

  // (2) File seeded immediate mail the player had already opened.
  for (const def of defs) {
    if (!isImmediate(def)) continue;
    if (!readEmailIds.has(def.email.id)) continue;
    const entry = getMailEntries(currentFs).find(
      (e) => e.dir === "new" && e.parsed.subject === def.email.subject,
    );
    if (entry) currentFs = markAsRead(currentFs, entry.filename).fs;
  }

  // (3) Restore the sent/ replies that consumed each answered prompt.
  const completed = new Set(history.completedObjectives);
  const present = new Set(getMailEntries(currentFs).map((e) => e.parsed.subject));
  const fromDomain = computer === "home" ? "email.com" : "nexacorp.com";
  for (const def of defs) {
    if (!def.replyOptions || !present.has(def.email.subject)) continue;
    const taken = takenReplyOption(def, completed);
    if (!taken) continue;
    if (hasReplyToEmail(currentFs, username, def.email.id)) continue;

    // Shaped like the real thing (PromptSession writes the same headers); the
    // parent's date stands in for a send time history doesn't record.
    const reply: ReplyEmail = {
      id: `reply_replay_${def.email.id}`,
      from: `${username}@${fromDomain}`,
      to: def.email.from,
      date: def.email.date,
      subject: `Re: ${def.email.subject}`,
      body: taken.replyBody,
      inReplyTo: def.email.id,
    };
    const written = currentFs.writeFile(
      `${getSentDir(username)}/sent_replay_${def.email.id}`,
      formatEmailContent(reply, false),
    );
    if (written.fs) currentFs = written.fs;
  }

  return currentFs;
}
