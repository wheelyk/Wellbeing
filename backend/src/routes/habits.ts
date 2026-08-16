import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { API_HABIT_TYPES, serializeHabit, toPrismaHabitType } from "../lib/habitType";

const createSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(API_HABIT_TYPES),
});

// `type` is deliberately not editable - see the "Decisions" section of this route's
// IMPLEMENTATION_LOG.md entry for why (existing habit-logs' value columns are only meaningful
// in light of the type they were logged under; allowing it to change after logs exist would
// leave old logs' values silently mismatched with no way to reconcile them).
const updateSchema = z.object({
  name: z.string().trim().min(1),
});

export const habitsRouter = Router();

habitsRouter.get("/", async (req, res) => {
  const habits = await prisma.habit.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
  });
  res.json(habits.map(serializeHabit));
});

habitsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid habit",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const habit = await prisma.habit.create({
    data: {
      userId: req.userId as string,
      name: parsed.data.name,
      type: toPrismaHabitType(parsed.data.type),
    },
  });

  res.status(201).json(serializeHabit(habit));
});

habitsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid habit",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // findFirst scoped to userId (not findUnique by id alone) so another user's habit 404s
  // instead of confirming its existence via a 403 - same "don't leak which case it is"
  // principle used throughout this codebase (see moodLogs.ts).
  const existing = await prisma.habit.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Habit not found", code: "HABIT_NOT_FOUND" },
    });
  }

  const habit = await prisma.habit.update({
    where: { id: existing.id },
    data: { name: parsed.data.name },
  });

  res.json(serializeHabit(habit));
});

habitsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.habit.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Habit not found", code: "HABIT_NOT_FOUND" },
    });
  }

  // Cascades to every HabitLog referencing this habit (onDelete: Cascade in schema.prisma) -
  // no manual cleanup of habit_logs needed here.
  await prisma.habit.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});
