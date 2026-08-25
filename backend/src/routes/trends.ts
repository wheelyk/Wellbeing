import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  addDaysToDateStr,
  formatDateInTimezone,
  getDayRangeUtc,
  todayInTimezone,
} from "../lib/timezone";
import { toApiCategoryValueType } from "../lib/categoryValueType";

// Same three choices requirements §10 and Tasks.md Phase 10 call for - no other period is valid
// input. Kept as a literal union (not a generic "any positive integer of days") because the
// frontend's period selector only ever offers these three buttons; anything else is rejected
// as a validation error rather than silently clamped to the nearest supported value.
const PERIOD_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).optional(),
});

interface DailyPoint {
  date: string;
  average: number | null;
  count: number;
}

// Mean of a plain array of numbers, or `null` for an empty array - `null` (not `0` or `NaN`) is
// what lets the frontend tell "logged a 0 value" (impossible for mood, a 1-based scale) apart
// from "nothing logged in this window," which the response shape needs to render an honest empty
// state instead of a misleading "Avg: 0".
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Builds the ordered list of "YYYY-MM-DD" calendar days from `startDate` to `endDate`
// (inclusive), in the caller's already-resolved timezone-relative date strings. This is the
// single source of truth for "which days does this period cover" - every series in the response
// (mood, activity, each category's own chart) has exactly one entry per day in this list, in this
// order, so the frontend never has to re-derive date math of its own to line up x-axis labels.
function buildDayRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    days.push(cursor);
    cursor = addDaysToDateStr(cursor, 1);
  }
  return days;
}

export const trendsRouter = Router();

trendsRouter.get("/", async (req, res) => {
  const parsedQuery = querySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: {
        message: "Invalid trends query",
        code: "VALIDATION_ERROR",
        details: parsedQuery.error.flatten().fieldErrors,
      },
    });
  }

  // req.userId only carries the id (see requireAuth.ts) - the user's timezone lives on their own
  // row, so it has to be fetched before "which calendar days does this period cover" can be
  // resolved at all. Same pattern as dashboard.ts.
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { timezone: true },
  });
  if (!user) {
    // Can only happen if the user row was deleted after the access token was issued (e.g. a
    // concurrent account deletion) - the token itself is still validly signed, so this is a
    // genuine 404, not an auth failure.
    return res.status(404).json({
      error: { message: "User not found", code: "USER_NOT_FOUND" },
    });
  }

  // Captured into a local so the `bucketByDay` closure below doesn't need to keep re-narrowing
  // `user` past its own null check - TypeScript's control-flow narrowing doesn't carry into a
  // nested function declaration that closes over an outer variable.
  const timezone = user.timezone;

  const period = parsedQuery.data.period ?? "7d";
  const periodDays = PERIOD_DAYS[period];

  const endDate = todayInTimezone(timezone);
  const startDate = addDaysToDateStr(endDate, -(periodDays - 1));
  const days = buildDayRange(startDate, endDate);

  // One bounded UTC range covering the whole period, computed once via the same timezone-aware
  // day-boundary logic dashboard.ts uses - this is what keeps the three queries below index-only
  // lookups on (userId, loggedAt) rather than scanning a user's entire history, regardless of how
  // long they've had the account (same "keep date-range queries bounded" concern documented on
  // dashboard.ts's STREAK_LOOKBACK_DAYS).
  const { start } = getDayRangeUtc(startDate, timezone);
  const { end } = getDayRangeUtc(endDate, timezone);
  const rangeWhere = { userId: req.userId, loggedAt: { gte: start, lt: end } };

  const [moodLogs, medicationLogs, categories, categoryLogs] = await Promise.all([
    prisma.moodLog.findMany({ where: rangeWhere, select: { mood: true, loggedAt: true } }),
    prisma.medicationLog.findMany({ where: rangeWhere, select: { loggedAt: true } }),
    // Every category visible to this user (their own + any system/admin ones) - fetched
    // regardless of period, so a numeric/scale category with zero logs *in this window* still
    // gets its own chart (an honest "not enough data yet" state), the same way the mood chart
    // already renders before a brand-new user has logged anything at all.
    prisma.category.findMany({
      where: { archivedAt: null, OR: [{ userId: null }, { userId: req.userId }] },
    }),
    prisma.categoryLog.findMany({
      where: rangeWhere,
      select: { categoryId: true, valueNumeric: true, loggedAt: true },
    }),
  ]);

  // Buckets a log array's values by the calendar day (in the user's timezone) each entry's
  // precise `loggedAt` instant falls on - the same "resolve to a day string, then group" approach
  // dashboard.ts uses for its streak's `loggedDates` set, just keeping each log's value alongside
  // the day instead of only the day itself. `activeDays` (below) is every day that shows up as a
  // key in *any* of the buckets, regardless of type - exactly the "distinct calendar days with
  // any entry" concept dashboard.ts's streak calculation already uses, just for the whole period
  // rather than a running streak.
  function bucketByDay<L extends { loggedAt: Date }, T>(logs: L[], value: (log: L) => T) {
    const map = new Map<string, T[]>();
    for (const log of logs) {
      const date = formatDateInTimezone(log.loggedAt, timezone);
      const bucket = map.get(date);
      if (bucket) bucket.push(value(log));
      else map.set(date, [value(log)]);
    }
    return map;
  }

  const moodByDay = bucketByDay(moodLogs, (log) => log.mood);

  const activeDays = new Set<string>();
  for (const dateSet of [
    moodByDay,
    bucketByDay(medicationLogs, () => true),
    // Any category log counts toward a day being "active" - including boolean/duration ones,
    // which get no chart of their own below (see categoryTrends) but still count the same way
    // dashboard.ts's streak and reminderScheduler.ts's hasLoggedTarget already treat them. This
    // also covers every former habit's and symptom's own activity now, since both unified into
    // Category (Phase 17) - see docs/log/17-unify-mood-symptom-habit.md.
    bucketByDay(categoryLogs, () => true),
  ]) {
    for (const date of dateSet.keys()) activeDays.add(date);
  }

  const moodSeries: DailyPoint[] = days.map((date) => {
    const values = moodByDay.get(date) ?? [];
    return { date, average: mean(values), count: values.length };
  });

  // Overall period average is the mean of every individual logged value in the window, not the
  // mean of the daily averages above - this keeps a day with three entries weighted three times
  // as heavily as a day with one, matching how a plain "average mood this period" reads
  // intuitively.
  const moodAverage = mean(moodLogs.map((log) => log.mood));

  // One chart per numeric/scale category (built-in or custom), mirroring moodSeries's own build -
  // boolean/duration categories get no chart here (former habits included, now that Habit unified
  // into Category - see docs/log/17-unify-mood-symptom-habit.md). Every former symptom is one of
  // these SCALE categories now too - each gets its own independent chart, replacing the single
  // combined "Symptom Severity" series this route used to compute across every symptom at once
  // (see this task's docs/log entry for that deliberate behavior change). `TrendLineChart` on the
  // frontend is reused directly for these (see docs/log/15-categories.md's Task 4 entry) - it's
  // already generic over domain/color/formatValue, so no new chart component is needed.
  const categoryLogsByCategoryId = new Map<string, typeof categoryLogs>();
  for (const log of categoryLogs) {
    const bucket = categoryLogsByCategoryId.get(log.categoryId);
    if (bucket) bucket.push(log);
    else categoryLogsByCategoryId.set(log.categoryId, [log]);
  }

  const categoryTrends = categories
    .filter((category) => category.valueType === "NUMERIC" || category.valueType === "SCALE")
    .map((category) => {
      // valueNumeric is the only column NUMERIC/SCALE categories ever populate (see
      // categoryLogs.ts's extractTypedValue) - the null-filter here is just to satisfy
      // TypeScript's own nullable column type, not a real runtime case for these two types.
      const logs = (categoryLogsByCategoryId.get(category.id) ?? []).filter(
        (log): log is typeof log & { valueNumeric: number } => log.valueNumeric !== null,
      );
      const byDay = bucketByDay(logs, (log) => log.valueNumeric);
      const series: DailyPoint[] = days.map((date) => {
        const values = byDay.get(date) ?? [];
        return { date, average: mean(values), count: values.length };
      });

      return {
        categoryId: category.id,
        name: category.name,
        icon: category.icon,
        valueType: toApiCategoryValueType(category.valueType),
        scaleMin: category.scaleMin,
        scaleMax: category.scaleMax,
        series,
        average: mean(logs.map((log) => log.valueNumeric)),
      };
    });

  res.json({
    period,
    startDate,
    endDate,
    days,
    mood: { series: moodSeries, average: moodAverage },
    categoryTrends,
    activity: {
      days: days.map((date) => ({ date, hasActivity: activeDays.has(date) })),
    },
  });
});
