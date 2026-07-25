import { vi } from "vitest";
import { initialMastery } from "../challenges/mastery";
import { useGameStore, type GameState } from "../state/gameStore";
import { DEFAULT_ZSHRC, DEFAULT_TMUX_CONF } from "../lib/defaultConfigs";

// A local-noon Monday, so day/week keys are timezone-stable in tests.
export const MONDAY = new Date(2026, 6, 20, 12, 0, 0).getTime();

/**
 * Reset the store to a fresh-play baseline and freeze Date at `now` (only Date
 * is faked, so real timers/promises keep working). Pass overrides for the
 * fields a test cares about instead of hand-rolling a partial setState.
 */
export function resetStore(overrides: Partial<GameState> = {}, now = MONDAY) {
  vi.useFakeTimers({ now, toFake: ["Date"] });
  useGameStore.setState({
    activeCategory: "all",
    challengeIndex: 0,
    completed: false,
    awaitingContinue: false,
    flash: null,
    bestTimes: {},
    reviewStats: {},
    pendingGradeId: null,
    reviewQueue: [],
    reviewTotal: 0,
    reviewReturn: null,
    toasts: [],
    mastery: initialMastery(now),
    lastMpAt: {},
    lastAwards: [],
    zshrc: DEFAULT_ZSHRC,
    tmuxConf: DEFAULT_TMUX_CONF,
    ...overrides,
  });
}
