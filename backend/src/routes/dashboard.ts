import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { formatDateInTimezone, getDayRangeUtc, todayInTimezone } from "../lib/timezone";
import { calculateStreak } from "../lib/streak";
import { DEFAULT_LOG_LIST_LIMIT, paginationQuerySchema } from "../lib/pagination";

// How far back to look for the streak calculation. Unbounded would mean scanning a user's
// entire history on every dashboard load, which only gets slower the longer someone uses the
// app - the same "keep date-range queries bounded" concern Tasks.md's Phase 4 cross-cutting
// item calls out. 90 days comfortably covers any realistic "currently active" streak (this
// app's own Trends feature, per requirements §10, tops out at a 90-day period too) while
// keeping the query cheap regardless of account age.
const STREAK_LOOKBACK_DAYS = 90;

const querySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format")
      .optional(),
  })
  .merge(paginationQuerySchema);

type RecentEntryType = "mood" | "symptom" | "medication" | "habit";

interface RecentEntry {
  type: RecentEntryType;
  label: string;
  value: string;
  loggedAt: string;
}

function formatHabitValue(log: {
  valueBoolean: boolean | null;
  valueNumeric: number | null;
  valueDurationMinutes: number | null;
}): string {
  if (log.valueBoolean !== null) return log.valueBoolean ? "Done" : "Not done";
  if (log.valueNumeric !== null) return `${log.valueNumeric}`;
  if (log.valueDurationMinutes !== null) return `${log.valueDurationMinutes} min`;
  return "—";
}

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req, res) => {
  const parsedQuery = querySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: {
        message: "Invalid dashboard query",
        code: "VALIDATION_ERROR",
        details: parsedQuery.error.flatten().fieldErrors,
      },
    });
  }

  // req.userId only carries the id (see requireAuth.ts) - the user's timezone lives on their
  // own row, so it has to be fetched before "today" can be resolved at all.
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

  // The resolved date doubles as both "which day's summary to show" *and* the streak's
  // reference point for "today" - deliberately, so the entire response is a pure function of
  // this one date and can be tested (and, if ever needed, browsed by the frontend) for any
  // fixed day, not just whatever the wall clock says right now.
  const date = parsedQuery.data.date ?? todayInTimezone(user.timezone);
  const { start, end } = getDayRangeUtc(date, user.timezone);
  const { limit: recentEntriesLimit = DEFAULT_LOG_LIST_LIMIT, offset: recentEntriesOffset = 0 } =
    parsedQuery.data;

  const [latestMood, symptomCount, medicationLogsToday, habitLogsToday, totalHabits] =
    await Promise.all([
      prisma.moodLog.findFirst({
        where: { userId: req.userId, loggedAt: { gte: start, lt: end } },
        orderBy: { loggedAt: "desc" },
      }),
      prisma.symptomLog.count({
        where: { userId: req.userId, loggedAt: { gte: start, lt: end } },
      }),
      prisma.medicationLog.findMany({
        where: { userId: req.userId, loggedAt: { gte: start, lt: end } },
        select: { taken: true },
      }),
      prisma.habitLog.findMany({
        where: { userId: req.userId, loggedAt: { gte: start, lt: end } },
        select: { habitId: true },
      }),
      prisma.habit.count({ where: { userId: req.userId } }),
    ]);

  const medicationSummary = {
    taken: medicationLogsToday.filter((log) => log.taken).length,
    total: medicationLogsToday.length,
  };

  const habitSummary = {
    // Distinct habits with at least one log today, not raw log count - logging the same habit
    // twice in a day shouldn't inflate "how many of my habits did I touch today."
    loggedCount: new Set(habitLogsToday.map((log) => log.habitId)).size,
    totalHabits,
  };

  // Merging four separately-sorted, separately-paginated tables into one time-ordered page can't
  // just `take: limit, skip: offset` any single table - the entry at merged position `offset` might
  // come from any of the four. Instead, each table is asked for enough of its own most-recent rows
  // to cover the worst case where a single type accounts for every entry up to and including one
  // past the requested page (`offset + limit + 1`, the same N+1 "is there more?" trick as
  // `fetchPage` in lib/pagination.ts, just applied before the merge instead of after).
  const perTypeFetch = recentEntriesOffset + recentEntriesLimit + 1;

  const [recentMood, recentSymptoms, recentMedications, recentHabits] = await Promise.all([
    prisma.moodLog.findMany({
      where: { userId: req.userId },
      orderBy: { loggedAt: "desc" },
      take: perTypeFetch,
    }),
    prisma.symptomLog.findMany({
      where: { userId: req.userId },
      orderBy: { loggedAt: "desc" },
      take: perTypeFetch,
      include: { symptom: { select: { name: true } } },
    }),
    prisma.medicationLog.findMany({
      where: { userId: req.userId },
      orderBy: { loggedAt: "desc" },
      take: perTypeFetch,
      include: { medication: { select: { name: true } } },
    }),
    prisma.habitLog.findMany({
      where: { userId: req.userId },
      orderBy: { loggedAt: "desc" },
      take: perTypeFetch,
      include: { habit: { select: { name: true } } },
    }),
  ]);

  const mergedRecentEntries: RecentEntry[] = [
    ...recentMood.map((log): RecentEntry => ({
      type: "mood",
      label: "Mood",
      value: `${log.mood}/5`,
      loggedAt: log.loggedAt.toISOString(),
    })),
    ...recentSymptoms.map((log): RecentEntry => ({
      type: "symptom",
      label: log.symptom.name,
      value: `${log.severity}/10`,
      loggedAt: log.loggedAt.toISOString(),
    })),
    ...recentMedications.map((log): RecentEntry => ({
      type: "medication",
      label: log.medication.name,
      value: log.taken ? "Taken" : "Not taken",
      loggedAt: log.loggedAt.toISOString(),
    })),
    ...recentHabits.map((log): RecentEntry => ({
      type: "habit",
      label: log.habit.name,
      value: formatHabitValue(log),
      loggedAt: log.loggedAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());

  const recentEntries = {
    entries: mergedRecentEntries.slice(
      recentEntriesOffset,
      recentEntriesOffset + recentEntriesLimit,
    ),
    limit: recentEntriesLimit,
    offset: recentEntriesOffset,
    hasMore: mergedRecentEntries.length > recentEntriesOffset + recentEntriesLimit,
  };

  // Every entry (of any of the four types) in the lookback window, reduced to just the set of
  // distinct calendar days (in the user's timezone) it falls on - exactly what the pure
  // `calculateStreak` function needs, and nothing more. Only `loggedAt` is selected from each
  // table since that's all this calculation uses.
  const lookbackStart = new Date(start.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const lookbackWhere = { userId: req.userId, loggedAt: { gte: lookbackStart, lt: end } };
  const [moodDates, symptomDates, medicationDates, habitDates] = await Promise.all([
    prisma.moodLog.findMany({ where: lookbackWhere, select: { loggedAt: true } }),
    prisma.symptomLog.findMany({ where: lookbackWhere, select: { loggedAt: true } }),
    prisma.medicationLog.findMany({ where: lookbackWhere, select: { loggedAt: true } }),
    prisma.habitLog.findMany({ where: lookbackWhere, select: { loggedAt: true } }),
  ]);

  const loggedDates = new Set<string>();
  for (const log of [...moodDates, ...symptomDates, ...medicationDates, ...habitDates]) {
    loggedDates.add(formatDateInTimezone(log.loggedAt, user.timezone));
  }

  const streak = calculateStreak(loggedDates, date);

  res.json({
    date,
    mood: latestMood,
    symptomCount,
    medicationSummary,
    habitSummary,
    recentEntries,
    streak,
  });
});
