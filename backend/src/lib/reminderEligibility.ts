// A pure function, deliberately - the same "no system clock, no database, trivial to unit test"
// shape as calculateStreak (see streak.ts) and for the same reason: the actual decision logic
// (should this specific reminder fire for this specific time right now) gets tested with plain
// string/boolean inputs, with no need to mock `Date.now()`, a timer, or a database connection.
//
// This evaluates exactly one (reminder, time) pair at a time - a Reminder can carry several
// independent times per day (see schema.prisma's Reminder.times), each needing its own
// eligibility check, so the caller (reminderScheduler.ts) calls this once per time rather than
// once per reminder.
export interface ReminderEligibilityInput {
  // "HH:mm" - the one fixed time being evaluated, one entry from the reminder's own `times`
  // array.
  time: string;
  // "HH:mm" - the current wall-clock time in *this user's own* timezone (see
  // timezone.ts's currentTimeInTimezone), not the server's or UTC's.
  currentLocalTime: string;
  // Whether a ReminderSend row already exists for this exact (reminder, today, time) triple -
  // computed by the caller from the database, since this function has no database access of its
  // own. Replaces the old single-reminder model's `lastReminderSentDate === today` check, which
  // couldn't express "this reminder has two independent times today, only one of which has fired
  // so far."
  alreadySentThisSlot: boolean;
  // Whether the user has already logged against this reminder's own target (see
  // reminderScheduler.ts's hasLoggedTarget) yet today - the entire point of a reminder is to
  // nudge someone who hasn't, so someone who already has gets no notification for this slot
  // regardless of what time it is.
  hasLoggedTarget: boolean;
  // Whether *now* falls inside the owner's quiet hours and this reminder isn't allowed to ignore
  // them (see lib/quietHours.ts, and Reminder.allowDuringQuietHours for who gets to).
  //
  // Deliberately about the current time rather than the slot's: that is what turns "don't send"
  // into "send later" for free. The slot stays due and unsent, so the fire-late rule below picks
  // it up on the first tick after quiet hours end - no deferral queue, no second mechanism.
  inQuietHours: boolean;
}

// Fires once the time has been reached or passed (not before - a string comparison on two
// same-width, zero-padded "HH:mm" values is equivalent to a numeric time comparison), and never
// again for that same (reminder, day, time) triple even if the scheduler keeps ticking past it or
// the process restarts partway through. Also correctly fires "late" if the process was down
// exactly at the reminder time and comes back up hours later that same day - better a late
// reminder than none, especially given Railway restarts a crashed process rather than losing the
// day's reminder entirely (see docs/log/07-deployment.md).
export function shouldSendReminder(input: ReminderEligibilityInput): boolean {
  if (input.hasLoggedTarget) return false;
  if (input.alreadySentThisSlot) return false;
  // Held rather than dropped: nothing is recorded as sent, so this same slot is still due when
  // quiet hours end and fires then.
  if (input.inQuietHours) return false;
  return input.currentLocalTime >= input.time;
}
