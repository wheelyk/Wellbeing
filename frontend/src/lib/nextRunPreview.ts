import { apiFetch } from "../api/client";

// The next few times a schedule will actually fire, as computed by the *server* - see
// backend/src/routes/reminders.ts's own comment on why this deliberately isn't calculated in the
// browser, even though cronSchedule.ts could do it. The browser's cron code draws the picker; the
// server's decides what gets sent. Asking the server is what turns this line into a check that the
// two agree, rather than the picker simply repeating itself back.
//
// See docs/log/33-next-run-preview.md.

export interface NextRun {
  // "YYYY-MM-DD" and "HH:mm", both already resolved into the user's own stored timezone.
  date: string;
  time: string;
}

export interface NextRunPreview {
  timezone: string;
  // The server resolved these in the user own timezone, so the client only ever compares date
  // strings and never has to decide what day it is anywhere.
  today: string;
  tomorrow: string;
  nextRuns: NextRun[];
}

export function fetchNextRuns(schedules: string[]): Promise<NextRunPreview> {
  return apiFetch<NextRunPreview>("/api/reminders/preview", {
    method: "POST",
    body: JSON.stringify({ schedules }),
  });
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Formats a run relative to the user's own "today", which the server has already resolved for us -
// so this never needs to reason about timezones itself, only about which of three date strings it
// was handed. Comparing plain "YYYY-MM-DD" strings is exact and has no clock in it at all.
export function describeNextRun(run: NextRun, preview: NextRunPreview): string {
  if (run.date === preview.today) return `today at ${run.time}`;
  if (run.date === preview.tomorrow) return `tomorrow at ${run.time}`;

  const [year, month, day] = run.date.split("-").map(Number);
  // Constructed as UTC and read back as UTC, so this is pure calendar arithmetic on the string -
  // no local-timezone shift can move it onto the wrong day.
  const weekday = DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTH_NAMES[month - 1]} at ${run.time}`;
}
