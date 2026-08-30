import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

// Its own file, mirroring remindersUpcoming.test.ts's own reasoning: reminders.test.ts ends in a
// top-level afterAll, and every test here needs a fixed clock the rest of that file deliberately
// does not have.
//
// 2026-08-30 is a Sunday. 14:05 UTC is chosen so "today" has both an already-elapsed slot (09:00)
// and a not-yet-arrived one (21:00) - the boundary this whole endpoint exists to draw correctly.
const NOW = "2026-08-30T14:05:00.000Z";
const TODAY = "2026-08-30";
const YESTERDAY = "2026-08-29";
const TWO_DAYS_AGO = "2026-08-28";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-recent-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

async function registerAndLogin(label: string, timezone = "UTC") {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
  await prisma.user.update({ where: { email }, data: { timezone } });
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "Sup3rSecret" });
  return {
    userId: loginRes.body.user.id as string,
    accessToken: loginRes.body.accessToken as string,
  };
}

function authed(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function createCategory(accessToken: string, name = "Diazepam", valueType = "boolean") {
  const res = await request(app)
    .post("/api/categories")
    .set(authed(accessToken))
    .send({ name, valueType });
  return res.body.id as string;
}

async function createReminder(
  userId: string,
  overrides: {
    target?: "GENERAL" | "CATEGORY";
    categoryId?: string;
    schedules?: string[];
    enabled?: boolean;
    stopsWhenLogged?: boolean;
  } = {},
) {
  return prisma.reminder.create({
    data: {
      userId,
      target: overrides.target ?? "GENERAL",
      categoryId: overrides.categoryId,
      schedules: overrides.schedules ?? ["0 9 * * *"],
      enabled: overrides.enabled ?? true,
      stopsWhenLogged: overrides.stopsWhenLogged ?? true,
    },
  });
}

async function logCategory(
  accessToken: string,
  categoryId: string,
  loggedAt: string,
  value: { valueBoolean?: boolean; valueNumeric?: number } = { valueBoolean: true },
) {
  const res = await request(app)
    .post("/api/category-logs")
    .set(authed(accessToken))
    .send({ categoryId, loggedAt, ...value });
  // A helper worth failing loudly rather than silently: a rejected log here would otherwise show
  // up several assertions later as "why is this reminder still missed", not as the real cause.
  if (res.status !== 201) {
    throw new Error(`logCategory failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

function recent(accessToken: string, days?: number) {
  return request(app)
    .get(`/api/reminders/recent${days !== undefined ? `?days=${days}` : ""}`)
    .set(authed(accessToken));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/reminders/recent", () => {
  it("401s without an access token", async () => {
    const res = await request(app).get("/api/reminders/recent");
    expect(res.status).toBe(401);
  });

  it("defaults to one day and resolves in the caller's own timezone", async () => {
    const { accessToken } = await registerAndLogin("default-tz", "Asia/Tokyo");

    const res = await recent(accessToken);

    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe("Asia/Tokyo");
    // 14:05 UTC is 23:05 in Tokyo, still the 30th there.
    expect(res.body.today).toBe("2026-08-30");
  });

  it("rejects any days value that isn't 1, 3 or 7", async () => {
    const { accessToken } = await registerAndLogin("bad-days");
    const res = await recent(accessToken, 30);
    expect(res.status).toBe(400);
    expect(res.body.error.details.days[0]).toMatch(/1, 3, 7/);
  });

  it("reports a logged reminder for the day it was actually logged, not the day it fires", async () => {
    const { accessToken, userId } = await registerAndLogin("logged");
    const categoryId = await createCategory(accessToken);
    await createReminder(userId, { target: "CATEGORY", categoryId, schedules: ["0 9 * * *"] });
    await logCategory(accessToken, categoryId, `${TODAY}T09:30:00.000Z`);

    const res = await recent(accessToken, 1);

    expect(res.body.runs).toEqual([
      expect.objectContaining({ date: TODAY, time: "09:00", state: "logged" }),
    ]);
  });

  it("reports a due-but-unlogged reminder as missed, once its day has ended", async () => {
    const { accessToken, userId } = await registerAndLogin("missed");
    const categoryId = await createCategory(accessToken);
    await createReminder(userId, { target: "CATEGORY", categoryId, schedules: ["0 9 * * *"] });
    // Yesterday's 09:00 came and went with nothing logged.

    const res = await recent(accessToken, 3);

    expect(res.body.runs).toContainEqual(
      expect.objectContaining({ date: YESTERDAY, time: "09:00", state: "missed" }),
    );
  });

  it("does not call today's own not-yet-arrived slot missed", async () => {
    const { accessToken, userId } = await registerAndLogin("too-soon");
    const categoryId = await createCategory(accessToken);
    // "Now" is 14:05 - this slot has not happened yet today.
    await createReminder(userId, { target: "CATEGORY", categoryId, schedules: ["0 21 * * *"] });

    const res = await recent(accessToken, 1);

    expect(res.body.runs).toEqual([]);
  });

  it("does report today's own already-elapsed slot as missed once nothing was logged for it", async () => {
    const { accessToken, userId } = await registerAndLogin("today-elapsed");
    const categoryId = await createCategory(accessToken);
    // 09:00 has already passed today (now is 14:05) and nothing was logged.
    await createReminder(userId, { target: "CATEGORY", categoryId, schedules: ["0 9 * * *"] });

    const res = await recent(accessToken, 1);

    expect(res.body.runs).toEqual([
      expect.objectContaining({ date: TODAY, time: "09:00", state: "missed" }),
    ]);
  });

  it("never calls today's own elapsed-but-not-yet-due slot missed while the day is still open", async () => {
    const { accessToken, userId } = await registerAndLogin("today-open");
    const categoryId = await createCategory(accessToken);
    // Logged today, after the slot - so it should read "logged", not "missed".
    await createReminder(userId, { target: "CATEGORY", categoryId, schedules: ["0 9 * * *"] });
    await logCategory(accessToken, categoryId, `${TODAY}T13:00:00.000Z`);

    const res = await recent(accessToken, 1);

    expect(res.body.runs).toEqual([
      expect.objectContaining({ date: TODAY, time: "09:00", state: "logged" }),
    ]);
  });

  it("gives a rhythm reminder no missed row at all", async () => {
    const { accessToken, userId } = await registerAndLogin("rhythm");
    const categoryId = await createCategory(accessToken, "Water", "numeric");
    // Every two hours, never stops on logging - nothing to have missed.
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId,
      schedules: ["0 */2 * * *"],
      stopsWhenLogged: false,
    });

    const res = await recent(accessToken, 3);

    expect(res.body.runs).toEqual([]);
  });

  it("still reports a logged day for a rhythm reminder, if it happens to have been logged", async () => {
    const { accessToken, userId } = await registerAndLogin("rhythm-logged");
    const categoryId = await createCategory(accessToken, "Water", "numeric");
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId,
      schedules: ["0 */2 * * *"],
      stopsWhenLogged: false,
    });
    await logCategory(accessToken, categoryId, `${YESTERDAY}T10:00:00.000Z`, { valueNumeric: 2 });

    const res = await recent(accessToken, 3);

    expect(res.body.runs).toContainEqual(
      expect.objectContaining({ date: YESTERDAY, state: "logged" }),
    );
  });

  it("reports a currently-disabled reminder as paused, not missed", async () => {
    const { accessToken, userId } = await registerAndLogin("paused");
    const categoryId = await createCategory(accessToken);
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId,
      schedules: ["0 9 * * *"],
      enabled: false,
    });

    const res = await recent(accessToken, 1);

    expect(res.body.runs).toEqual([
      expect.objectContaining({ date: TODAY, time: "09:00", state: "paused" }),
    ]);
  });

  it("collapses a day with several slots into one row, not one per slot", async () => {
    const { accessToken, userId } = await registerAndLogin("one-row-per-day");
    const categoryId = await createCategory(accessToken);
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId,
      schedules: ["0 9 * * *", "0 12 * * *"],
    });

    const res = await recent(accessToken, 1);

    // Both slots have elapsed by 14:05 and neither was logged - one missed row, at the first slot.
    expect(res.body.runs).toEqual([
      expect.objectContaining({ date: TODAY, time: "09:00", state: "missed" }),
    ]);
  });

  it("carries a category's name and icon, and null for a general reminder", async () => {
    const { accessToken, userId } = await registerAndLogin("category-shape");
    const categoryId = await createCategory(accessToken, "Sertraline");
    await request(app)
      .patch(`/api/categories/${categoryId}`)
      .set(authed(accessToken))
      .send({ icon: "💊" });
    await createReminder(userId, { target: "CATEGORY", categoryId, schedules: ["0 9 * * *"] });
    await createReminder(userId, { target: "GENERAL", schedules: ["0 12 * * *"] });

    const res = await recent(accessToken, 1);

    expect(res.body.runs).toContainEqual(
      expect.objectContaining({ category: { name: "Sertraline", icon: "💊" } }),
    );
    expect(res.body.runs).toContainEqual(
      expect.objectContaining({ target: "general", category: null }),
    );
  });

  it("merges several reminders into one chronological list, oldest first", async () => {
    const { accessToken, userId } = await registerAndLogin("merge");
    const morning = await createReminder(userId, { schedules: ["0 9 * * *"] });
    const category = await prisma.category.create({
      data: { userId, name: "Water intake", valueType: "NUMERIC", icon: "💧" },
    });
    const noon = await createReminder(userId, {
      target: "CATEGORY",
      categoryId: category.id,
      schedules: ["0 12 * * *"],
    });

    const res = await recent(accessToken, 3);

    expect(
      res.body.runs.map((r: { date: string; time: string; reminderId: string }) => [
        r.date,
        r.time,
        r.reminderId,
      ]),
    ).toEqual([
      [TWO_DAYS_AGO, "09:00", morning.id],
      [TWO_DAYS_AGO, "12:00", noon.id],
      [YESTERDAY, "09:00", morning.id],
      [YESTERDAY, "12:00", noon.id],
      [TODAY, "09:00", morning.id],
      [TODAY, "12:00", noon.id],
    ]);
  });

  it("never shows another user's reminders", async () => {
    const mine = await registerAndLogin("mine");
    const theirs = await registerAndLogin("theirs");
    await createReminder(theirs.userId, { schedules: ["0 9 * * *"] });

    const res = await recent(mine.accessToken, 1);

    expect(res.body.runs).toEqual([]);
  });

  it("returns an empty list for an account with no reminders at all", async () => {
    const { accessToken } = await registerAndLogin("none");
    const res = await recent(accessToken, 7);
    expect(res.body).toMatchObject({ timezone: "UTC", today: TODAY, truncated: false, runs: [] });
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  await prisma.categoryLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.reminderSend.deleteMany({ where: { reminder: { userId: { in: userIds } } } });
  await prisma.reminder.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
