import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "./prisma";
import { runTaskTick } from "./taskScheduler";

// Mirrors reminderScheduler.test.ts's own shape and its own reasoning for mocking at the
// `web-push` package boundary - a real integration test around runTaskTick's own wiring (does it
// find a due, unnotified task, respect quiet hours, send to a real subscription, and record the
// send), never a real push-service round-trip.
const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-taskscheduler-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

async function registerUser(
  label: string,
  timezone = "UTC",
  quietHours: { start: string | null; end: string | null } = { start: null, end: null },
) {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
  return prisma.user.update({
    where: { email },
    data: { timezone, quietHoursStart: quietHours.start, quietHoursEnd: quietHours.end },
  });
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

async function createTask(
  userId: string,
  overrides: { title?: string; dueAt?: Date; doneAt?: Date | null; notifiedAt?: Date | null } = {},
) {
  return prisma.task.create({
    data: {
      userId,
      title: overrides.title ?? "Phone the vet",
      dueAt: overrides.dueAt ?? new Date("2026-08-22T20:00:00.000Z"),
      doneAt: overrides.doneAt ?? null,
      notifiedAt: overrides.notifiedAt ?? null,
    },
  });
}

function notifiedPayload(callIndex: number): { title: string; body: string } {
  return JSON.parse(sendNotification.mock.calls[callIndex][1] as string);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T20:05:00.000Z"));
  sendNotification.mockReset();
  sendNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runTaskTick", () => {
  it("sends a due, unnotified task and records notifiedAt", async () => {
    const user = await registerUser("due");
    await addSubscription(user.id, "sub");
    const task = await createTask(user.id, { title: "Phone the vet" });

    await runTaskTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(notifiedPayload(0)).toEqual({ title: "WellTrack", body: "Phone the vet" });

    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stored?.notifiedAt).not.toBeNull();
  });

  it("does not send a task that isn't due yet", async () => {
    const user = await registerUser("not-due");
    await addSubscription(user.id, "sub");
    const task = await createTask(user.id, { dueAt: new Date("2026-08-22T20:10:00.000Z") });

    await runTaskTick();

    expect(sendNotification).not.toHaveBeenCalled();

    // Deleted rather than left sitting in the real, shared test database still due-and-
    // unnotified: a later test in this same file that advances the clock forward (see "holds a
    // due task inside quiet hours" below) would otherwise pick this row back up on its own tick
    // and inflate its own send count - a real cross-test leak this file's own tests already
    // caught once.
    await prisma.task.delete({ where: { id: task.id } });
  });

  it("never re-sends a task that was already notified", async () => {
    const user = await registerUser("already-notified");
    await addSubscription(user.id, "sub");
    await createTask(user.id, { notifiedAt: new Date("2026-08-22T20:00:00.000Z") });

    await runTaskTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("never sends a task that's already marked done", async () => {
    const user = await registerUser("already-done");
    await addSubscription(user.id, "sub");
    await createTask(user.id, { doneAt: new Date("2026-08-22T19:00:00.000Z") });

    await runTaskTick();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("holds a due task inside quiet hours rather than sending or discarding it", async () => {
    // 20:05 UTC falls inside a 19:00-21:00 quiet window.
    const user = await registerUser("quiet-hours", "UTC", { start: "19:00", end: "21:00" });
    await addSubscription(user.id, "sub");
    const task = await createTask(user.id);

    await runTaskTick();

    expect(sendNotification).not.toHaveBeenCalled();
    // Held, not skipped forever - notifiedAt stays null so a later tick (once quiet hours end)
    // can still pick this same task up. Confirmed directly by advancing past the window and
    // ticking again, rather than only asserting the negative above.
    const stillPending = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stillPending?.notifiedAt).toBeNull();

    vi.setSystemTime(new Date("2026-08-22T21:05:00.000Z"));
    await runTaskTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("resolves quiet hours in the owner's own timezone, not the server's", async () => {
    // 20:05 UTC is 13:05 in Los Angeles - well outside its own 19:00-21:00 local window, so this
    // task should send normally despite the UTC clock sitting inside that same numeric range.
    const user = await registerUser("owner-timezone", "America/Los_Angeles", {
      start: "19:00",
      end: "21:00",
    });
    await addSubscription(user.id, "sub");
    await createTask(user.id);

    await runTaskTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("deletes a subscription web-push reports as gone (410)", async () => {
    const user = await registerUser("stale-subscription");
    const goneSubscription = await addSubscription(user.id, "gone");
    const liveSubscription = await addSubscription(user.id, "live");
    await createTask(user.id);

    sendNotification.mockImplementation((subscription: { endpoint: string }) => {
      if (subscription.endpoint === goneSubscription.endpoint) {
        return Promise.reject(Object.assign(new Error("Gone"), { statusCode: 410 }));
      }
      return Promise.resolve(undefined);
    });

    await runTaskTick();

    const remaining = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    expect(remaining.map((s) => s.id)).toEqual([liveSubscription.id]);
  });

  it("does nothing when there is nothing due", async () => {
    await expect(runTaskTick()).resolves.toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
