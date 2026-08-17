import { describe, it, expect } from "vitest";
import { addDaysToDateStr, dayOfWeek, formatDateInTimezone, getDayRangeUtc } from "./timezone";

describe("formatDateInTimezone", () => {
  it("resolves a UTC instant to the correct calendar day in the user's timezone", () => {
    // 2026-08-17T02:00:00Z is already Aug 17 in UTC, but only 7pm on Aug 16 in Los Angeles
    // (UTC-7 in August, daylight time) - the whole point of this function is that these two
    // answers can genuinely differ for the same instant.
    expect(formatDateInTimezone(new Date("2026-08-17T02:00:00.000Z"), "UTC")).toBe("2026-08-17");
    expect(formatDateInTimezone(new Date("2026-08-17T02:00:00.000Z"), "America/Los_Angeles")).toBe(
      "2026-08-16",
    );
  });

  it("counts a late-night entry for the correct calendar day in a UTC-8 timezone", () => {
    // 11pm Aug 16 Pacific Standard Time (UTC-8, winter/non-DST) is 7am Aug 17 UTC - a log
    // stored at that instant must resolve back to Aug 16 for a PST user, not Aug 17.
    const loggedAt = new Date("2026-01-17T07:00:00.000Z"); // 11pm Jan 16 in America/Los_Angeles (PST)
    expect(formatDateInTimezone(loggedAt, "America/Los_Angeles")).toBe("2026-01-16");
    expect(formatDateInTimezone(loggedAt, "UTC")).toBe("2026-01-17");
  });

  it("resolves a calendar day that's ahead of UTC (e.g. Tokyo)", () => {
    // 9am Aug 17 in Tokyo (UTC+9) is still 11pm Aug 16 in UTC.
    const loggedAt = new Date("2026-08-16T23:00:00.000Z");
    expect(formatDateInTimezone(loggedAt, "Asia/Tokyo")).toBe("2026-08-17");
    expect(formatDateInTimezone(loggedAt, "UTC")).toBe("2026-08-16");
  });
});

describe("getDayRangeUtc", () => {
  it("returns a UTC range whose midpoint formats back to the same calendar day, in-timezone", () => {
    const { start, end } = getDayRangeUtc("2026-08-16", "America/Los_Angeles");
    expect(formatDateInTimezone(start, "America/Los_Angeles")).toBe("2026-08-16");
    // `end` is the exclusive start of the *next* day.
    expect(formatDateInTimezone(end, "America/Los_Angeles")).toBe("2026-08-17");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("places an instant just before midnight (local) inside the day, and just after outside it", () => {
    const { start, end } = getDayRangeUtc("2026-08-16", "America/Los_Angeles");
    const justBefore = new Date(start.getTime() - 1);
    const justAfterStart = new Date(start.getTime() + 1);
    const justBeforeEnd = new Date(end.getTime() - 1);
    const justAfterEnd = new Date(end.getTime());

    expect(justBefore.getTime() < start.getTime()).toBe(true);
    expect(
      justAfterStart.getTime() >= start.getTime() && justAfterStart.getTime() < end.getTime(),
    ).toBe(true);
    expect(justBeforeEnd.getTime() < end.getTime()).toBe(true);
    expect(justAfterEnd.getTime() >= end.getTime()).toBe(true);
  });

  it("works for UTC itself", () => {
    const { start, end } = getDayRangeUtc("2026-08-16", "UTC");
    expect(start.toISOString()).toBe("2026-08-16T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });
});

describe("addDaysToDateStr", () => {
  it("adds and subtracts days, including across month/year boundaries", () => {
    expect(addDaysToDateStr("2026-08-17", 1)).toBe("2026-08-18");
    expect(addDaysToDateStr("2026-08-17", -1)).toBe("2026-08-16");
    expect(addDaysToDateStr("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToDateStr("2025-12-31", 1)).toBe("2026-01-01");
  });
});

describe("dayOfWeek", () => {
  it("returns 0 for Sunday and 1 for Monday", () => {
    expect(dayOfWeek("2026-08-16")).toBe(0); // a Sunday
    expect(dayOfWeek("2026-08-17")).toBe(1); // a Monday
  });
});
