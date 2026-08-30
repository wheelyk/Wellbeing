import { describe, it, expect } from "vitest";
import { cooldownRemaining } from "./cooldown";

const logged = "2026-08-30T09:00:00.000Z";
const at = (iso: string) => new Date(iso);

describe("cooldownRemaining", () => {
  it("counts down from the last log plus the gap", () => {
    // Six-hour gap, logged at 09:00, asked at 11:48 - 3h 12m left.
    expect(cooldownRemaining(logged, 360, at("2026-08-30T11:48:00.000Z"))?.remaining).toBe(
      "3h 12m",
    );
  });

  it("drops the minutes when the remainder is a whole number of hours", () => {
    expect(cooldownRemaining(logged, 360, at("2026-08-30T11:00:00.000Z"))?.remaining).toBe("4h");
  });

  it("uses minutes alone under an hour", () => {
    expect(cooldownRemaining(logged, 360, at("2026-08-30T14:15:00.000Z"))?.remaining).toBe("45m");
  });

  // Rounding up rather than down: "0m remaining" on a cooldown that is still running reads as
  // "go ahead", which is the one wrong answer that actually matters here.
  it("never reports zero while the gap is still running", () => {
    const almost = cooldownRemaining(logged, 360, at("2026-08-30T14:59:30.000Z"));
    expect(almost?.remainingMs).toBeGreaterThan(0);
    expect(almost?.remaining).toBe("under a minute");
  });

  it("is null once the gap has passed", () => {
    expect(cooldownRemaining(logged, 360, at("2026-08-30T15:00:00.000Z"))).toBeNull();
    expect(cooldownRemaining(logged, 360, at("2026-08-30T18:00:00.000Z"))).toBeNull();
  });

  // Null is the "nothing to show" answer for every reason, not just the elapsed one - a card
  // should never carry a countdown row that says nothing.
  it("is null when there is nothing to count down", () => {
    expect(cooldownRemaining(null, 360, at("2026-08-30T10:00:00.000Z"))).toBeNull();
    expect(cooldownRemaining(logged, null, at("2026-08-30T10:00:00.000Z"))).toBeNull();
    expect(cooldownRemaining(logged, undefined, at("2026-08-30T10:00:00.000Z"))).toBeNull();
    expect(cooldownRemaining("not a date", 360, at("2026-08-30T10:00:00.000Z"))).toBeNull();
  });

  it("handles a gap longer than a day", () => {
    expect(cooldownRemaining(logged, 24 * 60, at("2026-08-30T10:30:00.000Z"))?.remaining).toBe(
      "22h 30m",
    );
  });
});
