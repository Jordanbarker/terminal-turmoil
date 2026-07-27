import { describe, it, expect } from "vitest";
import { CHECKPOINTS, Checkpoint } from "../checkpoints";
import { getPiperDeliveries } from "../piper/messages";
import { getPendingReplies } from "../../engine/piper/delivery";
import { PLAYER } from "../../state/types";

/**
 * A checkpoint's Piper backlog has to agree with the story position it claims.
 *
 * `reply:<deliveryId>:<index>` markers are as load-bearing as the delivery ids:
 * without one, `getPendingReplies` still surfaces the prompt. Checkpoints used
 * to ship markers for olive/edward only, so cheating into Day 2 left four stale
 * Oscar prompts and four stale Auri prompts live. A player could then answer
 * `oscar_access_review`'s tampering branch although `oscar_logs_normal` was
 * already a completed objective (recording BOTH branches), or walk the whole
 * Auri backlog and re-deliver Day 1 Chen lore into Chapter 3.
 */

const USER = PLAYER.username;
const defs = getPiperDeliveries(USER);
const defById = new Map(defs.map((d) => [d.id, d]));

/** Delivery ids only — reply/seen markers filtered out, order preserved. */
function deliveries(cp: Checkpoint): string[] {
  return cp.deliveredPiperIds.filter((id) => !id.startsWith("reply:") && !id.startsWith("seen:"));
}

function channelsOf(cp: Checkpoint): Map<string, string[]> {
  const byChannel = new Map<string, string[]>();
  for (const id of deliveries(cp)) {
    const def = defById.get(id);
    if (!def) continue;
    byChannel.set(def.channelId, [...(byChannel.get(def.channelId) ?? []), id]);
  }
  return byChannel;
}

describe("checkpoint Piper backlogs", () => {
  it("every delivered/reply id names a real delivery and a real option", () => {
    for (const cp of CHECKPOINTS) {
      for (const id of cp.deliveredPiperIds) {
        if (id.startsWith("seen:")) continue;
        if (id.startsWith("reply:")) {
          const [, deliveryId, idxRaw] = id.split(":");
          const def = defById.get(deliveryId);
          expect(def, `${cp.id}: reply marker for unknown delivery ${deliveryId}`).toBeDefined();
          expect(
            def!.replyOptions?.[Number(idxRaw)],
            `${cp.id}: ${id} has no such reply option`,
          ).toBeDefined();
          expect(
            deliveries(cp),
            `${cp.id}: ${id} answers a delivery that was never delivered`,
          ).toContain(deliveryId);
          continue;
        }
        expect(defById.get(id), `${cp.id}: unknown delivery ${id}`).toBeDefined();
      }
    }
  });

  it("no pending prompt can re-decide a branch the checkpoint already recorded", () => {
    for (const cp of CHECKPOINTS) {
      const completed = new Set(cp.completedObjectives);
      for (const channelId of channelsOf(cp).keys()) {
        for (const pending of getPendingReplies(channelId, cp.deliveredPiperIds, USER)) {
          for (const option of pending.options) {
            for (const event of option.triggerEvents ?? []) {
              if (event.type !== "objective_completed") continue;
              expect(
                completed.has(event.detail ?? ""),
                `${cp.id}: ${channelId}/${pending.deliveryId} is still pending but one of its ` +
                  `options completes "${event.detail}", which the checkpoint already records`,
              ).toBe(false);
            }
          }
        }
      }
    }
  });

  it("only the newest delivery in a channel may still be awaiting a reply", () => {
    for (const cp of CHECKPOINTS) {
      for (const [channelId, list] of channelsOf(cp)) {
        const pending = getPendingReplies(channelId, cp.deliveredPiperIds, USER);
        expect(
          pending.length,
          `${cp.id}: ${channelId} has a backlog of ${pending.length} pending prompts ` +
            `(${pending.map((p) => p.deliveryId).join(", ")})`,
        ).toBeLessThanOrEqual(1);
        if (pending.length === 1) {
          expect(
            pending[0].deliveryId,
            `${cp.id}: ${channelId} surfaces a stale prompt; the newest delivery is ${list[list.length - 1]}`,
          ).toBe(list[list.length - 1]);
        }
      }
    }
  });

  it("answering a pending prompt cannot re-deliver a message already in the checkpoint", () => {
    // An answered-implied prompt left pending would replay its cascade; an
    // actually-pending one must only lead somewhere new.
    for (const cp of CHECKPOINTS) {
      const delivered = new Set(deliveries(cp));
      for (const channelId of channelsOf(cp).keys()) {
        for (const pending of getPendingReplies(channelId, cp.deliveredPiperIds, USER)) {
          for (const def of defs) {
            const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
            const fedByPrompt = triggers.some(
              (t) => t.type === "after_piper_reply" && t.deliveryId === pending.deliveryId,
            );
            if (!fedByPrompt) continue;
            expect(
              delivered.has(def.id),
              `${cp.id}: ${channelId}/${pending.deliveryId} is pending but its cascade ` +
                `"${def.id}" is already delivered`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("a `piper_reply:<id>` objective implies the prompt is marked answered", () => {
    for (const cp of CHECKPOINTS) {
      for (const objective of cp.completedObjectives) {
        if (!objective.startsWith("piper_reply:")) continue;
        const deliveryId = objective.slice("piper_reply:".length);
        const def = defById.get(deliveryId);
        if (!def?.replyOptions) continue;
        const answered = def.replyOptions.some((_, idx) =>
          cp.deliveredPiperIds.includes(`reply:${deliveryId}:${idx}`),
        );
        expect(answered, `${cp.id}: ${objective} is complete but ${deliveryId} has no reply marker`).toBe(true);
      }
    }
  });
});
