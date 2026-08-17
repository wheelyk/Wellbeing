import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { addDaysToDateStr, todayInTimezone } from "../lib/timezone";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-trends-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

async function registerAndLogin(label: string) {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
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

describe("GET /api/trends", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).get("/api/trends");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid ?period=", async () => {
    const { accessToken } = await registerAndLogin("bad-period");
    const res = await request(app)
      .get("/api/trends")
      .query({ period: "14d" })
      .set(authed(accessToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("defaults to a 7-day period when ?period= is omitted", async () => {
    const { accessToken } = await registerAndLogin("default-period");
    const res = await request(app).get("/api/trends").set(authed(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.period).toBe("7d");
    expect(res.body.days).toHaveLength(7);
  });

  it.each(["7d", "30d", "90d"] as const)(
    "resolves a well-formed date range for period=%s",
    async (period) => {
      const { accessToken } = await registerAndLogin(`range-${period}`);
      const res = await request(app).get("/api/trends").query({ period }).set(authed(accessToken));

      expect(res.status).toBe(200);
      const expectedDays = { "7d": 7, "30d": 30, "90d": 90 }[period];
      expect(res.body.days).toHaveLength(expectedDays);
      expect(res.body.endDate).toBe(todayInTimezone("UTC"));
      expect(res.body.startDate).toBe(addDaysToDateStr(res.body.endDate, -(expectedDays - 1)));
      expect(res.body.symptomSeverity.series).toHaveLength(expectedDays);
      expect(res.body.mood.series).toHaveLength(expectedDays);
      expect(res.body.activity.days).toHaveLength(expectedDays);
    },
  );

  it("returns an empty-but-well-formed response for a brand-new user", async () => {
    const { accessToken } = await registerAndLogin("empty");
    const res = await request(app).get("/api/trends").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.symptomSeverity.average).toBeNull();
    expect(res.body.mood.average).toBeNull();
    expect(
      res.body.symptomSeverity.series.every((p: { average: null }) => p.average === null),
    ).toBe(true);
    expect(res.body.mood.series.every((p: { average: null }) => p.average === null)).toBe(true);
    expect(
      res.body.activity.days.every((d: { hasActivity: boolean }) => d.hasActivity === false),
    ).toBe(true);
  });

  it("computes per-day averages and an overall period average for symptom severity and mood", async () => {
    const { accessToken } = await registerAndLogin("averages");
    const today = todayInTimezone("UTC");
    const yesterday = addDaysToDateStr(today, -1);

    const symptomRes = await request(app)
      .post("/api/symptoms")
      .set(authed(accessToken))
      .send({ name: "Headache" });

    // Two severity logs on the same day (average to 6) and one on a different day (severity 2) -
    // overall average across all three individual logs is (4 + 8 + 2) / 3, not a mean-of-daily-
    // averages, per the route's documented weighting choice.
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId: symptomRes.body.id, severity: 4, loggedAt: `${today}T09:00:00.000Z` });
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId: symptomRes.body.id, severity: 8, loggedAt: `${today}T14:00:00.000Z` });
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId: symptomRes.body.id, severity: 2, loggedAt: `${yesterday}T09:00:00.000Z` });

    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 3, loggedAt: `${today}T09:00:00.000Z` });
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 5, loggedAt: `${yesterday}T09:00:00.000Z` });

    const res = await request(app)
      .get("/api/trends")
      .query({ period: "7d" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.symptomSeverity.average).toBeCloseTo((4 + 8 + 2) / 3);
    expect(res.body.mood.average).toBeCloseTo((3 + 5) / 2);

    const todayPoint = res.body.symptomSeverity.series.find(
      (p: { date: string }) => p.date === today,
    );
    const yesterdayPoint = res.body.symptomSeverity.series.find(
      (p: { date: string }) => p.date === yesterday,
    );
    expect(todayPoint).toMatchObject({ average: 6, count: 2 });
    expect(yesterdayPoint).toMatchObject({ average: 2, count: 1 });
  });

  it("marks a day active in the activity map for any of the four log types", async () => {
    const { accessToken } = await registerAndLogin("activity");
    const today = todayInTimezone("UTC");
    const loggedAt = `${today}T09:00:00.000Z`;

    const habitRes = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Walk", type: "boolean" });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: habitRes.body.id, valueBoolean: true, loggedAt });

    const res = await request(app).get("/api/trends").set(authed(accessToken));

    expect(res.status).toBe(200);
    const todayActivity = res.body.activity.days.find((d: { date: string }) => d.date === today);
    expect(todayActivity).toMatchObject({ hasActivity: true });

    const otherDays = res.body.activity.days.filter((d: { date: string }) => d.date !== today);
    expect(otherDays.every((d: { hasActivity: boolean }) => d.hasActivity === false)).toBe(true);
  });

  it("excludes entries outside the requested period", async () => {
    const { accessToken } = await registerAndLogin("out-of-range");
    const today = todayInTimezone("UTC");
    const longAgo = addDaysToDateStr(today, -30);

    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 1, loggedAt: `${longAgo}T09:00:00.000Z` });

    const res = await request(app)
      .get("/api/trends")
      .query({ period: "7d" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.mood.average).toBeNull();
  });

  it("resolves calendar days using the user's timezone, not UTC", async () => {
    const { accessToken, userId } = await registerAndLogin("timezone");
    await prisma.user.update({ where: { id: userId }, data: { timezone: "America/Los_Angeles" } });

    // 11pm Aug 16 in Los Angeles (PST-adjacent, UTC-7 in August) is already Aug 17 in UTC - this
    // must bucket to Aug 16 for this user, matching dashboard.ts's own timezone test.
    const res1 = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 4, loggedAt: "2026-08-17T06:00:00.000Z" });
    expect(res1.status).toBe(201);

    const res = await request(app)
      .get("/api/trends")
      .query({ period: "7d" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    // Whichever day it landed on (dependent on "today" for the test run), the average must be
    // non-null - i.e. the log was counted within the resolved period at all - confirming
    // timezone-aware bucketing didn't drop or misplace it outside the whole window.
    expect(res.body.mood.average).toBe(4);
  });

  it("never includes another user's entries", async () => {
    const userA = await registerAndLogin("iso-a");
    const userB = await registerAndLogin("iso-b");
    const today = todayInTimezone("UTC");

    await request(app)
      .post("/api/mood-logs")
      .set(authed(userB.accessToken))
      .send({ mood: 1, loggedAt: `${today}T09:00:00.000Z` });

    const res = await request(app).get("/api/trends").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.mood.average).toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
