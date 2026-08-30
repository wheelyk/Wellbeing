// "What will remind me, and when?" - the shape GET /api/reminders/upcoming returns, plus the pure
// grouping and phrasing the panel needs.
//
// The important thing about this list is what it is NOT: it is not cron expanded on the client.
// The server applies the scheduler's own rules - enabled, startsAt, expiresAt, stopsWhenLogged and
// quiet hours - because a list built from cron alone would confidently show runs that never happen
// (see docs/log/33-next-run-preview.md for the first time that lesson was learned, and
// docs/log/42-upcoming-reminders.md for this one). The client's only job is to render what it is
// told.

export type UpcomingState = "scheduled" | "held" | "logged" | "paused";

export interface UpcomingRun {
  /** "YYYY-MM-DD" in the account's own timezone. */
  date: string;
  /** "HH:mm", likewise. */
  time: string;
  reminderId: string;
  target: string;
  category: { name: string; icon: string | null } | null;
  state: UpcomingState;
  /** Only on a held run: the local time quiet hours end and it will actually arrive. */
  deliveredAt?: string;
  /** Present only when this entry stands for more than one slot - a cadence the server merged
   *  into one row (see docs/log/46-collapsing-repeated-runs.md). `time` is still the first. */
  repeatCount?: number;
  lastTime?: string;
}

export interface UpcomingResponse {
  timezone: string;
  today: string;
  truncated: boolean;
  runs: UpcomingRun[];
}

/** The ranges offered. 90 days was deliberately dropped - a daily reminder over 90 days is 90
 *  identical rows, which is a scroll, not information. */
export const UPCOMING_RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

export type UpcomingRange = (typeof UPCOMING_RANGES)[number]["days"];

export interface UpcomingDay {
  date: string;
  label: string;
  runs: UpcomingRun[];
}

// "Today" and "Tomorrow" are worth naming; past that a weekday and date reads better than a bare
// ISO string. `today` comes from the response rather than the browser, for the same reason every
// other date in this app does: the account's timezone is the server's to know.
function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";

  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  if (date === tomorrowStr) return "Tomorrow";

  const [ry, rm, rd] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(ry, rm - 1, rd)));
}

/** Groups an already-chronological list into days, preserving order. */
export function groupRunsByDay(runs: UpcomingRun[], today: string): UpcomingDay[] {
  const days: UpcomingDay[] = [];
  for (const run of runs) {
    const last = days[days.length - 1];
    if (last && last.date === run.date) {
      last.runs.push(run);
    } else {
      days.push({ date: run.date, label: dayLabel(run.date, today), runs: [run] });
    }
  }
  return days;
}

/** The line under a run, when there is something worth saying about why it is not simply due. */
// The line under a run. A collapsed cadence says how many and how late it goes, since "13:00" alone
// would understate a row standing for eleven slots; a state explains why it will not simply fire.
// Both can be true at once - eleven held slots need to say both things - so they are joined rather
// than one winning.
export function describeRun(run: UpcomingRun): string | null {
  const parts: string[] = [];
  if (run.repeatCount && run.repeatCount > 1) {
    parts.push(`${run.repeatCount} times, until ${run.lastTime}`);
  }
  const state = describeState(run);
  if (state) parts.push(state);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function describeState(run: UpcomingRun): string | null {
  switch (run.state) {
    case "held":
      // Held, not dropped - it still arrives, just not in the middle of the night. Saying when is
      // the whole point; "held" on its own would read as "lost".
      return run.deliveredAt ? `Quiet hours — arrives at ${run.deliveredAt}` : "Quiet hours";
    case "logged":
      return "Already logged, so this one won't fire";
    case "paused":
      return "This reminder is switched off";
    case "scheduled":
      return null;
  }
}

export function stateLabel(state: UpcomingState): string | null {
  switch (state) {
    case "held":
      return "Held";
    case "logged":
      return "Logged";
    case "paused":
      return "Paused";
    case "scheduled":
      return null;
  }
}
