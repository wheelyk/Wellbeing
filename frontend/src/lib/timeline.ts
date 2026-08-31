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
  /** Present only for a CATEGORY-target reminder - null for GENERAL, matching `category` itself.
   *  Timeline's own "log this" quick action (docs/log/50-timeline-v2.md) reads this to open that
   *  one category's form locked to it, rather than the full picker a GENERAL row opens. */
  categoryId: string | null;
  category: { name: string; icon: string | null } | null;
}

/** The shape GET /api/reminders/recent returns. */
export interface RecentRun extends BaseRun {
  state: "logged" | "missed" | "paused";
  /** The CategoryLog that made this row "logged" - present only then, and only for a CATEGORY
   *  target (see the route's own comment on why GENERAL never gets one, even though a match
   *  exists). Lets a tap on a logged row open that exact entry for editing. */
  logId: string | null;
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
  /** Always present so callers never need an `?? null` - null on every future-derived row, since
   *  UpcomingRun never carries one (see RecentRun's own comment on where this comes from). */
  logId: string | null;
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
    // logId set explicitly rather than left to spread from nothing - UpcomingRun has no such
    // field at all, and TimelineRun's own comment promises every row gets a real null here, not
    // an accidental `undefined`.
    ...upcoming.map((run): TimelineRun => ({ ...run, when: "future", logId: null })),
  ];
}

export type TimelineOrder = "oldest" | "newest";

/**
 * "Oldest first" is exactly the order `mergeRuns` already produces (past ascending, then future
 * ascending) - the natural order both source endpoints already return, and the only order this
 * whole module used before an order toggle existed. "Newest first" reverses the *whole* flat list
 * before grouping, not just the day order: reversing here is what makes each day's own rows (and,
 * for Today specifically, which of its rows end up above/below the NOW divider once split by
 * `splitAroundNow` below) reverse correctly too, since a plain array reverse preserves each day's
 * relative row order without `groupRunsByDay` ever needing to know which direction it was given.
 */
export function orderRuns(runs: TimelineRun[], order: TimelineOrder): TimelineRun[] {
  return order === "newest" ? [...runs].reverse() : runs;
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

/**
 * Splits one day's rows around the NOW divider, in whichever direction `order` reads. Only
 * meaningful for the day containing "today" - every other day is wholly past or wholly future by
 * construction (recent only ever returns days up to and including today; upcoming only ever
 * returns today onward), so the divider itself never appears there.
 */
export function splitAroundNow(
  dayRuns: TimelineRun[],
  order: TimelineOrder,
): { above: TimelineRun[]; below: TimelineRun[] } {
  const past = dayRuns.filter((run) => run.when === "past");
  const future = dayRuns.filter((run) => run.when === "future");
  return order === "newest" ? { above: future, below: past } : { above: past, below: future };
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (24 * 60 * 60 * 1000));
}

/**
 * Whether any row in `runs` (a /recent response's own list) was actually logged within the last
 * `days` calendar days, today included - the same "N days, counting backward" convention
 * TIMELINE_RANGES already uses. Drives which range chips Timeline bothers to show at all: a chip
 * for a window with nothing logged in it would look identical to a narrower one that already
 * shows, so it isn't offered (see TimelinePanel's own comment on why "Today" is the one exception,
 * always shown regardless of this check). Deliberately about *logged* rows only, not merely
 * "something to display" - a still-due or missed slot further back doesn't by itself justify
 * widening the window, only an entry someone actually recorded does.
 */
export function hasLoggedWithinDays(
  runs: RecentRun[],
  today: string,
  days: TimelineRange,
): boolean {
  return runs.some((run) => run.state === "logged" && daysBetween(run.date, today) < days);
}

/** What tapping a row should do, or null when there is genuinely nothing to do with it. */
export type TimelineRowAction =
  { type: "edit"; logId: string } | { type: "add"; categoryId: string | null };

/**
 * - A future row already marked "logged" is satisfied and won't fire (see describeState below) -
 *   nothing to add, and no one specific log to point an edit at either, so this is the one case
 *   with no action at all.
 * - A past "logged" row edits the exact entry that made it so, when one is known (CATEGORY target
 *   only - see RecentRun's own comment). A GENERAL "logged" row still offers "add": there's no
 *   single entry to edit, but logging something new is always a valid action regardless.
 * - Everything else (scheduled, held, missed, paused, in either direction) offers "add", locked
 *   to `categoryId` when the row names one, or the full picker when it's a GENERAL row.
 */
export function timelineRowAction(run: TimelineRun): TimelineRowAction | null {
  if (run.when === "future" && run.state === "logged") return null;
  if (run.state === "logged" && run.logId !== null) return { type: "edit", logId: run.logId };
  return { type: "add", categoryId: run.categoryId };
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
