import { describe, it, expect, vi, afterAll } from "vitest";
import { prisma } from "./prisma";
import { quietHoursHoldUntil, reminderSlotsForDate } from "./reminderRuns";

// Pure-function tests: no clock, no database, no mocking. `reminderSlotsForDate` and
// `quietHoursHoldUntil` are the rules the scheduler acts on and GET /api/reminders/upcoming
// describes, and they are worth pinning down on their own rather than only through either caller.
//
// Every date below is anchored to a real, checkable calendar date rather than "today":
// 2026-08-28 is a Friday, 2026-08-29 a Saturday, 2026-08-30 a Sunday, 2026-08-31 a Monday - the
// same anchors cron.test.ts already uses.
const FRIDAY = "2026-08-28";
const SATURDAY = "2026-08-29";
const SUNDAY = "2026-08-30";
const MONDAY = "2026-08-31";

// The shape callers pass, with the two bounds off unless a test is about them.
function slots(overrides: {
  date: string;
  schedules: string[];
  timeZone?: string;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  onUnparseable?: (expression: string, err: unknown) => void;
}) {
  return reminderSlotsForDate({
    timeZone: "UTC",
    startsAt: null,
    expiresAt: null,
    ...overrides,
  });
}

describe("reminderSlotsForDate", () => {
  it("expands every schedule for the date, deduplicated and ascending", () => {
    // Two rules that genuinely overlap: 09:00 is produced by both, and must appear once.
    expect(
      slots({ date: FRIDAY, schedules: ["0 9,20 * * *", "0 9 * * 1-5", "30 7 * * *"] }),
    ).toEqual(["07:30", "09:00", "20:00"]);
  });

  it("returns nothing on a date the expression does not fire at all", () => {
    expect(slots({ date: SATURDAY, schedules: ["0 9 * * 1-5"] })).toEqual([]);
  });

  it("skips an unparseable expression and reports it, keeping the ones that do parse", () => {
    const onUnparseable = vi.fn();

    expect(
      slots({ date: FRIDAY, schedules: ["0 9 * * *", "not a cron expression"], onUnparseable }),
    ).toEqual(["09:00"]);
    expect(onUnparseable).toHaveBeenCalledTimes(1);
    expect(onUnparseable.mock.calls[0][0]).toBe("not a cron expression");
  });

  it("does not require a reporter for an unparseable expression", () => {
    expect(() => slots({ date: FRIDAY, schedules: ["nonsense"] })).not.toThrow();
    expect(slots({ date: FRIDAY, schedules: ["nonsense"] })).toEqual([]);
  });

  describe("startsAt", () => {
    // 08:30 UTC on the Sunday.
    const startsAt = new Date("2026-08-30T08:30:00.000Z");

    it("drops the slots before the start time on the start day, and keeps the one at it", () => {
      expect(
        slots({ date: SUNDAY, schedules: ["0 7,8 * * *", "30 8 * * *", "0 9 * * *"] }),
      ).toEqual(["07:00", "08:00", "08:30", "09:00"]);

      // Inclusive at exactly startsAt, matching the scheduler's own `startsAt <= now` filter.
      expect(
        slots({
          date: SUNDAY,
          schedules: ["0 7,8 * * *", "30 8 * * *", "0 9 * * *"],
          startsAt,
        }),
      ).toEqual(["08:30", "09:00"]);
    });

    it("returns nothing for a date before the start day", () => {
      expect(slots({ date: SATURDAY, schedules: ["0 9 * * *"], startsAt })).toEqual([]);
    });

    it("keeps every slot on any day after the start day", () => {
      expect(slots({ date: MONDAY, schedules: ["0 7 * * *", "0 9 * * *"], startsAt })).toEqual([
        "07:00",
        "09:00",
      ]);
    });

    it("truncates the start to its minute, so a slot on that minute survives", () => {
      // A start half a minute into 03:46 still describes the 03:46 slot - comparing whole
      // instants instead would exclude the very slot the start was computed to name.
      expect(
        slots({
          date: SUNDAY,
          schedules: ["46 3 * * *"],
          startsAt: new Date("2026-08-30T03:46:30.000Z"),
        }),
      ).toEqual(["03:46"]);
    });

    it("resolves the start in the owner's timezone, not the server's", () => {
      // The same instant is 08:30 in UTC and 01:30 in Los Angeles, so a 07:00 slot is before the
      // start for one user and comfortably after it for the other. Getting this backwards is the
      // fire-on-the-wrong-day class of bug the whole timezone discipline exists to prevent.
      const schedules = ["0 7 * * *", "0 9 * * *"];
      expect(slots({ date: SUNDAY, schedules, startsAt })).toEqual(["09:00"]);
      expect(slots({ date: SUNDAY, schedules, startsAt, timeZone: "America/Los_Angeles" })).toEqual(
        ["07:00", "09:00"],
      );
    });
  });

  describe("expiresAt", () => {
    // 20:00 UTC on the Sunday.
    const expiresAt = new Date("2026-08-30T20:00:00.000Z");

    it("drops the slots at or after the expiry time on the expiry day", () => {
      // Exclusive at exactly expiresAt, and asymmetric with startsAt on purpose: the scheduler
      // treats a reminder as already gone at that instant (`expiresAt: { gt: now }`).
      expect(slots({ date: SUNDAY, schedules: ["0 19,20,21 * * *"], expiresAt })).toEqual([
        "19:00",
      ]);
    });

    it("returns nothing for a date after the expiry day", () => {
      expect(slots({ date: MONDAY, schedules: ["0 9 * * *"], expiresAt })).toEqual([]);
    });

    it("keeps every slot on a day before the expiry day", () => {
      expect(slots({ date: SATURDAY, schedules: ["0 9 * * *", "0 21 * * *"], expiresAt })).toEqual([
        "09:00",
        "21:00",
      ]);
    });

    it('reads an "end-of-day" expiry as all of that day and none of the next', () => {
      // routes/reminders.ts stores "end-of-day" as midnight *tomorrow* (getDayRangeUtc's exclusive
      // end). Read wrongly, that either kills today's evening slots or lets tomorrow's through.
      const endOfSunday = new Date("2026-08-31T00:00:00.000Z");
      expect(
        slots({ date: SUNDAY, schedules: ["0 9 * * *", "0 23 * * *"], expiresAt: endOfSunday }),
      ).toEqual(["09:00", "23:00"]);
      expect(
        slots({ date: MONDAY, schedules: ["0 9 * * *", "0 23 * * *"], expiresAt: endOfSunday }),
      ).toEqual([]);
    });

    it("resolves the expiry in the owner's timezone, not the server's", () => {
      // 20:00 UTC is 13:00 in Los Angeles, so the 15:00 slot survives for one user and not the
      // other.
      const schedules = ["0 12 * * *", "0 15 * * *"];
      expect(slots({ date: SUNDAY, schedules, expiresAt })).toEqual(["12:00", "15:00"]);
      expect(
        slots({ date: SUNDAY, schedules, expiresAt, timeZone: "America/Los_Angeles" }),
      ).toEqual(["12:00"]);
    });
  });

  it("applies both bounds together for a one-shot that describes a single moment", () => {
    // A follow-up asked for at 21:46 tonight, landing at 03:46 tomorrow: cron says when in the
    // day, startsAt says not before, expiresAt says never again.
    const startsAt = new Date("2026-08-30T03:46:00.000Z");
    const expiresAt = new Date("2026-08-31T00:00:00.000Z");
    const schedules = ["46 3 * * *"];

    expect(slots({ date: SATURDAY, schedules, startsAt, expiresAt })).toEqual([]);
    expect(slots({ date: SUNDAY, schedules, startsAt, expiresAt })).toEqual(["03:46"]);
    expect(slots({ date: MONDAY, schedules, startsAt, expiresAt })).toEqual([]);
  });
});

describe("quietHoursHoldUntil", () => {
  const overnight = { start: "22:00", end: "08:00" };

  it("returns the end of the window for a time inside it", () => {
    expect(quietHoursHoldUntil("03:46", false, overnight)).toBe("08:00");
    expect(quietHoursHoldUntil("23:30", false, overnight)).toBe("08:00");
  });

  it("returns null for a time outside the window", () => {
    expect(quietHoursHoldUntil("08:00", false, overnight)).toBeNull();
    expect(quietHoursHoldUntil("20:00", false, overnight)).toBeNull();
  });

  it("returns null when the reminder is allowed through the window", () => {
    // The half of this rule a second implementation would most easily forget - a 03:00 reminder
    // someone set by hand has been asked for in as many words. See docs/log/41-quiet-hours.md.
    expect(quietHoursHoldUntil("03:46", true, overnight)).toBeNull();
  });

  it("returns null when no window is configured", () => {
    expect(quietHoursHoldUntil("03:46", false, { start: null, end: null })).toBeNull();
  });
});

afterAll(async () => {
  // This module imports prisma (for hasLoggedTarget), so the client is constructed even though no
  // test here touches the database. Disconnecting keeps the worker from being held open.
  await prisma.$disconnect();
});
