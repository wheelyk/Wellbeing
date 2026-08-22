import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getVapidPublicKey } from "../lib/webPush";

// Matches the shape a real browser's `PushSubscription.toJSON()` produces - the frontend sends
// this object's fields through unmodified, not a reshaped version of it.
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const pushRouter = Router();

pushRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

pushRouter.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid push subscription",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { endpoint, keys } = parsed.data;
  const userId = req.userId as string;

  // Upserted by `endpoint` (its own unique column), not created unconditionally - a browser
  // that already holds a subscription for this exact service worker registration reuses the
  // same endpoint rather than minting a new one, and re-enabling reminders (or a different user
  // logging in on the same shared browser) should update that one row's owner/keys, not create a
  // duplicate that would otherwise violate the unique constraint.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });

  res.status(201).json({ message: "Subscribed" });
});

pushRouter.delete("/subscribe", async (req, res) => {
  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid request",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // Scoped to both endpoint and userId - deleting a subscription that exists but belongs to
  // another user silently matches zero rows rather than confirming its existence, the same
  // "don't leak which case it is" principle every other delete in this app already follows.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: req.userId },
  });

  res.status(200).json({ message: "Unsubscribed" });
});
