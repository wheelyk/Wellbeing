import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { todayInTimezone } from "../lib/timezone";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-dashboard-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("GET /api/dashboard", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(401);
  });

  it("rejects a malformed ?date= query param", async () => {
    const { accessToken } = await registerAndLogin("bad-date");
    const res = await request(app)
      .get("/api/dashboard")
      .query({ date: "17-08-2026" })
      .set(authed(accessToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("defaults to today, in the user's timezone (UTC by default)", async () => {
    const { accessToken } = await registerAndLogin("default-date");
    const res = await request(app).get("/api/dashboard").set(authed(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(todayInTimezone("UTC"));
  });

  it("returns an empty-but-well-formed summary for a brand-new user", async () => {
    const { accessToken } = await registerAndLogin("empty");
    const res = await request(app).get("/api/dashboard").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.mood).toBeNull();
    expect(res.body.symptomCount).toBe(0);
    expect(res.body.medicationSummary).toEqual({ taken: 0, total: 0 });
    expect(res.body.habitSummary).toEqual({ loggedCount: 0, totalHabits: 0 });
    expect(res.body.recentEntries).toEqual({
      entries: [],
      limit: 10,
      offset: 0,
      hasMore: false,
    });
    expect(res.body.streak).toEqual({ current: 0, daysLoggedThisWeek: 0 });
  });

  it("summarizes one entry of each type logged for the requested date", async () => {
    const { accessToken } = await registerAndLogin("summary");
    const date = "2026-08-17";
    const loggedAt = `${date}T09:00:00.000Z`;

    const symptomRes = await request(app)
      .post("/api/symptoms")
      .set(authed(accessToken))
      .send({ name: "Headache" });
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId: symptomRes.body.id, severity: 6, loggedAt });

    await request(app).post("/api/mood-logs").set(authed(accessToken)).send({ mood: 4, loggedAt });

    const medicationRes = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({ name: "Lisinopril" });
    await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId: medicationRes.body.id, taken: true, loggedAt });
    await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId: medicationRes.body.id, taken: false, loggedAt });

    const habitRes = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Walk", type: "boolean" });
    // A second habit that's never logged - exercises the "total habits" side of habitSummary.
    await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Meditate", type: "boolean" });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: habitRes.body.id, valueBoolean: true, loggedAt });

    const res = await request(app).get("/api/dashboard").query({ date }).set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.date).toBe(date);
    expect(res.body.mood).toMatchObject({ mood: 4 });
    expect(res.body.symptomCount).toBe(1);
    expect(res.body.medicationSummary).toEqual({ taken: 1, total: 2 });
    expect(res.body.habitSummary).toEqual({ loggedCount: 1, totalHabits: 2 });

    const labels = res.body.recentEntries.entries.map(
      (entry: { label: string; value: string }) => ({
        label: entry.label,
        value: entry.value,
      }),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        { label: "Headache", value: "6/10" },
        { label: "Mood", value: "4/5" },
        { label: "Lisinopril", value: "Taken" },
        { label: "Lisinopril", value: "Not taken" },
        { label: "Walk", value: "Done" },
      ]),
    );

    expect(res.body.streak.current).toBe(1);
    expect(res.body.streak.daysLoggedThisWeek).toBe(1);
  });

  // Regression test: the main summary test above only ever logs a *boolean* habit, so
  // formatHabitValue's numeric/duration branches (dashboard.ts) had never actually been
  // exercised by any test - a real gap for a case this codebase explicitly supports (see
  // habitLogs.ts's own three-way boolean/numeric/duration validation).
  it("formats numeric and duration habit values correctly in recentEntries", async () => {
    const { accessToken } = await registerAndLogin("habit-value-formats");
    const date = "2026-08-17";
    const loggedAt = `${date}T09:00:00.000Z`;

    const numericHabit = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Glasses of water", type: "numeric" });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: numericHabit.body.id, valueNumeric: 6, loggedAt });

    const durationHabit = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Meditation", type: "duration" });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: durationHabit.body.id, valueDurationMinutes: 15, loggedAt });

    const res = await request(app).get("/api/dashboard").query({ date }).set(authed(accessToken));

    const labels = res.body.recentEntries.entries.map(
      (entry: { label: string; value: string }) => ({ label: entry.label, value: entry.value }),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        { label: "Glasses of water", value: "6" },
        { label: "Meditation", value: "15 min" },
      ]),
    );
  });

  it("includes custom category logs in recentEntries, and counts them toward the streak", async () => {
    const { accessToken } = await registerAndLogin("category-entries");
    const date = "2026-08-17";
    const loggedAt = `${date}T09:00:00.000Z`;

    const scaleCategory = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Energy level", valueType: "scale", scaleMin: 1, scaleMax: 5, icon: "⚡" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: scaleCategory.body.id, valueNumeric: 4, loggedAt });

    const res = await request(app).get("/api/dashboard").query({ date }).set(authed(accessToken));

    expect(res.status).toBe(200);
    const categoryEntry = res.body.recentEntries.entries.find(
      (entry: { type: string }) => entry.type === "category",
    );
    expect(categoryEntry).toMatchObject({
      label: "Energy level",
      value: "4/5",
      categoryId: scaleCategory.body.id,
      icon: "⚡",
    });

    // A day with *only* a category log (no mood/symptom/medication/habit entry at all) still
    // counts as "logged" for streak purposes - hasLoggedToday's own reasoning in
    // reminderScheduler.ts applies identically here.
    expect(res.body.streak.current).toBe(1);
  });

  it("scopes results to the requested date only, excluding entries on other days", async () => {
    const { accessToken } = await registerAndLogin("scoped");

    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 2, loggedAt: "2026-08-10T09:00:00.000Z" });
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 5, loggedAt: "2026-08-17T09:00:00.000Z" });

    const res = await request(app)
      .get("/api/dashboard")
      .query({ date: "2026-08-10" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.mood).toMatchObject({ mood: 2 });
  });

  it("resolves a late-night entry to the correct calendar day for a non-UTC user's streak", async () => {
    const { accessToken, userId } = await registerAndLogin("timezone");
    await prisma.user.update({ where: { id: userId }, data: { timezone: "America/Los_Angeles" } });

    // 11pm on Jan 16 in Los Angeles (PST, UTC-8) is 7am Jan 17 in UTC - this must be counted
    // as a Jan 16 entry for this user, not Jan 17.
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 3, loggedAt: "2026-01-17T07:00:00.000Z" });

    const res = await request(app)
      .get("/api/dashboard")
      .query({ date: "2026-01-16" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.mood).toMatchObject({ mood: 3 });
    expect(res.body.streak.current).toBe(1);

    // The same entry must NOT show up for Jan 17 (the UTC calendar day) for this user.
    const nextDayRes = await request(app)
      .get("/api/dashboard")
      .query({ date: "2026-01-17" })
      .set(authed(accessToken));
    expect(nextDayRes.body.mood).toBeNull();
  });

  it("never includes another user's entries", async () => {
    const userA = await registerAndLogin("iso-a");
    const userB = await registerAndLogin("iso-b");
    const date = "2026-08-17";
    const loggedAt = `${date}T09:00:00.000Z`;

    await request(app)
      .post("/api/mood-logs")
      .set(authed(userB.accessToken))
      .send({ mood: 1, loggedAt });

    const res = await request(app)
      .get("/api/dashboard")
      .query({ date })
      .set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.mood).toBeNull();
    expect(res.body.recentEntries).toEqual({
      entries: [],
      limit: 10,
      offset: 0,
      hasMore: false,
    });
  });

  it("paginates recentEntries across all four log types with ?limit=&offset=", async () => {
    const { accessToken } = await registerAndLogin("paginate-recent");

    // 12 mood logs, spaced an hour apart, is enough to force pagination on its own - proves the
    // merge-then-slice logic works even when a single type accounts for every entry in a page,
    // not just the easy case of one entry per type.
    for (let i = 0; i < 12; i++) {
      await request(app)
        .post("/api/mood-logs")
        .set(authed(accessToken))
        .send({ mood: 3, loggedAt: `2026-08-17T${String(9 + i).padStart(2, "0")}:00:00.000Z` });
    }

    const firstPage = await request(app)
      .get("/api/dashboard")
      .query({ limit: 10, offset: 0 })
      .set(authed(accessToken));
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.recentEntries.entries).toHaveLength(10);
    expect(firstPage.body.recentEntries.hasMore).toBe(true);
    // Most recent first: the 11am-hour-offset-by-index entries were logged with increasing
    // hours, so the last one logged (index 11, 20:00Z) must sort first.
    expect(firstPage.body.recentEntries.entries[0].loggedAt).toBe("2026-08-17T20:00:00.000Z");

    const secondPage = await request(app)
      .get("/api/dashboard")
      .query({ limit: 10, offset: 10 })
      .set(authed(accessToken));
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.recentEntries.entries).toHaveLength(2);
    expect(secondPage.body.recentEntries.hasMore).toBe(false);
    // The oldest entry (index 0, 09:00Z) must land last, on the second page.
    expect(secondPage.body.recentEntries.entries[1].loggedAt).toBe("2026-08-17T09:00:00.000Z");
  });

  // Regression test for a documented-but-previously-unverified edge case (see this route's own
  // comment: "Can only happen if the user row was deleted after the access token was issued").
  // A still-validly-signed access token can outlive the user row it was issued for - e.g. a
  // second tab calling DELETE /api/users/me while this token is still within its 15-minute
  // lifetime - and this must answer a genuine 404, not crash trying to read `.timezone` off a
  // null user.
  it("returns 404 if the user row was deleted after the access token was issued", async () => {
    const { userId, accessToken } = await registerAndLogin("deleted-mid-session");
    await prisma.user.delete({ where: { id: userId } });

    const res = await request(app).get("/api/dashboard").set(authed(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
