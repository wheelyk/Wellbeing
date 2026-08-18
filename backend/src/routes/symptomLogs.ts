import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { DEFAULT_LOG_LIST_LIMIT, fetchPage, paginationQuerySchema } from "../lib/pagination";

const severityField = z.number().int().min(1).max(10);

const createSchema = z.object({
  symptomId: z.string().min(1),
  severity: severityField,
  notes: z.string().trim().min(1).optional(),
  // Accepts an explicit past (or future) timestamp for backfilling; omitted entirely means
  // "now," handled by the database's own @default(now()) so it reflects the moment the row
  // is actually inserted rather than the moment the request was parsed - same pattern as
  // mood-logs.
  loggedAt: z.string().datetime().optional(),
});

// See moodLogs.ts's identical comment: `notes` is widened to accept an explicit `null` on
// update only, so clearing a previously-entered note during an edit actually clears it instead
// of the "not provided" case (key absent) silently leaving the old value untouched.
const updateSchema = createSchema.partial().extend({
  notes: z.string().trim().min(1).optional().nullable(),
});

export const symptomLogsRouter = Router();

// The key defense against ID-tampering (Tasks.md Phase 3's cross-cutting requirement): a
// caller can only create/update a symptom log against a symptomId that is either a system
// symptom (userId null) or one they own themselves - never another user's private custom
// symptom, even if its ID is guessed or otherwise obtained.
async function symptomIsAccessible(symptomId: string, userId: string): Promise<boolean> {
  const symptom = await prisma.symptom.findFirst({
    where: { id: symptomId, OR: [{ userId: null }, { userId }] },
  });
  return symptom !== null;
}

symptomLogsRouter.get("/", async (req, res) => {
  const parsedQuery = paginationQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: {
        message: "Invalid symptom log query",
        code: "VALIDATION_ERROR",
        details: parsedQuery.error.flatten().fieldErrors,
      },
    });
  }
  const { limit = DEFAULT_LOG_LIST_LIMIT, offset = 0 } = parsedQuery.data;

  const page = await fetchPage(
    ({ take, skip }) =>
      prisma.symptomLog.findMany({
        where: { userId: req.userId },
        orderBy: { loggedAt: "desc" },
        take,
        skip,
      }),
    limit,
    offset,
  );

  res.json(page);
});

symptomLogsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid symptom log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { symptomId, severity, notes, loggedAt } = parsed.data;

  if (!(await symptomIsAccessible(symptomId, req.userId as string))) {
    // Same undifferentiated 404 used for symptom ownership elsewhere - whether symptomId
    // refers to nothing at all, or to a real symptom owned by someone else, the caller sees
    // exactly the same response either way.
    return res.status(404).json({
      error: { message: "Symptom not found", code: "SYMPTOM_NOT_FOUND" },
    });
  }

  const symptomLog = await prisma.symptomLog.create({
    data: {
      userId: req.userId as string,
      symptomId,
      severity,
      notes,
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.status(201).json(symptomLog);
});

symptomLogsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid symptom log",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // findFirst scoped to userId (not findUnique by id alone) so a log belonging to another
  // user 404s instead of confirming its existence - same reasoning as mood-logs.
  const existing = await prisma.symptomLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Symptom log not found", code: "SYMPTOM_LOG_NOT_FOUND" },
    });
  }

  const { symptomId, loggedAt, ...rest } = parsed.data;

  if (symptomId && !(await symptomIsAccessible(symptomId, req.userId as string))) {
    return res.status(404).json({
      error: { message: "Symptom not found", code: "SYMPTOM_NOT_FOUND" },
    });
  }

  const symptomLog = await prisma.symptomLog.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(symptomId ? { symptomId } : {}),
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });

  res.json(symptomLog);
});

symptomLogsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.symptomLog.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Symptom log not found", code: "SYMPTOM_LOG_NOT_FOUND" },
    });
  }

  await prisma.symptomLog.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});
