import { Router } from "express";
import { prisma } from "../lib/prisma";
import { serializeHabit } from "../lib/habitType";

export const exportRouter = Router();

// GET /api/export - lets a user download everything they've ever logged (plus the
// symptom/medication/habit definitions those logs reference) as a single JSON file. Every
// query below is scoped to req.userId, the same ownership boundary every other route in this
// app enforces (see dashboard.ts/history.ts) - nothing here is a system-wide export.
//
// System-default symptoms (Symptom.userId null, see schema.prisma) are deliberately excluded
// from the `symptoms` definitions list below, since they aren't something this user created or
// owns - the same distinction symptoms.ts's own GET / makes between "mine" and "everyone's."
// Any symptomLogs entry that references one still carries its name inline (symptomName below),
// so the export is still self-contained without pulling in symptoms belonging to no one.
exportRouter.get("/", async (req, res) => {
  const userId = req.userId as string;

  const [user, moodLogs, symptoms, symptomLogs, medications, medicationLogs, habits, habitLogs] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, displayName: true, timezone: true, createdAt: true },
      }),
      prisma.moodLog.findMany({ where: { userId }, orderBy: { loggedAt: "asc" } }),
      prisma.symptom.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.symptomLog.findMany({
        where: { userId },
        orderBy: { loggedAt: "asc" },
        include: { symptom: { select: { name: true } } },
      }),
      prisma.medication.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.medicationLog.findMany({
        where: { userId },
        orderBy: { loggedAt: "asc" },
        include: { medication: { select: { name: true } } },
      }),
      prisma.habit.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.habitLog.findMany({
        where: { userId },
        orderBy: { loggedAt: "asc" },
        include: { habit: { select: { name: true } } },
      }),
    ]);

  // Same "user row could have been deleted since the access token was issued" case dashboard.ts
  // and users.ts's GET /me both already guard against - a genuine 404, not an auth failure.
  if (!user) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  const exportedAt = new Date();
  // YYYY-MM-DD, for the suggested filename only - a human-scannable label on the download,
  // never parsed or read back, so the per-user-timezone "what day is it really" question that
  // matters elsewhere in this app (see lib/timezone.ts) doesn't apply here.
  const filenameDate = exportedAt.toISOString().slice(0, 10);

  const body = {
    exportedAt: exportedAt.toISOString(),
    user,
    moodLogs,
    symptoms,
    symptomLogs: symptomLogs.map(({ symptom, ...log }) => ({
      ...log,
      symptomName: symptom.name,
    })),
    medications,
    medicationLogs: medicationLogs.map(({ medication, ...log }) => ({
      ...log,
      medicationName: medication.name,
    })),
    habits: habits.map(serializeHabit),
    habitLogs: habitLogs.map(({ habit, ...log }) => ({ ...log, habitName: habit.name })),
  };

  // Content-Disposition: attachment is what turns this from "browser navigates to and renders
  // raw JSON" into "browser downloads a file" - the filename here is only ever a *suggestion*
  // the browser is free to rename on save, not something read back by anything server-side.
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="welltrack-export-${filenameDate}.json"`,
  );
  // Content-Disposition isn't one of the small set of headers a cross-origin fetch() response
  // exposes to JS by default (the "CORS-safelisted response headers" - Content-Type etc., but
  // not this one) - without explicitly opting it in here, frontend/api/client.ts's own
  // apiFetchFile would find res.headers.get("Content-Disposition") silently null in this app's
  // real deployed setup (frontend and backend on different origins/ports), and ExportDataSection
  // would fall back to its own generic filename, quietly losing the date suffix. Caught by
  // actually driving this through a real cross-origin browser session (see this task's PR
  // description) rather than trusting the vitest/supertest suite, which talks to the app
  // in-process and never exercises real cross-origin header-visibility rules at all.
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.json(body);
});
