import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-habits-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("habits routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/habits");
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post("/api/habits")
      .send({ name: "Exercise", type: "boolean" });
    expect(postRes.status).toBe(401);
  });

  it("creates a habit for the authenticated user for each supported type", async () => {
    const { accessToken, userId } = await registerAndLogin("create");

    for (const type of ["boolean", "numeric", "duration"] as const) {
      const res = await request(app)
        .post("/api/habits")
        .set(authed(accessToken))
        .send({ name: `Habit ${type}`, type });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ userId, name: `Habit ${type}`, type });
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
    }
  });

  it("rejects a missing name or an unsupported type", async () => {
    const { accessToken } = await registerAndLogin("validation");

    const missingName = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ type: "boolean" });
    expect(missingName.status).toBe(400);
    expect(missingName.body.error.code).toBe("VALIDATION_ERROR");

    const badType = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Sleep", type: "weekly" });
    expect(badType.status).toBe(400);
  });

  it("lists only the authenticated user's habits, oldest first", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");

    await request(app)
      .post("/api/habits")
      .set(authed(userA.accessToken))
      .send({ name: "Walk", type: "duration" });
    await request(app)
      .post("/api/habits")
      .set(authed(userA.accessToken))
      .send({ name: "Water", type: "numeric" });
    await request(app)
      .post("/api/habits")
      .set(authed(userB.accessToken))
      .send({ name: "Other user's habit", type: "boolean" });

    const res = await request(app).get("/api/habits").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((h: { userId: string }) => h.userId === userA.userId)).toBe(true);
    expect(res.body.map((h: { name: string }) => h.name)).toEqual(["Walk", "Water"]);
  });

  it("updates a habit's name (owned by the authenticated user)", async () => {
    const { accessToken } = await registerAndLogin("update");
    const created = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Exercise", type: "boolean" });

    const res = await request(app)
      .patch(`/api/habits/${created.body.id}`)
      .set(authed(accessToken))
      .send({ name: "Exercise (30 min)" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Exercise (30 min)");
    // type is immutable - never accepted on update, so it must be unchanged.
    expect(res.body.type).toBe("boolean");
  });

  it("ignores an attempt to change type via PATCH", async () => {
    const { accessToken } = await registerAndLogin("immutable-type");
    const created = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Water", type: "numeric" });

    const res = await request(app)
      .patch(`/api/habits/${created.body.id}`)
      .set(authed(accessToken))
      .send({ name: "Water intake", type: "duration" });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("numeric");
  });

  it("returns 404 updating or deleting a habit that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("missing");

    const patchRes = await request(app)
      .patch("/api/habits/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken))
      .send({ name: "Ghost" });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("HABIT_NOT_FOUND");

    const deleteRes = await request(app)
      .delete("/api/habits/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 when a user tries to edit or delete another user's habit", async () => {
    const owner = await registerAndLogin("owner");
    const intruder = await registerAndLogin("intruder");
    const created = await request(app)
      .post("/api/habits")
      .set(authed(owner.accessToken))
      .send({ name: "Private habit", type: "boolean" });

    const patchRes = await request(app)
      .patch(`/api/habits/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ name: "Hijacked" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/habits/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);

    const stillThere = await prisma.habit.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.name).toBe("Private habit");
  });

  it("deletes a habit owned by the authenticated user, cascading its logs", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const created = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Exercise", type: "boolean" });

    const log = await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: created.body.id, valueBoolean: true });
    expect(log.status).toBe(201);

    const res = await request(app)
      .delete(`/api/habits/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.habit.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
    const logStillThere = await prisma.habitLog.findUnique({ where: { id: log.body.id } });
    expect(logStillThere).toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
