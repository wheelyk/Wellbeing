import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const moodField = z.number().int().min(1).max(5);
// Energy/stress get one more point of resolution than mood (1-7, not 1-5) specifically so a
// midpoint exists (4) for "neither low nor high" - a 1-5 or 1-6 range either lacks that clean
// center or offers too little granularity, per real user feedback on the original 1-5 scale.
const energyStressField = z.number().int().min(1).max(7);

const createSchema = z.object({
  mood: moodField,
  energy: energyStressField.nullable().optional(),
  stress: energyStressField.nullable().optional(),
  notes: z.string().trim().min(1).optional(),
  // Accepts an explicit past (or future) timestamp for backfilling; omitted entirely means
  // "now", handled below rather than as a Zod default so "now" means the moment the request
  // is actually processed, not schema-parse time.
  loggedAt: z.string().datetime().optional(),
});

// `.partial()` alone would make `notes` optional-but-still-string-only, which can express "not
// provided" (key absent) but not "clear the existing value" (there's no string that means
// that). Editing an entry needs the second meaning too - e.g. clicking "Save Changes" after
// deleting existing notes text should actually clear it, not silently leave the old value in
// place - so `notes` is widened to also accept an explicit `null` on update specifically
// (`createSchema`, used only for POST, is untouched: there's no "clear" concept when creating).
const updateSchema = createSchema.partial().extend({
  notes: z.string().trim().min(1).optional().nullable(),
});

export const moodLogsRouter = Router();

moodLogsRouter.get("/", async (req, res) => {
  const moodLogs = await prisma.moodLog.findMany({
    where: { userId: req.userId },
    orderBy: { loggedAt: "desc" },
  });
  res.json(moodLogs);
});

moodLogsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid mood log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { mood, energy, stress, notes, loggedAt } = parsed.data;
  const moodLog = await prisma.moodLog.create({
    data: {
      userId: req.userId as string,
      mood,
      energy,
      stress,
      notes,
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.status(201).json(moodLog);
});

moodLogsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid mood log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // findFirst scoped to userId (not just findUnique by id) so a log belonging to another
  // user is treated as not found rather than confirming its existence via a 403 - the same
  // "don't leak information to an unauthorized caller" principle already applied to login's
  // undifferentiated INVALID_CREDENTIALS error.
  const existing = await prisma.moodLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Mood log not found", code: "MOOD_LOG_NOT_FOUND" },
    });
  }

  const { loggedAt, ...rest } = parsed.data;
  const moodLog = await prisma.moodLog.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.json(moodLog);
});

moodLogsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.moodLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Mood log not found", code: "MOOD_LOG_NOT_FOUND" },
    });
  }

  await prisma.moodLog.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});
