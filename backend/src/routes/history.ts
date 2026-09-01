import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { CategoryValueType as PrismaCategoryValueType } from "../generated/prisma/client";
import {
  addDaysToDateStr,
  formatDateInTimezone,
  getDayRangeUtc,
  timeInTimezone,
  todayInTimezone,
} from "../lib/timezone";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// The same three choices Timeline's own range chips offer (see frontend's lib/timeline.ts
// TIMELINE_RANGES) - lets Timeline ask "everything logged in the last N days" the same way it
// already asks /api/reminders/recent and /api/tasks, without having to compute a from/to date
// string itself (see docs/log/55-timeline-shows-all-logged.md for why that matters: the server
// always resolves calendar-day boundaries against the account's own timezone, never the client).
// Purely additive alongside from/to, which every existing caller (History's own filters) keeps
// using unchanged - days is only consulted when from is absent.
const DAY_OPTIONS = ["1", "3", "7"] as const;

const querySchema = z.object({
  from: z.string().regex(DATE_ONLY, "from must be YYYY-MM-DD").optional(),
  to: z.string().regex(DATE_ONLY, "to must be YYYY-MM-DD").optional(),
  days: z.enum(DAY_OPTIONS).optional(),
  // Narrows results to one category's own entries - mirrors categoryLogs.ts's identical
  // Phase 18 addition. Replaces the old `?type=` filter (medication vs. category), which stopped
  // meaning anything once every entry became a category (see
  // docs/log/19-medication-to-category.md) - filtering by the actual category is what a user
  // wanting to isolate e.g. just "Ibuprofen" or just "Reading" actually needs.
  categoryId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

interface HistoryEntry {
  id: string;
  categoryName: string;
  // Split from a single pre-joined `label` string (was `"Sertraline: Done"`) into its own
  // structured fields - the exact "real field on the response instead" this route's own
  // formatting comment used to point at as unaddressed. The frontend needs the name and value
  // apart to render History's rows the way Timeline already renders a reminder row: the name as
  // the row's own text, the value as a separate pill (see docs/log/53-history-redesign.md).
  categoryIcon: string | null;
  value: string;
  notes: string | null;
  loggedAt: string;
  // Resolved against the account's own timezone here, once - added for Timeline (see
  // docs/log/55-timeline-shows-all-logged.md), which needs pre-formatted date/time strings the
  // same way every other row it merges already provides them, rather than deriving them
  // client-side from loggedAt. History's own frontend still computes its own day-grouping key
  // from loggedAt directly (deliberately, in the browser's local timezone - see HistoryPage.tsx's
  // own comment) and simply ignores these two fields; nothing about its existing behaviour
  // changes.
  date: string;
  time: string;
}

// Mirrors dashboard.ts's identical formatCategoryLogValue - see there for why SCALE renders as
// "value/max" instead of a bare number.
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

export const historyRouter = Router();

historyRouter.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid history query",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const {
    from: explicitFrom,
    to,
    days,
    categoryId,
    limit = DEFAULT_LIMIT,
    offset = 0,
  } = parsed.data;

  if (explicitFrom && to && explicitFrom > to) {
    return res.status(400).json({
      error: { message: "`from` must not be after `to`", code: "VALIDATION_ERROR" },
    });
  }

  const userId = req.userId as string;

  // Looked up unconditionally (not just when from/to are present) so this route treats a
  // deleted-but-still-tokened caller the same way dashboard.ts/trends.ts/users.ts/export.ts all
  // already do - a genuine 404, not silently falling back to a default timezone and serving
  // whatever's left of a request that arrived after the underlying account was gone.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) {
    return res.status(404).json({
      error: { message: "User not found", code: "USER_NOT_FOUND" },
    });
  }

  // `from`/`to` are calendar-day strings with no timezone of their own (the same "YYYY-MM-DD,
  // resolved against *this user's* timezone" convention dashboard.ts/trends.ts already use via
  // getDayRangeUtc, not a raw UTC date). Using plain UTC midnight boundaries here instead (an
  // earlier version of this route did) would shift the effective window by the user's UTC
  // offset - wrongly pulling in some of the *previous* day's entries and excluding some of the
  // *requested* day's own entries for anyone not in UTC, exactly the class of bug Phase 1's
  // "always compute which calendar day using the user's own timezone" requirement exists to
  // prevent.
  const userTimezone = user.timezone;

  // `days`, when given, computes a default `from` the same "N calendar days back, through today"
  // way Timeline's own /api/reminders/recent and /api/tasks already do (see TIMELINE_RANGES) -
  // only when the caller hasn't already given an explicit `from` of their own (History's own
  // filters always pass one directly; Timeline always passes `days` instead). Never extends `to`
  // into the future the way those two do, since a category log has no "upcoming" half to show -
  // it only ever has a real, already-passed loggedAt.
  const from =
    explicitFrom ??
    (days ? addDaysToDateStr(todayInTimezone(userTimezone), -(Number(days) - 1)) : undefined);

  const dateFilter =
    from || to
      ? {
          loggedAt: {
            ...(from ? { gte: getDayRangeUtc(from, userTimezone).start } : {}),
            ...(to ? { lt: getDayRangeUtc(to, userTimezone).end } : {}),
          },
        }
      : {};

  // Every log is a category log now that Medication has unified into Category too (see
  // docs/log/19-medication-to-category.md) - a single, already-sorted query with a plain
  // offset/limit is enough; the old two-table k-way in-memory merge this route used to need
  // (medication logs and category logs living in separate tables) no longer applies.
  const categoryLogs = await prisma.categoryLog.findMany({
    // `categoryId` is applied underneath the same `userId` scope regardless of what's passed -
    // the same defense categoryLogs.ts's own `?categoryId=` filter already relies on, so an
    // arbitrary or shared system category id can never leak another user's data, it just returns
    // however many of the caller's own logs match.
    where: { userId, ...(categoryId ? { categoryId } : {}), ...dateFilter },
    // `id` as a secondary sort key: two logs sharing the exact same `loggedAt` (e.g. both
    // backfilled to the same instant) otherwise have no guaranteed relative order across separate
    // requests, which would make pagination non-deterministic.
    orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    skip: offset,
    include: { category: { select: { name: true, icon: true, valueType: true, scaleMax: true } } },
  });

  const hasMore = categoryLogs.length > limit;
  const entries: HistoryEntry[] = categoryLogs.slice(0, limit).map((log) => ({
    id: log.id,
    categoryName: log.category.name,
    categoryIcon: log.category.icon,
    value: formatCategoryLogValue(log),
    notes: log.notes,
    loggedAt: log.loggedAt.toISOString(),
    date: formatDateInTimezone(log.loggedAt, userTimezone),
    time: timeInTimezone(log.loggedAt, userTimezone),
  }));

  res.json({ entries, limit, offset, hasMore });
});
