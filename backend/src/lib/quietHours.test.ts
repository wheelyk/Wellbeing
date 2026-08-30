import { describe, it, expect } from "vitest";
import { isWithinQuietHours, quietHoursError } from "./quietHours";

// A pure function on two "HH:mm" strings, so these are plain inputs - no clock, no database, no
// mocking. The interesting case is that the window everyone actually wants (22:00 to 08:00) wraps
// midnight, and is therefore *not* a range in the arithmetic sense.
describe("isWithinQuietHours", () => {
  const overnight = { start: "22:00", end: "08:00" };

  it("covers the late evening and the early morning of a window that wraps midnight", () => {
    expect(isWithinQuietHours("22:00", overnight)).toBe(true);
    expect(isWithinQuietHours("23:59", overnight)).toBe(true);
    expect(isWithinQuietHours("00:00", overnight)).toBe(true);
    expect(isWithinQuietHours("03:46", overnight)).toBe(true);
    expect(isWithinQuietHours("07:59", overnight)).toBe(true);
  });

  it("leaves the middle of the day alone", () => {
    expect(isWithinQuietHours("08:00", overnight)).toBe(false);
    expect(isWithinQuietHours("12:00", overnight)).toBe(false);
    expect(isWithinQuietHours("21:59", overnight)).toBe(false);
  });

  // Half-open, deliberately: quiet *from* the start, and no longer quiet *at* the end. Someone who
  // sets "quiet until 8" means a reminder at exactly 08:00 should arrive.
  it("includes the start minute and excludes the end minute", () => {
    expect(isWithinQuietHours("22:00", overnight)).toBe(true);
    expect(isWithinQuietHours("08:00", overnight)).toBe(false);
  });

  it("handles a window that does not wrap midnight", () => {
    const daytime = { start: "09:00", end: "17:00" };
    expect(isWithinQuietHours("08:59", daytime)).toBe(false);
    expect(isWithinQuietHours("09:00", daytime)).toBe(true);
    expect(isWithinQuietHours("16:59", daytime)).toBe(true);
    expect(isWithinQuietHours("17:00", daytime)).toBe(false);
    // Would be true under the wrapping branch - proof the two branches don't leak into each other.
    expect(isWithinQuietHours("23:00", daytime)).toBe(false);
  });

  it("means no quiet hours at all when either end is missing", () => {
    expect(isWithinQuietHours("03:00", { start: null, end: null })).toBe(false);
    // A half-configured window has no statable meaning. Reading it as "quiet from 22:00 until
    // forever" would silently lose every notification the account has, so it means nothing instead.
    expect(isWithinQuietHours("03:00", { start: "22:00", end: null })).toBe(false);
    expect(isWithinQuietHours("03:00", { start: null, end: "08:00" })).toBe(false);
  });

  // "Quiet from 8 until 8" describes no time at all. Reading it as a full 24 hours would silence
  // an account permanently, which is the worst possible way to be wrong about this.
  it("treats an empty window as no quiet hours, not as all day", () => {
    expect(isWithinQuietHours("03:00", { start: "08:00", end: "08:00" })).toBe(false);
    expect(isWithinQuietHours("08:00", { start: "08:00", end: "08:00" })).toBe(false);
  });
});

describe("quietHoursError", () => {
  it("accepts a complete window, or none at all", () => {
    expect(quietHoursError("22:00", "08:00")).toBeNull();
    expect(quietHoursError(null, null)).toBeNull();
  });

  it("rejects half a window", () => {
    expect(quietHoursError("22:00", null)).toMatch(/both/i);
    expect(quietHoursError(null, "08:00")).toMatch(/both/i);
  });

  it("rejects a window that starts and ends at the same time", () => {
    expect(quietHoursError("08:00", "08:00")).toMatch(/same time/i);
  });
});
