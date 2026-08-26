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
      const category = await request(app)
        .post("/api/categories")
        .set(authed(accessToken))
        .send({ name: "Mood", valueType: "scale", scaleMin: 1, scaleMax: 5 });
      const res = await request(app).get("/api/trends").query({ period }).set(authed(accessToken));

      expect(res.status).toBe(200);
      const expectedDays = { "7d": 7, "30d": 30, "90d": 90 }[period];
      expect(res.body.days).toHaveLength(expectedDays);
      expect(res.body.endDate).toBe(todayInTimezone("UTC"));
      expect(res.body.startDate).toBe(addDaysToDateStr(res.body.endDate, -(expectedDays - 1)));
      const trend = res.body.categoryTrends.find(
        (t: { categoryId: string }) => t.categoryId === category.body.id,
      );
      expect(trend.series).toHaveLength(expectedDays);
      expect(res.body.activity.days).toHaveLength(expectedDays);
    },
  );

  it("returns an empty-but-well-formed response for a brand-new user", async () => {
    const { accessToken } = await registerAndLogin("empty");
    const res = await request(app).get("/api/trends").set(authed(accessToken));

    expect(res.status).toBe(200);
    // Every numeric/scale category this brand-new user can see - their own (none yet) plus every
    // system one (including Mood/Energy/Stress and every migrated system symptom - see
    // docs/log/17-unify-mood-symptom-habit.md) - must show up with an honest "no data yet" chart,
    // not just a single fixed mood series the way this route used to have before Mood itself
    // unified into Category.
    expect(res.body.categoryTrends.length).toBeGreaterThan(0);
    for (const trend of res.body.categoryTrends) {
      expect(trend.average).toBeNull();
      expect(trend.series.every((p: { average: null }) => p.average === null)).toBe(true);
    }
    expect(
      res.body.activity.days.every((d: { hasActivity: boolean }) => d.hasActivity === false),
    ).toBe(true);
  });

  // Regression test: a migrated symptom (Phase 17 - see docs/log/17-unify-mood-symptom-habit.md)
  // is just a SCALE category now, so its own per-day/overall averaging has to flow through the
  // same generic categoryTrends computation every other numeric/scale category uses - this is
  // the multi-log-per-day weighting scenario the old dedicated symptomSeverity computation used
  // to cover on its own, ported onto categoryTrends instead of being lost in the migration.
  it("computes per-day averages and an overall period average for a scale category, weighted by individual logs not daily means", async () => {
    const { accessToken } = await registerAndLogin("category-averages");
    const today = todayInTimezone("UTC");
    const yesterday = addDaysToDateStr(today, -1);

    const symptomRes = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Headache", valueType: "scale", scaleMin: 1, scaleMax: 10 });

    // Two logs on the same day (average to 6) and one on a different day (severity 2) - overall
    // average across all three individual logs is (4 + 8 + 2) / 3, not a mean-of-daily-averages,
    // per the route's documented weighting choice.
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({
        categoryId: symptomRes.body.id,
        valueNumeric: 4,
        loggedAt: `${today}T09:00:00.000Z`,
      });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({
        categoryId: symptomRes.body.id,
        valueNumeric: 8,
        loggedAt: `${today}T14:00:00.000Z`,
      });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({
        categoryId: symptomRes.body.id,
        valueNumeric: 2,
        loggedAt: `${yesterday}T09:00:00.000Z`,
      });

    const res = await request(app)
      .get("/api/trends")
      .query({ period: "7d" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    const trend = res.body.categoryTrends.find(
      (t: { categoryId: string }) => t.categoryId === symptomRes.body.id,
    );
    expect(trend.average).toBeCloseTo((4 + 8 + 2) / 3);

    const todayPoint = trend.series.find((p: { date: string }) => p.date === today);
    const yesterdayPoint = trend.series.find((p: { date: string }) => p.date === yesterday);
    expect(todayPoint).toMatchObject({ average: 6, count: 2 });
    expect(yesterdayPoint).toMatchObject({ average: 2, count: 1 });
  });

  it("marks a day active in the activity map for any log type", async () => {
    const { accessToken } = await registerAndLogin("activity");
    const today = todayInTimezone("UTC");
    const loggedAt = `${today}T09:00:00.000Z`;

    const categoryRes = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Walk", valueType: "boolean" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: categoryRes.body.id, valueBoolean: true, loggedAt });

    const res = await request(app).get("/api/trends").set(authed(accessToken));

    expect(res.status).toBe(200);
    const todayActivity = res.body.activity.days.find((d: { date: string }) => d.date === today);
    expect(todayActivity).toMatchObject({ hasActivity: true });

    const otherDays = res.body.activity.days.filter((d: { date: string }) => d.date !== today);
    expect(otherDays.every((d: { hasActivity: boolean }) => d.hasActivity === false)).toBe(true);
  });

  // Regression test: the test above (despite its own title) only actually seeds a boolean
  // *category* log - a medication log alone marking a day active had never been exercised by any
  // test, even though it goes through its own separate `bucketByDay(medicationLogs, ...)` call in
  // trends.ts.
  it("marks a day active from a medication log alone, with no other log type present", async () => {
    const { accessToken } = await registerAndLogin("activity-medication-only");
    const today = todayInTimezone("UTC");

    const medicationRes = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({ name: "Ibuprofen" });
    await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({
        medicationId: medicationRes.body.id,
        taken: true,
        loggedAt: `${today}T09:00:00.000Z`,
      });

    const res = await request(app).get("/api/trends").set(authed(accessToken));

    const todayActivity = res.body.activity.days.find((d: { date: string }) => d.date === today);
    expect(todayActivity).toMatchObject({ hasActivity: true });
  });

  it("excludes entries outside the requested period", async () => {
    const { accessToken } = await registerAndLogin("out-of-range");
    const today = todayInTimezone("UTC");
    const longAgo = addDaysToDateStr(today, -30);

    const category = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Mood", valueType: "scale", scaleMin: 1, scaleMax: 5 });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({
        categoryId: category.body.id,
        valueNumeric: 1,
        loggedAt: `${longAgo}T09:00:00.000Z`,
      });

    const res = await request(app)
      .get("/api/trends")
      .query({ period: "7d" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    const trend = res.body.categoryTrends.find(
      (t: { categoryId: string }) => t.categoryId === category.body.id,
    );
    expect(trend.average).toBeNull();
  });

  it("resolves calendar days using the user's timezone, not UTC", async () => {
    const { accessToken, userId } = await registerAndLogin("timezone");
    await prisma.user.update({ where: { id: userId }, data: { timezone: "America/Los_Angeles" } });
    const category = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Mood", valueType: "scale", scaleMin: 1, scaleMax: 5 });

    // 11pm yesterday in Los Angeles (PST-adjacent, UTC-7 in August) is already "today" in UTC -
    // this must bucket to *yesterday* for this user, matching dashboard.ts's own timezone test.
    // Anchored to `today` (computed at run time) rather than a hardcoded date: a fixed absolute
    // date here previously drifted outside the 7-day window this test itself queries once enough
    // real time had passed since the test was written - a real, reproduced bug, not a hypothetical
    // one - so "yesterday" is used instead, which is trivially inside any period of a day or more
    // regardless of when this test happens to run.
    const laToday = todayInTimezone("America/Los_Angeles");
    const res1 = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({
        categoryId: category.body.id,
        valueNumeric: 4,
        loggedAt: `${laToday}T06:00:00.000Z`,
      });
    expect(res1.status).toBe(201);

    const res = await request(app)
      .get("/api/trends")
      .query({ period: "7d" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    const trend = res.body.categoryTrends.find(
      (t: { categoryId: string }) => t.categoryId === category.body.id,
    );
    expect(trend.average).toBe(4);
  });

  it("never includes another user's entries", async () => {
    const userA = await registerAndLogin("iso-a");
    const userB = await registerAndLogin("iso-b");
    const today = todayInTimezone("UTC");

    const userBCategory = await request(app)
      .post("/api/categories")
      .set(authed(userB.accessToken))
      .send({ name: "Mood", valueType: "scale", scaleMin: 1, scaleMax: 5 });
    await request(app)
      .post("/api/category-logs")
      .set(authed(userB.accessToken))
      .send({
        categoryId: userBCategory.body.id,
        valueNumeric: 1,
        loggedAt: `${today}T09:00:00.000Z`,
      });

    const res = await request(app).get("/api/trends").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(
      res.body.categoryTrends.some(
        (t: { categoryId: string }) => t.categoryId === userBCategory.body.id,
      ),
    ).toBe(false);
  });

  // Regression test for a documented-but-previously-unverified edge case (see this route's own
  // comment: "Can only happen if the user row was deleted after the access token was issued").
  it("returns 404 if the user row was deleted after the access token was issued", async () => {
    const { userId, accessToken } = await registerAndLogin("deleted-mid-session");
    await prisma.user.delete({ where: { id: userId } });

    const res = await request(app).get("/api/trends").set(authed(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("returns a per-category series for a numeric/scale category, but no series for boolean/duration ones", async () => {
    const { accessToken } = await registerAndLogin("category-series");
    const today = todayInTimezone("UTC");
    const yesterday = addDaysToDateStr(today, -1);

    const scaleCategory = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Energy level", valueType: "scale", scaleMin: 1, scaleMax: 5 });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({
        categoryId: scaleCategory.body.id,
        valueNumeric: 4,
        loggedAt: `${today}T09:00:00.000Z`,
      });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({
        categoryId: scaleCategory.body.id,
        valueNumeric: 2,
        loggedAt: `${yesterday}T09:00:00.000Z`,
      });

    const booleanCategory = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Read today", valueType: "boolean" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({
        categoryId: booleanCategory.body.id,
        valueBoolean: true,
        loggedAt: `${today}T09:00:00.000Z`,
      });

    const res = await request(app)
      .get("/api/trends")
      .query({ period: "7d" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    // Not a plain length assertion - the shared system category list (including every migrated
    // symptom - see docs/log/17-unify-mood-symptom-habit.md) also contributes SCALE entries to
    // every user's own categoryTrends, so this looks up this test's own category specifically
    // rather than assuming it's the only one present.
    const trend = res.body.categoryTrends.find(
      (t: { categoryId: string }) => t.categoryId === scaleCategory.body.id,
    );
    expect(trend).toMatchObject({
      categoryId: scaleCategory.body.id,
      name: "Energy level",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
      average: 3,
    });
    const todayPoint = trend.series.find((p: { date: string }) => p.date === today);
    const yesterdayPoint = trend.series.find((p: { date: string }) => p.date === yesterday);
    expect(todayPoint).toMatchObject({ average: 4, count: 1 });
    expect(yesterdayPoint).toMatchObject({ average: 2, count: 1 });

    // The boolean category's own entry still counts toward the activity calendar...
    const todayActivity = res.body.activity.days.find((d: { date: string }) => d.date === today);
    expect(todayActivity).toMatchObject({ hasActivity: true });
    // ...but it gets no chart of its own, the same way any boolean/duration category never has
    // one (including former habits, now that Habit unified into Category).
    expect(res.body.categoryTrends.some((t: { name: string }) => t.name === "Read today")).toBe(
      false,
    );
  });

  it("still returns a category's chart (empty series) even with zero logs in the requested period", async () => {
    const { accessToken } = await registerAndLogin("category-no-logs");
    const category = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Water intake", valueType: "numeric" });

    const res = await request(app)
      .get("/api/trends")
      .query({ period: "7d" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    const trend = res.body.categoryTrends.find(
      (t: { categoryId: string }) => t.categoryId === category.body.id,
    );
    expect(trend).toMatchObject({ name: "Water intake", average: null });
    expect(trend.series.every((p: { average: null }) => p.average === null)).toBe(true);
  });

  it("never includes another user's personal categories in categoryTrends", async () => {
    const userA = await registerAndLogin("category-iso-a");
    const userB = await registerAndLogin("category-iso-b");
    await request(app)
      .post("/api/categories")
      .set(authed(userB.accessToken))
      .send({ name: "User B's category", valueType: "numeric" });

    const res = await request(app).get("/api/trends").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(
      res.body.categoryTrends.some((t: { name: string }) => t.name === "User B's category"),
    ).toBe(false);
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
