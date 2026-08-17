import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { HabitType as PrismaHabitType } from "../generated/prisma/client";
import { toApiHabitType } from "../lib/habitType";

// Mirrors the three nullable columns on HabitLog (see schema.prisma) - the API accepts exactly
// the same three field names the database uses, so no separate translation layer is needed here
// the way habits.ts needs one for `type` (there's no lowercase/uppercase mismatch for these).
const valueFieldsSchema = z.object({
  valueBoolean: z.boolean().optional(),
  valueNumeric: z.number().finite().optional(),
  // Minutes can't be negative; fractional minutes aren't a meaningful unit for a duration habit
  // (e.g. "walked for 32.5 minutes" isn't how this app's durations are meant to be recorded), so
  // this is an integer, unlike valueNumeric which has no such natural constraint.
  valueDurationMinutes: z.number().int().nonnegative().optional(),
});
type ValueFields = z.infer<typeof valueFieldsSchema>;

const createSchema = valueFieldsSchema.extend({
  habitId: z.string().trim().min(1),
  notes: z.string().trim().min(1).optional(),
  loggedAt: z.string().datetime().optional(),
});

// habitId is deliberately not part of this schema - which habit a log belongs to isn't
// editable after creation, avoiding the question of what it would even mean to "move" a log
// with an already-validated value shape onto a habit of a possibly different type.
//
// `notes` additionally accepts an explicit `null` here (unlike `createSchema`'s notes, which
// only accepts a real string or absence) so clearing a previously-entered note during an edit
// actually clears it, instead of "not provided" (key absent) silently leaving the old value in
// place - same reasoning as moodLogs.ts/symptomLogs.ts/medicationLogs.ts.
const updateSchema = valueFieldsSchema.extend({
  notes: z.string().trim().min(1).optional().nullable(),
  loggedAt: z.string().datetime().optional(),
});

const VALUE_FIELD_BY_TYPE: Record<PrismaHabitType, keyof ValueFields> = {
  BOOLEAN: "valueBoolean",
  NUMERIC: "valueNumeric",
  DURATION: "valueDurationMinutes",
};

// The core type-aware validation this task exists for: given the parent habit's actual `type`
// (read fresh from the database, never trusted from the request) and whichever value fields the
// caller provided, confirms exactly the one field matching that type is present - a numeric
// habit logged with `valueBoolean` (or with two fields at once, or none at all) is rejected here,
// before anything ever reaches Prisma.
function extractTypedValue(
  habitType: PrismaHabitType,
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

  const expected = VALUE_FIELD_BY_TYPE[habitType];
  if (provided[0] !== expected) {
    return {
      ok: false,
      message: `This habit is type "${toApiHabitType(habitType)}", which expects "${expected}", but got "${provided[0]}"`,
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

export const habitLogsRouter = Router();

habitLogsRouter.get("/", async (req, res) => {
  const habitLogs = await prisma.habitLog.findMany({
    where: { userId: req.userId },
    orderBy: { loggedAt: "desc" },
  });
  res.json(habitLogs);
});

habitLogsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid habit log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { habitId, valueBoolean, valueNumeric, valueDurationMinutes, notes, loggedAt } =
    parsed.data;

  // The cross-cutting requirement for this whole phase: never trust a caller-supplied
  // habitId at face value. Scoping this lookup by userId (not just id) means a habitId
  // belonging to a different user is treated as "doesn't exist" - the exact same
  // ID-tampering defense the update/delete routes below (and moodLogs.ts before them) use,
  // applied here on create as well since this is the one place a foreign habitId first
  // enters the system.
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId: req.userId },
  });
  if (!habit) {
    return res.status(404).json({
      error: { message: "Habit not found", code: "HABIT_NOT_FOUND" },
    });
  }

  const extracted = extractTypedValue(habit.type, {
    valueBoolean,
    valueNumeric,
    valueDurationMinutes,
  });
  if (!extracted.ok) {
    return res.status(400).json({
      error: { message: extracted.message, code: "VALIDATION_ERROR" },
    });
  }

  const habitLog = await prisma.habitLog.create({
    data: {
      userId: req.userId as string,
      habitId: habit.id,
      ...extracted.data,
      notes,
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.status(201).json(habitLog);
});

habitLogsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid habit log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // findFirst scoped to userId, same "don't leak which case it is" reasoning as habits.ts and
  // moodLogs.ts - a log belonging to another user 404s exactly like one that doesn't exist.
  const existing = await prisma.habitLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { habit: true },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Habit log not found", code: "HABIT_LOG_NOT_FOUND" },
    });
  }

  const { valueBoolean, valueNumeric, valueDurationMinutes, notes, loggedAt } = parsed.data;
  let valuePatch = {};
  if (hasAnyValueField({ valueBoolean, valueNumeric, valueDurationMinutes })) {
    // habitId is immutable (see updateSchema above), so existing.habit.type - fetched via the
    // include above - is always the correct type to validate against, even on update.
    const extracted = extractTypedValue(existing.habit.type, {
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

  const habitLog = await prisma.habitLog.update({
    where: { id: existing.id },
    data: {
      ...valuePatch,
      ...(notes !== undefined ? { notes } : {}),
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.json(habitLog);
});

habitLogsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.habitLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Habit log not found", code: "HABIT_LOG_NOT_FOUND" },
    });
  }

  await prisma.habitLog.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});
