import { describe, it, expect } from "vitest";
import { shouldSendReminder, type ReminderEligibilityInput } from "./reminderEligibility";

const BASE: ReminderEligibilityInput = {
  time: "20:00",
  currentLocalTime: "20:00",
  alreadySentThisSlot: false,
  hasLoggedTarget: false,
};

describe("shouldSendReminder", () => {
  it("fires the moment the time is reached, if the target hasn't been logged yet", () => {
    expect(shouldSendReminder(BASE)).toBe(true);
  });

  it("fires late if the current time has already passed the reminder time", () => {
    expect(shouldSendReminder({ ...BASE, currentLocalTime: "22:47" })).toBe(true);
  });

  it("does not fire before the reminder time", () => {
    expect(shouldSendReminder({ ...BASE, currentLocalTime: "19:59" })).toBe(false);
  });

  it("does not fire if the target has already been logged", () => {
    expect(shouldSendReminder({ ...BASE, hasLoggedTarget: true })).toBe(false);
  });

  it("does not fire twice for the same (reminder, day, time) slot", () => {
    expect(
      shouldSendReminder({ ...BASE, currentLocalTime: "23:55", alreadySentThisSlot: true }),
    ).toBe(false);
  });

  it("fires for a different slot even if another slot on the same reminder already fired today", () => {
    // alreadySentThisSlot is scoped to the one specific `time` being evaluated - the caller is
    // responsible for checking each of a reminder's several times independently (see
    // reminderScheduler.ts), not this pure function.
    expect(shouldSendReminder({ ...BASE, time: "15:00", alreadySentThisSlot: false })).toBe(true);
  });
});
