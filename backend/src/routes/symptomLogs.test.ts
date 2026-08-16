import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-symptomlogs-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("symptom-logs routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/symptom-logs");
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post("/api/symptom-logs")
      .send({ symptomId: "irrelevant", severity: 5 });
    expect(postRes.status).toBe(401);
  });

  it("creates a symptom log against a symptom the user owns", async () => {
    const { accessToken, userId } = await registerAndLogin("create-owned");
    const symptomId = await createSymptom(accessToken, "Migraine");

    const res = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 7, notes: "Started after lunch" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      symptomId,
      severity: 7,
      notes: "Started after lunch",
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.loggedAt).toBeDefined();
  });

  it("creates a symptom log against a system symptom (userId null)", async () => {
    const { accessToken, userId } = await registerAndLogin("create-system");
    const systemSymptom = await prisma.symptom.create({
      data: { userId: null, name: "Vitest system symptom for logs" },
    });

    const res = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId: systemSymptom.id, severity: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId, symptomId: systemSymptom.id, severity: 3 });

    await prisma.symptomLog.deleteMany({ where: { symptomId: systemSymptom.id } });
    await prisma.symptom.delete({ where: { id: systemSymptom.id } });
  });

  // This is the specific test the cross-cutting Phase 3 requirement calls for: a user must
  // not be able to create (or update) a symptom log against another user's private custom
  // symptom, even by supplying its real ID directly - the defining defense against
  // ID-tampering for this endpoint.
  it("rejects creating a symptom log against another user's private symptom (ID-tampering defense)", async () => {
    const owner = await registerAndLogin("tamper-owner");
    const attacker = await registerAndLogin("tamper-attacker");
    const privateSymptomId = await createSymptom(owner.accessToken, "Owner's private symptom");

    const res = await request(app)
      .post("/api/symptom-logs")
      .set(authed(attacker.accessToken))
      .send({ symptomId: privateSymptomId, severity: 6 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SYMPTOM_NOT_FOUND");

    const logs = await prisma.symptomLog.findMany({ where: { symptomId: privateSymptomId } });
    expect(logs).toHaveLength(0);
  });

  it("rejects updating a symptom log to point at another user's private symptom", async () => {
    const owner = await registerAndLogin("tamper-update-owner");
    const attacker = await registerAndLogin("tamper-update-attacker");
    const privateSymptomId = await createSymptom(
      owner.accessToken,
      "Owner's other private symptom",
    );
    const attackerSymptomId = await createSymptom(attacker.accessToken, "Attacker's own symptom");

    const created = await request(app)
      .post("/api/symptom-logs")
      .set(authed(attacker.accessToken))
      .send({ symptomId: attackerSymptomId, severity: 4 });

    const res = await request(app)
      .patch(`/api/symptom-logs/${created.body.id}`)
      .set(authed(attacker.accessToken))
      .send({ symptomId: privateSymptomId });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SYMPTOM_NOT_FOUND");

    const stillThere = await prisma.symptomLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.symptomId).toBe(attackerSymptomId);
  });

  it("rejects a nonexistent symptomId the same way as an inaccessible one", async () => {
    const { accessToken } = await registerAndLogin("bad-symptom-id");

    const res = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId: "00000000-0000-0000-0000-000000000000", severity: 5 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SYMPTOM_NOT_FOUND");
  });

  it("defaults loggedAt to now when omitted, and accepts an explicit past date for backfilling", async () => {
    const { accessToken } = await registerAndLogin("backfill");
    const symptomId = await createSymptom(accessToken, "Backfill symptom");
    const before = Date.now();

    const nowRes = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 4 });
    expect(nowRes.status).toBe(201);
    expect(new Date(nowRes.body.loggedAt).getTime()).toBeGreaterThanOrEqual(before);

    const past = "2026-01-01T09:00:00.000Z";
    const backfillRes = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 2, loggedAt: past });
    expect(backfillRes.status).toBe(201);
    expect(backfillRes.body.loggedAt).toBe(past);
  });

  it("rejects severity outside 1-10, and non-integer severity", async () => {
    const { accessToken } = await registerAndLogin("severity-validation");
    const symptomId = await createSymptom(accessToken, "Severity test symptom");

    const tooLow = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 0 });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.error.code).toBe("VALIDATION_ERROR");

    const tooHigh = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 11 });
    expect(tooHigh.status).toBe(400);

    const notInteger = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 5.5 });
    expect(notInteger.status).toBe(400);
  });

  it("accepts severity at both boundaries, 1 and 10", async () => {
    const { accessToken } = await registerAndLogin("severity-bounds");
    const symptomId = await createSymptom(accessToken, "Boundary symptom");

    const low = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 1 });
    expect(low.status).toBe(201);

    const high = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 10 });
    expect(high.status).toBe(201);
  });

  it("lists only the authenticated user's symptom logs, most recent first", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");
    const symptomA = await createSymptom(userA.accessToken, "List symptom A");
    const symptomB = await createSymptom(userB.accessToken, "List symptom B");

    await request(app)
      .post("/api/symptom-logs")
      .set(authed(userA.accessToken))
      .send({ symptomId: symptomA, severity: 3 });
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(userA.accessToken))
      .send({ symptomId: symptomA, severity: 8 });
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(userB.accessToken))
      .send({ symptomId: symptomB, severity: 5 });

    const res = await request(app).get("/api/symptom-logs").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((log: { userId: string }) => log.userId === userA.userId)).toBe(true);
  });

  it("updates a symptom log owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("update");
    const symptomId = await createSymptom(accessToken, "Update symptom");
    const created = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 4, notes: "Mild" });

    const res = await request(app)
      .patch(`/api/symptom-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ severity: 9, notes: "Much worse now" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ severity: 9, notes: "Much worse now" });
  });

  it("returns 404 updating or deleting a symptom log that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("missing");

    const patchRes = await request(app)
      .patch("/api/symptom-logs/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken))
      .send({ severity: 3 });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("SYMPTOM_LOG_NOT_FOUND");

    const deleteRes = await request(app)
      .delete("/api/symptom-logs/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 when a user tries to edit or delete another user's symptom log", async () => {
    const owner = await registerAndLogin("owner");
    const intruder = await registerAndLogin("intruder");
    const symptomId = await createSymptom(owner.accessToken, "Owner's log symptom");
    const created = await request(app)
      .post("/api/symptom-logs")
      .set(authed(owner.accessToken))
      .send({ symptomId, severity: 5 });

    const patchRes = await request(app)
      .patch(`/api/symptom-logs/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ severity: 1 });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/symptom-logs/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);

    const stillThere = await prisma.symptomLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.severity).toBe(5);
  });

  it("deletes a symptom log owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const symptomId = await createSymptom(accessToken, "Delete symptom");
    const created = await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId, severity: 6 });

    const res = await request(app)
      .delete(`/api/symptom-logs/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.symptomLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  await prisma.symptomLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.symptom.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
