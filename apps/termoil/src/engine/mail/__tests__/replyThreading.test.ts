import { describe, it, expect } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import { execute } from "@tt/core/commands/registry";
import type { GameClock } from "@tt/core/commands/clock";
import { createHomeFilesystem } from "../../../story/filesystem/home";
import { checkEmailDeliveries, GameEvent } from "../delivery";
import {
  formatEmailContent,
  getMailEntries,
  getSentDir,
  hasReplyToEmail,
  parseEmailContent,
} from "../mailUtils";
import "../../commands/builtins";

const USERNAME = "testplayer";
const OFFER_SUBJECT = "Job Offer: AI Engineer at NexaCorp";

function makeHomeFS(): VirtualFS {
  const root = createHomeFilesystem(USERNAME);
  return new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
}

/**
 * The in-game clock is interpolated per day segment, so every reply the player
 * sends inside one segment is stamped with the *same* millisecond. Freezing it
 * here is not a simplification, it is the real condition.
 */
const FROZEN = new Date("2026-02-21T14:00:00");
const frozenClock: GameClock = {
  now: () => FROZEN,
  ts: () => "14:00:00",
  time: () => ({ hour: "14", minute: "00", second: "00", dow: "Sat", month: "Feb", day: "21", year: "2026" }),
};

function homeCtx(fs: VirtualFS) {
  return {
    fs, cwd: fs.cwd, homeDir: fs.homeDir, username: USERNAME,
    activeComputer: "home" as const, clock: frozenClock,
  };
}

/** 1-based inbox index of a subject, as `mail <n>` numbers it. */
function indexOf(fs: VirtualFS, subject: string): number {
  return getMailEntries(fs).findIndex((e) => e.parsed.subject === subject) + 1;
}

const offerIndex = (fs: VirtualFS) => indexOf(fs, OFFER_SUBJECT);

/** Read an email and answer a reply option exactly as PromptSession does. */
function replyTo(fs: VirtualFS, subject: string, optionIdx = 0): VirtualFS {
  const read = execute("mail", [String(indexOf(fs, subject))], {}, homeCtx(fs));
  const next = read.newFs ?? fs;
  const option = read.promptSession!.options[optionIdx];
  const content = formatEmailContent(option.replyEmail!, false);
  return next.writeFile(`${getSentDir(USERNAME)}/${option.replyFilename}`, content).fs ?? next;
}

const replyToOffer = (fs: VirtualFS) => replyTo(fs, OFFER_SUBJECT);

describe("email reply dedup is threaded by id, not subject", () => {
  it("stamps X-In-Reply-To with the parent email id on prompt replies", () => {
    const fs = makeHomeFS();
    const read = execute("mail", [String(offerIndex(fs))], {}, homeCtx(fs));
    const replyEmail = read.promptSession!.options[0].replyEmail!;
    const content = formatEmailContent(replyEmail, false);
    expect(content).toContain("X-In-Reply-To: nexacorp_offer");
    expect(parseEmailContent(content).inReplyTo).toBe("nexacorp_offer");
  });

  it("hasReplyToEmail ignores a hand-composed 'Re: <subject>' in sent/", () => {
    let fs = makeHomeFS();
    const send = execute("mail", [`Re: ${OFFER_SUBJECT}`, "edward@nexacorp.com"], { s: true }, homeCtx(fs));
    fs = send.newFs!;
    expect(hasReplyToEmail(fs, USERNAME, "nexacorp_offer")).toBe(false);
  });

  it("hasReplyToEmail sees a real prompt reply", () => {
    const fs = replyToOffer(makeHomeFS());
    expect(hasReplyToEmail(fs, USERNAME, "nexacorp_offer")).toBe(true);
  });

  it("a `mail -s \"Re: ...\"` collision does not consume the reply prompt", () => {
    let fs = makeHomeFS();
    const send = execute("mail", [`Re: ${OFFER_SUBJECT}`, "edward@nexacorp.com"], { s: true }, homeCtx(fs));
    fs = send.newFs!;

    const read = execute("mail", [String(offerIndex(fs))], {}, homeCtx(fs));
    expect(read.promptSession).toBeDefined();
    // accepted_nexacorp is reachable: the accept branch still carries its events.
    const labels = read.promptSession!.options.map((o) => o.label);
    expect(labels.length).toBeGreaterThan(1);
  });

  it("stops offering the prompt once a real reply exists", () => {
    const fs = replyToOffer(makeHomeFS());
    // Re-read from cur/ — the offer is marked read by now.
    const reread = execute("mail", [String(offerIndex(fs))], {}, homeCtx(fs));
    expect(reread.promptSession).toBeUndefined();
  });

  it("keeps both reply records when two replies land in one game-clock window", () => {
    // The in-game clock is interpolated per day segment, so consecutive replies
    // share a timestamp. Filenames are keyed on the parent email id instead, or
    // the second reply overwrites the first and reopens its prompt.
    let fs = replyToOffer(makeHomeFS());

    const accepted: GameEvent = { type: "objective_completed", detail: "accepted_nexacorp" };
    const delivery = checkEmailDeliveries(fs, accepted, ["nexacorp_offer"], "home", {});
    expect(delivery.newDeliveries).toContain("chip_ssh_setup");
    fs = replyTo(delivery.fs, "Your NexaCorp workstation is ready!");

    const sent = fs.getNode(getSentDir(USERNAME));
    const files = Object.keys(isDirectory(sent!) ? sent!.children : {}).sort();
    expect(files).toEqual(["sent_chip_ssh_setup_0", "sent_nexacorp_offer_0"]);
    expect(hasReplyToEmail(fs, USERNAME, "nexacorp_offer")).toBe(true);
    expect(hasReplyToEmail(fs, USERNAME, "chip_ssh_setup")).toBe(true);

    // Neither prompt comes back.
    expect(execute("mail", [String(offerIndex(fs))], {}, homeCtx(fs)).promptSession).toBeUndefined();
    const chipIdx = indexOf(fs, "Your NexaCorp workstation is ready!");
    expect(execute("mail", [String(chipIdx)], {}, homeCtx(fs)).promptSession).toBeUndefined();
  });
});
