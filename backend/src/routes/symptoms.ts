import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
});

const updateSchema = createSchema.partial();

export const symptomsRouter = Router();

// System symptoms (userId null) plus the caller's own custom ones - the picker a symptom log
// is created against draws from exactly this combined list, never anyone else's custom
// symptoms.
symptomsRouter.get("/", async (req, res) => {
  const symptoms = await prisma.symptom.findMany({
    where: { OR: [{ userId: null }, { userId: req.userId }] },
    orderBy: { name: "asc" },
  });
  res.json(symptoms);
});

symptomsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid symptom",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { name, description } = parsed.data;
  const symptom = await prisma.symptom.create({
    data: { userId: req.userId as string, name, description },
  });

  res.status(201).json(symptom);
});

symptomsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid symptom",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // Scoped to userId (never matches a system symptom, whose userId is null, or another
  // user's) so both "doesn't exist" and "exists but isn't yours to edit" - including the
  // system-symptom case - come back as the same undifferentiated 404, per the same
  // "don't leak which case it is" principle used throughout this codebase.
  const existing = await prisma.symptom.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Symptom not found", code: "SYMPTOM_NOT_FOUND" },
    });
  }

  const symptom = await prisma.symptom.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  res.json(symptom);
});

symptomsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.symptom.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Symptom not found", code: "SYMPTOM_NOT_FOUND" },
    });
  }

  try {
    await prisma.symptom.delete({ where: { id: existing.id } });
  } catch (err) {
    // SymptomLog -> Symptom has no cascading delete (see schema.prisma) precisely so a
    // symptom with real logging history can't be silently deleted out from under them -
    // Postgres rejects the delete with a foreign key violation (P2003), which surfaces here
    // as a clear, actionable error instead of a raw 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return res.status(409).json({
        error: {
          message: "Cannot delete a symptom that still has logged entries",
          code: "SYMPTOM_HAS_LOGS",
        },
      });
    }
    throw err;
  }

  res.status(200).json({ message: "Deleted" });
});
