import { describe, it, expect, beforeEach, vi } from "vitest";
import { execute } from "@tt/core/commands/registry";
import type { CommandContext } from "@tt/core/commands/types";
import "../engine/commands/navigation"; // register challenges/review/goto/...
import { consumePendingNavigation } from "../engine/commands/navigation";
import { getCategory, registryIndex as idx } from "../challenges/categories";
import { CHALLENGES } from "../challenges/registry";
import { INITIAL_EASE, type ReviewStat } from "../challenges/scheduler";
import { MONDAY, resetStore } from "./helpers";
import { useGameStore } from "../state/gameStore";
import { buildBaseFs } from "../lib/seed";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ctx(): CommandContext {
  return {
    fs: buildBaseFs(),
    cwd: HOME_DIR,
    homeDir: HOME_DIR,
    username: "player",
    activeComputer: CRUNCH_MACHINE,
    rawArgs: [],
  } as unknown as CommandContext;
}

function run(line: string) {
  const [cmd, ...args] = line.split(" ");
  return execute(cmd, args, {}, ctx());
}

// A stat whose dueAt is `overdueBy` ms in the past (negative = not yet due).
const overdue = (overdueBy: number): ReviewStat => ({
  lastReviewedAt: Date.now() - DAY - overdueBy,
  intervalMs: DAY,
  ease: INITIAL_EASE,
  reps: 1,
  lapses: 0,
});

describe("review sessions", () => {
  beforeEach(() => {
    resetStore();
    consumePendingNavigation(); // clear any leftover pending nav
  });

  it("review reports nothing due when every stat is future-dated", () => {
    const reviewStats = Object.fromEntries(CHALLENGES.map((c) => [c.id, overdue(-10 * DAY)]));
    useGameStore.setState({ reviewStats });
    const out = strip(run("review").output);
    expect(out).toContain("Nothing due for review.");
    expect(out).toContain("Next review in");
    expect(consumePendingNavigation()).toBeNull();
  });

  it("review queues most-overdue first, then new challenges in registry order", () => {
    const [a, b] = [CHALLENGES[3].id, CHALLENGES[7].id];
    useGameStore.setState({ reviewStats: { [a]: overdue(HOUR), [b]: overdue(5 * DAY) } });
    const out = strip(run("review").output);
    expect(out).toContain(`Reviewing ${CHALLENGES.length} challenges: 2 due, ${CHALLENGES.length - 2} new.`);
    expect(out).toContain("1 Again, 2 Hard, 3/Enter Good, 4 Easy");
    const nav = consumePendingNavigation();
    expect(nav?.type).toBe("review");
    if (nav?.type !== "review") throw new Error("expected a review nav");
    expect(nav.queue.slice(0, 2)).toEqual([b, a]); // b is more overdue
    expect(nav.queue.slice(2)).toEqual(CHALLENGES.filter((c) => c.id !== a && c.id !== b).map((c) => c.id));
  });

  it("startReviewSession flips to 'all', loads the first id, and stashes the return spot", () => {
    const state = useGameStore.getState;
    useGameStore.setState({ activeCategory: "git", challengeIndex: 2 });
    state().startReviewSession(["rm-bomb", "panes-split"]);
    expect(state().activeCategory).toBe("all");
    expect(state().challengeIndex).toBe(idx("rm-bomb"));
    expect(state().reviewReturn).toEqual({ category: "git", index: 2 });
    expect(state().reviewQueue).toEqual(["panes-split"]);
    expect(state().reviewTotal).toBe(2);

    // Re-running review mid-session keeps the ORIGINAL return point.
    state().startReviewSession(["env-export"]);
    expect(state().reviewReturn).toEqual({ category: "git", index: 2 });
    expect(state().challengeIndex).toBe(idx("env-export"));

    // An empty queue is a no-op.
    const before = state().challengeIndex;
    state().startReviewSession([]);
    expect(state().challengeIndex).toBe(before);
  });

  it("grading at a mid-review gate records the stat and chains to the next queued id", () => {
    const state = useGameStore.getState;
    useGameStore.setState({
      challengeIndex: idx("panes-grid"),
      awaitingContinue: true,
      pendingGradeId: "panes-grid",
      reviewReturn: { category: "git", index: 2 },
      reviewQueue: ["rm-bomb"],
      reviewTotal: 2,
    });
    state().continueToNext("hard");
    expect(state().reviewStats["panes-grid"]).toMatchObject({ intervalMs: 12 * HOUR, reps: 1 });
    expect(state().challengeIndex).toBe(idx("rm-bomb"));
    expect(state().reviewQueue).toEqual([]);
    expect(state().awaitingContinue).toBe(false);
    expect(state().pendingGradeId).toBeNull();
    expect(state().reviewReturn).toEqual({ category: "git", index: 2 }); // still reviewing
  });

  it("exhausting the queue restores the pre-review spot and flashes completion", () => {
    const state = useGameStore.getState;
    useGameStore.setState({
      challengeIndex: idx("rm-bomb"),
      awaitingContinue: true,
      pendingGradeId: "rm-bomb",
      reviewReturn: { category: "git", index: 1 },
      reviewQueue: [],
      reviewTotal: 2,
    });
    state().continueToNext("good");
    expect(state().reviewStats["rm-bomb"]).toMatchObject({ intervalMs: DAY, reps: 1 });
    expect(state().activeCategory).toBe("git");
    expect(state().challengeIndex).toBe(1);
    expect(state().reviewReturn).toBeNull();
    expect(state().reviewTotal).toBe(0);
    expect(state().flash).toBe("✓ Review session complete");
  });

  it("continueToNext defaults to a Good grade", () => {
    const state = useGameStore.getState;
    useGameStore.setState({ challengeIndex: 0, awaitingContinue: true, pendingGradeId: "panes-split" });
    state().continueToNext();
    expect(state().reviewStats["panes-split"]).toMatchObject({ intervalMs: DAY, ease: INITIAL_EASE });
    expect(state().challengeIndex).toBe(1); // sequential play advances as before
  });

  it("sequential play reaches the gate with a pending grade and records on continue", () => {
    const state = useGameStore.getState;
    state().loadChallenge(idx("panes-split"));
    const rootPaneId = state().windows[0].activePaneId;
    const rightPaneId = state().splitPane(rootPaneId, "h")!;
    state().splitPane(rightPaneId, "v"); // (h L (v L L)) = the target layout
    expect(state().awaitingContinue).toBe(true);
    expect(state().pendingGradeId).toBe("panes-split");
    state().continueToNext("easy");
    expect(state().reviewStats["panes-split"]).toMatchObject({ intervalMs: 3 * DAY, reps: 1 });
    expect(state().pendingGradeId).toBeNull();
    expect(state().challengeIndex).toBe(idx("panes-split") + 1);
  });

  it("the last registry challenge gates during review but completes outside it", () => {
    const state = useGameStore.getState;
    const all = getCategory("all").challenges;
    const last = all[all.length - 1];
    expect(last.id).toBe("vim-reorder");
    // vim-reorder's final step checks recipe.txt is in Step 1/2/3 order. Seed
    // the file into that satisfied state so parking stepIndex on the last step
    // lets checkCompletion hit the terminal branch without editor choreography.
    const satisfyLast = () => {
      const wr = state().fs.writeFile(
        "/home/player/work/recipe.txt",
        "Step 1: chop the vegetables\nStep 2: simmer for 20 minutes\nStep 3: serve\n",
      );
      if (!wr.fs) throw new Error(wr.error ?? "seed recipe.txt failed");
      state().setFs(wr.fs);
    };

    // Outside review: end-of-track banner with a pending grade.
    state().loadChallenge(all.length - 1);
    satisfyLast();
    useGameStore.setState({ stepIndex: last.steps.length - 1 });
    state().checkCompletion();
    expect(state().completed).toBe(true);
    expect(state().awaitingContinue).toBe(false);
    expect(state().pendingGradeId).toBe(last.id);

    // Grading the banner records once, then further continues are no-ops.
    state().continueToNext("again");
    expect(state().reviewStats[last.id]).toMatchObject({ intervalMs: 10 * MINUTE, lapses: 1 });
    expect(state().completed).toBe(true);
    state().continueToNext("easy");
    expect(state().reviewStats[last.id].reps).toBe(1); // no double-grade

    // During review: the gate rises instead, so the queue can keep chaining.
    useGameStore.setState({ completed: false, reviewReturn: { category: "all", index: 0 }, reviewTotal: 1 });
    state().loadChallenge(all.length - 1);
    satisfyLast();
    useGameStore.setState({ stepIndex: last.steps.length - 1 });
    state().checkCompletion();
    expect(state().awaitingContinue).toBe(true);
    expect(state().completed).toBe(false);
    expect(state().pendingGradeId).toBe(last.id);
  });

  // Completes panes-split through the real splitPane -> checkCompletion path.
  const completePanesSplit = () => {
    const state = useGameStore.getState;
    state().loadChallenge(idx("panes-split"));
    const rootPaneId = state().windows[0].activePaneId;
    const rightPaneId = state().splitPane(rootPaneId, "h")!;
    state().splitPane(rightPaneId, "v"); // (h L (v L L)) = the target layout
  };

  it("completing awards mastery points at the gate, before any grade", () => {
    const state = useGameStore.getState;
    completePanesSplit();
    expect(state().awaitingContinue).toBe(true);
    expect(state().mastery.mp).toBe(50); // never cleared before => first clear
    expect(state().lastAwards).toEqual([{ mp: 50, label: "First clear" }]);
    expect(state().lastMpAt["panes-split"]).toBeDefined();
  });

  it("an Again grade adds no MP but still schedules the lapse", () => {
    const state = useGameStore.getState;
    completePanesSplit();
    state().continueToNext("again");
    expect(state().mastery.mp).toBe(50); // completion MP already paid; grade adds nothing
    expect(state().reviewStats["panes-split"]).toMatchObject({ lapses: 1 });
  });

  it("abandoning a gate keeps the completion MP but never schedules — and a replay pays nothing", () => {
    const state = useGameStore.getState;
    completePanesSplit();
    state().jumpToChallenge(idx("rm-bomb"));
    expect(state().pendingGradeId).toBeNull();
    expect(state().mastery.mp).toBe(50); // the objective completion happened
    expect(state().reviewStats["panes-split"]).toBeUndefined();

    // Replaying immediately: bestTimes blocks first-clear, the sub-day gate
    // (measured from lastMpAt) blocks retention.
    completePanesSplit();
    expect(state().mastery.mp).toBe(50);
  });

  it("a sub-day re-clear pays 0 MP and does not move lastMpAt", () => {
    const state = useGameStore.getState;
    completePanesSplit();
    const firstAt = state().lastMpAt["panes-split"];
    expect(firstAt).toBe(MONDAY);

    // An hour later, well inside the one-day retention gate.
    state().jumpToChallenge(idx("rm-bomb"));
    vi.setSystemTime(MONDAY + HOUR);
    completePanesSplit();
    expect(state().lastAwards).toEqual([]);
    expect(state().mastery.mp).toBe(50); // nothing paid
    // The zero-pay clear must NOT push the clock forward: measuring from the
    // original clear is what lets a genuine next-day repeat still earn.
    expect(state().lastMpAt["panes-split"]).toBe(firstAt);

    state().jumpToChallenge(idx("rm-bomb"));
    vi.setSystemTime(MONDAY + DAY + HOUR);
    completePanesSplit();
    expect(state().lastAwards).toEqual([{ mp: 4, label: "Retention" }]);
    expect(state().lastMpAt["panes-split"]).toBe(MONDAY + DAY + HOUR);
  });

  it("the end-of-track banner writes the completion MP too", () => {
    // The `completed` branch of checkCompletion is a SEPARATE set() from the
    // mid-track gate; if the mastery write is dropped from it, the last
    // challenge of every track silently pays nothing.
    const state = useGameStore.getState;
    const all = getCategory("all").challenges;
    const last = all[all.length - 1];
    // The recipe.txt shortcut below is vim-reorder's solution; fail loudly if
    // a new challenge is appended to the registry instead of mysteriously.
    expect(last.id).toBe("vim-reorder");
    state().loadChallenge(all.length - 1);
    // Same recipe.txt shortcut as above: vim keystrokes can't be driven here.
    const wr = state().fs.writeFile(
      "/home/player/work/recipe.txt",
      "Step 1: chop the vegetables\nStep 2: simmer for 20 minutes\nStep 3: serve\n",
    );
    if (!wr.fs) throw new Error(wr.error ?? "seed recipe.txt failed");
    state().setFs(wr.fs);
    useGameStore.setState({ stepIndex: last.steps.length - 1 });
    state().checkCompletion();

    expect(state().completed).toBe(true);
    expect(state().mastery.mp).toBe(50);
    expect(state().lastAwards).toEqual([{ mp: 50, label: "First clear" }]);
    expect(state().lastMpAt[last.id]).toBe(MONDAY);
    expect(state().bestTimes[last.id]).toBeDefined();

    // Grading the banner only schedules; it must not pay a second time.
    state().continueToNext("good");
    expect(state().mastery.mp).toBe(50);
  });

  it("challenges shows due badges and the review summary", () => {
    const first = CHALLENGES[0];
    useGameStore.setState({ reviewStats: { [first.id]: overdue(HOUR) } });
    const out = strip(run("challenges").output);
    expect(out).toContain(`1. ${first.title} ● due`);
    expect(out).toContain("1 due for review: run 'review'.");
  });

  it("switching tracks or jumping abandons the review session", () => {
    const state = useGameStore.getState;
    useGameStore.setState({ reviewReturn: { category: "git", index: 1 }, reviewQueue: ["rm-bomb"], reviewTotal: 3 });
    state().selectCategory("git");
    expect(state().reviewReturn).toBeNull();
    expect(state().reviewQueue).toEqual([]);
    expect(state().reviewTotal).toBe(0);

    // restartChallenge must NOT cancel (it re-seeds the current challenge only).
    useGameStore.setState({ activeCategory: "all", reviewReturn: { category: "git", index: 1 }, reviewTotal: 1 });
    state().restartChallenge();
    expect(state().reviewReturn).toEqual({ category: "git", index: 1 });
  });
});
