import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const createSchema = z.object({
  medicationId: z.string().trim().min(1),
  taken: z.boolean(),
  notes: z.string().trim().min(1).optional(),
  // Accepts an explicit past (or future) timestamp for backfilling; omitted entirely means
  // "now", handled below rather than as a Zod default so "now" means the moment the request
  // is actually processed, not schema-parse time. Same pattern as mood-logs.
  loggedAt: z.string().datetime().optional(),
});

const updateSchema = createSchema.partial();

export const medicationLogsRouter = Router();

// Verifies medicationId genuinely belongs to the authenticated user before it's ever used in
// a create/update - the key defense against ID-tampering called out in Tasks.md's Phase 3
// cross-cutting item: without this check, a user could submit another user's medicationId in
// the request body and create a log record that references it, even though every *query*
// elsewhere is correctly scoped by userId. A malicious or malformed medicationId simply won't
// match any row scoped to req.userId, so it's indistinguishable here from "doesn't exist".
async function medicationBelongsToUser(medicationId: string, userId?: string): Promise<boolean> {
  const medication = await prisma.medication.findFirst({
    where: { id: medicationId, userId },
  });
  return medication !== null;
}

medicationLogsRouter.get("/", async (req, res) => {
  const medicationLogs = await prisma.medicationLog.findMany({
    where: { userId: req.userId },
    orderBy: { loggedAt: "desc" },
  });
  res.json(medicationLogs);
});

medicationLogsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid medication log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { medicationId, taken, notes, loggedAt } = parsed.data;

  if (!(await medicationBelongsToUser(medicationId, req.userId))) {
    return res.status(404).json({
      error: { message: "Medication not found", code: "MEDICATION_NOT_FOUND" },
    });
  }

  const medicationLog = await prisma.medicationLog.create({
    data: {
      userId: req.userId as string,
      medicationId,
      taken,
      notes,
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.status(201).json(medicationLog);
});

medicationLogsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid medication log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // findFirst scoped to userId (not just findUnique by id) so a log belonging to another user
  // is treated as not found rather than confirming its existence via a 403 - same principle as
  // mood-logs.
  const existing = await prisma.medicationLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Medication log not found", code: "MEDICATION_LOG_NOT_FOUND" },
    });
  }

  const { medicationId, loggedAt, ...rest } = parsed.data;

  // If the caller is trying to re-point this log at a different medication, that new
  // medicationId needs the exact same ownership check as on create - otherwise an existing,
  // legitimately-owned log could be tampered into referencing another user's medication via
  // PATCH instead of POST.
  if (medicationId !== undefined && !(await medicationBelongsToUser(medicationId, req.userId))) {
    return res.status(404).json({
      error: { message: "Medication not found", code: "MEDICATION_NOT_FOUND" },
    });
  }

  const medicationLog = await prisma.medicationLog.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(medicationId !== undefined ? { medicationId } : {}),
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.json(medicationLog);
});

medicationLogsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.medicationLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Medication log not found", code: "MEDICATION_LOG_NOT_FOUND" },
    });
  }

  await prisma.medicationLog.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});
