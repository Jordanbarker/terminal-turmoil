import { GameEvent } from "../mail/delivery";
import { PiperDelivery, PiperMessage, PiperTrigger } from "./types";
import { getPiperDeliveries } from "../../story/piper/messages";
import { PIPER_CHANNELS } from "../../story/piper/channels";

/**
 * Check if any piper deliveries should fire for the given event.
 * Returns new delivery IDs to add to deliveredPiperIds.
 */
export function checkPiperDeliveries(
  event: GameEvent,
  deliveredIds: string[],
  username: string
): string[] {
  const newDeliveries: string[] = [];

  for (const def of getPiperDeliveries(username)) {
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    if (triggers.every((t) => t.type === "immediate")) continue;
    if (deliveredIds.includes(def.id)) continue;
    if (newDeliveries.includes(def.id)) continue;

    let matches = false;
    for (const trigger of triggers) {
      if (trigger.type === "immediate") continue;
      matches = matchesTrigger(trigger, event, deliveredIds, newDeliveries);
      if (matches) break;
    }

    if (matches) {
      newDeliveries.push(def.id);
    }
  }

  return newDeliveries;
}

function matchesTrigger(
  trigger: PiperTrigger,
  event: GameEvent,
  deliveredIds: string[],
  newDeliveries: string[]
): boolean {
  switch (trigger.type) {
    case "immediate":
      return false;
    case "after_file_read":
      if (event.type !== "file_read" || event.detail !== trigger.filePath) return false;
      if (trigger.requireDelivered) {
        return deliveredIds.includes(trigger.requireDelivered)
          || newDeliveries.includes(trigger.requireDelivered);
      }
      return true;
    case "after_email_read":
      return event.type === "file_read" && event.detail === trigger.emailId;
    case "after_piper_reply":
      return event.type === "objective_completed" && event.detail === `piper_reply:${trigger.deliveryId}`;
    case "after_command":
      return event.type === "command_executed" && event.detail === trigger.command;
    case "after_objective":
      return event.type === "objective_completed" && event.detail === trigger.objectiveId;
  }
}

/**
 * Get delivery IDs for all "immediate" piper messages.
 * Called once at NexaCorp game start to seed initial messages.
 */
export function seedImmediatePiper(username: string): string[] {
  const ids: string[] = [];
  for (const def of getPiperDeliveries(username)) {
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    if (triggers.some((t) => t.type === "immediate")) {
      ids.push(def.id);
    }
  }
  return ids;
}

/**
 * Build the conversation history for a channel, including player replies.
 * Returns messages in chronological order.
 */
export function getConversationHistory(
  channelId: string,
  deliveredIds: string[],
  username: string
): PiperMessage[] {
  const messages: PiperMessage[] = [];

  for (const def of getPiperDeliveries(username)) {
    if (def.channelId !== channelId) continue;
    if (!deliveredIds.includes(def.id)) continue;

    messages.push(...def.messages);

    // Check for player reply
    if (def.replyOptions) {
      for (let i = 0; i < def.replyOptions.length; i++) {
        const replyId = `reply:${def.id}:${i}`;
        if (deliveredIds.includes(replyId)) {
          messages.push({
            id: replyId,
            from: username,
            timestamp: "",
            body: def.replyOptions[i].messageBody,
            isPlayer: true,
          });
          break;
        }
      }
    }
  }

  return messages;
}

/**
 * Get the pending reply options for a channel (if any).
 * Returns the delivery ID and options for the most recent unread delivery with reply options.
 */
export function getPendingReply(
  channelId: string,
  deliveredIds: string[],
  username: string
): { deliveryId: string; options: PiperDelivery["replyOptions"] } | null {
  const defs = getPiperDeliveries(username);

  // Find the last delivered message in this channel that has reply options
  // and hasn't been replied to yet
  for (let i = defs.length - 1; i >= 0; i--) {
    const def = defs[i];
    if (def.channelId !== channelId) continue;
    if (!deliveredIds.includes(def.id)) continue;
    if (!def.replyOptions) continue;

    // Check if already replied
    const hasReply = def.replyOptions.some(
      (_, idx) => deliveredIds.includes(`reply:${def.id}:${idx}`)
    );
    if (hasReply) continue;

    return { deliveryId: def.id, options: def.replyOptions };
  }

  return null;
}

/**
 * Get channels that have at least one delivered message.
 * DM channels only show up when they have content.
 */
export function getVisibleChannels(
  deliveredIds: string[],
  username: string
): { channel: typeof PIPER_CHANNELS[number]; unread: number }[] {
  const defs = getPiperDeliveries(username);
  const result: { channel: typeof PIPER_CHANNELS[number]; unread: number }[] = [];

  for (const channel of PIPER_CHANNELS) {
    const channelDefs = defs.filter(
      (d) => d.channelId === channel.id && deliveredIds.includes(d.id)
    );

    if (channelDefs.length === 0 && channel.type === "dm") continue;
    if (channelDefs.length === 0 && channel.type === "channel") {
      // Always show channels even if empty
      result.push({ channel, unread: 0 });
      continue;
    }

    // Count unread: messages in deliveries that haven't been "seen"
    // A delivery is considered read if there's a `seen:channelId` entry
    // or the player has replied to it
    const totalMessages = channelDefs.reduce((sum, d) => sum + d.messages.length, 0);
    const seenKey = `seen:${channel.id}`;
    const seenCountStr = deliveredIds.find((id) => id.startsWith(seenKey));
    const seenCount = seenCountStr ? parseInt(seenCountStr.split(":")[2] || "0", 10) : 0;
    const unread = Math.max(0, totalMessages - seenCount);

    result.push({ channel, unread });
  }

  return result;
}
