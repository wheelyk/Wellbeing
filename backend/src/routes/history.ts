import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { CategoryValueType as PrismaCategoryValueType } from "../generated/prisma/client";
import { getDayRangeUtc } from "../lib/timezone";

const HISTORY_TYPES = ["medication", "category"] as const;
type HistoryType = (typeof HISTORY_TYPES)[number];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const querySchema = z.object({
  type: z.enum(HISTORY_TYPES).optional(),
  from: z.string().regex(DATE_ONLY, "from must be YYYY-MM-DD").optional(),
  to: z.string().regex(DATE_ONLY, "to must be YYYY-MM-DD").optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

interface HistoryEntry {
  id: string;
  type: HistoryType;
  label: string;
  notes: string | null;
  loggedAt: string;
}

function medicationLabel(name: string, dosage: string | null, taken: boolean): string {
  const base = dosage ? `${name} — ${dosage}` : name;
  return `${base} — ${taken ? "Taken" : "Not taken"}`;
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

  const { type, from, to, limit = DEFAULT_LIMIT, offset = 0 } = parsed.data;

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

  const wantsType = (t: HistoryType) => !type || type === t;

  // Pagination strategy (see IMPLEMENTATION_LOG.md's history entry for the full write-up):
  // offset-based, applied *after* merging two independently-sorted per-type queries rather than a
  // single SQL query, since medication/category logs live in two separate tables with no shared
  // "all entries" table to page over directly. Each table is queried for its own `desc` order and
  // capped at `offset + limit + 1` rows - enough for the merge below to produce a correct
  // top-(offset+limit) result (a standard k-way merge of sorted streams), with the "+1"
  // specifically so `hasMore` can be computed exactly rather than guessed at.
  const fetchCap = offset + limit + 1;

  const [medicationLogs, categoryLogs] = await Promise.all([
    wantsType("medication")
      ? prisma.medicationLog.findMany({
          where: { userId, ...dateFilter },
          // `id` as a secondary sort key: the in-memory merge below already breaks loggedAt ties
          // by id for the *final* ordering, but that alone doesn't help if the DB-level
          // `take: fetchCap` cutoff itself non-deterministically chose *which* tied rows survived
          // to reach that merge in the first place - the tiebreak needs to happen at the query
          // level too.
          orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
          take: fetchCap,
          include: { medication: true },
        })
      : Promise.resolve([]),
    wantsType("category")
      ? prisma.categoryLog.findMany({
          where: { userId, ...dateFilter },
          // `id` as a secondary sort key - see the identical reasoning on the medication query
          // above.
          orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
          take: fetchCap,
          include: { category: { select: { name: true, valueType: true, scaleMax: true } } },
        })
      : Promise.resolve([]),
  ]);

  const entries: HistoryEntry[] = [
    ...medicationLogs.map((log) => ({
      id: log.id,
      type: "medication" as const,
      label: medicationLabel(log.medication.name, log.medication.dosage, log.taken),
      notes: log.notes,
      loggedAt: log.loggedAt.toISOString(),
    })),
    ...categoryLogs.map((log) => ({
      id: log.id,
      type: "category" as const,
      label: `${log.category.name}: ${formatCategoryLogValue(log)}`,
      notes: log.notes,
      loggedAt: log.loggedAt.toISOString(),
    })),
  ];

  // Merge-sort by loggedAt desc; ties (e.g. two entries backfilled to the exact same instant)
  // broken by id so the ordering - and therefore pagination - is deterministic across requests.
  entries.sort((a, b) => {
    const diff = new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime();
    if (diff !== 0) return diff;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  const page = entries.slice(offset, offset + limit);
  const hasMore = entries.length > offset + limit;

  res.json({ entries: page, limit, offset, hasMore });
});
