import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-medicationlogs-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function createMedication(accessToken: string, name = "Ibuprofen") {
  const res = await request(app).post("/api/medications").set(authed(accessToken)).send({ name });
  return res.body.id as string;
}

describe("medication-logs routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/medication-logs");
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post("/api/medication-logs")
      .send({ medicationId: "x", taken: true });
    expect(postRes.status).toBe(401);
  });

  it("creates a medication log for the authenticated user and returns it", async () => {
    const { accessToken, userId } = await registerAndLogin("create");
    const medicationId = await createMedication(accessToken);

    const res = await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId, taken: true, notes: "With breakfast" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      medicationId,
      taken: true,
      notes: "With breakfast",
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.loggedAt).toBeDefined();
  });

  it("defaults loggedAt to now when omitted, and accepts an explicit past date for backfilling", async () => {
    const { accessToken } = await registerAndLogin("backfill");
    const medicationId = await createMedication(accessToken);
    const before = Date.now();

    const nowRes = await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId, taken: false });
    expect(nowRes.status).toBe(201);
    expect(new Date(nowRes.body.loggedAt).getTime()).toBeGreaterThanOrEqual(before);

    const past = "2026-01-01T09:00:00.000Z";
    const backfillRes = await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId, taken: true, loggedAt: past });
    expect(backfillRes.status).toBe(201);
    expect(backfillRes.body.loggedAt).toBe(past);
  });

  it("rejects a missing medicationId or non-boolean taken", async () => {
    const { accessToken } = await registerAndLogin("validation");
    const medicationId = await createMedication(accessToken);

    const missingMedication = await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ taken: true });
    expect(missingMedication.status).toBe(400);
    expect(missingMedication.body.error.code).toBe("VALIDATION_ERROR");

    const badTaken = await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId, taken: "yes" });
    expect(badTaken.status).toBe(400);
  });

  // The key ID-tampering defense: a user submitting another user's medicationId must not be
  // able to create a log against it, even though they're otherwise a fully authenticated user
  // creating their own log row (userId comes from the token, not the request body).
  it("rejects creating a medication log against another user's medicationId", async () => {
    const owner = await registerAndLogin("id-tamper-owner");
    const attacker = await registerAndLogin("id-tamper-attacker");
    const ownerMedicationId = await createMedication(owner.accessToken, "Owner's Medication");

    const res = await request(app)
      .post("/api/medication-logs")
      .set(authed(attacker.accessToken))
      .send({ medicationId: ownerMedicationId, taken: true });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MEDICATION_NOT_FOUND");

    const logs = await prisma.medicationLog.findMany({
      where: { medicationId: ownerMedicationId },
    });
    expect(logs).toHaveLength(0);
  });

  it("rejects re-pointing an existing log at another user's medicationId via PATCH", async () => {
    const owner = await registerAndLogin("id-tamper-patch-owner");
    const attacker = await registerAndLogin("id-tamper-patch-attacker");
    const ownerMedicationId = await createMedication(owner.accessToken, "Owner's Medication");
    const attackerMedicationId = await createMedication(
      attacker.accessToken,
      "Attacker's Medication",
    );

    const created = await request(app)
      .post("/api/medication-logs")
      .set(authed(attacker.accessToken))
      .send({ medicationId: attackerMedicationId, taken: true });
    expect(created.status).toBe(201);

    const res = await request(app)
      .patch(`/api/medication-logs/${created.body.id}`)
      .set(authed(attacker.accessToken))
      .send({ medicationId: ownerMedicationId });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MEDICATION_NOT_FOUND");

    const stillThere = await prisma.medicationLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.medicationId).toBe(attackerMedicationId);
  });

  it("lists only the authenticated user's medication logs, most recent first", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");
    const medA = await createMedication(userA.accessToken);
    const medB = await createMedication(userB.accessToken);

    await request(app)
      .post("/api/medication-logs")
      .set(authed(userA.accessToken))
      .send({ medicationId: medA, taken: true });
    await request(app)
      .post("/api/medication-logs")
      .set(authed(userA.accessToken))
      .send({ medicationId: medA, taken: false });
    await request(app)
      .post("/api/medication-logs")
      .set(authed(userB.accessToken))
      .send({ medicationId: medB, taken: true });

    const res = await request(app).get("/api/medication-logs").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries.every((log: { userId: string }) => log.userId === userA.userId)).toBe(
      true,
    );
  });

  it("paginates with limit/offset and reports hasMore correctly", async () => {
    const { accessToken } = await registerAndLogin("medication-pagination");
    const medicationId = await createMedication(accessToken);
    // Five medication logs, one hour apart, so ordering is deterministic.
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/medication-logs")
        .set(authed(accessToken))
        .send({
          medicationId,
          taken: true,
          loggedAt: new Date(Date.UTC(2026, 6, 1, i)).toISOString(),
        });
    }

    const page1 = await request(app)
      .get("/api/medication-logs")
      .query({ limit: 2, offset: 0 })
      .set(authed(accessToken));
    expect(page1.body.entries).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app)
      .get("/api/medication-logs")
      .query({ limit: 2, offset: 4 })
      .set(authed(accessToken));
    expect(page2.body.entries).toHaveLength(1);
    expect(page2.body.hasMore).toBe(false);
  });

  it("updates a medication log owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("update");
    const medicationId = await createMedication(accessToken);
    const created = await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId, taken: false, notes: "Skipped" });

    const res = await request(app)
      .patch(`/api/medication-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ taken: true, notes: "Actually took it later" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ taken: true, notes: "Actually took it later" });
  });

  it("clears notes when explicitly sent as null", async () => {
    const { accessToken } = await registerAndLogin("clear-notes");
    const medicationId = await createMedication(accessToken);
    const created = await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId, taken: false, notes: "Skipped" });

    const res = await request(app)
      .patch(`/api/medication-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ notes: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ taken: false, notes: null });
  });

  it("returns 404 updating or deleting a medication log that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("missing");

    const patchRes = await request(app)
      .patch("/api/medication-logs/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken))
      .send({ taken: true });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("MEDICATION_LOG_NOT_FOUND");

    const deleteRes = await request(app)
      .delete("/api/medication-logs/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 when a user tries to edit or delete another user's medication log", async () => {
    const owner = await registerAndLogin("owner");
    const intruder = await registerAndLogin("intruder");
    const medicationId = await createMedication(owner.accessToken);
    const created = await request(app)
      .post("/api/medication-logs")
      .set(authed(owner.accessToken))
      .send({ medicationId, taken: true });

    const patchRes = await request(app)
      .patch(`/api/medication-logs/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ taken: false });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/medication-logs/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);

    const stillThere = await prisma.medicationLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.taken).toBe(true);
  });

  it("deletes a medication log owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const medicationId = await createMedication(accessToken);
    const created = await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId, taken: true });

    const res = await request(app)
      .delete(`/api/medication-logs/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.medicationLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
