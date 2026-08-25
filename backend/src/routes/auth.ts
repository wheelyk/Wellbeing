import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { clearRefreshTokenCookie, setRefreshTokenCookie } from "../lib/cookies";
import { sendPasswordResetEmail } from "../lib/mail";
import { requireAuth } from "../middleware/requireAuth";
import { authRateLimiter } from "../middleware/rateLimiter";
import { isAdminEmail } from "../lib/isAdmin";

const SALT_ROUNDS = 12;

// How long a forgot-password reset token stays valid after it's issued. An hour is the
// standard tradeoff for this kind of link: long enough that a real person can receive the
// email and act on it without rushing, short enough that a token sitting unused in an old
// inbox stops being a meaningful risk fairly quickly.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Same fallback used in app.ts (kept as its own local constant rather than importing across
// files for one string) - where the reset link in the placeholder email should point.
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

// A precomputed bcrypt hash of an unguessable value, with no matching user. Used as the
// comparison target on login when the email doesn't match any user, so bcrypt.compare()
// still does its normal (slow) work either way — this prevents an attacker from telling
// "wrong password" apart from "no such account" by measuring response time.
const DUMMY_PASSWORD_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Y6Y3VtZ44Q4XdrOTLPfPT2mDcMYVK";

// An id that can never match a real user row (schema.prisma's User.id is a plain string, not a
// database-enforced UUID, so no format validation to satisfy here - it just needs to not exist).
// Used the same way DUMMY_PASSWORD_HASH is used for login: giving forgot-password's
// "user not found" branch an equivalent-cost database write to perform, so the two branches
// can't be told apart by response timing either - see forgot-password's own comment below.
const DUMMY_USER_ID = "00000000-0000-0000-0000-000000000000";

// Shared by /login and /refresh (both need to hand the frontend the same shape of "who is this,"
// the second one just via a rotated cookie instead of a password) - a plain function rather
// than a Prisma `select` clause since /refresh already has a full user row in hand from its own
// lookup, with no reason to query the database a second time just to reshape it.
function serializeUser(user: {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  createdAt: Date;
  moodEnabled: boolean;
  symptomEnabled: boolean;
  medicationEnabled: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
    createdAt: user.createdAt,
    moodEnabled: user.moodEnabled,
    symptomEnabled: user.symptomEnabled,
    medicationEnabled: user.medicationEnabled,
    // Computed, not stored - see lib/isAdmin.ts. AuthContext is populated from /login and
    // /refresh (both call this function), never from GET /api/users/me directly, so isAdmin (and
    // the toggle flags above) have to be included here too, not just on the /me response, or
    // the frontend's session-derived state would lag a full page reload.
    isAdmin: isAdminEmail(user.email),
  };
}

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: passwordField,
  displayName: z.string().trim().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordField,
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: passwordField,
});

// A reset token is a high-entropy random value (32 bytes from crypto.randomBytes, unlike a
// human-chosen password), so unlike passwordHash above, this doesn't need bcrypt's slow,
// salted design - that exists specifically to blunt brute-forcing a *low-entropy* secret a
// person picked. A plain, fast SHA-256 hash is enough here: the point is only that the raw
// token - the thing actually required to reset a password - can't be recovered from what's
// stored in the database, the same "never store the raw secret" principle as passwords, just
// with a hash suited to a different kind of secret.
function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const authRouter = Router();

authRouter.post("/register", authRateLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid registration details",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { email, password, displayName } = parsed.data;
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: displayName ?? email.split("@")[0],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        createdAt: true,
      },
    });

    return res.status(201).json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({
        error: { message: "Email is already registered", code: "EMAIL_TAKEN" },
      });
    }
    throw err;
  }
});

authRouter.post("/login", authRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid login details",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    return res.status(401).json({
      error: { message: "Invalid email or password", code: "INVALID_CREDENTIALS" },
    });
  }

  setRefreshTokenCookie(res, signRefreshToken(user.id));

  return res.status(200).json({
    user: serializeUser(user),
    accessToken: signAccessToken(user.id),
  });
});

authRouter.post("/refresh", async (req, res) => {
  const token: unknown = req.cookies?.refreshToken;

  if (typeof token !== "string") {
    return res.status(401).json({
      error: { message: "No refresh token provided", code: "MISSING_REFRESH_TOKEN" },
    });
  }

  let userId: string;
  try {
    const payload = verifyRefreshToken(token);
    userId = payload.sub as string;
  } catch {
    clearRefreshTokenCookie(res);
    return res.status(401).json({
      error: { message: "Invalid or expired refresh token", code: "INVALID_REFRESH_TOKEN" },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    clearRefreshTokenCookie(res);
    return res.status(401).json({
      error: { message: "Invalid or expired refresh token", code: "INVALID_REFRESH_TOKEN" },
    });
  }

  // Rotate: every refresh issues a brand new refresh token and invalidates the cookie
  // holding the old one, so a stolen-but-unused refresh token has a shrinking window of use.
  setRefreshTokenCookie(res, signRefreshToken(user.id));

  // Also returning `user` here (not just `accessToken`) is what actually makes session
  // rehydration on page load possible: AuthContext calls this same endpoint on mount to check
  // "is there still a valid refresh cookie," and needs the full user object back, the same way
  // /login already provides it, to populate its state - not just a token with nothing to attach
  // a display name/email to.
  return res.status(200).json({ user: serializeUser(user), accessToken: signAccessToken(user.id) });
});

authRouter.post("/logout", (_req, res) => {
  // Stateless JWTs can't be individually revoked server-side (see 2.3's rotation-not-
  // reuse-detection decision) — logout's whole job is just making sure the browser stops
  // sending the refresh cookie. Clearing is safe to call even with no cookie present.
  clearRefreshTokenCookie(res);
  return res.status(200).json({ message: "Logged out" });
});

authRouter.post("/change-password", requireAuth, authRateLimiter, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid password change request",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { currentPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: req.userId } });

  const passwordMatches = await bcrypt.compare(
    currentPassword,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (!user || !passwordMatches) {
    return res.status(401).json({
      error: { message: "Current password is incorrect", code: "INVALID_CURRENT_PASSWORD" },
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Stateless JWTs mean an existing session on another device can't be individually revoked
  // (same limitation as logout, above) - but clearing this browser's refresh cookie forces a
  // fresh login with the new password here, which is the one thing that can be done.
  clearRefreshTokenCookie(res);
  return res.status(200).json({ message: "Password updated" });
});

authRouter.post("/forgot-password", authRateLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid forgot-password request",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { email } = parsed.data;

  // Always the same response, whether or not this email actually matches an account - see
  // docs/log/01-auth-backend.md's forgot-password entry for the full reasoning. In short:
  // confirming "yes, that email has an account here" to an anonymous caller is itself a small
  // privacy leak (worse for a health app specifically), and it's exactly the same "don't leak
  // which case it is" principle already applied to login's INVALID_CREDENTIALS response above.
  const genericResponse = {
    message: "If that email is registered, a reset link has been sent.",
  };

  const user = await prisma.user.findUnique({ where: { email } });
  const rawToken = crypto.randomBytes(32).toString("hex");

  // A matching-shape database write happens on *both* branches, not just when a real user is
  // found - an identical response body (above) isn't enough on its own: the "found" branch used
  // to do a real UPDATE and the "not found" branch did nothing at all, and that extra write is
  // slower than skipping it, in a way a timing measurement could pick up on to tell the two
  // cases apart regardless of what the response body says. `DUMMY_USER_ID` never matches a real
  // row, so this update always fails with Prisma's "record not found" error in that case -
  // caught and discarded, the same "let the real work happen either way" approach
  // DUMMY_PASSWORD_HASH already uses for login above.
  try {
    await prisma.user.update({
      where: { id: user?.id ?? DUMMY_USER_ID },
      data: {
        resetTokenHash: hashResetToken(rawToken),
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")) {
      throw err;
    }
  }

  if (user) {
    // The raw token only ever exists in memory here and in the email it's embedded in - never
    // written to the database (only its hash is, above) and never logged anywhere except
    // inside this placeholder mailer's own clearly-labeled console output.
    const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(user.email, resetLink);
  }

  return res.status(200).json(genericResponse);
});

authRouter.post("/reset-password", authRateLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid reset-password request",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { token, newPassword } = parsed.data;
  const user = await prisma.user.findFirst({ where: { resetTokenHash: hashResetToken(token) } });

  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return res.status(400).json({
      error: { message: "Invalid or expired reset link", code: "INVALID_RESET_TOKEN" },
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Clearing resetTokenHash/resetTokenExpiresAt here is what makes the token single-use - a
  // second request with the same (now-valid-looking) token no longer matches any user's
  // resetTokenHash, and fails exactly like an already-expired one above.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });

  // Same reasoning as change-password above: stateless JWTs mean a session open on another
  // device can't be individually revoked, but clearing this browser's refresh cookie is the
  // one thing that can be done - and matters more here than for change-password, since a
  // password reset is often prompted by the old password having leaked in the first place.
  clearRefreshTokenCookie(res);
  return res.status(200).json({ message: "Password updated" });
});
