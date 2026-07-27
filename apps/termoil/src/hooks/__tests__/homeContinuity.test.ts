import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGameStore } from "../../state/gameStore";
import { buildFs, serializeGameState, restoreGameState, pickSaveableState } from "../../state/saveManager";
import { resolveHomeForReentry } from "../useComputerTransitions";
import { getMailEntries, getSentDir } from "../../engine/mail/mailUtils";
import { PLAYER } from "../../state/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
});

const USER = PLAYER.username;
const HOME = `/home/${USER}`;
/** Two home emails with non-immediate triggers: one read, one still unread. */
const READ_EMAIL = "nexacorp_followup";
const UNREAD_EMAIL = "chip_ssh_setup";

function write(fs: VirtualFS, path: string, content: string): VirtualFS {
  const res = fs.writeFile(path, content);
  if (!res.fs) throw new Error(`write ${path} failed: ${res.error}`);
  return res.fs;
}

/** Subjects of the mail sitting in `new/` (i.e. unread). */
function unreadSubjects(fs: VirtualFS): string[] {
  return getMailEntries(fs).filter((e) => e.dir === "new").map((e) => e.parsed.subject);
}
function readSubjects(fs: VirtualFS): string[] {
  return getMailEntries(fs).filter((e) => e.dir === "cur").map((e) => e.parsed.subject);
}

/**
 * A home box that has been lived in: one email opened, one still unread, a
 * reply filed in sent/, a file the player created, plus an exported env var
 * and an alias.
 */
function seedLivedInHome() {
  const store = useGameStore.getState();
  let fs = buildFs(USER, "home", {
    deliveredEmailIds: [READ_EMAIL, UNREAD_EMAIL],
    readEmailIds: new Set([READ_EMAIL]),
  });
  fs = write(fs, `${HOME}/notes-to-self.txt`, "remember the .bak logs\n");
  fs = write(fs, `${getSentDir(USER)}/001_re_offer.txt`, "Subject: Re: Offer\n\nI accept.\n");
  store.initComputer("home", fs);
  store.setComputerEnv("home", { ...useGameStore.getState().computerState.home!.envVars, MY_VAR: "mine" });
  store.setComputerAliases("home", { ...useGameStore.getState().computerState.home!.aliases, gs: "git status" });
  useGameStore.setState({ deliveredEmailIds: [READ_EMAIL, UNREAD_EMAIL] });
  return useGameStore.getState().computerState.home!;
}

beforeEach(() => {
  storage.clear();
  useGameStore.getState().resetGame();
});

describe("home survives the end-of-day / termination reentry", () => {
  it("returns the live filesystem rather than a rebuilt one", () => {
    const before = seedLivedInHome();
    const fs = resolveHomeForReentry();
    expect(fs).toBe(before.fs);
  });

  it("keeps player-created files", () => {
    seedLivedInHome();
    expect(resolveHomeForReentry().readFile(`${HOME}/notes-to-self.txt`).content).toBe(
      "remember the .bak logs\n"
    );
  });

  it("keeps the sent/ maildir, so answered mail stays answered", () => {
    seedLivedInHome();
    const sent = resolveHomeForReentry().getNode(`${getSentDir(USER)}/001_re_offer.txt`);
    expect(sent?.type).toBe("file");
  });

  it("keeps per-email read/unread state", () => {
    const before = seedLivedInHome();
    const readBefore = readSubjects(before.fs);
    const unreadBefore = unreadSubjects(before.fs);
    expect(readBefore.length).toBe(1);

    const fs = resolveHomeForReentry();
    expect(readSubjects(fs)).toEqual(readBefore);
    expect(unreadSubjects(fs)).toEqual(unreadBefore);
    // The reentry must not resurrect the opened email as unread.
    expect(unreadSubjects(fs)).not.toContain(readBefore[0]);
  });

  it("keeps exported env vars and aliases (no initComputer re-derive)", () => {
    seedLivedInHome();
    resolveHomeForReentry();
    const entry = useGameStore.getState().computerState.home!;
    expect(entry.envVars.MY_VAR).toBe("mine");
    expect(entry.aliases.gs).toBe("git status");
  });

  it("keeps shell history", () => {
    const before = seedLivedInHome();
    const withHistory = write(before.fs, `${HOME}/.zsh_history`, ": 1700000000:0;ls -la\n");
    useGameStore.getState().setComputerFs("home", withHistory);
    expect(resolveHomeForReentry().readFile(`${HOME}/.zsh_history`).content).toContain("ls -la");
  });

  it("falls back to a seeded build only when home has no state at all", () => {
    seedLivedInHome();
    useGameStore.getState().removeComputer("home");
    const fs = resolveHomeForReentry();
    expect(useGameStore.getState().computerState.home?.fs).toBe(fs);
    expect(fs.readFile(`${HOME}/notes-to-self.txt`).content).toBeUndefined();
    // Even the fallback replays delivered mail as history, not as new mail.
    expect(unreadSubjects(fs).length).toBe(
      getMailEntries(fs).length - readSubjects(fs).length
    );
    expect(readSubjects(fs).length).toBe(2);
  });
});

describe("save round-trip preserves read state", () => {
  it("read mail stays read through serialize -> restore", () => {
    const before = seedLivedInHome();
    const readBefore = readSubjects(before.fs);
    const unreadBefore = unreadSubjects(before.fs);

    const payload = serializeGameState(pickSaveableState(useGameStore.getState()));
    const restored = restoreGameState(payload);

    const fs = restored.computerState.home!.fs;
    expect(readSubjects(fs)).toEqual(readBefore);
    expect(unreadSubjects(fs)).toEqual(unreadBefore);
    expect(fs.readFile(`${HOME}/notes-to-self.txt`).content).toBe("remember the .bak logs\n");
    expect(fs.getNode(`${getSentDir(USER)}/001_re_offer.txt`)?.type).toBe("file");
  });

  it("a pane whose computer entry is unrecoverable rebuilds without unread resurrection", () => {
    seedLivedInHome();
    const payload = serializeGameState(pickSaveableState(useGameStore.getState()));
    // Simulate a corrupted/absent FS entry: restoreGameState rebuilds from seed.
    payload.computerStates = {};
    const fs = restoreGameState(payload).computerState.home!.fs;
    expect(unreadSubjects(fs)).not.toContain(readSubjects(fs)[0]);
    expect(readSubjects(fs).length).toBe(2);
  });

  it("pendingPiperNotification round-trips instead of leaking from the live session", () => {
    useGameStore.getState().setPendingPiperNotification(true);
    const payload = serializeGameState(pickSaveableState(useGameStore.getState()));
    expect(payload.pendingPiperNotification).toBe(true);
    expect(restoreGameState(payload).pendingPiperNotification).toBe(true);

    payload.pendingPiperNotification = false;
    expect(restoreGameState(payload).pendingPiperNotification).toBe(false);
  });
});
