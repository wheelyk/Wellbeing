import { addDaysToDateStr, dayOfWeek } from "./timezone";

export interface StreakResult {
  current: number;
  daysLoggedThisWeek: number;
}

// A "pure function" here means: given the same arguments, it always returns the same result,
// and it doesn't read the system clock, touch the database, or do anything else outside its own
// inputs/output. That's what makes it trivial to unit test - a test just builds a `Set` of
// dates by hand and checks the returned numbers, with no database, no auth, no HTTP request
// involved, and no need to fake "the current time" to exercise a specific scenario.
//
// `loggedDates` is the set of calendar-day strings ("YYYY-MM-DD") on which the user logged at
// least one entry of *any* type - the caller (the dashboard route) is responsible for turning
// raw `loggedAt` timestamps into these day strings using the user's timezone (see
// `lib/timezone.ts`); this function never sees a timestamp or a timezone, only already-resolved
// calendar days, which is what keeps it pure and simple.
//
// `today` is the calendar-day string this calculation is anchored to - normally the real
// "today" in the user's timezone, but the dashboard route lets a caller resolve the whole
// response (including the streak) against an explicit `?date=`, which is what makes this
// endpoint deterministic and testable for a fixed date rather than always depending on the
// wall clock.
//
// Week definition: Monday-Sunday. Documented here since requirements.md leaves the choice open
// ("Mon-Sun or Sun-Sat, your call") - Monday-Sunday was picked as the more common convention
// outside the US, and there's no requirement anywhere in this app that depends on which one is
// used, so either would have been an equally valid choice.
export function calculateStreak(loggedDates: Set<string>, today: string): StreakResult {
  // "current" counts consecutive logged days ending at `today` - but if nothing has been
  // logged yet today (a very normal state for, say, 8am before anyone's opened the app), the
  // streak shouldn't already read as "broken" for the rest of the day; it counts from
  // yesterday instead. If neither today nor yesterday has a log, the streak is 0.
  let cursor = loggedDates.has(today) ? today : addDaysToDateStr(today, -1);
  let current = 0;
  while (loggedDates.has(cursor)) {
    current++;
    cursor = addDaysToDateStr(cursor, -1);
  }

  // "daysLoggedThisWeek" counts logged days within the Monday-Sunday week that contains
  // `today`, regardless of whether they're before or after `today` within that week (a log
  // backfilled for a couple of days ago still counts toward "this week").
  const weekday = dayOfWeek(today); // 0 = Sunday ... 6 = Saturday
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = addDaysToDateStr(today, -daysSinceMonday);

  let daysLoggedThisWeek = 0;
  for (let i = 0; i < 7; i++) {
    if (loggedDates.has(addDaysToDateStr(monday, i))) daysLoggedThisWeek++;
  }

  return { current, daysLoggedThisWeek };
}
