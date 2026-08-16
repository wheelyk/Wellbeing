import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1),
});

const updateSchema = createSchema.partial();

export const medicationsRouter = Router();

medicationsRouter.get("/", async (req, res) => {
  const medications = await prisma.medication.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
  });
  res.json(medications);
});

medicationsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid medication",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const medication = await prisma.medication.create({
    data: {
      userId: req.userId as string,
      name: parsed.data.name,
    },
  });

  res.status(201).json(medication);
});

medicationsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid medication",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // findFirst scoped to userId (not just findUnique by id) so a medication belonging to
  // another user - or a not-yet-supported system medication - is treated as not found rather
  // than confirming its existence via a 403, matching the mood-logs pattern.
  const existing = await prisma.medication.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Medication not found", code: "MEDICATION_NOT_FOUND" },
    });
  }

  const medication = await prisma.medication.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  res.json(medication);
});

medicationsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.medication.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Medication not found", code: "MEDICATION_NOT_FOUND" },
    });
  }

  // Cascades to every MedicationLog referencing this medication (onDelete: Cascade on the
  // MedicationLog.medication relation) - deleting a medication a user no longer takes also
  // clears its history rather than leaving orphaned logs behind.
  await prisma.medication.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});
