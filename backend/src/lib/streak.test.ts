import { describe, it, expect } from "vitest";
import { calculateStreak } from "./streak";

describe("calculateStreak", () => {
  it("returns a zero streak and zero days this week when nothing has ever been logged", () => {
    const result = calculateStreak(new Set(), "2026-08-17");
    expect(result).toEqual({ current: 0, daysLoggedThisWeek: 0 });
  });

  it("counts a currently-active streak that includes today", () => {
    // Mon 8/10 .. Mon 8/17, every day logged, "today" being the Monday.
    const loggedDates = new Set([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
    const result = calculateStreak(loggedDates, "2026-08-17");
    expect(result.current).toBe(8);
  });

  it("still counts the streak as active if today has no entry yet but yesterday does", () => {
    // Nothing logged yet today (e.g. it's 8am and the user hasn't opened the app) - the streak
    // should read as still alive, anchored on yesterday, not already broken.
    const loggedDates = new Set(["2026-08-15", "2026-08-16"]);
    const result = calculateStreak(loggedDates, "2026-08-17");
    expect(result.current).toBe(2);
  });

  it("resets to zero once a full day has passed with no entry at all", () => {
    const loggedDates = new Set(["2026-08-14", "2026-08-15"]);
    // Neither "today" (8/17) nor "yesterday" (8/16) has an entry - the streak is broken.
    const result = calculateStreak(loggedDates, "2026-08-17");
    expect(result.current).toBe(0);
  });

  it("stops counting at a gap in the middle rather than counting through it", () => {
    // Logged 8/15 and 8/17, but not 8/16 - the streak ending at 8/17 is just 1 day, not 2,
    // since the gap on 8/16 breaks the run before it reaches the earlier logged day.
    const loggedDates = new Set(["2026-08-13", "2026-08-14", "2026-08-15", "2026-08-17"]);
    const result = calculateStreak(loggedDates, "2026-08-17");
    expect(result.current).toBe(1);
  });

  it("counts days logged this week (Monday-Sunday) regardless of the current streak", () => {
    // Week of Mon 8/10 - Sun 8/16. Logged Mon, Wed, Fri (non-consecutive, so no meaningful
    // streak), "today" is the following Monday (8/17, a new week with nothing logged yet).
    const loggedDates = new Set(["2026-08-10", "2026-08-12", "2026-08-14"]);
    const result = calculateStreak(loggedDates, "2026-08-16");
    expect(result.daysLoggedThisWeek).toBe(3);
  });

  it("resets days-logged-this-week at the Monday boundary", () => {
    // 8/16 is a Sunday (end of one week); 8/17 is the Monday starting the next. A log on the
    // Sunday shouldn't count toward the following Monday's week.
    const loggedDates = new Set(["2026-08-16"]);
    const result = calculateStreak(loggedDates, "2026-08-17");
    expect(result.daysLoggedThisWeek).toBe(0);
  });

  it("handles a streak spanning a month/year boundary", () => {
    const loggedDates = new Set(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
    const result = calculateStreak(loggedDates, "2026-01-02");
    expect(result.current).toBe(4);
  });
});
