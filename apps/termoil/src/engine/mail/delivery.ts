import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import { basename } from "@tt/core/lib/pathUtils";
import { getEmailDefinitions } from "./emails";
import {
  deliverEmail,
  deliverEmailAsRead,
  getMailDir,
  getMailEntries,
  getNewDir,
  hasReplyToEmail,
  slugify,
} from "./mailUtils";
import { EmailDelivery } from "./types";
import { getPiperDeliveries } from "../../story/piper/messages";
import { ComputerId, PLAYER, StoryFlags } from "../../state/types";
import { matchesCommonTrigger } from "../narrative/triggerMatcher";
import { getTriggersForComputer } from "../narrative/storyFlags";

// GameEvent now lives in @tt/core (story-agnostic engine vocabulary). Re-exported
// here so the existing `import { GameEvent } from ".../mail/delivery"` call sites
// stay valid; rewire them to @tt/core opportunistically.
export type { GameEvent } from "@tt/core";
import type { GameEvent } from "@tt/core";

const triggersOf = (def: EmailDelivery) =>
  Array.isArray(def.trigger) ? def.trigger : [def.trigger];

const isImmediate = (def: EmailDelivery) => triggersOf(def).some((t) => t.type === "immediate");

/**
 * Everything the story hangs off one email, derived from the definitions rather
 * than an id list so a content edit can't silently strip an email of its
 * dependents. Each entry is a debt the email still owes the player.
 */
interface EmailDependents {
  /** Reply options that fire trigger events: the reply itself is the progression. */
  consequentialReply: boolean;
  /** `file_read` story-flag triggers keyed on the email id. */
  readFlags: { flag: string; value: string | boolean }[];
  /** Emails delivered by `after_email_read` on this id. */
  emailIds: string[];
  /** Piper deliveries triggered by `after_email_read` on this id. */
  piperIds: string[];
}

function getEmailDependents(
  def: EmailDelivery,
  allEmails: EmailDelivery[],
  username: string,
  computer: ComputerId
): EmailDependents {
  const id = def.email.id;
  const readsThis = (triggers: { type: string; emailId?: string }[]) =>
    triggers.some((t) => t.type === "after_email_read" && t.emailId === id);

  return {
    consequentialReply: !!def.replyOptions?.some((opt) => opt.triggerEvents?.length),
    readFlags: getTriggersForComputer(computer, username)
      .filter((t) => t.event === "file_read" && t.detail === id)
      .map((t) => ({ flag: t.flag as string, value: t.value })),
    emailIds: allEmails.filter((d) => readsThis(triggersOf(d))).map((d) => d.email.id),
    piperIds: getPiperDeliveries(username)
      .filter((d) => readsThis(Array.isArray(d.trigger) ? d.trigger : [d.trigger]))
      .map((d) => d.id),
  };
}

/**
 * Has this immediate email already done its narrative job?
 *
 * Immediate emails are baked into the seed maildir and never re-delivered, so
 * `rm -r /var/mail/$USER/new` used to delete a story beat permanently. There is
 * no persisted "read" set, so spentness is judged from whatever record the
 * email's dependents leave behind, strongest first:
 *
 * - **Consequential reply** wins outright: spent only once the reply is in
 *   `sent/`. Reading is not enough, the reply prompt *is* the progression, so a
 *   deleted NexaCorp offer comes back until the player has answered it.
 * - Otherwise **any** discharged dependent is proof the email was opened: a
 *   `file_read` story flag being set (`welcome_edward` → `piper_unlocked`), or a
 *   follow-up email delivered by `after_email_read` on this id.
 * - **`after_email_read` piper** deliveries are real dependents, but
 *   `deliveredPiperIds` doesn't reach this layer and so can't discharge
 *   anything. An email whose *only* dependent is a piper DM
 *   (`it_provisioned` → `maya_dm_welcome`) is therefore restored whenever it is
 *   missing; re-reading it just re-delivers a DM that is already there.
 * - No dependents at all (`job_board_alert`) means nothing to lose: spent from
 *   the start, so deleting pure flavor is permanent.
 */
function isImmediateEmailSpent(
  def: EmailDelivery,
  deps: EmailDependents,
  fs: VirtualFS,
  username: string,
  storyFlags: StoryFlags,
  deliveredIds: string[]
): boolean {
  if (deps.consequentialReply) {
    return hasReplyToEmail(fs, username, def.email.id);
  }
  if (deps.readFlags.some((t) => storyFlags[t.flag] === t.value)) return true;
  if (deps.emailIds.some((id) => deliveredIds.includes(id))) return true;

  const hasCheckableDependent = deps.readFlags.length > 0 || deps.emailIds.length > 0;
  return !hasCheckableDependent && deps.piperIds.length === 0;
}

/**
 * Put back seeded immediate emails the player deleted before they had served
 * their purpose, and recreate `new/` if it went with them (writeFile needs an
 * existing parent, so a missing `new/` would swallow this heal itself).
 *
 * Scoped by the maildir root existing, which also keeps this off machines that
 * have no mailbox for the current user (chipinfra, erik-pc, the dev container).
 * Nuking `/var/mail/$USER` outright is therefore still permanent.
 */
function healSeededImmediateEmails(
  fs: VirtualFS,
  computer: ComputerId,
  username: string,
  storyFlags: StoryFlags,
  deliveredIds: string[]
): { fs: VirtualFS; healed: string[] } {
  const mailRoot = fs.getNode(getMailDir(username));
  if (!mailRoot || !isDirectory(mailRoot)) return { fs, healed: [] };

  const allEmails = getEmailDefinitions(username, computer, storyFlags);
  const immediates = allEmails.filter(isImmediate);
  if (immediates.length === 0) return { fs, healed: [] };

  let currentFs = fs;
  const newDir = getNewDir(username);
  const newDirNode = currentFs.getNode(newDir);
  if (!newDirNode || !isDirectory(newDirNode)) {
    currentFs = currentFs.makeDirectory(newDir).fs ?? currentFs;
  }

  // Presence is keyed on the delivered filename slug first (the file's real
  // identity) and the Subject header second, so neither editing a subject line
  // nor renaming a file can trick the heal into delivering a duplicate.
  const entries = getMailEntries(currentFs);
  const present = new Set([
    ...entries.map((e) => e.slug),
    ...entries.map((e) => e.parsed.subject),
  ]);
  let nextSeq = entries.length > 0 ? Math.max(...entries.map((e) => e.seq)) + 1 : 1;

  const healed: string[] = [];
  for (const def of immediates) {
    if (present.has(slugify(def.email.subject)) || present.has(def.email.subject)) continue;
    const deps = getEmailDependents(def, allEmails, username, computer);
    if (isImmediateEmailSpent(def, deps, currentFs, username, storyFlags, deliveredIds)) continue;
    currentFs = deliverEmail(currentFs, def.email, nextSeq).fs;
    healed.push(def.email.id);
    nextSeq++;
  }

  return { fs: currentFs, healed };
}

export function checkEmailDeliveries(
  fs: VirtualFS,
  event: GameEvent,
  deliveredIds: string[],
  computer: ComputerId = "nexacorp",
  storyFlags?: StoryFlags
): { fs: VirtualFS; newDeliveries: string[] } {
  // homeDir is always /home/<user>; the fallback only covers a degenerate "/".
  const username = basename(fs.homeDir) || PLAYER.username;

  // Healed ids ride along in newDeliveries: callers only keep the returned fs
  // when that array is non-empty, and it also raises the "new mail" notice.
  const heal = healSeededImmediateEmails(fs, computer, username, storyFlags ?? {}, deliveredIds);
  const newDeliveries: string[] = [...heal.healed];
  let currentFs = heal.fs;

  // Determine next sequence number from existing entries
  const existing = getMailEntries(currentFs);
  let nextSeq = existing.length > 0 ? Math.max(...existing.map((e) => e.seq)) + 1 : 1;

  for (const def of getEmailDefinitions(username, computer, storyFlags)) {
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    if (triggers.every((t) => t.type === "immediate")) continue;
    if (deliveredIds.includes(def.email.id)) continue;
    if (newDeliveries.includes(def.email.id)) continue;

    let matches = false;
    for (const trigger of triggers) {
      if (trigger.type === "immediate") continue;
      matches = matchesCommonTrigger(trigger, event, deliveredIds, newDeliveries, storyFlags);
      if (matches) break;
    }

    if (matches) {
      const result = deliverEmail(currentFs, def.email, nextSeq);
      currentFs = result.fs;
      newDeliveries.push(def.email.id);
      nextSeq++;
    }
  }

  return { fs: currentFs, newDeliveries };
}

/**
 * Re-seed previously delivered non-immediate emails into a freshly built filesystem.
 * Called from buildFs so emails survive filesystem rebuilds.
 */
export function seedDeliveredEmails(
  fs: VirtualFS,
  deliveredIds: string[],
  computer: ComputerId,
  username: string,
  readEmailIds: Set<string> = new Set(),
  storyFlags?: StoryFlags
): VirtualFS {
  const defs = getEmailDefinitions(username, computer, storyFlags);
  const existing = getMailEntries(fs);
  let nextSeq =
    existing.length > 0 ? Math.max(...existing.map((e) => e.seq)) + 1 : 1;
  let currentFs = fs;

  for (const def of defs) {
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    if (triggers.every((t) => t.type === "immediate")) continue;
    if (!deliveredIds.includes(def.email.id)) continue;

    const deliver = readEmailIds.has(def.email.id) ? deliverEmailAsRead : deliverEmail;
    const result = deliver(currentFs, def.email, nextSeq);
    currentFs = result.fs;
    nextSeq++;
  }

  return currentFs;
}
