import { describe, it, expect } from "vitest";
import {
  awardCompletion,
  awardDeckCleared,
  dayKeyOf,
  initialMastery,
  levelFor,
  progressInLevel,
  weekKeyOf,
  type MasteryState,
} from "../challenges/mastery";
import { INITIAL_EASE } from "../challenges/scheduler";
import { useGameStore } from "../state/gameStore";
import { CHALLENGES } from "../challenges/registry";
import { MONDAY, resetStore } from "./helpers";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const first = { isFirstClear: true, elapsedMs: null, intervalMs: null };
const repeat = (elapsedMs: number, intervalMs: number | null = null) => ({
  isFirstClear: false,
  elapsedMs,
  intervalMs,
});

const mp = (s: MasteryState) => s.mp;

describe("levels", () => {
  it("bands by threshold", () => {
    expect(levelFor(0)).toEqual({ title: "Curious", min: 0, next: 500 });
    expect(levelFor(499).title).toBe("Curious");
    expect(levelFor(500)).toEqual({ title: "Learner", min: 500, next: 2_000 });
    expect(levelFor(2_000).title).toBe("Scholar");
    expect(levelFor(9_999)).toEqual({ title: "Master", min: 6_000, next: null });
  });

  it("progress is 0..1 within the band and 1 at the top", () => {
    expect(progressInLevel(0)).toBe(0);
    expect(progressInLevel(250)).toBeCloseTo(0.5);
    expect(progressInLevel(6_000)).toBe(1);
    expect(progressInLevel(50_000)).toBe(1);
  });
});

describe("awardCompletion", () => {
  it("first clear is a flat 50 and exempt from the daily tally", () => {
    const r = awardCompletion(initialMastery(MONDAY), first, MONDAY);
    expect(r.awards).toEqual([{ label: "First clear", mp: 50 }]);
    expect(r.state.reviewsToday).toBe(0);
  });

  it("sub-day repeats are gated: no MP, no daily/weekly tick", () => {
    for (const elapsed of [0, 10 * MINUTE, DAY - 1]) {
      const r = awardCompletion(initialMastery(MONDAY), repeat(elapsed), MONDAY);
      expect(r.awards).toEqual([]);
      expect(r.state.reviewsToday).toBe(0);
      expect(r.state.daysThisWeek).toEqual([]);
    }
  });

  it("repeats before the card's scheduled interval pay nothing", () => {
    // 7-day interval: re-clearing at day 1 is gated; at day 7 it pays the curve.
    const early = awardCompletion(initialMastery(MONDAY), repeat(DAY, 7 * DAY), MONDAY);
    expect(early.awards).toEqual([]);
    expect(early.state.reviewsToday).toBe(0);
    const due = awardCompletion(initialMastery(MONDAY), repeat(7 * DAY, 7 * DAY), MONDAY);
    expect(due.awards).toEqual([{ label: "Retention", mp: 12 }]);
    // Ungraded cards (no interval) keep the one-day floor.
    expect(awardCompletion(initialMastery(MONDAY), repeat(DAY, null), MONDAY).awards[0].mp).toBe(4);
  });

  it("sub-day scheduler intervals never shorten the one-day gate", () => {
    // The scheduler's two sub-day intervals: a lapsed card sits at 10m and a
    // Hard card at 12h. The gate is max(1 day, interval), so neither can open
    // an early-payout window; otherwise failing a card would make it the
    // cheapest thing in the deck to farm.
    for (const intervalMs of [10 * MINUTE, 12 * HOUR]) {
      expect(awardCompletion(initialMastery(MONDAY), repeat(11 * MINUTE, intervalMs), MONDAY).awards).toEqual([]);
      expect(awardCompletion(initialMastery(MONDAY), repeat(13 * HOUR, intervalMs), MONDAY).awards).toEqual([]);
      expect(awardCompletion(initialMastery(MONDAY), repeat(DAY - 1, intervalMs), MONDAY).awards).toEqual([]);
      // A full day clears the floor and the curve pays as usual.
      expect(awardCompletion(initialMastery(MONDAY), repeat(DAY, intervalMs), MONDAY).awards).toEqual([
        { label: "Retention", mp: 4 },
      ]);
    }
  });

  it("repeat awards scale with the elapsed gap survived", () => {
    const award = (elapsedMs: number) =>
      awardCompletion(initialMastery(MONDAY), repeat(elapsedMs), MONDAY).awards[0].mp;
    expect(award(DAY)).toBe(4);
    expect(award(7 * DAY)).toBe(12);
    expect(award(30 * DAY)).toBe(20);
    expect(award(60 * DAY)).toBe(24);
  });

  it("daily decay halves past 20 reviews and quarters past 40", () => {
    let s: MasteryState = { ...initialMastery(MONDAY), reviewsToday: 20 };
    let r = awardCompletion(s, repeat(7 * DAY), MONDAY);
    expect(r.awards[0].mp).toBe(6); // 21st review -> x0.5
    s = { ...initialMastery(MONDAY), reviewsToday: 40 };
    r = awardCompletion(s, repeat(7 * DAY), MONDAY);
    expect(r.awards[0].mp).toBe(3); // 41st -> x0.25
  });

  it("weekly goal fires once at 4 distinct awarded days", () => {
    let s = initialMastery(MONDAY);
    const awarded: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = awardCompletion(s, repeat(DAY), MONDAY + i * DAY);
      s = r.state;
      awarded.push(...r.awards.map((a) => a.label));
    }
    expect(awarded.filter((l) => l === "Weekly goal")).toHaveLength(1);
    expect(s.daysThisWeek).toHaveLength(5);
  });

  it("first clears count toward the weekly goal even though they skip the decay tally", () => {
    // A player working through the registry for the first time only ever earns
    // first-clear MP, so the weekly goal has to be reachable on that path too.
    let s = initialMastery(MONDAY);
    const awarded: string[][] = [];
    for (let i = 0; i < 4; i++) {
      const r = awardCompletion(s, first, MONDAY + i * DAY);
      s = r.state;
      awarded.push(r.awards.map((a) => a.label));
    }
    expect(awarded.slice(0, 3)).toEqual([["First clear"], ["First clear"], ["First clear"]]);
    expect(awarded[3]).toEqual(["First clear", "Weekly goal"]);
    expect(s.weeklyGoalMet).toBe(true);
    expect(s.reviewsToday).toBe(0); // first clears never tick the daily decay counter
    expect(mp(s)).toBe(4 * 50 + 50);

    // Fires exactly once: a fifth day this week adds no second bonus.
    const fifth = awardCompletion(s, first, MONDAY + 4 * DAY);
    expect(fifth.awards).toEqual([{ label: "First clear", mp: 50 }]);
  });

  it("rolls the daily counter over and resets the week on a new Monday", () => {
    const s = awardCompletion(initialMastery(MONDAY), repeat(DAY), MONDAY).state;
    expect(s.reviewsToday).toBe(1);
    const nextWeek = awardCompletion(s, repeat(DAY), MONDAY + 7 * DAY).state;
    expect(nextWeek.reviewsToday).toBe(1);
    expect(nextWeek.dayKey).toBe(dayKeyOf(MONDAY + 7 * DAY));
    expect(nextWeek.weekKey).toBe(weekKeyOf(MONDAY + 7 * DAY));
    expect(nextWeek.daysThisWeek).toEqual([dayKeyOf(MONDAY + 7 * DAY)]);
    expect(mp(nextWeek)).toBeGreaterThan(mp(s));
  });
});

describe("awardDeckCleared", () => {
  it("needs at least one review today and only fires once", () => {
    expect(awardDeckCleared(initialMastery(MONDAY), MONDAY).awards).toEqual([]);
    const reviewed = awardCompletion(initialMastery(MONDAY), repeat(DAY), MONDAY).state;
    const cleared = awardDeckCleared(reviewed, MONDAY);
    expect(cleared.awards).toEqual([{ label: "Deck cleared", mp: 25 }]);
    expect(awardDeckCleared(cleared.state, MONDAY).awards).toEqual([]);
  });

  it("becomes available again the next day", () => {
    const reviewed = awardCompletion(initialMastery(MONDAY), repeat(DAY), MONDAY).state;
    const cleared = awardDeckCleared(reviewed, MONDAY).state;
    const nextDay = awardCompletion(cleared, repeat(DAY), MONDAY + DAY).state;
    expect(awardDeckCleared(nextDay, MONDAY + DAY).awards).toHaveLength(1);
  });
});

describe("recordGrade wiring", () => {
  // Completion MP is paid by checkCompletion (covered in review.test.ts);
  // recordGrade only schedules and, when nothing is left due, pays deck-cleared.
  const reset = (overrides: Parameters<typeof resetStore>[0] = {}) =>
    resetStore({ pendingGradeId: CHALLENGES[0].id, ...overrides });

  it("schedules the grade but pays no completion MP", () => {
    reset();
    useGameStore.getState().recordGrade("good");
    const s = useGameStore.getState();
    expect(s.mastery.mp).toBe(0);
    expect(s.pendingGradeId).toBeNull();
    expect(s.reviewStats[CHALLENGES[0].id]).toBeDefined();
    expect(s.lastAwards).toEqual([]);
  });

  it("again still schedules the lapse", () => {
    reset();
    useGameStore.getState().recordGrade("again");
    const s = useGameStore.getState();
    expect(s.mastery.mp).toBe(0);
    expect(s.reviewStats[CHALLENGES[0].id].lapses).toBe(1);
  });

  it("adds the deck-cleared bonus once nothing in the registry is due", () => {
    // Every challenge freshly graded => none due, so a repeat grade clears the deck.
    const stats = Object.fromEntries(
      CHALLENGES.map((c) => [c.id, { lastReviewedAt: MONDAY, intervalMs: 7 * DAY, ease: INITIAL_EASE, reps: 2, lapses: 0 }])
    );
    reset({ reviewStats: stats, mastery: { ...initialMastery(MONDAY), reviewsToday: 1 } });
    useGameStore.getState().recordGrade("good");
    const s = useGameStore.getState();
    expect(s.lastAwards).toEqual([{ mp: 25, label: "Deck cleared" }]);
    expect(s.mastery.mp).toBe(25);
    expect(s.mastery.clearedToday).toBe(true);
  });

  it("failing the last due card never claims deck-cleared", () => {
    // "again" pushes the failed card 10m out, so nothing is due right after —
    // but that must not consume the bonus (the genuine clear comes later).
    const stats = Object.fromEntries(
      CHALLENGES.map((c) => [
        c.id,
        c.id === CHALLENGES[0].id
          ? { lastReviewedAt: MONDAY - 8 * DAY, intervalMs: 7 * DAY, ease: INITIAL_EASE, reps: 2, lapses: 0 }
          : { lastReviewedAt: MONDAY, intervalMs: 7 * DAY, ease: INITIAL_EASE, reps: 2, lapses: 0 },
      ])
    );
    reset({ reviewStats: stats, mastery: { ...initialMastery(MONDAY), reviewsToday: 1 } });
    useGameStore.getState().recordGrade("again");
    const s = useGameStore.getState();
    expect(s.toasts).toEqual([]);
    expect(s.mastery.clearedToday).toBe(false);
    expect(s.mastery.mp).toBe(0);
  });

  it("never fires while any card is still ungraded", () => {
    // Never-graded cards aren't "due" (isDue), so without the all-graded guard
    // a single grade in plain sequential play would look like a cleared deck.
    reset({ mastery: { ...initialMastery(MONDAY), reviewsToday: 1 } });
    useGameStore.getState().recordGrade("good");
    const s = useGameStore.getState();
    expect(s.toasts).toEqual([]);
    expect(s.mastery.clearedToday).toBe(false);
    expect(s.mastery.mp).toBe(0);
  });

  it("is a no-op with no pending grade", () => {
    reset();
    useGameStore.setState({ pendingGradeId: null });
    useGameStore.getState().recordGrade("good");
    expect(useGameStore.getState().mastery.mp).toBe(0);
  });
});

describe("persist hydration", () => {
  it("deep-merges a partial persisted mastery over the defaults", () => {
    // A save written before a MasteryState field existed must hydrate with
    // that field defaulted, not crash the award functions on first use.
    // (Exercises the persist `merge` option directly: the test env's storage
    // is an in-memory no-op, so a real rehydrate round-trip isn't possible.)
    const merge = useGameStore.persist.getOptions().merge!;
    const partial = { mp: 123, dayKey: "2026-01-01" }; // no daysThisWeek etc.
    const merged = merge({ mastery: partial }, useGameStore.getState());
    const m = merged.mastery;
    expect(m.mp).toBe(123);
    expect(m.dayKey).toBe("2026-01-01");
    expect(m.daysThisWeek).toEqual([]);
    expect(m.weeklyGoalMet).toBe(false);
    // The crash site: rollover + weekly-goal bookkeeping must not throw.
    expect(() => awardCompletion(m, repeat(2 * DAY), MONDAY)).not.toThrow();
  });
});

describe("weekKeyOf", () => {
  it("maps every day of a week to the same Monday", () => {
    const keys = Array.from({ length: 7 }, (_, i) => weekKeyOf(MONDAY + i * DAY));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(dayKeyOf(MONDAY));
    expect(weekKeyOf(MONDAY + 7 * DAY)).toBe(dayKeyOf(MONDAY + 7 * DAY));
  });

  it("finds the right Monday across a DST spring-forward", () => {
    // US DST starts Sun 2026-03-08; Thu 2026-03-12 must still key to Mon 03-09.
    const thursday = new Date(2026, 2, 12, 12, 0, 0).getTime();
    expect(weekKeyOf(thursday)).toBe(dayKeyOf(new Date(2026, 2, 9, 12).getTime()));
  });
});
