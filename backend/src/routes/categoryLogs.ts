import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { CategoryValueType as PrismaCategoryValueType } from "../generated/prisma/client";
import { toApiCategoryValueType } from "../lib/categoryValueType";
import { DEFAULT_LOG_LIST_LIMIT, fetchPage, paginationQuerySchema } from "../lib/pagination";

// Mirrors the three nullable columns on CategoryLog (see schema.prisma).
const valueFieldsSchema = z.object({
  valueBoolean: z.boolean().optional(),
  valueNumeric: z.number().finite().optional(),
  valueDurationMinutes: z.number().int().nonnegative().optional(),
});
type ValueFields = z.infer<typeof valueFieldsSchema>;

const createSchema = valueFieldsSchema.extend({
  categoryId: z.string().trim().min(1),
  notes: z.string().trim().min(1).optional(),
  loggedAt: z.string().datetime().optional(),
});

// categoryId is deliberately not part of this schema - same reasoning as habitLogs.ts's own
// updateSchema: which category a log belongs to isn't editable after creation.
//
// `notes` accepts an explicit `null` here (unlike createSchema's) so clearing a previously
// entered note during an edit actually clears it, matching every other log type's own edit
// schema in this codebase.
const updateSchema = valueFieldsSchema.extend({
  notes: z.string().trim().min(1).optional().nullable(),
  loggedAt: z.string().datetime().optional(),
});

// SCALE shares NUMERIC's storage column (valueNumeric) - the two differ only in whether a
// min/max bound is enforced at write time (see extractTypedValue below), not in which column is
// populated.
const VALUE_FIELD_BY_TYPE: Record<PrismaCategoryValueType, keyof ValueFields> = {
  BOOLEAN: "valueBoolean",
  NUMERIC: "valueNumeric",
  SCALE: "valueNumeric",
  DURATION: "valueDurationMinutes",
};

// The core type-aware validation this module exists for: given the parent category's actual
// valueType (and, for SCALE, its own scaleMin/scaleMax - all read fresh from the database, never
// trusted from the request) and whichever value fields the caller provided, confirms exactly one
// field matching that type is present and, for SCALE, within bounds.
function extractTypedValue(
  category: {
    valueType: PrismaCategoryValueType;
    scaleMin: number | null;
    scaleMax: number | null;
  },
  fields: ValueFields,
):
  | {
      ok: true;
      data: {
        valueBoolean: boolean | null;
        valueNumeric: number | null;
        valueDurationMinutes: number | null;
      };
    }
  | { ok: false; message: string } {
  const provided = (["valueBoolean", "valueNumeric", "valueDurationMinutes"] as const).filter(
    (key) => fields[key] !== undefined,
  );

  if (provided.length === 0) {
    return {
      ok: false,
      message:
        "A value is required: exactly one of valueBoolean, valueNumeric, valueDurationMinutes",
    };
  }
  if (provided.length > 1) {
    return {
      ok: false,
      message: `Only one value field may be set at a time, got: ${provided.join(", ")}`,
    };
  }

  const expected = VALUE_FIELD_BY_TYPE[category.valueType];
  if (provided[0] !== expected) {
    return {
      ok: false,
      message: `This category is type "${toApiCategoryValueType(category.valueType)}", which expects "${expected}", but got "${provided[0]}"`,
    };
  }

  if (
    category.valueType === "SCALE" &&
    fields.valueNumeric !== undefined &&
    category.scaleMin !== null &&
    category.scaleMax !== null &&
    (fields.valueNumeric < category.scaleMin || fields.valueNumeric > category.scaleMax)
  ) {
    return {
      ok: false,
      message: `Value must be between ${category.scaleMin} and ${category.scaleMax}`,
    };
  }

  return {
    ok: true,
    data: {
      valueBoolean: fields.valueBoolean ?? null,
      valueNumeric: fields.valueNumeric ?? null,
      valueDurationMinutes: fields.valueDurationMinutes ?? null,
    },
  };
}

function hasAnyValueField(fields: ValueFields): boolean {
  return (
    fields.valueBoolean !== undefined ||
    fields.valueNumeric !== undefined ||
    fields.valueDurationMinutes !== undefined
  );
}

// Optional `categoryId` filter (Phase 18) - lets a per-category Dashboard card page through just
// its own history, independently of every other category's logs, rather than the combined list
// the bare (unfiltered) query already serves.
const listQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().trim().min(1).optional(),
});

export const categoryLogsRouter = Router();

categoryLogsRouter.get("/", async (req, res) => {
  const parsedQuery = listQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: {
        message: "Invalid category log query",
        code: "VALIDATION_ERROR",
        details: parsedQuery.error.flatten().fieldErrors,
      },
    });
  }
  const { limit = DEFAULT_LOG_LIST_LIMIT, offset = 0, categoryId } = parsedQuery.data;

  const page = await fetchPage(
    ({ take, skip }) =>
      prisma.categoryLog.findMany({
        where: { userId: req.userId, ...(categoryId ? { categoryId } : {}) },
        orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
    limit,
    offset,
  );

  res.json(page);
});

// A single log by id - added for Timeline's own "tap a logged row to edit it" quick action
// (docs/log/50-timeline-v2.md). Nothing before this route needed to fetch one log in isolation:
// PATCH/DELETE already take an id but return either the updated row or a bare confirmation, never
// a plain "give me this one back" read, and the list route above only ever returns pages. Auth-
// scoped the same way PATCH/DELETE already are - a 404, not a 403, for another user's log, so a
// guessed id never confirms whether it exists at all.
categoryLogsRouter.get("/:id", async (req, res) => {
  const log = await prisma.categoryLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!log) {
    return res.status(404).json({
      error: { message: "Category log not found", code: "CATEGORY_LOG_NOT_FOUND" },
    });
  }
  res.json(log);
});

categoryLogsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid category log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { categoryId, valueBoolean, valueNumeric, valueDurationMinutes, notes, loggedAt } =
    parsed.data;

  // A category log can be created against a system category (userId null) or the caller's own -
  // never against another user's personal category. Mirrors Symptom's own read-scoping, applied
  // here as the write-time ID-tampering defense every other log route already establishes for
  // its own parent reference.
  const category = await prisma.category.findFirst({
    where: { id: categoryId, archivedAt: null, OR: [{ userId: null }, { userId: req.userId }] },
  });
  if (!category) {
    return res.status(404).json({
      error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
    });
  }

  const extracted = extractTypedValue(category, {
    valueBoolean,
    valueNumeric,
    valueDurationMinutes,
  });
  if (!extracted.ok) {
    return res.status(400).json({
      error: { message: extracted.message, code: "VALIDATION_ERROR" },
    });
  }

  const categoryLog = await prisma.categoryLog.create({
    data: {
      userId: req.userId as string,
      categoryId: category.id,
      ...extracted.data,
      notes,
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.status(201).json(categoryLog);
});

categoryLogsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid category log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const existing = await prisma.categoryLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { category: true },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Category log not found", code: "CATEGORY_LOG_NOT_FOUND" },
    });
  }

  const { valueBoolean, valueNumeric, valueDurationMinutes, notes, loggedAt } = parsed.data;
  let valuePatch = {};
  if (hasAnyValueField({ valueBoolean, valueNumeric, valueDurationMinutes })) {
    // categoryId is immutable (see updateSchema above), so existing.category - fetched via the
    // include above - is always the correct category to validate against, even on update.
    const extracted = extractTypedValue(existing.category, {
      valueBoolean,
      valueNumeric,
      valueDurationMinutes,
    });
    if (!extracted.ok) {
      return res.status(400).json({
        error: { message: extracted.message, code: "VALIDATION_ERROR" },
      });
    }
    valuePatch = extracted.data;
  }

  const categoryLog = await prisma.categoryLog.update({
    where: { id: existing.id },
    data: {
      ...valuePatch,
      ...(notes !== undefined ? { notes } : {}),
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.json(categoryLog);
});

categoryLogsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.categoryLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Category log not found", code: "CATEGORY_LOG_NOT_FOUND" },
    });
  }

  await prisma.categoryLog.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});
