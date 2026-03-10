import { describe, it, expect } from "vitest";
import { checkPiperDeliveries, seedImmediatePiper, getConversationHistory, getPendingReply, getVisibleChannels } from "../delivery";
import { GameEvent } from "../../mail/delivery";

const USERNAME = "testplayer";

describe("checkPiperDeliveries", () => {
  it("does not deliver immediate messages via checkPiperDeliveries", () => {
    const event: GameEvent = { type: "command_executed", detail: "ls" };
    const result = checkPiperDeliveries(event, [], USERNAME);
    expect(result).not.toContain("general_edward_welcome");
  });

  it("delivers messages on matching after_file_read trigger", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/onboarding.md",
    };
    const result = checkPiperDeliveries(event, [], USERNAME);
    expect(result).toContain("oscar_log_check");
    expect(result).toContain("dana_welcome");
  });

  it("delivers messages on matching after_email_read trigger", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "chip_intro",
    };
    const result = checkPiperDeliveries(event, [], USERNAME);
    expect(result).toContain("eng_sarah_welcome");
  });

  it("delivers messages on matching after_objective trigger", () => {
    const event: GameEvent = {
      type: "objective_completed",
      detail: "search_tools_accepted",
    };
    const result = checkPiperDeliveries(event, [], USERNAME);
    expect(result).toContain("oscar_access_review");
  });

  it("skips already-delivered messages", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/onboarding.md",
    };
    const result = checkPiperDeliveries(event, ["oscar_log_check"], USERNAME);
    expect(result).not.toContain("oscar_log_check");
    expect(result).toContain("dana_welcome");
  });

  it("does not duplicate deliveries within the same call", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/srv/engineering/team-info.md",
    };
    const result = checkPiperDeliveries(event, [], USERNAME);
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it("returns empty array when no event matches", () => {
    const event: GameEvent = {
      type: "file_read",
      detail: "/some/unrelated/path",
    };
    const result = checkPiperDeliveries(event, [], USERNAME);
    expect(result).toHaveLength(0);
  });
});

describe("seedImmediatePiper", () => {
  it("returns IDs of all immediate deliveries", () => {
    const ids = seedImmediatePiper(USERNAME);
    expect(ids).toContain("general_edward_welcome");
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("getConversationHistory", () => {
  it("returns messages for a delivered channel", () => {
    const messages = getConversationHistory("general", ["general_edward_welcome"], USERNAME);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].from).toBe("Edward Torres");
  });

  it("returns empty for undelivered channel", () => {
    const messages = getConversationHistory("general", [], USERNAME);
    expect(messages).toHaveLength(0);
  });

  it("includes player reply when reply ID is in delivered list", () => {
    const delivered = ["general_edward_welcome", "reply:general_edward_welcome:0"];
    const messages = getConversationHistory("general", delivered, USERNAME);
    const playerMsg = messages.find((m) => m.isPlayer);
    expect(playerMsg).toBeDefined();
  });
});

describe("getPendingReply", () => {
  it("returns reply options for unreplied delivery", () => {
    const pending = getPendingReply("dm_oscar", ["oscar_log_check"], USERNAME);
    expect(pending).not.toBeNull();
    expect(pending!.deliveryId).toBe("oscar_log_check");
    expect(pending!.options!.length).toBeGreaterThan(0);
  });

  it("returns null when already replied", () => {
    const pending = getPendingReply("dm_oscar", ["oscar_log_check", "reply:oscar_log_check:0"], USERNAME);
    expect(pending).toBeNull();
  });

  it("returns null for channel with no reply options", () => {
    const pending = getPendingReply("general", ["general_edward_welcome"], USERNAME);
    // general_edward_welcome has reply options, so this should return them
    expect(pending).not.toBeNull();
  });
});

describe("getVisibleChannels", () => {
  it("shows channels even when empty", () => {
    const channels = getVisibleChannels([], USERNAME);
    const general = channels.find((c) => c.channel.id === "general");
    expect(general).toBeDefined();
  });

  it("hides DMs with no delivered messages", () => {
    const channels = getVisibleChannels([], USERNAME);
    const oscar = channels.find((c) => c.channel.id === "dm_oscar");
    expect(oscar).toBeUndefined();
  });

  it("shows DMs when messages have been delivered", () => {
    const channels = getVisibleChannels(["oscar_log_check"], USERNAME);
    const oscar = channels.find((c) => c.channel.id === "dm_oscar");
    expect(oscar).toBeDefined();
  });

  it("calculates unread count", () => {
    const channels = getVisibleChannels(["general_edward_welcome"], USERNAME);
    const general = channels.find((c) => c.channel.id === "general");
    expect(general).toBeDefined();
    expect(general!.unread).toBeGreaterThan(0);
  });
});
