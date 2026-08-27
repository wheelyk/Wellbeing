import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { CategoryValueType as PrismaCategoryValueType } from "../generated/prisma/client";
import { getDayRangeUtc } from "../lib/timezone";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const querySchema = z.object({
  from: z.string().regex(DATE_ONLY, "from must be YYYY-MM-DD").optional(),
  to: z.string().regex(DATE_ONLY, "to must be YYYY-MM-DD").optional(),
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
  label: string;
  notes: string | null;
  loggedAt: string;
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

  const { from, to, categoryId, limit = DEFAULT_LIMIT, offset = 0 } = parsed.data;

  if (from && to && from > to) {
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
    include: { category: { select: { name: true, valueType: true, scaleMax: true } } },
  });

  const hasMore = categoryLogs.length > limit;
  const entries: HistoryEntry[] = categoryLogs.slice(0, limit).map((log) => ({
    id: log.id,
    label: `${log.category.name}: ${formatCategoryLogValue(log)}`,
    notes: log.notes,
    loggedAt: log.loggedAt.toISOString(),
  }));

  res.json({ entries, limit, offset, hasMore });
});
