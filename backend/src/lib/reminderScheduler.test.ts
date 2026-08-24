import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "./prisma";
import { runReminderTick } from "./reminderScheduler";

// This is an *integration* test around runReminderTick's own wiring (does it correctly query
// eligible reminders, check whether their own target has really been logged via the real
// database, send to every real subscription row, record the send, and clean up gone
// subscriptions) - not a re-test of shouldSendReminder's own eligibility rules, which
// reminderEligibility.test.ts already covers exhaustively with plain inputs. `web-push`'s actual
// network-sending call is mocked throughout - never a real push service round-trip in a test.
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

async function registerUser(label: string, timezone = "UTC") {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
  return prisma.user.update({ where: { email }, data: { timezone } });
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

// Mirrors this file's own directly-against-Prisma style for the old single-reminder model -
// creates a Reminder row directly, bypassing /api/reminders (which has its own dedicated
// ownership/validation tests in reminders.test.ts).
async function createReminder(
  userId: string,
  overrides: {
    target?: "GENERAL" | "MOOD" | "SYMPTOM" | "HABIT" | "MEDICATION" | "CATEGORY";
    medicationId?: string;
    categoryId?: string;
    times?: string[];
    enabled?: boolean;
  } = {},
) {
  return prisma.reminder.create({
    data: {
      userId,
      target: overrides.target ?? "GENERAL",
      medicationId: overrides.medicationId,
      categoryId: overrides.categoryId,
      times: overrides.times ?? ["20:00"],
      enabled: overrides.enabled ?? true,
    },
  });
}

// web-push's real sendNotification takes the payload as a JSON *string* (see webPush.ts's own
// `JSON.stringify(payload)` call) - the mock above receives that same string, not the object, so
// assertions on its shape need to parse it back first.
function notifiedPayload(callIndex: number): { title: string; body: string } {
  return JSON.parse(sendNotification.mock.calls[callIndex][1] as string);
}

beforeEach(() => {
  vi.useFakeTimers();
  // 20:05 UTC - past "20:00" UTC, for every test below that uses a UTC user and default time.
  vi.setSystemTime(new Date("2026-08-22T20:05:00.000Z"));
  sendNotification.mockReset();
  sendNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runReminderTick", () => {
  it("sends a GENERAL reminder when nothing has been logged today, and records the send", async () => {
    const user = await registerUser("eligible");
    const subscription = await addSubscription(user.id, "eligible");
    const reminder = await createReminder(user.id);

    await runReminderTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toMatchObject({ endpoint: subscription.endpoint });
    expect(notifiedPayload(0)).toMatchObject({
      body: "You haven't logged anything today yet.",
    });

    const sends = await prisma.reminderSend.findMany({ where: { reminderId: reminder.id } });
    expect(sends).toMatchObject([{ date: "2026-08-22", time: "20:00" }]);
  });

  it("does not send a GENERAL reminder if anything at all was logged today (including a custom category entry)", async () => {
    const user = await registerUser("category-only");
    await addSubscription(user.id, "category-only");
    await createReminder(user.id);
    const category = await prisma.category.create({
      data: { userId: user.id, name: "Water intake", valueType: "NUMERIC" },
    });
    await prisma.categoryLog.create({
      data: { userId: user.id, categoryId: category.id, valueNumeric: 3 },
    });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not send twice for the same (reminder, day, time) slot", async () => {
    const user = await registerUser("already-sent");
    await addSubscription(user.id, "already-sent");
    const reminder = await createReminder(user.id);
    await prisma.reminderSend.create({
      data: { reminderId: reminder.id, date: "2026-08-22", time: "20:00" },
    });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not send before the time has arrived", async () => {
    const user = await registerUser("too-early");
    await addSubscription(user.id, "too-early");
    await createReminder(user.id, { times: ["23:00"] });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("fires each independent time on the same reminder separately", async () => {
    const user = await registerUser("two-times");
    await addSubscription(user.id, "two-times");
    // Both "09:00" and "20:00" are due (system time is 20:05); "23:00" is not.
    const reminder = await createReminder(user.id, { times: ["09:00", "20:00", "23:00"] });

    await runReminderTick();

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const sends = await prisma.reminderSend.findMany({
      where: { reminderId: reminder.id },
      orderBy: { time: "asc" },
    });
    expect(sends.map((s) => s.time)).toEqual(["09:00", "20:00"]);
  });

  it("scopes a MEDICATION reminder to its own specific medication, not any medication log", async () => {
    const user = await registerUser("medication-specific");
    await addSubscription(user.id, "medication-specific");
    const diazepam = await prisma.medication.create({
      data: { userId: user.id, name: "Diazepam" },
    });
    const sertraline = await prisma.medication.create({
      data: { userId: user.id, name: "Sertraline" },
    });
    await createReminder(user.id, { target: "MEDICATION", medicationId: diazepam.id });

    // Logged Sertraline, not Diazepam - the Diazepam-specific reminder should still fire.
    await prisma.medicationLog.create({
      data: { userId: user.id, medicationId: sertraline.id, taken: true },
    });

    await runReminderTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(notifiedPayload(0)).toMatchObject({ body: "Time to take Diazepam." });
  });

  it("includes a medication's dosage in the notification body when set", async () => {
    const user = await registerUser("medication-dosage");
    await addSubscription(user.id, "medication-dosage");
    const medication = await prisma.medication.create({
      data: { userId: user.id, name: "Diazepam", dosage: "2mg" },
    });
    await createReminder(user.id, { target: "MEDICATION", medicationId: medication.id });

    await runReminderTick();

    expect(notifiedPayload(0)).toMatchObject({
      body: "Time to take Diazepam (2mg).",
    });
  });

  it("does not send a MEDICATION reminder once its own medication has been logged today", async () => {
    const user = await registerUser("medication-logged");
    await addSubscription(user.id, "medication-logged");
    const medication = await prisma.medication.create({
      data: { userId: user.id, name: "Diazepam" },
    });
    await createReminder(user.id, { target: "MEDICATION", medicationId: medication.id });
    await prisma.medicationLog.create({
      data: { userId: user.id, medicationId: medication.id, taken: true },
    });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("scopes a CATEGORY reminder to its own specific category", async () => {
    const user = await registerUser("category-specific");
    await addSubscription(user.id, "category-specific");
    const water = await prisma.category.create({
      data: { userId: user.id, name: "Water intake", valueType: "NUMERIC" },
    });
    await createReminder(user.id, { target: "CATEGORY", categoryId: water.id });

    await runReminderTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(notifiedPayload(0)).toMatchObject({ body: "Time to log Water intake." });
  });

  it("does not send a disabled reminder", async () => {
    const user = await registerUser("disabled");
    await addSubscription(user.id, "disabled");
    await createReminder(user.id, { enabled: false });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  // web-push reports a subscription as gone via a thrown error carrying a 410 (or 404)
  // statusCode - the standard signal a browser unsubscribed or the endpoint expired without
  // this app ever being told directly (see webPush.ts's own sendPushNotification).
  it("deletes a subscription web-push reports as gone (410), without affecting the other one", async () => {
    const user = await registerUser("stale-subscription");
    const goneSubscription = await addSubscription(user.id, "gone");
    const liveSubscription = await addSubscription(user.id, "live");
    await createReminder(user.id);

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
