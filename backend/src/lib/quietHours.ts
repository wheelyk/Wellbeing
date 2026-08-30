// "Don't wake me in the middle of the night."
//
// A pure function on two "HH:mm" strings, deliberately - the same shape as reminderEligibility.ts
// and streak.ts, and for the same reason: the decision is fiddly enough to be worth testing on its
// own, with no clock, no database and no mocking.
//
// The fiddly part is that the normal case wraps midnight. 22:00 to 08:00 is not a range in the
// arithmetic sense - it is everything *outside* 08:00 to 22:00 - so a naive `start <= t && t < end`
// is wrong for exactly the window everybody actually wants.

export interface QuietHours {
  // "HH:mm" in the user's own timezone. Both null (or absent) means no quiet hours at all.
  start: string | null;
  end: string | null;
}

// Whether a local "HH:mm" falls inside the window. Half-open: the start minute is quiet, the end
// minute is not - so 22:00-08:00 means a reminder at exactly 08:00 fires, which is what someone
// setting "quiet until 8" means by it.
export function isWithinQuietHours(time: string, quietHours: QuietHours): boolean {
  const { start, end } = quietHours;
  // Both or neither. A half-configured window has no sensible meaning, and treating it as "quiet
  // from 22:00 until forever" would be a silent way to lose every notification.
  if (!start || !end) return false;
  // A window with the same start and end is empty rather than all-day: "quiet from 8 until 8"
  // describes no time at all, and reading it as 24 hours would silence everything for good.
  if (start === end) return false;

  return start < end
    ? time >= start && time < end
    : // Wraps midnight: quiet from the start until the day ends, and again from midnight to the end.
      time >= start || time < end;
}

// Validation shared by the profile route and anything else that accepts a window. Returns the
// message rather than throwing, so a caller can attach it to the field it belongs to.
export function quietHoursError(start: string | null, end: string | null): string | null {
  const given = [start, end].filter((v) => v !== null).length;
  if (given === 1) {
    return "Set both a start and an end time, or neither";
  }
  if (start !== null && start === end) {
    return "Quiet hours can't start and end at the same time";
  }
  return null;
}
