import { prisma } from "./prisma";
import { cronSlotsForDate } from "./cron";
import { isWithinQuietHours, type QuietHours } from "./quietHours";
import { formatDateInTimezone, timeInTimezone } from "./timezone";
import type { ReminderTarget } from "../generated/prisma/client";

// The rules that decide *whether a reminder really fires at a given slot*, in one place.
//
// They used to live entirely inside reminderScheduler.ts, where they were reachable only by the
// background tick. That was fine while the tick was the only thing that needed to know. It stopped
// being fine the moment a second caller wanted the same answer for a slot that has not happened
// yet (GET /api/reminders/upcoming - see docs/log/42-upcoming-reminders.md).
//
// The alternative - writing "does this fire?" a second time in the route - is the exact failure
// docs/log/33-next-run-preview.md exists to prevent, one level deeper. That entry made the point
// about cron *expansion*: two implementations of "which slots does this expression produce" can
// drift apart silently, and the bug surfaces weeks later as a notification on the wrong day. Every
// word of it applies to the layer above expansion too. `nextRunsForSchedules` in cron.ts is
// genuinely shared, and still answers the wrong question on its own: it knows cron and nothing
// else. It has never heard of `enabled`, `startsAt`, `expiresAt`, `stopsWhenLogged` or quiet hours,
// all of which arrived after it was written. A preview built on it alone would confidently list
// runs that cannot happen.
//
// So the scheduler now calls these functions rather than owning the logic, and the fact that its
// own tests pass unchanged is what says the extraction was faithful.

export interface ReminderSlotsInput {
  // The local calendar date being asked about, "YYYY-MM-DD" in `timeZone`. Not "today" - the whole
  // reason this is a parameter is that one caller looks forward and the other never does.
  date: string;
  // The reminder's stored cron expressions.
  schedules: string[];
  // The *owner's* stored timezone, never the server's. Everything below reads local wall-clock
  // times, and a cron time is a local time.
  timeZone: string;
  // A moment this reminder must not fire before, or null for "from now on". See
  // docs/log/40-reminder-starts-at.md.
  startsAt: Date | null;
  // A moment after which it never fires again, or null for a standing reminder. See
  // docs/log/37-temporary-reminders-backend.md.
  expiresAt: Date | null;
  // Called for a stored expression that no longer parses. Optional because the two callers want
  // different things: the scheduler logs it (one user's bad row must not stop the tick that serves
  // everyone else), while a read-only preview simply omits it rather than filling the log with a
  // line per day scanned. Either way it is skipped, never thrown - expressions are validated at
  // the API boundary, so this should not be reachable at all.
  onUnparseable?: (expression: string, err: unknown) => void;
}

// Every "HH:mm" slot this reminder genuinely has on the given local date: the cron expansion of
// all its schedules, minus anything outside the [startsAt, expiresAt) window.
//
// Deduplicated and ascending. Two expressions can legitimately overlap on one day (a weekday rule
// and a specific-date rule), and the same slot must never be treated as two separate firings.
export function reminderSlotsForDate(input: ReminderSlotsInput): string[] {
  const { date, schedules, timeZone, startsAt, expiresAt, onUnparseable } = input;

  const slots = new Set<string>();
  for (const expression of schedules) {
    try {
      for (const slot of cronSlotsForDate(expression, date)) slots.add(slot);
    } catch (err) {
      onUnparseable?.(expression, err);
    }
  }

  let times = [...slots].sort();

  // Both bounds are applied in the local date/"HH:mm" frame rather than by rebuilding each slot
  // into an absolute instant. That is deliberate on two counts. It is the frame the rest of this
  // codebase already reasons in (see timezone.ts), and it truncates to the minute on both sides -
  // so a startsAt of 03:46:30 does not exclude the 03:46 slot it was computed to describe.

  if (startsAt) {
    // On the day a reminder starts, the slots earlier than its start time have not "already
    // passed" - they were never its slots at all. Without this the scheduler's own fire-late rule
    // (see reminderEligibility.ts) would deliver a one-shot for 03:46 the moment it was created at
    // 21:46 the evening before, which is the entire failure startsAt exists to prevent.
    const startDate = formatDateInTimezone(startsAt, timeZone);
    if (date < startDate) return [];
    if (date === startDate) {
      // Inclusive: a slot at exactly startsAt is allowed, matching the scheduler's own
      // `startsAt <= now` candidate filter.
      const startTime = timeInTimezone(startsAt, timeZone);
      times = times.filter((time) => time >= startTime);
    }
  }

  if (expiresAt) {
    // The exact mirror. The scheduler never needed this, because its database query already drops
    // any reminder whose expiry has passed and it only ever looks at today - so for the scheduler
    // this filter can only ever agree with the query it already ran. It is load-bearing for a
    // caller that looks *ahead*, where "expires on Thursday" has to stop Friday's slots appearing.
    const expiryDate = formatDateInTimezone(expiresAt, timeZone);
    if (date > expiryDate) return [];
    if (date === expiryDate) {
      // Exclusive, and asymmetric with startsAt on purpose: the scheduler treats a reminder as
      // already gone at exactly `expiresAt` (`expiresAt: { gt: now }`), so a slot landing on that
      // same minute is past the end rather than the last one through it. It also makes
      // "end-of-day" - stored as midnight *tomorrow* - exclude every slot of tomorrow and no slot
      // of today, which is what someone asking for "the rest of today" means.
      const expiryTime = timeInTimezone(expiresAt, timeZone);
      times = times.filter((time) => time < expiryTime);
    }
  }

  return times;
}

// Whether quiet hours hold this reminder at the given local time - and if so, the local "HH:mm"
// the window ends at, which is when the held slot will actually be delivered. Null means not held.
//
// Returning the end time rather than a bare boolean is what lets the upcoming list say "03:46,
// arriving 08:00" without re-deriving the window itself. The scheduler only needs the yes/no and
// compares against null.
//
// `allowDuringQuietHours` is the half of this rule most likely to be forgotten by a second
// implementation, which is precisely why it lives here rather than being re-written at each call
// site. See docs/log/41-quiet-hours.md for why the flag's default differs by creation path.
export function quietHoursHoldUntil(
  localTime: string,
  allowDuringQuietHours: boolean,
  quietHours: QuietHours,
): string | null {
  if (allowDuringQuietHours) return null;
  if (!isWithinQuietHours(localTime, quietHours)) return null;
  // Non-null whenever isWithinQuietHours said true - it returns false if either end is missing.
  return quietHours.end;
}

// What a reminder is *about*, which is all either caller needs to ask the question below.
export interface ReminderTargetRef {
  target: ReminderTarget;
  categoryId: string | null;
}

// Whether the user has already logged against this specific reminder's own target within the given
// UTC instant range (normally one local day) - GENERAL is a blanket "any category log at all"
// check; CATEGORY is scoped to the specific category this reminder is about (a "Diazepam" reminder
// isn't satisfied by logging "Sertraline" - both are now their own categories, see
// docs/log/19-medication-to-category.md).
//
// Note what this does *not* consider: `stopsWhenLogged`. That is the caller's question ("does
// being logged stop this one?"), not this function's ("has it been logged?"), and keeping them
// separate is what lets the scheduler skip the query entirely for a reminder that fires on a
// rhythm regardless.
export async function hasLoggedTarget(
  reminder: ReminderTargetRef,
  userId: string,
  start: Date,
  end: Date,
): Promise<boolean> {
  const where = { userId, loggedAt: { gte: start, lt: end } };

  switch (reminder.target) {
    case "GENERAL":
      return (await prisma.categoryLog.findFirst({ where, select: { id: true } })) !== null;
    case "CATEGORY":
      return (
        (await prisma.categoryLog.findFirst({
          where: { ...where, categoryId: reminder.categoryId as string },
          select: { id: true },
        })) !== null
      );
  }
}
