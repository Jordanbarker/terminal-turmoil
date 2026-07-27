import { describe, it, expect, beforeEach, vi } from "vitest";
import { CHECKPOINTS } from "../../story/checkpoints";
import { buildCheckpointState, INITIAL_STORY_FLAGS } from "../checkpointLoad";
import { useGameStore } from "../gameStore";
import { buildFs } from "../saveManager";
import { PLAYER } from "../types";
import { getEmailDefinitions } from "../../engine/mail/emails";
import { getMailEntries, getSentDir, hasReplyToEmail, parseEmailContent } from "../../engine/mail/mailUtils";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { findRepoRoot, readIndex, resolveHead, readCommit, getCurrentBranch, readHead, gitStatus } from "@tt/core/git/repo";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
});

beforeEach(() => {
  storage.clear();
  useGameStore.getState().resetGame();
});

const clonedCheckpoints = CHECKPOINTS.filter((cp) => cp.storyFlags.dbt_project_cloned);

describe("checkpoint loads produce a usable dbt repo", () => {
  it("covers at least one checkpoint (guards the filter above)", () => {
    expect(clonedCheckpoints.length).toBeGreaterThan(0);
  });

  for (const cp of clonedCheckpoints) {
    it(`${cp.id}: nexacorp-analytics is a real git repo`, () => {
      const { computerState } = buildCheckpointState(PLAYER.username, cp);
      const fs = computerState.devcontainer!.fs;
      const repoPath = `/home/${PLAYER.username}/nexacorp-analytics`;

      // Asserted through the git engine, not by looking for a .git directory:
      // a repo that findRepoRoot/resolveHead/gitStatus all accept is one the
      // player's git commands will accept.
      expect(findRepoRoot(fs, repoPath)).toBe(repoPath);
      expect(getCurrentBranch(readHead(fs, repoPath))).toBe("main");
      const head = resolveHead(fs, repoPath);
      expect(head).toBeTruthy();
      expect(readCommit(fs, repoPath, head!)).not.toBeNull();
      expect(readIndex(fs, repoPath)).toEqual({ staged: {}, deleted: [] });

      // A clean checkout tracking origin/main: no phantom untracked files, and
      // the remote-tracking ref exists so `git pull` has something to pull from.
      const status = gitStatus(fs, repoPath);
      expect(status.branch).toBe("main");
      expect(status.staged).toEqual([]);
      expect(status.unstaged).toEqual([]);
      expect(status.untracked).toEqual([]);
      expect(status.tracking).toEqual({ remoteRef: "origin/main", ahead: 0, behind: 0 });
    });
  }

  it("no checkpoint leaves a working tree without a repo", () => {
    for (const cp of CHECKPOINTS) {
      if (!cp.computers.includes("devcontainer")) continue;
      const fs = buildCheckpointState(PLAYER.username, cp).computerState.devcontainer!.fs;
      const repoPath = `/home/${PLAYER.username}/nexacorp-analytics`;
      const treeExists = !!fs.getNode(repoPath);
      expect(treeExists).toBe(!!cp.storyFlags.dbt_project_cloned);
      if (treeExists) expect(findRepoRoot(fs, repoPath)).toBe(repoPath);
    }
  });
});

describe("checkpoint story flags", () => {
  it("every checkpoint keeps the baseline flags", () => {
    for (const cp of CHECKPOINTS) {
      const { storyFlags } = buildCheckpointState(PLAYER.username, cp);
      for (const [flag, value] of Object.entries(INITIAL_STORY_FLAGS)) {
        expect(storyFlags[flag], `${cp.id} lost ${flag}`).toBe(value);
      }
    }
  });

  it("tabs_unlocked survives every loadCheckpointData call", () => {
    for (const cp of CHECKPOINTS) {
      useGameStore.getState().resetGame();
      useGameStore.getState().loadCheckpointData(cp);
      expect(useGameStore.getState().storyFlags.tabs_unlocked, `${cp.id}`).toBe(true);
    }
  });

  it("a checkpoint's own flags still win over the baseline", () => {
    const { storyFlags } = buildCheckpointState(PLAYER.username, {
      ...CHECKPOINTS[0],
      storyFlags: { ...CHECKPOINTS[0].storyFlags, tabs_unlocked: false },
    });
    expect(storyFlags.tabs_unlocked).toBe(false);
  });
});

describe("loadCheckpointData store effects", () => {
  it("marks the intro as seen so the nano tutorial can't re-fire", () => {
    expect(useGameStore.getState().hasSeenIntro).toBe(false);
    useGameStore.getState().loadCheckpointData(CHECKPOINTS[0]);
    expect(useGameStore.getState().hasSeenIntro).toBe(true);
  });

  it("clears a pending Piper notification from the pre-cheat session", () => {
    useGameStore.getState().setPendingPiperNotification(true);
    useGameStore.getState().loadCheckpointData(CHECKPOINTS[0]);
    expect(useGameStore.getState().pendingPiperNotification).toBe(false);
  });

});

/**
 * The mailbox a checkpoint hands the player has to agree with the flags it
 * sets. The regression this guards: at `cheat 2` the NexaCorp offer arrived
 * UNREAD with a live accept/decline prompt even though `accepted_nexacorp` was
 * a completed objective, so picking "Thanks, but I'll have to pass" fired
 * `rejected_nexacorp_1` and delivered a recruiting follow-up mid-Chapter-2.
 */
describe("checkpoint mailbox agrees with checkpoint flags", () => {
  const offerDef = () =>
    getEmailDefinitions(PLAYER.username, "home").find((d) => d.email.id === "nexacorp_offer")!;

  /** The mail entry for an email id, by subject (maildir filenames are NNN_<slug>). */
  const entryFor = (fs: VirtualFS, id: string) => {
    const def = getEmailDefinitions(PLAYER.username, "home").find((d) => d.email.id === id)!;
    return getMailEntries(fs).find((e) => e.parsed.subject === def.email.subject);
  };

  for (const cp of CHECKPOINTS) {
    if (!cp.deliveredEmailIds.includes("nexacorp_offer")) continue;

    it(`${cp.id}: the offer is filed read, not sitting unread in new/`, () => {
      const fs = buildCheckpointState(PLAYER.username, cp).computerState.home!.fs;
      const entry = entryFor(fs, "nexacorp_offer");
      expect(entry, "offer missing from the mailbox entirely").toBeDefined();
      expect(entry!.dir).toBe("cur");
      expect(entry!.parsed.status).toBe("R");
    });

    it(`${cp.id}: the offer's reply prompt reads as already answered`, () => {
      const fs = buildCheckpointState(PLAYER.username, cp).computerState.home!.fs;
      expect(hasReplyToEmail(fs, PLAYER.username, "nexacorp_offer")).toBe(true);
    });

    it(`${cp.id}: the recorded reply is the accept branch, so declining is unreachable`, () => {
      const fs = buildCheckpointState(PLAYER.username, cp).computerState.home!.fs;
      const sent = fs.getNode(getSentDir(PLAYER.username));
      expect(sent?.type).toBe("directory");
      const replies = sent && sent.type === "directory" ? Object.values(sent.children) : [];
      const offerReply = replies.find(
        (n) => n.type === "file" && parseEmailContent(n.content).inReplyTo === "nexacorp_offer"
      );
      expect(offerReply).toBeDefined();
      const accept = offerDef().replyOptions![0];
      const decline = offerDef().replyOptions![1];
      const body = parseEmailContent((offerReply as { content: string }).content).body;
      expect(body).toContain(accept.replyBody.split("\n")[2]);
      expect(body).not.toContain(decline.replyBody.split("\n")[2]);
      // The checkpoint records acceptance, so the decline branch's objective
      // must not be recorded alongside it.
      expect(cp.completedObjectives).toContain("accepted_nexacorp");
      expect(cp.completedObjectives).not.toContain("rejected_nexacorp_1");
    });
  }

  it("files every immediate email the checkpoint lists as delivered", () => {
    for (const cp of CHECKPOINTS) {
      const fs = buildCheckpointState(PLAYER.username, cp).computerState.home!.fs;
      for (const def of getEmailDefinitions(PLAYER.username, "home")) {
        if (!cp.deliveredEmailIds.includes(def.email.id)) continue;
        const entry = entryFor(fs, def.email.id);
        expect(entry?.dir, `${cp.id}/${def.email.id}`).toBe("cur");
      }
    }
  });

  it("leaves mail the checkpoint never delivered untouched in new/", () => {
    // job_board_alert/backup_failure are immediate and listed as delivered, so
    // they file read; anything absent from the list stays as the builder seeded it.
    const fs = buildCheckpointState(PLAYER.username, {
      ...CHECKPOINTS[0],
      deliveredEmailIds: [],
      completedObjectives: [],
    }).computerState.home!.fs;
    expect(entryFor(fs, "nexacorp_offer")!.dir).toBe("new");
    expect(hasReplyToEmail(fs, PLAYER.username, "nexacorp_offer")).toBe(false);
  });
});

describe("buildFs mailbox replay", () => {
  it("re-seeds previously delivered mail as read, not as new unread mail", () => {
    const fs = buildFs(PLAYER.username, "home", { deliveredEmailIds: ["nexacorp_followup"] });
    const cur = fs.getNode(`/var/mail/${PLAYER.username}/cur`);
    expect(cur && cur.type === "directory" && Object.keys(cur.children).length).toBe(1);
  });

  it("honours an explicit read set", () => {
    const fs = buildFs(PLAYER.username, "home", {
      deliveredEmailIds: ["nexacorp_followup"],
      readEmailIds: new Set(),
    });
    const cur = fs.getNode(`/var/mail/${PLAYER.username}/cur`);
    expect(cur && cur.type === "directory" ? Object.keys(cur.children).length : -1).toBe(0);
  });

  it("only restores replies for mail that is actually in the mailbox", () => {
    // nexacorp_persuasion_1 also carries an "accept" option, but it is only
    // delivered on the reject path. Completing accepted_nexacorp must not
    // conjure a reply to an email the player never received.
    const fs = buildFs(PLAYER.username, "home", {
      deliveredEmailIds: ["nexacorp_offer"],
      completedObjectives: ["accepted_nexacorp"],
    });
    expect(hasReplyToEmail(fs, PLAYER.username, "nexacorp_offer")).toBe(true);
    expect(hasReplyToEmail(fs, PLAYER.username, "nexacorp_persuasion_1")).toBe(false);
  });

  it("leaves a prompt live when no branch objective is recorded", () => {
    const fs = buildFs(PLAYER.username, "home", { deliveredEmailIds: ["nexacorp_offer"] });
    expect(hasReplyToEmail(fs, PLAYER.username, "nexacorp_offer")).toBe(false);
  });
});
