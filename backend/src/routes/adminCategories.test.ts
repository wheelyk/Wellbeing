import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-admincategories-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];
// System categories (userId: null) this file creates - tracked explicitly and cleaned up by id,
// rather than a blanket "delete every userId: null category" in afterAll, since other test files
// (e.g. categories.test.ts) may have their own system-category rows alive at the same time if
// vitest runs test files in parallel.
const createdSystemCategoryIds: string[] = [];

async function registerAndLogin(email: string) {
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

// ADMIN_EMAIL (see backend/.env, loaded via dotenv/config at import time - the same convention
// push.test.ts's VAPID_* keys already rely on) names the one account requireAdmin ever lets
// through. Registering an account with this exact address is what actually makes it the admin
// for these tests, not any flag this test file sets itself.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

describe.skipIf(!ADMIN_EMAIL)("admin categories routes", () => {
  it("403s a regular (non-admin) authenticated user on every method", async () => {
    const { accessToken } = await registerAndLogin(uniqueEmail("non-admin"));

    const getRes = await request(app).get("/api/admin/categories").set(authed(accessToken));
    expect(getRes.status).toBe(403);
    expect(getRes.body.error.code).toBe("FORBIDDEN");

    const postRes = await request(app)
      .post("/api/admin/categories")
      .set(authed(accessToken))
      .send({ name: "Sleep", valueType: "duration" });
    expect(postRes.status).toBe(403);
  });

  it("401s with no access token at all", async () => {
    const res = await request(app).get("/api/admin/categories");
    expect(res.status).toBe(401);
  });

  it("lets the admin account create a system-wide category visible to every other user", async () => {
    const admin = await registerAndLogin(ADMIN_EMAIL as string);
    const otherUser = await registerAndLogin(uniqueEmail("beneficiary"));

    const createRes = await request(app)
      .post("/api/admin/categories")
      .set(authed(admin.accessToken))
      .send({ name: "Sleep hours", valueType: "numeric", icon: "😴" });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      userId: null,
      name: "Sleep hours",
      valueType: "numeric",
    });
    createdSystemCategoryIds.push(createRes.body.id);

    // Visible to a completely different, non-admin user through the regular categories route.
    const listRes = await request(app).get("/api/categories").set(authed(otherUser.accessToken));
    const names: string[] = listRes.body.map((c: { name: string }) => c.name);
    expect(names).toContain("Sleep hours");

    // But that other user still can't edit or archive it - it's system-owned, not theirs.
    const patchRes = await request(app)
      .patch(`/api/categories/${createRes.body.id}`)
      .set(authed(otherUser.accessToken))
      .send({ name: "Renamed" });
    expect(patchRes.status).toBe(404);
  });

  it("creates a system category already assigned to a built-in group, but rejects a regular user's own private group", async () => {
    const admin = await registerAndLogin(ADMIN_EMAIL as string);
    const other = await registerAndLogin(uniqueEmail("group-owner"));

    const groupsRes = await request(app).get("/api/category-groups").set(authed(admin.accessToken));
    const medicineId = groupsRes.body.find((g: { name: string }) => g.name === "Medicine").id;

    const created = await request(app)
      .post("/api/admin/categories")
      .set(authed(admin.accessToken))
      .send({ name: "Ibuprofen (system)", valueType: "boolean", groupId: medicineId });
    expect(created.status).toBe(201);
    expect(created.body.groupId).toBe(medicineId);
    createdSystemCategoryIds.push(created.body.id);

    const privateGroup = await request(app)
      .post("/api/category-groups")
      .set(authed(other.accessToken))
      .send({ name: "Someone's private group" });
    const rejected = await request(app)
      .post("/api/admin/categories")
      .set(authed(admin.accessToken))
      .send({
        name: "Should fail",
        valueType: "boolean",
        groupId: privateGroup.body.id,
      });
    expect(rejected.status).toBe(404);
    expect(rejected.body.error.code).toBe("GROUP_NOT_FOUND");
  });

  it("rejects a scale category with no bounds, same validation as the regular categories route", async () => {
    const admin = await registerAndLogin(ADMIN_EMAIL as string);

    const res = await request(app)
      .post("/api/admin/categories")
      .set(authed(admin.accessToken))
      .send({ name: "Bad admin scale", valueType: "scale" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lets the admin update and archive a system category, scoped to userId: null only", async () => {
    const admin = await registerAndLogin(ADMIN_EMAIL as string);
    const created = await request(app)
      .post("/api/admin/categories")
      .set(authed(admin.accessToken))
      .send({ name: "Screen time", valueType: "duration" });
    createdSystemCategoryIds.push(created.body.id);

    const patchRes = await request(app)
      .patch(`/api/admin/categories/${created.body.id}`)
      .set(authed(admin.accessToken))
      .send({ name: "Daily screen time" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe("Daily screen time");

    const archiveRes = await request(app)
      .delete(`/api/admin/categories/${created.body.id}`)
      .set(authed(admin.accessToken));
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.archivedAt).not.toBeNull();

    const listRes = await request(app).get("/api/categories").set(authed(admin.accessToken));
    expect(listRes.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it("404s the admin trying to manage a regular user's personal category through the admin route", async () => {
    const admin = await registerAndLogin(ADMIN_EMAIL as string);
    const otherUser = await registerAndLogin(uniqueEmail("personal-owner"));

    const personal = await request(app)
      .post("/api/categories")
      .set(authed(otherUser.accessToken))
      .send({ name: "Someone's own category", valueType: "boolean" });

    const patchRes = await request(app)
      .patch(`/api/admin/categories/${personal.body.id}`)
      .set(authed(admin.accessToken))
      .send({ name: "Hijacked" });
    expect(patchRes.status).toBe(404);
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  await prisma.categoryLog.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { categoryId: { in: createdSystemCategoryIds } }] },
  });
  await prisma.category.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { id: { in: createdSystemCategoryIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
