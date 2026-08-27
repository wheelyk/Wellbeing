import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { CategoryValueType as PrismaCategoryValueType } from "../generated/prisma/client";
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

interface RecentEntry {
  label: string;
  value: string;
  loggedAt: string;
  categoryId: string;
  icon: string | null;
}

// Exactly one of valueBoolean/valueNumeric/valueDurationMinutes is populated, matching the
// parent Category's own valueType - SCALE shares NUMERIC's storage column, formatted as
// "value/max" when the category's own scaleMax is known - the same rendering Mood and Symptom
// each used their own fixed scale for before both unified into Category (e.g. "4/5", "7/10").
function formatCategoryLogValue(log: {
  valueBoolean: boolean | null;
  valueNumeric: number | null;
  valueDurationMinutes: number | null;
  category: { valueType: PrismaCategoryValueType; scaleMax: number | null };
}): string {
  if (log.valueBoolean !== null) return log.valueBoolean ? "Done" : "Not done";
  if (log.valueDurationMinutes !== null) return `${log.valueDurationMinutes} min`;
  if (log.valueNumeric !== null) {
    if (log.category.valueType === "SCALE" && log.category.scaleMax !== null) {
      return `${log.valueNumeric}/${log.category.scaleMax}`;
    }
    return `${log.valueNumeric}`;
  }
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

  // Every log is a category log now that Medication has unified into Category too (see
  // docs/log/19-medication-to-category.md) - a plain count, not a "taken/total" breakdown, since
  // an unbounded, user-extensible category set has no fixed "how many were there to log today"
  // denominator the way the original built-ins did. This is the frontend's sole signal for
  // whether to show "Nothing logged yet today" at all (see DashboardSummary.tsx).
  const loggedTodayCount = await prisma.categoryLog.count({
    where: { userId: req.userId, loggedAt: { gte: start, lt: end } },
  });

  const recentCategories = await prisma.categoryLog.findMany({
    where: { userId: req.userId },
    orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
    take: recentEntriesOffset + recentEntriesLimit + 1,
    include: {
      category: { select: { name: true, icon: true, valueType: true, scaleMax: true } },
    },
  });

  const recentEntries = {
    entries: recentCategories
      .slice(recentEntriesOffset, recentEntriesOffset + recentEntriesLimit)
      .map((log): RecentEntry => ({
        label: log.category.name,
        value: formatCategoryLogValue(log),
        loggedAt: log.loggedAt.toISOString(),
        categoryId: log.categoryId,
        icon: log.category.icon,
      })),
    limit: recentEntriesLimit,
    offset: recentEntriesOffset,
    hasMore: recentCategories.length > recentEntriesOffset + recentEntriesLimit,
  };

  // Every category log in the lookback window, reduced to just the set of distinct calendar days
  // (in the user's timezone) it falls on - exactly what the pure `calculateStreak` function needs,
  // and nothing more. Only `loggedAt` is selected since that's all this calculation uses.
  const lookbackStart = new Date(start.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const categoryDates = await prisma.categoryLog.findMany({
    where: { userId: req.userId, loggedAt: { gte: lookbackStart, lt: end } },
    select: { loggedAt: true },
  });

  const loggedDates = new Set<string>();
  for (const log of categoryDates) {
    loggedDates.add(formatDateInTimezone(log.loggedAt, user.timezone));
  }

  const streak = calculateStreak(loggedDates, date);

  res.json({
    date,
    loggedTodayCount,
    recentEntries,
    streak,
  });
});
