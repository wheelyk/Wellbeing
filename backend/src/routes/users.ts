import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { clearRefreshTokenCookie } from "../lib/cookies";
import { isAdminEmail } from "../lib/isAdmin";

// Validates by actually constructing an Intl.DateTimeFormat with this zone - the same call
// `backend/src/lib/timezone.ts` makes for real, downstream, to resolve a user's calendar day -
// rather than checking membership in Intl.supportedValuesOf("timeZone")'s enumerated list.
// That list turns out to be the wrong tool here: on at least this project's Node/ICU version,
// it excludes "UTC" (confirmed directly: `Intl.supportedValuesOf("timeZone").includes("UTC")`
// is false), even though `new Intl.DateTimeFormat(undefined, { timeZone: "UTC" })` works fine -
// "UTC" is both this app's own `User.timezone` schema default (Phase 1) and the first option in
// the frontend's own timezone <select>, so this rejected the timezone every brand-new user
// actually starts with, and only surfaced when a real account tried to save *any* profile
// change without first switching away from the default. A garbage zone (e.g.
// "Not/A_Real_Zone") still throws from the constructor, so this stays just as strict for the
// case it actually needs to catch.
function isValidTimeZone(timeZone: string): boolean {
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

const PROFILE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  timezone: true,
  createdAt: true,
} as const;

export const usersRouter = Router();

usersRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: PROFILE_SELECT,
  });

  // requireAuth already confirmed the access token's subject was valid at issuance time, but
  // the user row itself could have been deleted since (e.g. this same DELETE /me endpoint,
  // called from a second tab) - treat that the same way every other "no such row" case in
  // this app does, rather than a 500.
  if (!user) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  // Computed, not stored/selected (isAdmin isn't a database column - see lib/isAdmin.ts).
  res.json({ ...user, isAdmin: isAdminEmail(user.email) });
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
    select: PROFILE_SELECT,
  });

  res.json({ ...user, isAdmin: isAdminEmail(user.email) });
});

usersRouter.delete("/me", async (req, res) => {
  // Every relation from User (Category, CategoryLog) is declared `onDelete: Cascade` in
  // schema.prisma, so a single delete of the User row is enough -
  // Postgres itself removes every row across every one of those tables that references this user,
  // in the same statement, with no separate application-level transaction needed. (Confirmed
  // directly: see users.test.ts's "removes every related row" test, which queries each table
  // after deletion rather than trusting the 200 response.)
  await prisma.user.delete({ where: { id: req.userId } });

  // Matches POST /api/auth/logout's cookie-clearing exactly: the account (and any session
  // token tied to it) is gone, so the browser must stop sending a refresh cookie that would
  // otherwise point at a user id that no longer exists.
  clearRefreshTokenCookie(res);
  res.status(200).json({ message: "Account deleted" });
});
