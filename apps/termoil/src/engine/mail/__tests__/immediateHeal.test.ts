import { describe, it, expect } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { checkEmailDeliveries, GameEvent } from "../delivery";
import { createNexacorpFilesystem } from "../../../story/filesystem/nexacorp";
import { createHomeFilesystem } from "../../../story/filesystem/home";
import { formatEmailContent, getMailEntries, getNewDir, getSentDir } from "../mailUtils";
import { StoryFlags } from "../../../state/types";

const USERNAME = "testplayer";
const TICK: GameEvent = { type: "command_executed", detail: "ls" };

function nexacorpFS(): VirtualFS {
  return new VirtualFS(createNexacorpFilesystem(USERNAME), `/home/${USERNAME}`, `/home/${USERNAME}`);
}

function homeFS(): VirtualFS {
  return new VirtualFS(createHomeFilesystem(USERNAME), `/home/${USERNAME}`, `/home/${USERNAME}`);
}

const subjects = (fs: VirtualFS) => getMailEntries(fs).map((e) => e.parsed.subject);

/** `rm -r /var/mail/<user>/new` — the soft-lock the heal exists for. */
function removeNewDir(fs: VirtualFS): VirtualFS {
  return fs.removeNode(getNewDir(USERNAME)).fs ?? fs;
}

describe("seeded immediate emails self-heal", () => {
  it("brings back an unread immediate email deleted with the whole new/ dir", () => {
    const fs = removeNewDir(nexacorpFS());
    expect(subjects(fs)).toHaveLength(0);

    const result = checkEmailDeliveries(fs, TICK, [], "nexacorp", {});
    expect(result.newDeliveries).toContain("welcome_edward");
    expect(subjects(result.fs)).toContain("Welcome aboard!");
  });

  it("recreates the deleted new/ directory so later deliveries can land", () => {
    const fs = removeNewDir(nexacorpFS());
    const { fs: healed } = checkEmailDeliveries(fs, TICK, [], "nexacorp", {});
    const node = healed.getNode(getNewDir(USERNAME));
    expect(node?.type).toBe("directory");
  });

  it("does not double-deliver on the next check", () => {
    const first = checkEmailDeliveries(removeNewDir(nexacorpFS()), TICK, [], "nexacorp", {});
    const second = checkEmailDeliveries(first.fs, TICK, first.newDeliveries, "nexacorp", {});
    expect(second.newDeliveries).not.toContain("welcome_edward");
    expect(subjects(second.fs).filter((s) => s === "Welcome aboard!")).toHaveLength(1);
  });

  it("leaves an untouched maildir alone", () => {
    const before = nexacorpFS();
    const result = checkEmailDeliveries(before, TICK, [], "nexacorp", {});
    expect(result.newDeliveries).toHaveLength(0);
    expect(subjects(result.fs)).toHaveLength(subjects(before).length);
  });

  it("keeps a read-then-deleted email deleted", () => {
    // piper_unlocked is the record that welcome_edward was opened; the email
    // has already done its job, so deleting it is the player's call.
    const fs = removeNewDir(nexacorpFS());
    const flags: StoryFlags = { piper_unlocked: true };
    const result = checkEmailDeliveries(fs, TICK, [], "nexacorp", flags);
    expect(result.newDeliveries).not.toContain("welcome_edward");
    expect(subjects(result.fs)).not.toContain("Welcome aboard!");
  });

  it("never resurrects flavor emails nothing depends on", () => {
    // job_board_alert has no reply, no read flag and no after_email_read
    // dependents in either the email or the piper definitions.
    const fs = removeNewDir(homeFS());
    const result = checkEmailDeliveries(fs, TICK, [], "home", {});
    expect(result.newDeliveries).not.toContain("job_board_alert");
  });

  it("restores an email whose only dependent is a piper DM", () => {
    // it_provisioned has no read flag, but maya_dm_welcome triggers on
    // after_email_read of it, so losing it unread costs Maya's welcome DM.
    const fs = removeNewDir(nexacorpFS());
    const result = checkEmailDeliveries(fs, TICK, [], "nexacorp", { piper_unlocked: true });
    expect(result.newDeliveries).toContain("it_provisioned");
  });

  it("treats a delivered after_email_read follow-up as proof the email was opened", () => {
    // tom_welcome fires on reading welcome_edward, so its delivery discharges
    // welcome_edward even with no story flags at all.
    const fs = removeNewDir(nexacorpFS());
    const result = checkEmailDeliveries(fs, TICK, ["tom_welcome"], "nexacorp", {});
    expect(result.newDeliveries).not.toContain("welcome_edward");
  });

  it("restores the NexaCorp offer until its reply is actually sent", () => {
    // Reading the offer is not enough — the reply prompt is the progression.
    const fs = removeNewDir(homeFS());
    const flags: StoryFlags = { read_nexacorp_offer: true };
    const result = checkEmailDeliveries(fs, TICK, [], "home", flags);
    expect(result.newDeliveries).toContain("nexacorp_offer");
  });

  it("leaves the NexaCorp offer deleted once it has been replied to", () => {
    let fs = homeFS();
    const reply = formatEmailContent(
      {
        id: "reply_1",
        from: `${USERNAME}@email.com`,
        to: "Edward Torres <edward@nexacorp.com>",
        date: "Sat, 21 Feb 2026 09:00:00",
        subject: "Re: Job Offer: AI Engineer at NexaCorp",
        body: "I'm in!",
        inReplyTo: "nexacorp_offer",
      },
      false
    );
    fs = fs.writeFile(`${getSentDir(USERNAME)}/sent_1`, reply).fs!;
    fs = removeNewDir(fs);

    const result = checkEmailDeliveries(fs, TICK, [], "home", {});
    expect(result.newDeliveries).not.toContain("nexacorp_offer");
  });

  it("does not deliver a duplicate when a mail file is truncated or overwritten", () => {
    // `echo scratch > /var/mail/<user>/new/001_welcome_aboard` leaves a file
    // that is no longer a message. It must not list as a blank inbox row, and
    // the restored copy must not sit alongside a second live "Welcome aboard!".
    let fs = nexacorpFS();
    fs = fs.writeFile(`${getNewDir(USERNAME)}/001_welcome_aboard`, "scratch\n").fs!;
    expect(subjects(fs)).not.toContain("");

    const result = checkEmailDeliveries(fs, TICK, [], "nexacorp", {});
    expect(subjects(result.fs).filter((s) => s === "Welcome aboard!")).toHaveLength(1);
    expect(subjects(result.fs)).not.toContain("");
  });

  it("does not re-deliver when only the Subject header was edited", () => {
    // Presence is keyed on the delivered filename slug first, so rewriting the
    // subject in place is an edit, not a deletion.
    let fs = nexacorpFS();
    const entry = getMailEntries(fs).find((e) => e.parsed.subject === "Welcome aboard!")!;
    fs = fs.writeFile(
      `${getNewDir(USERNAME)}/${entry.filename}`,
      "From: Edward Torres <edward@nexacorp.com>\nSubject: Renamed\n\nbody\n"
    ).fs!;

    const result = checkEmailDeliveries(fs, TICK, [], "nexacorp", {});
    expect(result.newDeliveries).not.toContain("welcome_edward");
  });

  it("stays out of machines with no mailbox for the user", () => {
    const fs = new VirtualFS(createNexacorpFilesystem(USERNAME), "/home/erik", "/home/erik");
    const result = checkEmailDeliveries(fs, TICK, [], "erik-pc", {});
    expect(result.newDeliveries).toHaveLength(0);
    expect(result.fs.getNode("/var/mail/erik")).toBeNull();
  });
});
