import { describe, it, expect, vi, afterEach } from "vitest";
import { realWallClock } from "../clock";

afterEach(() => {
  vi.useRealTimers();
});

describe("realWallClock", () => {
  it("renders now(), ts() and time() from the same wall clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 4, 9, 5, 3)); // local Sat Jul 04 2026 09:05:03

    const clock = realWallClock();
    expect(clock.now().getTime()).toBe(new Date(2026, 6, 4, 9, 5, 3).getTime());
    expect(clock.ts()).toBe("09:05:03");
    expect(clock.time()).toEqual({
      hour: "09",
      minute: "05",
      second: "03",
      dow: "Sat",
      month: "Jul",
      day: "4",
      year: "2026",
    });
  });

  it("keeps ticking (it is not a frozen snapshot)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    const clock = realWallClock();
    expect(clock.ts()).toBe("00:00:00");
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 42));
    expect(clock.ts()).toBe("00:00:42");
  });
});
