// Every "which calendar day does this log belong to" question in the app (dashboard summary,
// streak calculation) has to be answered relative to the *user's* timezone, not the server's -
// two users logging at the same literal instant can be on different calendar days from each
// other (e.g. 11pm Aug 16 in New York is already 4am Aug 17 in London). Node's built-in `Intl`
// API can do this correctly without adding a dependency (no `luxon`/`date-fns-tz` is installed
// in this project), so this module is a small, hand-written wrapper around it rather than a new
// package.

// Formats a UTC instant as the "YYYY-MM-DD" calendar date it falls on *in the given IANA
// timezone* (e.g. "America/Los_Angeles"). The 'en-CA' locale is a deliberate trick: unlike most
// locales, it formats dates as YYYY-MM-DD by default, which is exactly the ISO-ish shape this
// app uses everywhere else for a "date only" string - no manual zero-padding/reassembly needed.
export function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDateStr(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

// The inverse problem: given a *wall-clock* moment (year/month/day/hour/minute/second) that's
// meant to be read in a specific timezone, what UTC instant does that correspond to? There's no
// direct built-in for this, so it's solved by a "guess, measure, correct" approach:
//   1. Guess the answer is that wall-clock time read as if it were already UTC.
//   2. Ask Intl what that guessed instant's wall-clock time actually looks like *in the target
//      timezone* - the gap between the guess and that reading is exactly the timezone's UTC
//      offset at that moment (which varies through the year for timezones observing DST).
//   3. Subtract that offset from the guess to get the real answer.
// This can be one step off right at a DST transition (the offset measured a few minutes away
// from the transition instant can differ from the offset actually in effect at it), which is an
// accepted, documented limitation - exact-to-the-second correctness across a DST transition
// isn't a requirement anywhere this function is used (day-boundary queries, not billing).
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(guessMs));

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  const readBackMs = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  const offsetMs = readBackMs - guessMs;
  return new Date(guessMs - offsetMs);
}

// The one thing the dashboard route actually needs from this module: the half-open UTC instant
// range `[start, end)` covering a given calendar day ("YYYY-MM-DD") in the user's timezone -
// e.g. every SymptomLog/MoodLog/etc. with `loggedAt` in that range is "logged that day" for that
// user, regardless of what calendar day it happens to fall on in UTC or on the server.
export function getDayRangeUtc(dateStr: string, timeZone: string): { start: Date; end: Date } {
  const { year, month, day } = parseDateStr(dateStr);
  const start = zonedWallClockToUtc(year, month, day, 0, 0, 0, timeZone);
  // Adding a day via Date.UTC's own overflow handling (e.g. day 32 of a 31-day month) rather
  // than hand-rolling month-length/leap-year math - JS normalizes it correctly either way.
  const nextDayMs = Date.UTC(year, month - 1, day + 1);
  const nextDay = new Date(nextDayMs);
  const end = zonedWallClockToUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
  return { start, end };
}

// "Today," resolved in the user's timezone - used whenever the dashboard's `?date=` query
// param is omitted.
export function todayInTimezone(timeZone: string): string {
  return formatDateInTimezone(new Date(), timeZone);
}

// The current wall-clock time in the user's timezone, as "HH:mm" (24-hour, zero-padded) - the
// same shape `User.reminderTime` is stored in, so the reminder scheduler can compare the two
// directly as strings rather than parsing either one into numbers first.
export function currentTimeInTimezone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

// Shifts a "YYYY-MM-DD" calendar-date string by `days` (negative moves backward), purely as
// calendar-date arithmetic - no timezone involved at this point, since the string no longer
// carries any. Parsed and re-formatted via Date.UTC so month/year rollovers (e.g. subtracting a
// day from "2026-01-01") are handled by the same battle-tested overflow normalization used
// above, not hand-written.
export function addDaysToDateStr(dateStr: string, days: number): string {
  const { year, month, day } = parseDateStr(dateStr);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const y = String(shifted.getUTCFullYear()).padStart(4, "0");
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Day of week for a "YYYY-MM-DD" string, as plain calendar-date arithmetic (0 = Sunday ... 6 =
// Saturday, matching JS's own `Date#getDay`/`getUTCDay` convention).
export function dayOfWeek(dateStr: string): number {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
