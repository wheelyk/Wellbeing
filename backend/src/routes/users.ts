import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { clearRefreshTokenCookie } from "../lib/cookies";

// Node's Intl.supportedValuesOf("timeZone") returns every IANA zone name the runtime
// recognizes (~400 of them) - used here so PATCH /me can reject a garbage timezone string
// up front, rather than accepting it and only discovering it's invalid later when
// `backend/src/lib/timezone.ts`'s Intl calls throw while resolving *that* user's dashboard.
// Falling back to a try/catch around constructing an Intl.DateTimeFormat covers the (unlikely,
// on any Node version this project targets) case where supportedValuesOf itself isn't
// available, rather than skipping validation entirely.
function isValidTimeZone(timeZone: string): boolean {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone").includes(timeZone);
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

const updateSchema = z
  .object({
    displayName: z.string().trim().min(1, "Display name can't be empty"),
    timezone: z.string().refine(isValidTimeZone, "Not a recognized timezone"),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const usersRouter = Router();

usersRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, displayName: true, timezone: true, createdAt: true },
  });

  // requireAuth already confirmed the access token's subject was valid at issuance time, but
  // the user row itself could have been deleted since (e.g. this same DELETE /me endpoint,
  // called from a second tab) - treat that the same way every other "no such row" case in
  // this app does, rather than a 500.
  if (!user) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  res.json(user);
});

usersRouter.patch("/me", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid profile update",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: parsed.data,
    select: { id: true, email: true, displayName: true, timezone: true, createdAt: true },
  });

  res.json(user);
});

usersRouter.delete("/me", async (req, res) => {
  // Every relation from User (MoodLog, Habit, HabitLog, Medication, MedicationLog, Symptom,
  // SymptomLog) is declared `onDelete: Cascade` in schema.prisma, so a single delete of the
  // User row is enough - Postgres itself removes every row across every one of those tables
  // that references this user, in the same statement, with no separate application-level
  // transaction needed. (Confirmed directly: see users.test.ts's "removes every related row"
  // test, which queries each table after deletion rather than trusting the 200 response.)
  await prisma.user.delete({ where: { id: req.userId } });

  // Matches POST /api/auth/logout's cookie-clearing exactly: the account (and any session
  // token tied to it) is gone, so the browser must stop sending a refresh cookie that would
  // otherwise point at a user id that no longer exists.
  clearRefreshTokenCookie(res);
  res.status(200).json({ message: "Account deleted" });
});
