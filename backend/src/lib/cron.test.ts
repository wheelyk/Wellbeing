import { describe, it, expect } from "vitest";
import {
  parseCron,
  cronMatchesDate,
  cronSlotsForDate,
  cronValidationError,
  CronParseError,
  MAX_SLOTS_PER_EXPRESSION,
} from "./cron";

// 2026-08-28 is a Friday (dayOfWeek 5) - used throughout so day-of-week assertions are anchored
// to a real, checkable date rather than "whatever today happens to be."
const FRIDAY = "2026-08-28";
const SATURDAY = "2026-08-29";
const SUNDAY = "2026-08-30";
const MONDAY = "2026-08-31";

describe("parseCron", () => {
  it("expands a fully-wildcarded expression across every value in each field", () => {
    const parsed = parseCron("* * * * *");
    expect(parsed.minutes).toHaveLength(60);
    expect(parsed.hours).toHaveLength(24);
    expect(parsed.daysOfMonth[0]).toBe(1);
    expect(parsed.daysOfMonth.at(-1)).toBe(31);
    expect(parsed.months).toHaveLength(12);
    expect(parsed.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parsed.domRestricted).toBe(false);
    expect(parsed.dowRestricted).toBe(false);
  });

  it("parses single values, lists, ranges and steps", () => {
    expect(parseCron("30 9 * * *").minutes).toEqual([30]);
    expect(parseCron("0 9,12,18 * * *").hours).toEqual([9, 12, 18]);
    expect(parseCron("0 9 * * 1-5").daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron("*/15 * * * *").minutes).toEqual([0, 15, 30, 45]);
    expect(parseCron("0 8-18/4 * * *").hours).toEqual([8, 12, 16]);
  });

  it("treats a bare number with a step as 'from here to the end of the range'", () => {
    expect(parseCron("5/20 * * * *").minutes).toEqual([5, 25, 45]);
  });

  it("accepts 7 as an alias for Sunday, normalising it to 0", () => {
    expect(parseCron("0 9 * * 7").daysOfWeek).toEqual([0]);
    expect(parseCron("0 9 * * 6,7").daysOfWeek).toEqual([0, 6]);
  });

  it("rejects the wrong number of fields", () => {
    expect(() => parseCron("0 9 * *")).toThrow(CronParseError);
    expect(() => parseCron("0 9 * * * *")).toThrow(CronParseError);
    expect(() => parseCron("")).toThrow(CronParseError);
  });

  it("rejects out-of-range values with a field-specific message", () => {
    expect(() => parseCron("60 9 * * *")).toThrow(/minute field must be between 0 and 59/);
    expect(() => parseCron("0 24 * * *")).toThrow(/hour field must be between 0 and 23/);
    expect(() => parseCron("0 9 32 * *")).toThrow(/day of month field must be between 1 and 31/);
    expect(() => parseCron("0 9 * 13 *")).toThrow(/month field must be between 1 and 12/);
    expect(() => parseCron("0 9 * * 8")).toThrow(/day of week field must be between 0 and 6/);
  });

  it("rejects syntax it deliberately doesn't support rather than guessing", () => {
    expect(() => parseCron("0 9 * * MON")).toThrow(CronParseError);
    expect(() => parseCron("0 9 ? * *")).toThrow(CronParseError);
    expect(() => parseCron("0 9 L * *")).toThrow(CronParseError);
    expect(() => parseCron("0 9 * * 5#2")).toThrow(CronParseError);
  });

  it("rejects malformed ranges and steps", () => {
    expect(() => parseCron("0 9-5 * * *")).toThrow(/backwards/);
    expect(() => parseCron("0 */0 * * *")).toThrow(/at least 1/);
    expect(() => parseCron("0 */a * * *")).toThrow(/whole number/);
    expect(() => parseCron("0 9,, * * *")).toThrow(/Empty value/);
  });
});

describe("cronMatchesDate", () => {
  it("matches every day when neither day field is restricted", () => {
    const parsed = parseCron("0 9 * * *");
    expect(cronMatchesDate(parsed, FRIDAY)).toBe(true);
    expect(cronMatchesDate(parsed, SUNDAY)).toBe(true);
  });

  it("honours a day-of-week restriction", () => {
    const weekdays = parseCron("0 9 * * 1-5");
    expect(cronMatchesDate(weekdays, FRIDAY)).toBe(true);
    expect(cronMatchesDate(weekdays, SATURDAY)).toBe(false);
    expect(cronMatchesDate(weekdays, SUNDAY)).toBe(false);
    expect(cronMatchesDate(weekdays, MONDAY)).toBe(true);
  });

  it("honours a weekend restriction, including Sunday as 0", () => {
    const weekends = parseCron("0 10 * * 0,6");
    expect(cronMatchesDate(weekends, SATURDAY)).toBe(true);
    expect(cronMatchesDate(weekends, SUNDAY)).toBe(true);
    expect(cronMatchesDate(weekends, FRIDAY)).toBe(false);
  });

  it("honours a day-of-month restriction", () => {
    const firstAndFifteenth = parseCron("0 7 1,15 * *");
    expect(cronMatchesDate(firstAndFifteenth, "2026-08-01")).toBe(true);
    expect(cronMatchesDate(firstAndFifteenth, "2026-08-15")).toBe(true);
    expect(cronMatchesDate(firstAndFifteenth, FRIDAY)).toBe(false);
  });

  it("honours a month restriction", () => {
    const decemberOnly = parseCron("0 9 * 12 *");
    expect(cronMatchesDate(decemberOnly, "2026-12-01")).toBe(true);
    expect(cronMatchesDate(decemberOnly, FRIDAY)).toBe(false);
  });

  // Cron's most surprising rule, and the one most likely to be got wrong: when BOTH day fields are
  // narrowed they are OR'd, not AND'd. 2026-08-31 is a Monday, so "the 1st, or any Monday" must
  // match it via the day-of-week half even though it is not the 1st.
  it("ORs day-of-month and day-of-week when both are restricted", () => {
    const parsed = parseCron("0 9 1 * 1");
    expect(cronMatchesDate(parsed, "2026-08-01")).toBe(true); // the 1st (a Saturday)
    expect(cronMatchesDate(parsed, MONDAY)).toBe(true); // a Monday, not the 1st
    expect(cronMatchesDate(parsed, FRIDAY)).toBe(false); // neither
  });
});

describe("cronSlotsForDate", () => {
  it("produces one slot for a single daily time", () => {
    expect(cronSlotsForDate("0 9 * * *", FRIDAY)).toEqual(["09:00"]);
    expect(cronSlotsForDate("30 18 * * *", FRIDAY)).toEqual(["18:30"]);
  });

  it("produces every hour for an hourly expression", () => {
    const slots = cronSlotsForDate("0 * * * *", FRIDAY);
    expect(slots).toHaveLength(24);
    expect(slots[0]).toBe("00:00");
    expect(slots.at(-1)).toBe("23:00");
  });

  it("produces the cross-product of hours and minutes, sorted", () => {
    expect(cronSlotsForDate("0,30 9 * * *", FRIDAY)).toEqual(["09:00", "09:30"]);
    expect(cronSlotsForDate("0 8,20 * * *", FRIDAY)).toEqual(["08:00", "20:00"]);
  });

  it("returns nothing on a day the expression doesn't fire", () => {
    expect(cronSlotsForDate("0 9 * * 1-5", SATURDAY)).toEqual([]);
    expect(cronSlotsForDate("0 7 1,15 * *", FRIDAY)).toEqual([]);
  });

  it("zero-pads to the same HH:mm shape Reminder times have always used", () => {
    expect(cronSlotsForDate("5 7 * * *", FRIDAY)).toEqual(["07:05"]);
  });
});

describe("cronValidationError", () => {
  it("accepts the expressions the schedule picker generates", () => {
    for (const expression of [
      "0 9 * * *", // every day
      "0 8 * * 1-5", // weekdays
      "30 10 * * 0,6", // weekends
      "30 18 * * 1,3,5", // custom days
      "0 * * * *", // every hour
      "0 7 1,15 * *", // hand-written, day-of-month
    ]) {
      expect(cronValidationError(expression)).toBeNull();
    }
  });

  it("reports why an expression is invalid, rather than just that it is", () => {
    expect(cronValidationError("0 9 * *")).toMatch(/exactly 5 fields/);
    expect(cronValidationError("0 25 * * *")).toMatch(/hour field/);
    expect(cronValidationError("0 9 * * MON")).toMatch(/Unrecognised/);
  });

  it("rejects an expression that would fire absurdly often", () => {
    // Every minute of every hour - 1440 slots a day.
    expect(cronValidationError("* * * * *")).toMatch(/1440 times a day/);
    // Every 5 minutes - 288 a day, still well over the cap.
    expect(cronValidationError("*/5 * * * *")).toMatch(/at most 48/);
  });

  it("allows exactly the cap, and rejects one past it", () => {
    // Every 30 minutes = 48 slots, the documented maximum.
    expect(cronSlotsForDate("0,30 * * * *", FRIDAY)).toHaveLength(MAX_SLOTS_PER_EXPRESSION);
    expect(cronValidationError("0,30 * * * *")).toBeNull();
    // Every 20 minutes = 72 slots.
    expect(cronValidationError("*/20 * * * *")).not.toBeNull();
  });
});
