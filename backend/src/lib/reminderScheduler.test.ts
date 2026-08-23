import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "./prisma";
import { runReminderTick } from "./reminderScheduler";

// This is an *integration* test around runReminderTick's own wiring (does it correctly query
// eligible users, check whether they've really logged today via the real database, send to
// every real subscription row, and clean up gone ones) - not a re-test of shouldSendReminder's
// own eligibility rules, which reminderEligibility.test.ts already covers exhaustively with
// plain inputs. `web-push`'s actual network-sending call is mocked throughout - never a real
// push service round-trip in a test.
const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-reminders-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

async function registerReminderUser(
  label: string,
  overrides: { reminderTime?: string; lastReminderSentDate?: string | null } = {},
) {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
  const user = await prisma.user.update({
    where: { email },
    data: {
      timezone: "UTC",
      reminderEnabled: true,
      reminderTime: overrides.reminderTime ?? "20:00",
      lastReminderSentDate: overrides.lastReminderSentDate ?? null,
    },
  });
  return user;
}

async function addSubscription(userId: string, endpointSuffix: string) {
  return prisma.pushSubscription.create({
    data: {
      userId,
      endpoint: `https://push.example.com/${endpointSuffix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      p256dh: "fake-p256dh",
      auth: "fake-auth",
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // 20:05 UTC - past a "20:00" UTC reminder time, for every test below that uses a UTC user.
  vi.setSystemTime(new Date("2026-08-22T20:05:00.000Z"));
  sendNotification.mockReset();
  sendNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runReminderTick", () => {
  it("sends a reminder to an eligible user with no entries logged today", async () => {
    const user = await registerReminderUser("eligible");
    const subscription = await addSubscription(user.id, "eligible");

    await runReminderTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toMatchObject({ endpoint: subscription.endpoint });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastReminderSentDate).toBe("2026-08-22");
  });

  it("does not send if the user already logged something today", async () => {
    const user = await registerReminderUser("already-logged");
    await addSubscription(user.id, "already-logged");
    await prisma.moodLog.create({ data: { userId: user.id, mood: 3 } });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not send if the only thing logged today is a custom category entry", async () => {
    const user = await registerReminderUser("category-only");
    await addSubscription(user.id, "category-only");
    const category = await prisma.category.create({
      data: { userId: user.id, name: "Water intake", valueType: "NUMERIC" },
    });
    await prisma.categoryLog.create({
      data: { userId: user.id, categoryId: category.id, valueNumeric: 3 },
    });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not send twice in the same day", async () => {
    const user = await registerReminderUser("already-sent", { lastReminderSentDate: "2026-08-22" });
    await addSubscription(user.id, "already-sent");

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not send before the reminder time has arrived", async () => {
    const user = await registerReminderUser("too-early", { reminderTime: "23:00" });
    await addSubscription(user.id, "too-early");

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  // web-push reports a subscription as gone via a thrown error carrying a 410 (or 404)
  // statusCode - the standard signal a browser unsubscribed or the endpoint expired without
  // this app ever being told directly (see webPush.ts's own sendPushNotification).
  it("deletes a subscription web-push reports as gone (410), without affecting the other one", async () => {
    const user = await registerReminderUser("stale-subscription");
    const goneSubscription = await addSubscription(user.id, "gone");
    const liveSubscription = await addSubscription(user.id, "live");

    sendNotification.mockImplementation((subscription: { endpoint: string }) => {
      if (subscription.endpoint === goneSubscription.endpoint) {
        return Promise.reject(Object.assign(new Error("Gone"), { statusCode: 410 }));
      }
      return Promise.resolve(undefined);
    });

    await runReminderTick();

    const remaining = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    expect(remaining.map((s) => s.id)).toEqual([liveSubscription.id]);
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
