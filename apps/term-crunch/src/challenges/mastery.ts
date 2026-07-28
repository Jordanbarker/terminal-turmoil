/**
 * Mastery points (MP) / levels: the experience system layered on top of the
 * SM-2-lite scheduler. Rewards skill RETENTION rather than grind — a big flat
 * bonus for first-clearing a challenge, then repeat awards scaled by the time
 * elapsed since the last MP-paying completion, with daily diminishing returns
 * past a review threshold.
 *
 * Grades NEVER touch MP: they are self-reported and exist only to steer the
 * scheduler — tying MP to them would incentivize overrating, corrupting the
 * scheduler's own signal. MP rewards the objective act of completing, at the
 * moment of completion; anti-farming is purely time-based (the retention gate
 * + daily decay), not grade-based. The retention gate is the card's scheduled
 * interval (min one day): re-clearing before the scheduler would have asked
 * pays nothing, so following the schedule strictly dominates grinding.
 *
 * Pure module, same contract as `scheduler.ts`: no store or registry imports,
 * `now` is always a parameter (never Date.now()), formulas explained here.
 *
 * Rollover is LAZY: every award function re-derives dayKey/weekKey from `now`
 * and resets the daily/weekly counters when they changed. There is deliberately
 * no streak state — missing a day simply grants nothing, it never penalizes.
 */

const DAY = 24 * 60 * 60_000;

export interface MasteryState {
  mp: number;
  dayKey: string; // "YYYY-MM-DD" local
  reviewsToday: number; // MP-paying repeat completions today (first clears and gated repeats exempt)
  clearedToday: boolean; // deck-cleared bonus already granted today
  weekKey: string; // dayKey of this week's local Monday
  daysThisWeek: string[]; // distinct dayKeys with a successful review this week
  weeklyGoalMet: boolean;
}

export interface Award {
  label: string;
  mp: number;
}

export interface AwardResult {
  state: MasteryState;
  awards: Award[];
}

// ---------------------------------------------------------------- levels

export interface Level {
  title: string;
  min: number;
}

// Levels are titles only: they gate nothing. Anything added here must be a
// reward the game actually delivers, or the sidebar advertises vapor.
export const LEVELS: Level[] = [
  { title: "Curious", min: 0 },
  { title: "Learner", min: 500 },
  { title: "Scholar", min: 2_000 },
  { title: "Master", min: 6_000 },
];

/** Level band containing `mp`; `next` is the next band's threshold, or null at the top. */
export function levelFor(mp: number): { title: string; min: number; next: number | null } {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (mp >= LEVELS[i].min) idx = i;
  const level = LEVELS[idx];
  const nextLevel = LEVELS[idx + 1];
  return { title: level.title, min: level.min, next: nextLevel ? nextLevel.min : null };
}

/** 0..1 progress through the current band; 1 once at the top band. */
export function progressInLevel(mp: number): number {
  const { min, next } = levelFor(mp);
  if (next === null) return 1;
  return Math.min(1, Math.max(0, (mp - min) / (next - min)));
}

// ---------------------------------------------------------------- awards

const FIRST_CLEAR_MP = 50;
const DECK_CLEARED_MP = 25;
const WEEKLY_GOAL_MP = 50;
const WEEKLY_GOAL_DAYS = 4;

const MAX_RETENTION_MP = 30;

// Repeats before the card's scheduled interval elapses pay nothing at all —
// this hard gate (not a floor) is the anti-farm: without it, re-clearing the
// whole deck daily out-earns scheduled play several times over. One day is
// the floor for ungraded cards (which have no interval yet).
const MIN_RETENTION_GATE_MS = DAY;

/** Successful-review count tiers and their multiplier on repeat awards. */
const DAILY_DECAY: { upTo: number; mult: number }[] = [
  { upTo: 20, mult: 1 },
  { upTo: 40, mult: 0.5 },
  { upTo: Infinity, mult: 0.25 },
];

/** Local "YYYY-MM-DD" for a timestamp. */
export function dayKeyOf(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** dayKey of the local Monday on or before `now` (weeks run Mon-Sun). */
export function weekKeyOf(now: number): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const daysSinceMonday = (d.getDay() + 6) % 7; // Sunday(0) -> 6
  // Calendar math, not ms math: subtracting 24h multiples across a DST
  // spring-forward would land on Sunday 23:00 and shift the weekKey mid-week.
  d.setDate(d.getDate() - daysSinceMonday);
  return dayKeyOf(d.getTime());
}

export function initialMastery(now: number): MasteryState {
  return {
    mp: 0,
    dayKey: dayKeyOf(now),
    reviewsToday: 0,
    clearedToday: false,
    weekKey: weekKeyOf(now),
    daysThisWeek: [],
    weeklyGoalMet: false,
  };
}

/** Apply lazy day/week rollover so counters always describe `now`. */
function rollover(state: MasteryState, now: number): MasteryState {
  const dayKey = dayKeyOf(now);
  const weekKey = weekKeyOf(now);
  let next = state;
  if (dayKey !== next.dayKey) {
    next = { ...next, dayKey, reviewsToday: 0, clearedToday: false };
  }
  if (weekKey !== next.weekKey) {
    next = { ...next, weekKey, daysThisWeek: [], weeklyGoalMet: false };
  }
  return next;
}

/**
 * Retention bonus for a repeat: scaled by the gap the player actually survived
 * since the last MP-paying completion. 0 below the gate — the card's scheduled
 * interval, floored at one day — else `4 * log2(1 + days)` capped at 30:
 * 1d -> 4, 7d -> 12, 30d -> 20, 60d -> ~24. The cap only binds around 180d+,
 * which the scheduler's 60d MAX_INTERVAL_MS never reaches, so it is purely a
 * guard.
 */
function retentionMp(elapsedMs: number, intervalMs: number | null): number {
  const gateMs = Math.max(MIN_RETENTION_GATE_MS, intervalMs ?? 0);
  if (elapsedMs < gateMs) return 0;
  const days = elapsedMs / DAY;
  return Math.min(MAX_RETENTION_MP, Math.round(4 * Math.log2(1 + days)));
}

function dailyMultiplier(reviewsToday: number): number {
  // reviewsToday is the count BEFORE this review, so this review is #n+1.
  const n = reviewsToday + 1;
  return DAILY_DECAY.find((tier) => n <= tier.upTo)!.mult;
}

export interface CompletionInfo {
  /** True when the challenge has never been completed (the store derives this from bestTimes). */
  isFirstClear: boolean;
  /** ms since this challenge's last MP-paying completion; null = first ever. */
  elapsedMs: number | null;
  /** The card's current scheduler interval; null = never graded. Gates retention MP. */
  intervalMs: number | null;
}

/**
 * MP for one completion, awarded the moment the win is detected (not at the
 * grade gate — grades only feed the scheduler).
 */
export function awardCompletion(state: MasteryState, info: CompletionInfo, now: number): AwardResult {
  let next = rollover(state, now);
  const awards: Award[] = [];

  if (info.isFirstClear) {
    // Flat and exempt from daily decay: onboarding is deliberately generous
    // (27 challenges x 50 = 1,350, mid-Learner after one full pass through the
    // registry).
    awards.push({ label: "First clear", mp: FIRST_CLEAR_MP });
    next = { ...next, mp: next.mp + FIRST_CLEAR_MP };
  } else {
    const base = retentionMp(info.elapsedMs ?? 0, info.intervalMs);
    if (base > 0) {
      const mp = Math.max(1, Math.round(base * dailyMultiplier(next.reviewsToday)));
      awards.push({ label: "Retention", mp });
      next = { ...next, mp: next.mp + mp, reviewsToday: next.reviewsToday + 1 };
    }
  }

  // Gated early repeats award nothing above, and must not tick the weekly
  // goal either — only completions that actually paid something count.
  if (awards.length > 0) {
    if (!next.daysThisWeek.includes(next.dayKey)) {
      next = { ...next, daysThisWeek: [...next.daysThisWeek, next.dayKey] };
    }
    if (!next.weeklyGoalMet && next.daysThisWeek.length >= WEEKLY_GOAL_DAYS) {
      awards.push({ label: "Weekly goal", mp: WEEKLY_GOAL_MP });
      next = { ...next, mp: next.mp + WEEKLY_GOAL_MP, weeklyGoalMet: true };
    }
  }

  return { state: next, awards };
}

/** Once-per-day bonus for finishing the day's review queue. No-op if no reviews happened. */
export function awardDeckCleared(state: MasteryState, now: number): AwardResult {
  const next = rollover(state, now);
  if (next.clearedToday || next.reviewsToday === 0) return { state: next, awards: [] };
  return {
    state: { ...next, mp: next.mp + DECK_CLEARED_MP, clearedToday: true },
    awards: [{ label: "Deck cleared", mp: DECK_CLEARED_MP }],
  };
}
