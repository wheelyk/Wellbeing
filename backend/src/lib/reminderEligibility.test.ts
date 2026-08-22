import { describe, it, expect } from "vitest";
import { shouldSendReminder, type ReminderEligibilityInput } from "./reminderEligibility";

const BASE: ReminderEligibilityInput = {
  reminderEnabled: true,
  reminderTime: "20:00",
  currentLocalTime: "20:00",
  today: "2026-08-22",
  lastReminderSentDate: null,
  hasLoggedToday: false,
};

describe("shouldSendReminder", () => {
  it("fires the moment the reminder time is reached, if nothing's been logged yet", () => {
    expect(shouldSendReminder(BASE)).toBe(true);
  });

  it("fires late if the current time has already passed the reminder time", () => {
    expect(shouldSendReminder({ ...BASE, currentLocalTime: "22:47" })).toBe(true);
  });

  it("does not fire before the reminder time", () => {
    expect(shouldSendReminder({ ...BASE, currentLocalTime: "19:59" })).toBe(false);
  });

  it("does not fire if reminders are disabled", () => {
    expect(shouldSendReminder({ ...BASE, reminderEnabled: false })).toBe(false);
  });

  it("does not fire if no reminder time has ever been set", () => {
    expect(shouldSendReminder({ ...BASE, reminderTime: null })).toBe(false);
  });

  it("does not fire if the user has already logged something today", () => {
    expect(shouldSendReminder({ ...BASE, hasLoggedToday: true })).toBe(false);
  });

  it("does not fire twice on the same day, even well past the reminder time", () => {
    expect(
      shouldSendReminder({
        ...BASE,
        currentLocalTime: "23:55",
        lastReminderSentDate: "2026-08-22",
      }),
    ).toBe(false);
  });

  it("fires again on a new day, even if one was already sent yesterday", () => {
    expect(
      shouldSendReminder({
        ...BASE,
        lastReminderSentDate: "2026-08-21",
      }),
    ).toBe(true);
  });
});
