import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-medications-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("medications routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/medications");
    expect(getRes.status).toBe(401);

    const postRes = await request(app).post("/api/medications").send({ name: "Ibuprofen" });
    expect(postRes.status).toBe(401);
  });

  it("creates a medication for the authenticated user and returns it", async () => {
    const { accessToken, userId } = await registerAndLogin("create");

    const res = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({ name: "Ibuprofen" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId, name: "Ibuprofen" });
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
  });

  it("rejects an empty or missing name", async () => {
    const { accessToken } = await registerAndLogin("validation");

    const emptyRes = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({ name: "   " });
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.code).toBe("VALIDATION_ERROR");

    const missingRes = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({});
    expect(missingRes.status).toBe(400);
  });

  it("lists only the authenticated user's medications", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");

    await request(app).post("/api/medications").set(authed(userA.accessToken)).send({ name: "A1" });
    await request(app).post("/api/medications").set(authed(userA.accessToken)).send({ name: "A2" });
    await request(app).post("/api/medications").set(authed(userB.accessToken)).send({ name: "B1" });

    const res = await request(app).get("/api/medications").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((med: { userId: string }) => med.userId === userA.userId)).toBe(true);
  });

  it("updates a medication owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("update");
    const created = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({ name: "Old Name" });

    const res = await request(app)
      .patch(`/api/medications/${created.body.id}`)
      .set(authed(accessToken))
      .send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "New Name" });
  });

  it("returns 404 updating or deleting a medication that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("missing");

    const patchRes = await request(app)
      .patch("/api/medications/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken))
      .send({ name: "Something" });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("MEDICATION_NOT_FOUND");

    const deleteRes = await request(app)
      .delete("/api/medications/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 when a user tries to edit or delete another user's medication", async () => {
    const owner = await registerAndLogin("owner");
    const intruder = await registerAndLogin("intruder");
    const created = await request(app)
      .post("/api/medications")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's Medication" });

    const patchRes = await request(app)
      .patch(`/api/medications/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ name: "Tampered" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/medications/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);

    const stillThere = await prisma.medication.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.name).toBe("Owner's Medication");
  });

  it("deletes a medication owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const created = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({ name: "To Delete" });

    const res = await request(app)
      .delete(`/api/medications/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.medication.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
