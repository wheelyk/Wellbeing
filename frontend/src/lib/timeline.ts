// "What did I log, what did I miss, and what's coming up" - one merged, chronological list built
// from two servers calls: GET /api/reminders/recent (the past) and GET /api/reminders/upcoming
// (the future). Both apply the scheduler's own firing rules rather than a second set that merely
// agrees with them today (see docs/log/42-upcoming-reminders.md and
// docs/log/47-recent-reminders.md) - this module's only job is to merge, group by day, and phrase
// what each server already decided. Nothing here expands a cron expression or re-derives a state.

export type TimelineState = "scheduled" | "held" | "logged" | "missed" | "paused";

interface BaseRun {
  /** "YYYY-MM-DD" in the account's own timezone. */
  date: string;
  /** "HH:mm", likewise. */
  time: string;
  reminderId: string;
  target: string;
  category: { name: string; icon: string | null } | null;
}

/** The shape GET /api/reminders/recent returns. */
export interface RecentRun extends BaseRun {
  state: "logged" | "missed" | "paused";
}

export interface RecentResponse {
  timezone: string;
  today: string;
  truncated: boolean;
  runs: RecentRun[];
}

/** The shape GET /api/reminders/upcoming returns. */
export interface UpcomingRun extends BaseRun {
  state: "scheduled" | "held" | "logged" | "paused";
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

/** One row of the merged timeline - a `RecentRun` or `UpcomingRun`, tagged with which side of
 *  "now" it came from. The tag is what lets the panel draw the NOW divider correctly even though
 *  both sides can legitimately contribute rows for the same calendar day. */
export interface TimelineRun extends BaseRun {
  state: TimelineState;
  when: "past" | "future";
  deliveredAt?: string;
  repeatCount?: number;
  lastTime?: string;
}

/**
 * Concatenates, not sorts. `recent`'s rows are all at or before "now" and `upcoming`'s are all
 * strictly after it (each endpoint's own rule - see their route comments), so the two lists are
 * already in chronological order relative to each other with no merge step needed: every `recent`
 * row genuinely precedes every `upcoming` row, including on a shared "today" where recent's
 * elapsed slots and upcoming's remaining ones meet at "now" itself.
 */
export function mergeRuns(recent: RecentRun[], upcoming: UpcomingRun[]): TimelineRun[] {
  return [
    ...recent.map((run): TimelineRun => ({ ...run, when: "past" })),
    ...upcoming.map((run): TimelineRun => ({ ...run, when: "future" })),
  ];
}

/**
 * The ranges offered, applied identically to both `/recent` and `/upcoming` - each endpoint
 * already reads "N days" as "N days including today, counting in its own direction" (a convention
 * both had independently before this panel existed), so one shared value asks each for exactly
 * that in its own direction. The visible window is therefore `2N - 1` calendar days for N > 1
 * (today is shared), not `N` - "3 days" shows five days on screen (2 back, today, 2 forward), not
 * three. That is a deliberate simplification: a literal "yesterday, today, tomorrow" window would
 * need each endpoint to accept day-counts (2, 4) neither one does, for no benefit over reusing the
 * three values both already validate. 30/90 stay dropped, as they were on the old Coming Up panel
 * - a daily reminder over that many days is a scroll, not information.
 */
export const TIMELINE_RANGES = [
  { days: 1, label: "Today" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
] as const;

export type TimelineRange = (typeof TIMELINE_RANGES)[number]["days"];

export interface TimelineDay {
  date: string;
  label: string;
  runs: TimelineRun[];
}

// "Yesterday", "Today" and "Tomorrow" are worth naming; past that a weekday and date reads better
// than a bare ISO string. `today` is passed in from a response rather than read from the browser,
// for the same reason every other date in this app is: the account's timezone is the server's to
// know, not the device's.
function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";

  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  if (date === tomorrow) return "Tomorrow";
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (date === yesterday) return "Yesterday";

  const [ry, rm, rd] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(ry, rm - 1, rd)));
}

/** Groups an already-chronological list into days, preserving order. */
export function groupRunsByDay(runs: TimelineRun[], today: string): TimelineDay[] {
  const days: TimelineDay[] = [];
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

// The line under a run. A collapsed cadence says how many and how late it goes, since "13:00"
// alone would understate a row standing for eleven slots; a state explains why it will not
// simply fire (or, for "missed", already didn't). Both can be true at once - eleven held slots
// need to say both things - so they are joined rather than one silently winning.
export function describeRun(run: TimelineRun): string | null {
  const parts: string[] = [];
  if (run.repeatCount && run.repeatCount > 1) {
    parts.push(`${run.repeatCount} times, until ${run.lastTime}`);
  }
  const state = describeState(run);
  if (state) parts.push(state);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function describeState(run: TimelineRun): string | null {
  switch (run.state) {
    case "held":
      // Held, not dropped - it still arrives, just not in the middle of the night. Saying when is
      // the whole point; "held" on its own would read as "lost".
      return run.deliveredAt ? `Quiet hours — arrives at ${run.deliveredAt}` : "Quiet hours";
    case "logged":
      // "Logged" only needs explaining looking *forward*: an upcoming slot that will not fire
      // because its target is already logged today is worth saying plainly. A past row that
      // reads "logged" already carries the whole explanation in the pill and its place in the
      // list - saying it again would be redundant.
      return run.when === "future" ? "Already logged, so this one won't fire" : null;
    case "missed":
      return "No dose logged that day";
    case "paused":
      return "This reminder is switched off";
    case "scheduled":
      return null;
  }
}

export function stateLabel(state: TimelineState): string | null {
  switch (state) {
    case "held":
      return "Held";
    case "logged":
      return "Logged";
    case "missed":
      return "Missed";
    case "paused":
      return "Paused";
    case "scheduled":
      return null;
  }
}
