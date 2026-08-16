import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-symptoms-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("symptoms routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/symptoms");
    expect(getRes.status).toBe(401);

    const postRes = await request(app).post("/api/symptoms").send({ name: "Headache" });
    expect(postRes.status).toBe(401);
  });

  it("lists system symptoms plus the caller's own custom symptoms, but not another user's", async () => {
    const owner = await registerAndLogin("list-owner");
    const other = await registerAndLogin("list-other");

    await request(app)
      .post("/api/symptoms")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's custom symptom" });
    await request(app)
      .post("/api/symptoms")
      .set(authed(other.accessToken))
      .send({ name: "Other's custom symptom" });

    const res = await request(app).get("/api/symptoms").set(authed(owner.accessToken));

    expect(res.status).toBe(200);
    const names: string[] = res.body.map((s: { name: string }) => s.name);
    expect(names).toContain("Owner's custom symptom");
    expect(names).not.toContain("Other's custom symptom");
    // System symptoms (seeded separately, userId null) should also be visible to every user -
    // this test doesn't assume the seed script has run, so it only asserts every returned row
    // is either null (system) or the caller's own, not that any specific system symptom exists.
    expect(
      res.body.every(
        (s: { userId: string | null }) => s.userId === null || s.userId === owner.userId,
      ),
    ).toBe(true);
  });

  it("creates a user-specific symptom with an optional description", async () => {
    const { accessToken, userId } = await registerAndLogin("create");

    const res = await request(app)
      .post("/api/symptoms")
      .set(authed(accessToken))
      .send({ name: "Joint pain", description: "Aching in the knees" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      name: "Joint pain",
      description: "Aching in the knees",
    });
  });

  it("rejects creating a symptom with no name", async () => {
    const { accessToken } = await registerAndLogin("validation");

    const res = await request(app).post("/api/symptoms").set(authed(accessToken)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("updates a symptom owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("update");
    const created = await request(app)
      .post("/api/symptoms")
      .set(authed(accessToken))
      .send({ name: "Fatigue (custom)" });

    const res = await request(app)
      .patch(`/api/symptoms/${created.body.id}`)
      .set(authed(accessToken))
      .send({ description: "Feeling drained all day" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Fatigue (custom)",
      description: "Feeling drained all day",
    });
  });

  it("returns 404 updating or deleting a symptom that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("missing");

    const patchRes = await request(app)
      .patch("/api/symptoms/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken))
      .send({ name: "Anything" });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("SYMPTOM_NOT_FOUND");

    const deleteRes = await request(app)
      .delete("/api/symptoms/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 when a user tries to edit or delete another user's custom symptom", async () => {
    const owner = await registerAndLogin("owner");
    const intruder = await registerAndLogin("intruder");
    const created = await request(app)
      .post("/api/symptoms")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's private symptom" });

    const patchRes = await request(app)
      .patch(`/api/symptoms/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ name: "Renamed" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/symptoms/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);

    const stillThere = await prisma.symptom.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.name).toBe("Owner's private symptom");
  });

  it("returns 404 (not a different status) when a user tries to edit or delete a system symptom", async () => {
    const { accessToken } = await registerAndLogin("system-symptom");
    const systemSymptom = await prisma.symptom.create({
      data: { userId: null, name: "Vitest system symptom" },
    });

    const patchRes = await request(app)
      .patch(`/api/symptoms/${systemSymptom.id}`)
      .set(authed(accessToken))
      .send({ name: "Renamed" });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("SYMPTOM_NOT_FOUND");

    const deleteRes = await request(app)
      .delete(`/api/symptoms/${systemSymptom.id}`)
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);

    const stillThere = await prisma.symptom.findUnique({ where: { id: systemSymptom.id } });
    expect(stillThere).not.toBeNull();

    await prisma.symptom.delete({ where: { id: systemSymptom.id } });
  });

  it("deletes a symptom owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const created = await request(app)
      .post("/api/symptoms")
      .set(authed(accessToken))
      .send({ name: "Nausea (custom)" });

    const res = await request(app)
      .delete(`/api/symptoms/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.symptom.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });

  it("refuses to delete a symptom that still has logged entries", async () => {
    const { accessToken } = await registerAndLogin("has-logs");
    const created = await request(app)
      .post("/api/symptoms")
      .set(authed(accessToken))
      .send({ name: "Symptom with history" });
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId: created.body.id, severity: 5 });

    const res = await request(app)
      .delete(`/api/symptoms/${created.body.id}`)
      .set(authed(accessToken));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SYMPTOM_HAS_LOGS");

    const stillThere = await prisma.symptom.findUnique({ where: { id: created.body.id } });
    expect(stillThere).not.toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  // Explicit order (logs, then symptoms, then users) rather than relying on onDelete: Cascade
  // to resolve it for us: the "has-logs" test above leaves a symptom with a log still pointing
  // at it (SymptomLog -> Symptom is RESTRICT, deliberately, per schema.prisma), and Postgres
  // doesn't guarantee cascade-delete ordering across two independent cascade paths (users ->
  // symptom_logs and users -> symptoms) enough to trust it wouldn't trip that same RESTRICT
  // constraint mid-cascade.
  await prisma.symptomLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.symptom.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
