import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-history-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function createSymptom(accessToken: string, name: string) {
  const res = await request(app).post("/api/symptoms").set(authed(accessToken)).send({ name });
  return res.body.id as string;
}

async function createMedication(accessToken: string, name: string) {
  const res = await request(app).post("/api/medications").set(authed(accessToken)).send({ name });
  return res.body.id as string;
}

async function createHabit(accessToken: string, name: string) {
  const res = await request(app)
    .post("/api/habits")
    .set(authed(accessToken))
    .send({ name, type: "boolean" });
  return res.body.id as string;
}

// Seeds one log of each of the four types for a given user, spaced an hour apart via explicit
// loggedAt timestamps so ordering assertions are deterministic instead of relying on however
// fast the requests happen to fire.
async function seedOneOfEach(accessToken: string, baseIso: string) {
  const base = new Date(baseIso).getTime();
  const at = (hoursAgo: number) => new Date(base - hoursAgo * 60 * 60 * 1000).toISOString();

  const symptomId = await createSymptom(accessToken, "Headache");
  const medicationId = await createMedication(accessToken, "Ibuprofen");
  const habitId = await createHabit(accessToken, "Exercise");

  await request(app)
    .post("/api/mood-logs")
    .set(authed(accessToken))
    .send({ mood: 4, loggedAt: at(1) });
  await request(app)
    .post("/api/symptom-logs")
    .set(authed(accessToken))
    .send({ symptomId, severity: 6, loggedAt: at(2) });
  await request(app)
    .post("/api/medication-logs")
    .set(authed(accessToken))
    .send({ medicationId, taken: true, loggedAt: at(3) });
  await request(app)
    .post("/api/habit-logs")
    .set(authed(accessToken))
    .send({ habitId, valueBoolean: true, loggedAt: at(4) });
}

describe("GET /api/history", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).get("/api/history");
    expect(res.status).toBe(401);
  });

  it("returns a unified, chronologically-sorted list across all four log types", async () => {
    const { accessToken } = await registerAndLogin("unified");
    await seedOneOfEach(accessToken, "2026-06-01T12:00:00.000Z");

    const res = await request(app).get("/api/history").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(4);
    expect(res.body.entries.map((e: { type: string }) => e.type)).toEqual([
      "mood",
      "symptom",
      "medication",
      "habit",
    ]);
    // Sorted most-recent-first.
    const times = res.body.entries.map((e: { loggedAt: string }) => new Date(e.loggedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    expect(res.body.entries[0]).toMatchObject({ type: "mood", label: "Mood 4/5" });
    expect(res.body.entries[1]).toMatchObject({
      type: "symptom",
      label: "Headache — Severity 6/10",
    });
    expect(res.body.entries[2]).toMatchObject({
      type: "medication",
      label: "Ibuprofen — Taken",
    });
    expect(res.body.entries[3]).toMatchObject({ type: "habit", label: "Exercise: Done" });
    // Each entry's own id is present and is the id the corresponding per-type DELETE endpoint
    // expects - the same id used to create it via the per-type routes above.
    res.body.entries.forEach((entry: { id: string }) => expect(entry.id).toBeDefined());
  });

  // Regression test: `seedOneOfEach`'s habit is always `type: "boolean"`, so formatHabitValue's
  // numeric/duration branches (this route's own, separate copy of the same logic dashboard.ts
  // has) had never actually been exercised by any test here either.
  it("formats numeric and duration habit values correctly", async () => {
    const { accessToken } = await registerAndLogin("habit-value-formats");

    const numericHabit = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Glasses of water", type: "numeric" });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: numericHabit.body.id, valueNumeric: 6 });

    const durationHabit = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Meditation", type: "duration" });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: durationHabit.body.id, valueDurationMinutes: 15 });

    const res = await request(app).get("/api/history").set(authed(accessToken));

    const labels = res.body.entries.map((e: { label: string }) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Glasses of water: 6", "Meditation: 15 min"]));
  });

  it("includes custom category logs, formatted the same way as habit values, and filters by them too", async () => {
    const { accessToken } = await registerAndLogin("category-entries");

    const scaleCategory = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Energy level", valueType: "scale", scaleMin: 1, scaleMax: 5 });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: scaleCategory.body.id, valueNumeric: 4 });

    const durationCategory = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Meditation", valueType: "duration" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: durationCategory.body.id, valueDurationMinutes: 15 });

    const res = await request(app).get("/api/history").set(authed(accessToken));
    const labels = res.body.entries.map((e: { label: string }) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Energy level: 4/5", "Meditation: 15 min"]));

    const filtered = await request(app)
      .get("/api/history")
      .query({ type: "category" })
      .set(authed(accessToken));
    expect(filtered.body.entries).toHaveLength(2);
    expect(filtered.body.entries.every((e: { type: string }) => e.type === "category")).toBe(true);
  });

  it("filters by entry type", async () => {
    const { accessToken } = await registerAndLogin("filter-type");
    await seedOneOfEach(accessToken, "2026-06-02T12:00:00.000Z");

    const res = await request(app)
      .get("/api/history")
      .query({ type: "symptom" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].type).toBe("symptom");
  });

  it("filters by date range (from/to, inclusive)", async () => {
    const { accessToken } = await registerAndLogin("filter-date");
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 1, loggedAt: "2026-01-01T09:00:00.000Z" });
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 3, loggedAt: "2026-02-15T09:00:00.000Z" });
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 5, loggedAt: "2026-03-30T09:00:00.000Z" });

    const res = await request(app)
      .get("/api/history")
      .query({ from: "2026-02-01", to: "2026-02-28" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].label).toBe("Mood 3/5");
  });

  // Regression test: `from`/`to` are calendar-day strings that must be resolved against *this
  // user's own timezone*, the same convention dashboard.ts/trends.ts already use - not raw UTC
  // day boundaries. For a UTC-5 user (America/New_York in February, no DST), local Feb 1 spans
  // [2026-02-01T05:00:00.000Z, 2026-02-02T05:00:00.000Z) in UTC, not the UTC calendar day. Each
  // entry below sits on the "wrong" side of the naive-UTC-boundary version of this filter but
  // the "right" side of the timezone-aware one, so this test would have failed against the
  // pre-fix implementation instead of just happening to pass either way.
  it("resolves `from`/`to` against the user's own timezone, not UTC", async () => {
    const { accessToken } = await registerAndLogin("filter-date-timezone");
    await request(app)
      .patch("/api/users/me")
      .set(authed(accessToken))
      .send({ timezone: "America/New_York" });

    // Jan 31, 9pm local - a naive UTC-midnight filter for `from: 2026-02-01` would wrongly
    // include this (its UTC date is already Feb 1), but it isn't really Feb 1 for this user.
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 1, loggedAt: "2026-02-01T02:00:00.000Z" });
    // Feb 1, 7am local - unambiguously inside the requested day under either interpretation.
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 3, loggedAt: "2026-02-01T12:00:00.000Z" });
    // Feb 1, 9pm local - a naive UTC `to: 2026-02-01` filter would wrongly exclude this (its UTC
    // date has already rolled to Feb 2), even though it's still Feb 1 for this user.
    await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 5, loggedAt: "2026-02-02T02:00:00.000Z" });

    const res = await request(app)
      .get("/api/history")
      .query({ from: "2026-02-01", to: "2026-02-01" })
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: { label: string }) => e.label).sort()).toEqual([
      "Mood 3/5",
      "Mood 5/5",
    ]);
  });

  it("rejects `from` after `to`", async () => {
    const { accessToken } = await registerAndLogin("bad-range");
    const res = await request(app)
      .get("/api/history")
      .query({ from: "2026-05-01", to: "2026-01-01" })
      .set(authed(accessToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid type or date format", async () => {
    const { accessToken } = await registerAndLogin("bad-query");

    const badType = await request(app)
      .get("/api/history")
      .query({ type: "not-a-real-type" })
      .set(authed(accessToken));
    expect(badType.status).toBe(400);

    const badDate = await request(app)
      .get("/api/history")
      .query({ from: "06-01-2026" })
      .set(authed(accessToken));
    expect(badDate.status).toBe(400);
  });

  it("paginates with limit/offset and reports hasMore correctly", async () => {
    const { accessToken } = await registerAndLogin("pagination");
    // Five mood logs, one hour apart, so ordering is deterministic.
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/mood-logs")
        .set(authed(accessToken))
        .send({ mood: 3, loggedAt: new Date(Date.UTC(2026, 6, 1, i)).toISOString() });
    }

    const page1 = await request(app)
      .get("/api/history")
      .query({ limit: 2, offset: 0 })
      .set(authed(accessToken));
    expect(page1.body.entries).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app)
      .get("/api/history")
      .query({ limit: 2, offset: 2 })
      .set(authed(accessToken));
    expect(page2.body.entries).toHaveLength(2);
    expect(page2.body.hasMore).toBe(true);

    const page3 = await request(app)
      .get("/api/history")
      .query({ limit: 2, offset: 4 })
      .set(authed(accessToken));
    expect(page3.body.entries).toHaveLength(1);
    expect(page3.body.hasMore).toBe(false);

    // No overlap between pages.
    const allIds = [page1, page2, page3].flatMap((p) =>
      p.body.entries.map((e: { id: string }) => e.id),
    );
    expect(new Set(allIds).size).toBe(5);
  });

  it("only returns the authenticated user's own entries", async () => {
    const userA = await registerAndLogin("scope-a");
    const userB = await registerAndLogin("scope-b");
    await seedOneOfEach(userA.accessToken, "2026-06-03T12:00:00.000Z");
    await request(app).post("/api/mood-logs").set(authed(userB.accessToken)).send({ mood: 2 });

    const res = await request(app).get("/api/history").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(4);
  });

  // Regression test for a documented-but-previously-unverified edge case (see this route's own
  // comment: same "deleted-but-still-tokened caller" 404 dashboard.ts/trends.ts/users.ts/
  // export.ts already return). Also confirms this route now checks user existence
  // unconditionally, not just when `from`/`to` are present.
  it("returns 404 if the user row was deleted after the access token was issued", async () => {
    const { userId, accessToken } = await registerAndLogin("deleted-mid-session");
    await prisma.user.delete({ where: { id: userId } });

    const res = await request(app).get("/api/history").set(authed(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
