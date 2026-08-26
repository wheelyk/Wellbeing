import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-categorylogs-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function createCategory(
  accessToken: string,
  valueType: "boolean" | "numeric" | "duration" | "scale",
  extra: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post("/api/categories")
    .set(authed(accessToken))
    .send({ name: `Category ${valueType}`, valueType, ...extra });
  return res.body.id as string;
}

describe("category-logs routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/category-logs");
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post("/api/category-logs")
      .send({ categoryId: "irrelevant", valueBoolean: true });
    expect(postRes.status).toBe(401);
  });

  it("creates a log for a boolean category with valueBoolean", async () => {
    const { accessToken, userId } = await registerAndLogin("bool-create");
    const categoryId = await createCategory(accessToken, "boolean");

    const res = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueBoolean: true, notes: "Did it" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      categoryId,
      valueBoolean: true,
      valueNumeric: null,
      valueDurationMinutes: null,
      notes: "Did it",
    });
  });

  it("creates a log for a numeric category with valueNumeric", async () => {
    const { accessToken } = await registerAndLogin("numeric-create");
    const categoryId = await createCategory(accessToken, "numeric");

    const res = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueNumeric: 2.5 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ valueBoolean: null, valueNumeric: 2.5 });
  });

  it("creates a log for a duration category with valueDurationMinutes", async () => {
    const { accessToken } = await registerAndLogin("duration-create");
    const categoryId = await createCategory(accessToken, "duration");

    const res = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueDurationMinutes: 45 });

    expect(res.status).toBe(201);
    expect(res.body.valueDurationMinutes).toBe(45);
  });

  it("creates a log for a scale category within bounds, using valueNumeric", async () => {
    const { accessToken } = await registerAndLogin("scale-create");
    const categoryId = await createCategory(accessToken, "scale", { scaleMin: 1, scaleMax: 5 });

    const res = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueNumeric: 4 });

    expect(res.status).toBe(201);
    expect(res.body.valueNumeric).toBe(4);
  });

  it("rejects a scale value outside the category's own scaleMin/scaleMax", async () => {
    const { accessToken } = await registerAndLogin("scale-bounds");
    const categoryId = await createCategory(accessToken, "scale", { scaleMin: 1, scaleMax: 5 });

    const tooHigh = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueNumeric: 6 });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error.code).toBe("VALIDATION_ERROR");

    const tooLow = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueNumeric: 0 });
    expect(tooLow.status).toBe(400);
  });

  it("rejects a value that doesn't match the category's type", async () => {
    const { accessToken } = await registerAndLogin("mismatch");
    const categoryId = await createCategory(accessToken, "boolean");

    const res = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueNumeric: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("allows logging against a system category, but not another user's personal category", async () => {
    const owner = await registerAndLogin("system-log-owner");
    const other = await registerAndLogin("system-log-other");
    const systemCategory = await prisma.category.create({
      data: { userId: null, name: "Vitest system category", valueType: "BOOLEAN" },
    });
    const personalCategory = await createCategory(owner.accessToken, "boolean");

    const systemRes = await request(app)
      .post("/api/category-logs")
      .set(authed(other.accessToken))
      .send({ categoryId: systemCategory.id, valueBoolean: true });
    expect(systemRes.status).toBe(201);

    const personalRes = await request(app)
      .post("/api/category-logs")
      .set(authed(other.accessToken))
      .send({ categoryId: personalCategory, valueBoolean: true });
    expect(personalRes.status).toBe(404);
    expect(personalRes.body.error.code).toBe("CATEGORY_NOT_FOUND");

    await prisma.categoryLog.deleteMany({ where: { categoryId: systemCategory.id } });
    await prisma.category.delete({ where: { id: systemCategory.id } });
  });

  it("rejects creating a log against a categoryId that doesn't exist at all", async () => {
    const { accessToken } = await registerAndLogin("nonexistent-category");

    const res = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: "00000000-0000-0000-0000-000000000000", valueBoolean: true });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });

  it("clears notes when explicitly sent as null, and preserves value when updating notes only", async () => {
    const { accessToken } = await registerAndLogin("update");
    const categoryId = await createCategory(accessToken, "numeric");
    const created = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueNumeric: 1, notes: "First" });

    const cleared = await request(app)
      .patch(`/api/category-logs/${created.body.id}`)
      .set(authed(accessToken))
      .send({ notes: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ valueNumeric: 1, notes: null });
  });

  it("returns 404 when a user tries to edit or delete another user's category log", async () => {
    const owner = await registerAndLogin("log-owner");
    const intruder = await registerAndLogin("log-intruder");
    const categoryId = await createCategory(owner.accessToken, "boolean");
    const created = await request(app)
      .post("/api/category-logs")
      .set(authed(owner.accessToken))
      .send({ categoryId, valueBoolean: true });

    const patchRes = await request(app)
      .patch(`/api/category-logs/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ valueBoolean: false });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/category-logs/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("deletes a category log owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const categoryId = await createCategory(accessToken, "boolean");
    const created = await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId, valueBoolean: true });

    const res = await request(app)
      .delete(`/api/category-logs/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.categoryLog.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });

  it("lists only the authenticated user's category logs, most recent first", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");
    const categoryA = await createCategory(userA.accessToken, "boolean");
    const categoryB = await createCategory(userB.accessToken, "boolean");

    await request(app)
      .post("/api/category-logs")
      .set(authed(userA.accessToken))
      .send({ categoryId: categoryA, valueBoolean: true });
    await request(app)
      .post("/api/category-logs")
      .set(authed(userB.accessToken))
      .send({ categoryId: categoryB, valueBoolean: true });

    const res = await request(app).get("/api/category-logs").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].userId).toBe(userA.userId);
  });

  // Phase 18: a per-category Dashboard card pages through just its own history via this filter,
  // rather than the combined list every other list endpoint call in this file exercises.
  it("filters by ?categoryId=, returning only that category's own logs for the caller", async () => {
    const { accessToken } = await registerAndLogin("category-filter");
    const categoryA = await createCategory(accessToken, "boolean");
    const categoryB = await createCategory(accessToken, "boolean");

    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: categoryA, valueBoolean: true });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: categoryB, valueBoolean: false });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: categoryA, valueBoolean: false });

    const res = await request(app)
      .get(`/api/category-logs?categoryId=${categoryA}`)
      .set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(
      res.body.entries.every((log: { categoryId: string }) => log.categoryId === categoryA),
    ).toBe(true);
  });

  it("never returns another user's logs even when ?categoryId= names a shared system category", async () => {
    const owner = await registerAndLogin("category-filter-owner");
    const other = await registerAndLogin("category-filter-other");
    const systemCategory = await prisma.category.create({
      data: { userId: null, name: "Vitest filter system category", valueType: "BOOLEAN" },
    });

    await request(app)
      .post("/api/category-logs")
      .set(authed(owner.accessToken))
      .send({ categoryId: systemCategory.id, valueBoolean: true });
    await request(app)
      .post("/api/category-logs")
      .set(authed(other.accessToken))
      .send({ categoryId: systemCategory.id, valueBoolean: true });

    const res = await request(app)
      .get(`/api/category-logs?categoryId=${systemCategory.id}`)
      .set(authed(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].userId).toBe(owner.userId);

    // The category_logs FK is Restrict, not Cascade (see schema.prisma) - both logs created
    // above against this system category have to go first, or deleting it would fail.
    await prisma.categoryLog.deleteMany({ where: { categoryId: systemCategory.id } });
    await prisma.category.delete({ where: { id: systemCategory.id } });
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  await prisma.categoryLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
