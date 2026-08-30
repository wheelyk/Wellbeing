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
    target?: "GENERAL" | "CATEGORY";
    categoryId?: string;
    schedules?: string[];
    enabled?: boolean;
    expiresAt?: Date | null;
    startsAt?: Date | null;
    stopsWhenLogged?: boolean;
  } = {},
) {
  return prisma.reminder.create({
    data: {
      userId,
      target: overrides.target ?? "GENERAL",
      categoryId: overrides.categoryId,
      schedules: overrides.schedules ?? ["0 20 * * *"],
      enabled: overrides.enabled ?? true,
      expiresAt: overrides.expiresAt ?? null,
      startsAt: overrides.startsAt ?? null,
      stopsWhenLogged: overrides.stopsWhenLogged ?? true,
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
    await createReminder(user.id, { schedules: ["0 23 * * *"] });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  // Behaviour change, made deliberately alongside cron schedules rather than discovered by a
  // failing test: several *missed* slots on one reminder now produce a single notification for the
  // most recent one, not one per slot. Sending two identical "time to log X" pushes back-to-back
  // was already odd when a reminder could hold at most six hand-typed times; with `0 * * * *` and
  // a process that was down until the afternoon it would have been fifteen. Every superseded slot
  // is still recorded, so none of them can fire again later. See
  // docs/log/25-cron-reminder-schedules.md.
  it("sends once for the most recent due slot, and records the superseded ones as handled", async () => {
    const user = await registerUser("two-times");
    await addSubscription(user.id, "two-times");
    // "09:00" and "20:00" are both due (system time is 20:05); "23:00" is not.
    const reminder = await createReminder(user.id, {
      schedules: ["0 9 * * *", "0 20 * * *", "0 23 * * *"],
    });

    await runReminderTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const sends = await prisma.reminderSend.findMany({
      where: { reminderId: reminder.id },
      orderBy: { time: "asc" },
    });
    // Both due slots are marked handled - 20:00 because it actually notified, 09:00 because it was
    // superseded - so neither can fire again on a later tick today. 23:00 is untouched.
    expect(sends.map((s) => s.time)).toEqual(["09:00", "20:00"]);
  });

  it("expands a recurring expression into every slot it produces, firing once for the latest due", async () => {
    const user = await registerUser("hourly");
    await addSubscription(user.id, "hourly");
    // Every hour on the hour. At 20:05 that means 00:00-20:00 are all due, 21:00-23:00 are not.
    const reminder = await createReminder(user.id, { schedules: ["0 * * * *"] });

    await runReminderTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const sends = await prisma.reminderSend.findMany({
      where: { reminderId: reminder.id },
      orderBy: { time: "asc" },
    });
    expect(sends).toHaveLength(21);
    expect(sends[0].time).toBe("00:00");
    expect(sends.at(-1)?.time).toBe("20:00");
  });

  it("does not fire at all on a day the expression excludes", async () => {
    const user = await registerUser("weekday-only");
    await addSubscription(user.id, "weekday-only");
    // The suite's fake clock is pinned to a Saturday (see the setSystemTime call above), so a
    // weekdays-only expression must produce no slots at all - the day-of-week case that simply
    // could not exist when schedules were bare "HH:mm" strings.
    await createReminder(user.id, { schedules: ["0 9 * * 1-5"] });

    await runReminderTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  // A former Medication reminder is just a CATEGORY reminder now (see
  // docs/log/19-medication-to-category.md) - these three tests mirror what the now-deleted
  // reminderScheduler tests covered for MEDICATION specifically, using a boolean category (a
  // former medication's own shape) with its `description` standing in for the old `dosage` field.
  it("scopes a CATEGORY reminder to its own specific category, not any category log", async () => {
    const user = await registerUser("category-specific-boolean");
    await addSubscription(user.id, "category-specific-boolean");
    const diazepam = await prisma.category.create({
      data: { userId: user.id, name: "Diazepam", valueType: "BOOLEAN" },
    });
    const sertraline = await prisma.category.create({
      data: { userId: user.id, name: "Sertraline", valueType: "BOOLEAN" },
    });
    await createReminder(user.id, { target: "CATEGORY", categoryId: diazepam.id });

    // Logged Sertraline, not Diazepam - the Diazepam-specific reminder should still fire.
    await prisma.categoryLog.create({
      data: { userId: user.id, categoryId: sertraline.id, valueBoolean: true },
    });

    await runReminderTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(notifiedPayload(0)).toMatchObject({ body: "Time to log Diazepam." });
  });

  it("includes a category's description in the notification body when set", async () => {
    const user = await registerUser("category-description");
    await addSubscription(user.id, "category-description");
    const category = await prisma.category.create({
      data: { userId: user.id, name: "Diazepam", valueType: "BOOLEAN", description: "2mg" },
    });
    await createReminder(user.id, { target: "CATEGORY", categoryId: category.id });

    await runReminderTick();

    expect(notifiedPayload(0)).toMatchObject({
      body: "Time to log Diazepam (2mg).",
    });
  });

  it("does not send a CATEGORY reminder once its own category has been logged today", async () => {
    const user = await registerUser("category-logged");
    await addSubscription(user.id, "category-logged");
    const category = await prisma.category.create({
      data: { userId: user.id, name: "Diazepam", valueType: "BOOLEAN" },
    });
    await createReminder(user.id, { target: "CATEGORY", categoryId: category.id });
    await prisma.categoryLog.create({
      data: { userId: user.id, categoryId: category.id, valueBoolean: true },
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

  // The two readings of a repeating reminder, now that a user can say which one they meant:
  // "nudge me until I do it" (stopsWhenLogged - the default, and how every reminder has always
  // behaved) and "nudge me on a rhythm" (not stopsWhenLogged). These two tests are deliberately
  // identical in every respect except that flag, so the flag is unambiguously what decides it.
  describe("stop condition", () => {
    async function userWithLoggedCategory(label: string) {
      const user = await registerUser(label);
      await addSubscription(user.id, label);
      const category = await prisma.category.create({
        data: { userId: user.id, name: "Water", valueType: "NUMERIC" },
      });
      await prisma.categoryLog.create({
        data: {
          userId: user.id,
          categoryId: category.id,
          valueNumeric: 1,
          loggedAt: new Date("2026-08-22T09:00:00.000Z"),
        },
      });
      return { user, category };
    }

    it("keeps firing after the target has been logged when it does not stop on logging", async () => {
      const { user, category } = await userWithLoggedCategory("rhythm");
      await createReminder(user.id, {
        target: "CATEGORY",
        categoryId: category.id,
        stopsWhenLogged: false,
      });

      await runReminderTick();

      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it("still goes quiet after logging when it does stop on logging", async () => {
      const { user, category } = await userWithLoggedCategory("until-done");
      await createReminder(user.id, {
        target: "CATEGORY",
        categoryId: category.id,
        stopsWhenLogged: true,
      });

      await runReminderTick();

      expect(sendNotification).not.toHaveBeenCalled();
    });
  });

  // startsAt is the mirror of expiresAt, and exists for one specific failure: the scheduler fires
  // late on purpose, so without it a one-shot created this evening for tomorrow morning would be
  // read as a slot that had already passed, and delivered immediately.
  describe("reminders that have not started yet", () => {
    it("does not fire a slot earlier than the start time on the day it starts", async () => {
      const user = await registerUser("starts-later-today");
      await addSubscription(user.id, "starts-later-today");
      // "Now" is 20:05 (see beforeEach) and the slot is 20:00 - due, and would fire. But the
      // reminder does not begin until 22:00 today, so 20:00 was never one of its slots.
      await createReminder(user.id, {
        startsAt: new Date("2026-08-22T22:00:00.000Z"),
      });

      await runReminderTick();

      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("fires normally on a later day, when every slot is after the start", async () => {
      const user = await registerUser("started-yesterday");
      await addSubscription(user.id, "started-yesterday");
      // Started yesterday evening; today's 20:00 slot is legitimately after it.
      await createReminder(user.id, {
        startsAt: new Date("2026-08-21T22:00:00.000Z"),
      });

      await runReminderTick();

      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it("fires a slot at or after the start time on the starting day", async () => {
      const user = await registerUser("starts-earlier-today");
      await addSubscription(user.id, "starts-earlier-today");
      await createReminder(user.id, {
        startsAt: new Date("2026-08-22T19:00:00.000Z"),
      });

      await runReminderTick();

      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it("is not a candidate at all while its start is still in the future", async () => {
      const user = await registerUser("starts-tomorrow");
      await addSubscription(user.id, "starts-tomorrow");
      const reminder = await createReminder(user.id, {
        startsAt: new Date("2026-08-23T08:00:00.000Z"),
      });

      await runReminderTick();

      expect(sendNotification).not.toHaveBeenCalled();
      // Not merely unsent - never considered, so nothing was recorded as handled either.
      expect(await prisma.reminderSend.findMany({ where: { reminderId: reminder.id } })).toEqual(
        [],
      );
    });
  });

  // A temporary reminder ("nudge me every 30 minutes for the rest of today") is an ordinary
  // reminder with an expiry - these four tests pin down the only two things that expiry actually
  // changes: whether the reminder is still a candidate, and when the row is finally removed.
  describe("expiring reminders", () => {
    it("still sends one whose expiry has not passed yet", async () => {
      const user = await registerUser("expiry-live");
      await addSubscription(user.id, "expiry-live");
      // 20:05 "now" (see beforeEach); this expires at midnight tonight.
      await createReminder(user.id, { expiresAt: new Date("2026-08-23T00:00:00.000Z") });

      await runReminderTick();

      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it("does not send one whose expiry has passed", async () => {
      const user = await registerUser("expiry-passed");
      await addSubscription(user.id, "expiry-passed");
      // Expired five minutes ago. The 20:00 slot is otherwise perfectly due - it is only the
      // expiry that stops it.
      const reminder = await createReminder(user.id, {
        expiresAt: new Date("2026-08-22T20:00:00.000Z"),
      });

      await runReminderTick();

      expect(sendNotification).not.toHaveBeenCalled();
      // Not merely unsent - never even considered, so no send row was written either.
      const sends = await prisma.reminderSend.findMany({ where: { reminderId: reminder.id } });
      expect(sends).toEqual([]);
    });

    it("keeps a recently expired reminder around, so it is still visible on the day it ran", async () => {
      const user = await registerUser("expiry-recent");
      const reminder = await createReminder(user.id, {
        expiresAt: new Date("2026-08-22T09:00:00.000Z"),
      });

      await runReminderTick();

      expect(await prisma.reminder.findUnique({ where: { id: reminder.id } })).not.toBeNull();
    });

    it("sweeps away one that expired more than a day ago, and leaves standing reminders alone", async () => {
      const user = await registerUser("expiry-sweep");
      const longExpired = await createReminder(user.id, {
        // 25 hours before "now" - past the 24-hour retention window.
        expiresAt: new Date("2026-08-21T19:05:00.000Z"),
      });
      const standing = await createReminder(user.id, {
        target: "CATEGORY",
        categoryId: (
          await prisma.category.create({
            data: { userId: user.id, name: "Water", valueType: "NUMERIC" },
          })
        ).id,
      });

      await runReminderTick();

      expect(await prisma.reminder.findUnique({ where: { id: longExpired.id } })).toBeNull();
      expect(await prisma.reminder.findUnique({ where: { id: standing.id } })).not.toBeNull();
    });
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
