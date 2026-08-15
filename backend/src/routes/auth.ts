import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken } from "../lib/jwt";

const SALT_ROUNDS = 12;

// A precomputed bcrypt hash of an unguessable value, with no matching user. Used as the
// comparison target on login when the email doesn't match any user, so bcrypt.compare()
// still does its normal (slow) work either way — this prevents an attacker from telling
// "wrong password" apart from "no such account" by measuring response time.
const DUMMY_PASSWORD_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Y6Y3VtZ44Q4XdrOTLPfPT2mDcMYVK";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  displayName: z.string().trim().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
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

authRouter.post("/login", async (req, res) => {
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

  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (!user || !passwordMatches) {
    return res.status(401).json({
      error: { message: "Invalid email or password", code: "INVALID_CREDENTIALS" },
    });
  }

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      createdAt: user.createdAt,
    },
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id),
  });
});
