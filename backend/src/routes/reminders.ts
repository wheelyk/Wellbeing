import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { ReminderTarget as PrismaReminderTarget } from "../generated/prisma/client";
import {
  API_REMINDER_TARGETS,
  toApiReminderTarget,
  toPrismaReminderTarget,
} from "../lib/reminderTarget";
import { cronValidationError, nextRunsForSchedules } from "../lib/cron";
import { addDaysToDateStr, todayInTimezone } from "../lib/timezone";

// A generous cap, not a real limit anyone should hit - guards against a runaway request rather
// than a genuine product constraint (see routes/categories.ts's icon length cap for the same kind
// of defensive-not-restrictive bound). This bounds the number of *expressions*; cron.ts's own
// MAX_SLOTS_PER_EXPRESSION separately bounds how often any single one of them may fire.
//
// Raised from 6 once the picker gained multiple schedule rules per reminder (see
// docs/log/27-multiple-schedules-per-reminder.md): rules multiply expressions, so a UI cap of
// four rules with a few times each needs more headroom than a single rule ever did.
const MAX_SCHEDULES = 12;

// Enough to show the shape of a schedule (a two-rule weekday/weekend pattern needs more than one
// to be recognisable) without turning a confirmation line into a list.
const PREVIEW_RUN_COUNT = 3;

const schedulesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "A schedule can't be empty")
      // Validated with the same parser the scheduler itself uses (see lib/cron.ts), so anything
      // accepted here is guaranteed to be something the scheduler can expand later - there is
      // deliberately no second, looser notion of "valid" anywhere. The parser's own message is
      // surfaced rather than a generic "invalid schedule", so the user is told which field is
      // wrong and why.
      .superRefine((expression, ctx) => {
        const error = cronValidationError(expression);
        if (error) ctx.addIssue({ code: "custom", message: error });
      }),
  )
  .min(1, "At least one schedule is required")
  .max(MAX_SCHEDULES, `At most ${MAX_SCHEDULES} schedules are allowed`)
  // Deduped, but deliberately *not* sorted - unlike the times[] this replaced. Sorting "HH:mm"
  // strings happened to produce chronological order, which is why the old schema did it; sorting
  // cron expressions lexicographically produces nothing meaningful ("0 15 * * *" lands before
  // "0 9 * * *"), so it would reorder the user's list for no benefit. Input order is preserved
  // instead, so what someone entered is the order they see when they come back.
  .transform((schedules) => [...new Set(schedules)]);

const createSchema = z
  .object({
    target: z.enum(API_REMINDER_TARGETS),
    categoryId: z.string().trim().min(1).optional(),
    schedules: schedulesSchema,
  })
  .refine(
    (data) => {
      if (data.target === "category") return !!data.categoryId;
      return !data.categoryId;
    },
    {
      message:
        'categoryId is required for target "category"; it is not allowed for any other target',
      path: ["target"],
    },
  );

// target/medicationId/categoryId are deliberately not part of this schema - immutable after
// creation, the same reasoning as Habit.type: what a reminder is *about* isn't something that
// makes sense to change after the fact, only whether it's on and when it fires.
const updateSchema = z
  .object({
    schedules: schedulesSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

const REMINDER_INCLUDE = {
  category: { select: { name: true, icon: true } },
} as const;

// Shapes a raw Prisma Reminder row (SCREAMING_CASE target, plus the joined category) into the
// JSON the API actually returns - mirrors habitType.ts's serializeHabit/categoryValueType.ts's
// serializeCategory.
function serializeReminder<
  T extends {
    target: PrismaReminderTarget;
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

// "When would this actually fire?", answered for a schedule the caller hasn't saved yet.
//
// Deliberately computed here rather than in the browser, even though the frontend has its own cron
// code capable of it. That frontend implementation exists to *draw* the picker; this one is what
// the scheduler genuinely uses to decide what to send. A preview derived from the drawing code
// could agree with the user's expectation while still disagreeing with what will really happen -
// which is precisely the failure this endpoint exists to make visible. See
// docs/log/33-next-run-preview.md.
//
// Declared before the "/:id" routes below purely for readability; POST "/preview" and POST "/" are
// already unambiguous to Express.
remindersRouter.post("/preview", async (req, res) => {
  const parsed = z.object({ schedules: schedulesSchema }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid schedule",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // The scheduler resolves every reminder against the owner's stored timezone, so a preview that
  // used the server's - or the browser's - would be answering a different question.
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { timezone: true },
  });
  if (!user) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  // "today" travels with the response so the client never has to work out what day it is in the
  // user timezone - it only has to compare date strings, which has no clock in it at all.
  const today = todayInTimezone(user.timezone);
  res.json({
    timezone: user.timezone,
    today,
    tomorrow: addDaysToDateStr(today, 1),
    nextRuns: nextRunsForSchedules(parsed.data.schedules, user.timezone, PREVIEW_RUN_COUNT),
  });
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

  const { target, categoryId, schedules } = parsed.data;
  const prismaTarget = toPrismaReminderTarget(target);

  // ID-tampering defense - the same pattern every other route with a foreign reference already
  // uses: scope the lookup by ownership/visibility before ever trusting the id in the request.
  if (target === "category") {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, archivedAt: null, OR: [{ userId: null }, { userId: req.userId }] },
    });
    if (!category) {
      return res.status(404).json({
        error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
      });
    }
  }

  // At most one reminder per (user, target, categoryId) - an app-level check, not a DB
  // constraint, matching this codebase's established preference for this class of invariant (see
  // e.g. HabitLog's own "exactly one value column" check in habitLogs.ts).
  const existing = await prisma.reminder.findFirst({
    where: {
      userId: req.userId,
      target: prismaTarget,
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
      categoryId: categoryId ?? null,
      schedules,
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
