// A pure function, deliberately - the same "no system clock, no database, trivial to unit test"
// shape as calculateStreak (see streak.ts) and for the same reason: the actual decision logic
// (should this specific user get a reminder right now) gets tested with plain string/boolean
// inputs, with no need to mock `Date.now()`, a timer, or a database connection.
export interface ReminderEligibilityInput {
  reminderEnabled: boolean;
  // "HH:mm", or null if the user has never set one - reminders can be enabled in the same
  // request that sets a time (see users.ts), but nothing stops the two from arriving out of
  // step, so this still has to be checked independently rather than assumed present.
  reminderTime: string | null;
  // "HH:mm" - the current wall-clock time in *this user's own* timezone (see
  // timezone.ts's currentTimeInTimezone), not the server's or UTC's.
  currentLocalTime: string;
  // "YYYY-MM-DD" - today's date in this user's own timezone (see timezone.ts's
  // todayInTimezone).
  today: string;
  // "YYYY-MM-DD", or null if a reminder has never been sent - written by the scheduler itself
  // after a successful send, purely to guarantee at most one reminder per calendar day even
  // though the scheduler ticks every few minutes.
  lastReminderSentDate: string | null;
  // Whether this user has logged anything (any of the four log types) yet today, in their own
  // timezone - the entire point of the reminder is to nudge someone who hasn't, so someone who
  // already has gets no notification regardless of what time it is.
  hasLoggedToday: boolean;
}

// Fires once the user's chosen reminder time has been reached or passed (not before - a string
// comparison on two same-width, zero-padded "HH:mm" values is equivalent to a numeric time
// comparison) for the first tick that day, and never again that same day even if the scheduler
// keeps ticking past it or the process restarts partway through. Also correctly fires "late" if
// the process was down exactly at the reminder time and comes back up hours later that same day
// - better a late reminder than none, especially given Railway restarts a crashed process rather
// than losing the day's reminder entirely (see docs/log/07-deployment.md).
export function shouldSendReminder(input: ReminderEligibilityInput): boolean {
  if (!input.reminderEnabled || !input.reminderTime) return false;
  if (input.hasLoggedToday) return false;
  if (input.lastReminderSentDate === input.today) return false;
  return input.currentLocalTime >= input.reminderTime;
}
