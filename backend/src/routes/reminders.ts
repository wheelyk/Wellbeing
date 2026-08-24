import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { ReminderTarget as PrismaReminderTarget } from "../generated/prisma/client";
import {
  API_REMINDER_TARGETS,
  toApiReminderTarget,
  toPrismaReminderTarget,
} from "../lib/reminderTarget";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
// A generous cap, not a real limit anyone should hit - guards against a runaway request rather
// than a genuine product constraint (see routes/categories.ts's icon length cap for the same
// kind of defensive-not-restrictive bound).
const MAX_TIMES = 6;

const timesSchema = z
  .array(z.string().regex(TIME_REGEX, "Must be a valid 24-hour HH:mm time"))
  .min(1, "At least one time is required")
  .max(MAX_TIMES, `At most ${MAX_TIMES} times are allowed`)
  // Deduped and sorted server-side - the frontend's own repeatable time-input list doesn't need
  // to enforce either itself, and a stable order makes the reminders list read sensibly without
  // the frontend re-sorting what it gets back.
  .transform((times) => [...new Set(times)].sort());

const createSchema = z
  .object({
    target: z.enum(API_REMINDER_TARGETS),
    medicationId: z.string().trim().min(1).optional(),
    categoryId: z.string().trim().min(1).optional(),
    times: timesSchema,
  })
  .refine(
    (data) => {
      if (data.target === "medication") return !!data.medicationId && !data.categoryId;
      if (data.target === "category") return !!data.categoryId && !data.medicationId;
      return !data.medicationId && !data.categoryId;
    },
    {
      message:
        'medicationId is required (and categoryId forbidden) for target "medication"; categoryId is required (and medicationId forbidden) for target "category"; neither is allowed for any other target',
      path: ["target"],
    },
  );

// target/medicationId/categoryId are deliberately not part of this schema - immutable after
// creation, the same reasoning as Habit.type: what a reminder is *about* isn't something that
// makes sense to change after the fact, only whether it's on and when it fires.
const updateSchema = z
  .object({
    times: timesSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

const REMINDER_INCLUDE = {
  medication: { select: { name: true, dosage: true } },
  category: { select: { name: true, icon: true } },
} as const;

// Shapes a raw Prisma Reminder row (SCREAMING_CASE target, plus the joined medication/category)
// into the JSON the API actually returns - mirrors habitType.ts's serializeHabit/
// categoryValueType.ts's serializeCategory.
function serializeReminder<
  T extends {
    target: PrismaReminderTarget;
    medication: { name: string; dosage: string | null } | null;
    category: { name: string; icon: string | null } | null;
  },
>(reminder: T): Omit<T, "target"> & { target: string } {
  return { ...reminder, target: toApiReminderTarget(reminder.target) };
}

export const remindersRouter = Router();

remindersRouter.get("/", async (req, res) => {
  const reminders = await prisma.reminder.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
    include: REMINDER_INCLUDE,
  });
  res.json(reminders.map(serializeReminder));
});

remindersRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid reminder",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { target, medicationId, categoryId, times } = parsed.data;
  const prismaTarget = toPrismaReminderTarget(target);

  // ID-tampering defense - the same pattern every other route with a foreign reference already
  // uses: scope the lookup by ownership/visibility before ever trusting the id in the request.
  if (target === "medication") {
    const medication = await prisma.medication.findFirst({
      where: { id: medicationId, userId: req.userId },
    });
    if (!medication) {
      return res.status(404).json({
        error: { message: "Medication not found", code: "MEDICATION_NOT_FOUND" },
      });
    }
  } else if (target === "category") {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, archivedAt: null, OR: [{ userId: null }, { userId: req.userId }] },
    });
    if (!category) {
      return res.status(404).json({
        error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
      });
    }
  }

  // At most one reminder per (user, target, medicationId-or-categoryId) - an app-level check,
  // not a DB constraint, matching this codebase's established preference for this class of
  // invariant (see e.g. HabitLog's own "exactly one value column" check in habitLogs.ts).
  const existing = await prisma.reminder.findFirst({
    where: {
      userId: req.userId,
      target: prismaTarget,
      medicationId: medicationId ?? null,
      categoryId: categoryId ?? null,
    },
  });
  if (existing) {
    return res.status(409).json({
      error: { message: "A reminder for this already exists", code: "REMINDER_ALREADY_EXISTS" },
    });
  }

  const reminder = await prisma.reminder.create({
    data: {
      userId: req.userId as string,
      target: prismaTarget,
      medicationId: medicationId ?? null,
      categoryId: categoryId ?? null,
      times,
    },
    include: REMINDER_INCLUDE,
  });

  res.status(201).json(serializeReminder(reminder));
});

remindersRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid reminder",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // findFirst scoped to userId (not just findUnique by id) so another user's reminder 404s
  // instead of confirming its existence via a 403 - same "don't leak which case it is" principle
  // used throughout this codebase.
  const existing = await prisma.reminder.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Reminder not found", code: "REMINDER_NOT_FOUND" },
    });
  }

  const reminder = await prisma.reminder.update({
    where: { id: existing.id },
    data: parsed.data,
    include: REMINDER_INCLUDE,
  });

  res.json(serializeReminder(reminder));
});

remindersRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.reminder.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Reminder not found", code: "REMINDER_NOT_FOUND" },
    });
  }

  // A real hard delete, unlike Category - a Reminder has no historical value of its own once
  // removed (unlike a log, there's nothing a user would ever want to look back on).
  await prisma.reminder.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});
