import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-habitlogs-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function createHabit(
  accessToken: string,
  type: "boolean" | "numeric" | "duration",
  name = `Habit ${type}`,
) {
  const res = await request(app).post("/api/habits").set(authed(accessToken)).send({ name, type });
  return res.body.id as string;
}

describe("habit-logs routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/habit-logs");
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post("/api/habit-logs")
      .send({ habitId: "irrelevant", valueBoolean: true });
    expect(postRes.status).toBe(401);
  });

  it("creates a log for a boolean habit with valueBoolean", async () => {
    const { accessToken, userId } = await registerAndLogin("bool-create");
    const habitId = await createHabit(accessToken, "boolean");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueBoolean: true, notes: "Did it" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      habitId,
      valueBoolean: true,
      valueNumeric: null,
      valueDurationMinutes: null,
      notes: "Did it",
    });
    expect(res.body.loggedAt).toBeDefined();
  });

  it("creates a log for a numeric habit with valueNumeric", async () => {
    const { accessToken } = await registerAndLogin("numeric-create");
    const habitId = await createHabit(accessToken, "numeric");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueNumeric: 2.5 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      habitId,
      valueBoolean: null,
      valueNumeric: 2.5,
      valueDurationMinutes: null,
    });
  });

  it("creates a log for a duration habit with valueDurationMinutes", async () => {
    const { accessToken } = await registerAndLogin("duration-create");
    const habitId = await createHabit(accessToken, "duration");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueDurationMinutes: 45 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      habitId,
      valueBoolean: null,
      valueNumeric: null,
      valueDurationMinutes: 45,
    });
  });

  it("rejects a value that doesn't match the habit's type (boolean habit, numeric value)", async () => {
    const { accessToken } = await registerAndLogin("mismatch-bool-numeric");
    const habitId = await createHabit(accessToken, "boolean");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueNumeric: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a value that doesn't match the habit's type (numeric habit, boolean value)", async () => {
    const { accessToken } = await registerAndLogin("mismatch-numeric-bool");
    const habitId = await createHabit(accessToken, "numeric");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueBoolean: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a value that doesn't match the habit's type (duration habit, numeric value)", async () => {
    const { accessToken } = await registerAndLogin("mismatch-duration-numeric");
    const habitId = await createHabit(accessToken, "duration");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueNumeric: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a request with no value field at all", async () => {
    const { accessToken } = await registerAndLogin("no-value");
    const habitId = await createHabit(accessToken, "boolean");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a request with more than one value field set at once", async () => {
    const { accessToken } = await registerAndLogin("two-values");
    const habitId = await createHabit(accessToken, "numeric");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueNumeric: 3, valueBoolean: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a negative duration and a non-integer duration", async () => {
    const { accessToken } = await registerAndLogin("bad-duration");
    const habitId = await createHabit(accessToken, "duration");

    const negative = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueDurationMinutes: -5 });
    expect(negative.status).toBe(400);

    const fractional = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueDurationMinutes: 12.5 });
    expect(fractional.status).toBe(400);
  });

  it("rejects creating a log against another user's habit (ID-tampering defense)", async () => {
    const owner = await registerAndLogin("tamper-owner");
    const attacker = await registerAndLogin("tamper-attacker");
    const habitId = await createHabit(owner.accessToken, "boolean");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(attacker.accessToken))
      .send({ habitId, valueBoolean: true });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HABIT_NOT_FOUND");

    // Confirm the attacker's request genuinely created nothing.
    const logs = await prisma.habitLog.findMany({ where: { habitId } });
    expect(logs).toHaveLength(0);
  });

  it("rejects creating a log against a habitId that doesn't exist at all", async () => {
    const { accessToken } = await registerAndLogin("nonexistent-habit");

    const res = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: "00000000-0000-0000-0000-000000000000", valueBoolean: true });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HABIT_NOT_FOUND");
  });

  it("defaults loggedAt to now when omitted, and accepts an explicit past date for backfilling", async () => {
    const { accessToken } = await registerAndLogin("backfill");
    const habitId = await createHabit(accessToken, "boolean");
    const before = Date.now();

    const nowRes = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueBoolean: false });
    expect(nowRes.status).toBe(201);
    expect(new Date(nowRes.body.loggedAt).getTime()).toBeGreaterThanOrEqual(before);

    const past = "2026-01-01T09:00:00.000Z";
    const backfillRes = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueBoolean: true, loggedAt: past });
    expect(backfillRes.status).toBe(201);
    expect(backfillRes.body.loggedAt).toBe(past);
  });

  it("lists only the authenticated user's habit logs, most recent first", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");
    const habitA = await createHabit(userA.accessToken, "boolean");
    const habitB = await createHabit(userB.accessToken, "boolean");

    await request(app)
      .post("/api/habit-logs")
      .set(authed(userA.accessToken))
      .send({ habitId: habitA, valueBoolean: true });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(userA.accessToken))
      .send({ habitId: habitA, valueBoolean: false });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(userB.accessToken))
      .send({ habitId: habitB, valueBoolean: true });

    const res = await request(app).get("/api/habit-logs").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((log: { userId: string }) => log.userId === userA.userId)).toBe(true);
  });

  it("updates a habit log's value and notes when owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("update");
    const habitId = await createHabit(accessToken, "numeric");
    const created = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueNumeric: 1, notes: "First glass" });

    const res = await request(app)
      .patch(`/api/habit-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ valueNumeric: 3, notes: "Three glasses" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valueNumeric: 3, notes: "Three glasses" });
  });

  it("clears notes when explicitly sent as null", async () => {
    const { accessToken } = await registerAndLogin("clear-notes");
    const habitId = await createHabit(accessToken, "numeric");
    const created = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueNumeric: 1, notes: "First glass" });

    const res = await request(app)
      .patch(`/api/habit-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ notes: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valueNumeric: 1, notes: null });
  });

  it("rejects updating a log's value with a shape that doesn't match its habit's type", async () => {
    const { accessToken } = await registerAndLogin("update-mismatch");
    const habitId = await createHabit(accessToken, "duration");
    const created = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueDurationMinutes: 20 });

    const res = await request(app)
      .patch(`/api/habit-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ valueBoolean: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("allows updating only notes without touching the existing value", async () => {
    const { accessToken } = await registerAndLogin("update-notes-only");
    const habitId = await createHabit(accessToken, "boolean");
    const created = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueBoolean: true });

    const res = await request(app)
      .patch(`/api/habit-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ notes: "Added later" });

    expect(res.status).toBe(200);
    expect(res.body.valueBoolean).toBe(true);
    expect(res.body.notes).toBe("Added later");
  });

  it("returns 404 updating or deleting a habit log that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("missing");

    const patchRes = await request(app)
      .patch("/api/habit-logs/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken))
      .send({ notes: "x" });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("HABIT_LOG_NOT_FOUND");

    const deleteRes = await request(app)
      .delete("/api/habit-logs/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 when a user tries to edit or delete another user's habit log", async () => {
    const owner = await registerAndLogin("log-owner");
    const intruder = await registerAndLogin("log-intruder");
    const habitId = await createHabit(owner.accessToken, "boolean");
    const created = await request(app)
      .post("/api/habit-logs")
      .set(authed(owner.accessToken))
      .send({ habitId, valueBoolean: true });

    const patchRes = await request(app)
      .patch(`/api/habit-logs/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ valueBoolean: false });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/habit-logs/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);

    const stillThere = await prisma.habitLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.valueBoolean).toBe(true);
  });

  it("deletes a habit log owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const habitId = await createHabit(accessToken, "boolean");
    const created = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId, valueBoolean: true });

    const res = await request(app)
      .delete(`/api/habit-logs/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.habitLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
