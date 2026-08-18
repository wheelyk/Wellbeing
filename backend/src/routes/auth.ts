import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { clearRefreshTokenCookie, setRefreshTokenCookie } from "../lib/cookies";
import { requireAuth } from "../middleware/requireAuth";
import { authRateLimiter } from "../middleware/rateLimiter";

const SALT_ROUNDS = 12;

// A precomputed bcrypt hash of an unguessable value, with no matching user. Used as the
// comparison target on login when the email doesn't match any user, so bcrypt.compare()
// still does its normal (slow) work either way — this prevents an attacker from telling
// "wrong password" apart from "no such account" by measuring response time.
const DUMMY_PASSWORD_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Y6Y3VtZ44Q4XdrOTLPfPT2mDcMYVK";

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
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
    createdAt: user.createdAt,
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
