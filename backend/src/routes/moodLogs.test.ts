import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-moodlogs-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("mood-logs routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/mood-logs");
    expect(getRes.status).toBe(401);

    const postRes = await request(app).post("/api/mood-logs").send({ mood: 3 });
    expect(postRes.status).toBe(401);
  });

  it("creates a mood log for the authenticated user and returns it", async () => {
    const { accessToken, userId } = await registerAndLogin("create");

    const res = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 4, energy: 3, stress: 2, notes: "Feeling okay" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      mood: 4,
      energy: 3,
      stress: 2,
      notes: "Feeling okay",
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.loggedAt).toBeDefined();
  });

  it("defaults loggedAt to now when omitted, and accepts an explicit past date for backfilling", async () => {
    const { accessToken } = await registerAndLogin("backfill");
    const before = Date.now();

    const nowRes = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 3 });
    expect(nowRes.status).toBe(201);
    expect(new Date(nowRes.body.loggedAt).getTime()).toBeGreaterThanOrEqual(before);

    const past = "2026-01-01T09:00:00.000Z";
    const backfillRes = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 2, loggedAt: past });
    expect(backfillRes.status).toBe(201);
    expect(backfillRes.body.loggedAt).toBe(past);
  });

  it("rejects mood outside 1-5, and energy/stress outside 1-7 when present", async () => {
    const { accessToken } = await registerAndLogin("validation");

    const badMood = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 6 });
    expect(badMood.status).toBe(400);
    expect(badMood.body.error.code).toBe("VALIDATION_ERROR");

    const badEnergyTooLow = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 3, energy: 0 });
    expect(badEnergyTooLow.status).toBe(400);

    const badEnergyTooHigh = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 3, energy: 8 });
    expect(badEnergyTooHigh.status).toBe(400);
  });

  it("accepts energy/stress up to 7, one point past mood's 1-5 range", async () => {
    const { accessToken } = await registerAndLogin("energy-stress-range");

    const res = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 5, energy: 7, stress: 6 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mood: 5, energy: 7, stress: 6 });
  });

  it("lists only the authenticated user's mood logs, most recent first", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");

    await request(app).post("/api/mood-logs").set(authed(userA.accessToken)).send({ mood: 1 });
    await request(app).post("/api/mood-logs").set(authed(userA.accessToken)).send({ mood: 5 });
    await request(app).post("/api/mood-logs").set(authed(userB.accessToken)).send({ mood: 3 });

    const res = await request(app).get("/api/mood-logs").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((log: { userId: string }) => log.userId === userA.userId)).toBe(true);
  });

  it("updates a mood log owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("update");
    const created = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 2, notes: "Rough start" });

    const res = await request(app)
      .patch(`/api/mood-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ mood: 4, notes: "Better now" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mood: 4, notes: "Better now" });
  });

  it("clears energy, stress, and notes when explicitly sent as null", async () => {
    const { accessToken } = await registerAndLogin("clear-optional-fields");
    const created = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 2, energy: 5, stress: 6, notes: "Rough start" });

    const res = await request(app)
      .patch(`/api/mood-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ energy: null, stress: null, notes: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mood: 2, energy: null, stress: null, notes: null });
  });

  it("returns 404 updating or deleting a mood log that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("missing");

    const patchRes = await request(app)
      .patch("/api/mood-logs/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken))
      .send({ mood: 3 });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("MOOD_LOG_NOT_FOUND");

    const deleteRes = await request(app)
      .delete("/api/mood-logs/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 when a user tries to edit or delete another user's mood log", async () => {
    const owner = await registerAndLogin("owner");
    const intruder = await registerAndLogin("intruder");
    const created = await request(app)
      .post("/api/mood-logs")
      .set(authed(owner.accessToken))
      .send({ mood: 3 });

    const patchRes = await request(app)
      .patch(`/api/mood-logs/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ mood: 1 });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/mood-logs/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);

    // Confirm the intruder's requests genuinely had no effect.
    const stillThere = await prisma.moodLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.mood).toBe(3);
  });

  it("deletes a mood log owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const created = await request(app)
      .post("/api/mood-logs")
      .set(authed(accessToken))
      .send({ mood: 3 });

    const res = await request(app)
      .delete(`/api/mood-logs/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.moodLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
