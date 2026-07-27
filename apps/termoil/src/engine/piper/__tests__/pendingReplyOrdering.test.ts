import { describe, it, expect } from "vitest";
import { getPendingReplies, type PendingReply } from "../delivery";
import { pickVisibleReply } from "../PiperSession";
import type { StoryFlags } from "../../../state/types";

const USERNAME = "testplayer";

const answer = (deliveryId: string, optionIdx: number) => `reply:${deliveryId}:${optionIdx}`;

/** What the session surfaces: the oldest unanswered prompt. */
const surfaced = (channelId: string, delivered: string[]) =>
  getPendingReplies(channelId, delivered, USERNAME)[0] ?? null;

/**
 * Two prompts can be outstanding in one channel: natural exploration (reading a
 * log before opening Piper) delivers a follow-up on top of an unanswered intro.
 * Both must stay answerable — the intro replies are what unlock grep/find/diff
 * (Oscar) and head/tail/wc/less (Auri).
 */
describe("multiple outstanding reply prompts per channel", () => {
  describe("Oscar — oscar_log_check then oscar_access_review", () => {
    // Reading /srv/engineering/onboarding.md delivers oscar_log_check; reading
    // /var/log/system.log then delivers oscar_access_review on top of it.
    const delivered = ["oscar_log_check", "oscar_access_review"];

    it("lists both unanswered prompts, oldest first", () => {
      const pending = getPendingReplies("dm_oscar", delivered, USERNAME);
      expect(pending.map((p) => p.deliveryId)).toEqual([
        "oscar_log_check",
        "oscar_access_review",
      ]);
    });

    it("surfaces the earlier prompt first", () => {
      expect(surfaced("dm_oscar", delivered)!.deliveryId).toBe("oscar_log_check");
    });

    it("surfaces the later prompt once the earlier one is answered", () => {
      const after = [...delivered, answer("oscar_log_check", 0)];
      expect(surfaced("dm_oscar", after)!.deliveryId).toBe("oscar_access_review");
    });

    it("keeps the earlier prompt answerable after the later one is answered", () => {
      const after = [...delivered, answer("oscar_access_review", 0)];
      expect(surfaced("dm_oscar", after)!.deliveryId).toBe("oscar_log_check");
    });

    it("returns nothing once both are answered", () => {
      const after = [...delivered, answer("oscar_log_check", 0), answer("oscar_access_review", 0)];
      expect(surfaced("dm_oscar", after)).toBeNull();
    });
  });

  describe("Auri — auri_hello then auri_pipeline_help", () => {
    // Reading welcome_edward delivers auri_hello; reading the Chen handoff notes
    // then delivers auri_pipeline_help on top of it.
    const delivered = ["auri_hello", "auri_pipeline_help"];

    it("lists both unanswered prompts, oldest first", () => {
      const pending = getPendingReplies("dm_auri", delivered, USERNAME);
      expect(pending.map((p) => p.deliveryId)).toEqual(["auri_hello", "auri_pipeline_help"]);
    });

    it("keeps auri_hello (the inspection-tools unlock) answerable after the later prompt", () => {
      const after = [...delivered, answer("auri_pipeline_help", 0)];
      expect(surfaced("dm_auri", after)!.deliveryId).toBe("auri_hello");
    });

    it("surfaces auri_pipeline_help once auri_hello is answered", () => {
      const after = [...delivered, answer("auri_hello", 0)];
      expect(surfaced("dm_auri", after)!.deliveryId).toBe("auri_pipeline_help");
    });
  });

  it("orders by delivery order, not definition order", () => {
    // oscar_access_review is defined after oscar_log_check but delivered first
    // here; the surfaced prompt follows the conversation, not the source file.
    const pending = getPendingReplies(
      "dm_oscar",
      ["oscar_access_review", "oscar_log_check"],
      USERNAME
    );
    expect(pending.map((p) => p.deliveryId)).toEqual(["oscar_access_review", "oscar_log_check"]);
  });

  it("ignores reply and seen markers when walking the delivered list", () => {
    const pending = getPendingReplies(
      "dm_oscar",
      ["seen:dm_oscar:3", "oscar_log_check", "oscar_access_review", "seen:dm_oscar:3"],
      USERNAME
    );
    expect(pending.map((p) => p.deliveryId)).toEqual([
      "oscar_log_check",
      "oscar_access_review",
    ]);
  });
});

describe("pickVisibleReply", () => {
  const oscarPending = () =>
    getPendingReplies("dm_oscar", ["oscar_log_check", "oscar_access_review"], USERNAME);

  it("picks the oldest prompt and maps menu positions to option indices", () => {
    const picked = pickVisibleReply(oscarPending(), {});
    expect(picked!.deliveryId).toBe("oscar_log_check");
    expect(picked!.mapping).toEqual([0, 1]);
  });

  it("hides flag-gated options but keeps the prompt", () => {
    // oscar_access_review's diff branch is gated behind discovered_log_tampering.
    const pending = getPendingReplies("dm_oscar", ["oscar_access_review"], USERNAME);
    expect(pickVisibleReply(pending, {})!.mapping).toEqual([0]);
    const flags: StoryFlags = { discovered_log_tampering: true };
    expect(pickVisibleReply(pending, flags)!.mapping).toEqual([0, 1]);
  });

  it("skips a prompt whose options are all gated away instead of dead-ending", () => {
    const pending: PendingReply[] = [
      {
        deliveryId: "all_hidden",
        options: [
          { label: "x", messageBody: "x", visibleWhen: { flag: "accused_nobody" } },
        ],
      },
      ...oscarPending(),
    ];
    expect(pickVisibleReply(pending, {})!.deliveryId).toBe("oscar_log_check");
  });

  it("returns null when nothing is pending", () => {
    expect(pickVisibleReply([], {})).toBeNull();
  });
});
