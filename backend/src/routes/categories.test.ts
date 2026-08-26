import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-categories-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("categories routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/categories");
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post("/api/categories")
      .send({ name: "Water intake", valueType: "numeric" });
    expect(postRes.status).toBe(401);
  });

  it("lists system categories plus the caller's own, but not another user's", async () => {
    const owner = await registerAndLogin("list-owner");
    const other = await registerAndLogin("list-other");

    await request(app)
      .post("/api/categories")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's custom category", valueType: "boolean" });
    await request(app)
      .post("/api/categories")
      .set(authed(other.accessToken))
      .send({ name: "Other's custom category", valueType: "boolean" });

    const res = await request(app).get("/api/categories").set(authed(owner.accessToken));

    expect(res.status).toBe(200);
    const names: string[] = res.body.map((c: { name: string }) => c.name);
    expect(names).toContain("Owner's custom category");
    expect(names).not.toContain("Other's custom category");
    expect(
      res.body.every(
        (c: { userId: string | null }) => c.userId === null || c.userId === owner.userId,
      ),
    ).toBe(true);
  });

  it("creates a user-specific category of each value type", async () => {
    const { accessToken, userId } = await registerAndLogin("create");

    const boolean = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Read today", valueType: "boolean", icon: "📖" });
    expect(boolean.status).toBe(201);
    expect(boolean.body).toMatchObject({
      userId,
      name: "Read today",
      valueType: "boolean",
      icon: "📖",
    });

    const numeric = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Water intake", valueType: "numeric" });
    expect(numeric.status).toBe(201);
    expect(numeric.body.valueType).toBe("numeric");

    const duration = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Meditation", valueType: "duration" });
    expect(duration.status).toBe(201);
    expect(duration.body.valueType).toBe("duration");

    const scale = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Energy level", valueType: "scale", scaleMin: 1, scaleMax: 5 });
    expect(scale.status).toBe(201);
    expect(scale.body).toMatchObject({ valueType: "scale", scaleMin: 1, scaleMax: 5 });
  });

  it("rejects a scale category with no scaleMin/scaleMax, or with scaleMin >= scaleMax", async () => {
    const { accessToken } = await registerAndLogin("scale-validation");

    const missingBounds = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Bad scale", valueType: "scale" });
    expect(missingBounds.status).toBe(400);
    expect(missingBounds.body.error.code).toBe("VALIDATION_ERROR");

    const invertedBounds = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Bad scale 2", valueType: "scale", scaleMin: 5, scaleMax: 1 });
    expect(invertedBounds.status).toBe(400);
  });

  it("rejects creating a category with no name", async () => {
    const { accessToken } = await registerAndLogin("validation");

    const res = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ valueType: "boolean" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("updates a category's name/icon but not its value type", async () => {
    const { accessToken } = await registerAndLogin("update");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Steps", valueType: "numeric" });

    const res = await request(app)
      .patch(`/api/categories/${created.body.id}`)
      .set(authed(accessToken))
      .send({ name: "Daily steps", icon: "🚶" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Daily steps", icon: "🚶", valueType: "numeric" });
  });

  it("returns 404 updating or deleting a category that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("missing");

    const patchRes = await request(app)
      .patch("/api/categories/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken))
      .send({ name: "Anything" });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("CATEGORY_NOT_FOUND");

    const deleteRes = await request(app)
      .delete("/api/categories/00000000-0000-0000-0000-000000000000")
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 when a user tries to edit or delete another user's category", async () => {
    const owner = await registerAndLogin("owner");
    const intruder = await registerAndLogin("intruder");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's private category", valueType: "boolean" });

    const patchRes = await request(app)
      .patch(`/api/categories/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ name: "Renamed" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/categories/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteRes.status).toBe(404);
  });

  it("returns 404 (not a different status) when a user tries to edit or delete a system category", async () => {
    const { accessToken } = await registerAndLogin("system-category");
    const systemCategory = await prisma.category.create({
      data: { userId: null, name: "Vitest system category", valueType: "BOOLEAN" },
    });

    const patchRes = await request(app)
      .patch(`/api/categories/${systemCategory.id}`)
      .set(authed(accessToken))
      .send({ name: "Renamed" });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe("CATEGORY_NOT_FOUND");

    const deleteRes = await request(app)
      .delete(`/api/categories/${systemCategory.id}`)
      .set(authed(accessToken));
    expect(deleteRes.status).toBe(404);

    const stillThere = await prisma.category.findUnique({ where: { id: systemCategory.id } });
    expect(stillThere?.archivedAt).toBeNull();

    await prisma.category.delete({ where: { id: systemCategory.id } });
  });

  it("archives (not hard-deletes) a category owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("archive");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Journaling", valueType: "boolean" });

    const res = await request(app)
      .delete(`/api/categories/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).not.toBeNull();

    // Still exists in the database (archived, not deleted) - a category with logs against it
    // shouldn't ever silently vanish.
    const stillThere = await prisma.category.findUnique({ where: { id: created.body.id } });
    expect(stillThere).not.toBeNull();

    // No longer returned by the default list.
    const listRes = await request(app).get("/api/categories").set(authed(accessToken));
    expect(listRes.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it("creates and updates a category's description", async () => {
    const { accessToken } = await registerAndLogin("description");
    const created = await request(app).post("/api/categories").set(authed(accessToken)).send({
      name: "Joint pain",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 10,
      description: "Left knee, mostly",
    });
    expect(created.status).toBe(201);
    expect(created.body.description).toBe("Left knee, mostly");

    const updated = await request(app)
      .patch(`/api/categories/${created.body.id}`)
      .set(authed(accessToken))
      .send({ description: "Left knee and lower back" });
    expect(updated.status).toBe(200);
    expect(updated.body.description).toBe("Left knee and lower back");

    const cleared = await request(app)
      .patch(`/api/categories/${created.body.id}`)
      .set(authed(accessToken))
      .send({ description: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.description).toBeNull();
  });
});

describe("categories routes — lastLoggedAt", () => {
  it("is null for a category with no logs yet from this caller", async () => {
    const { accessToken } = await registerAndLogin("last-logged-none");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Never logged", valueType: "boolean" });

    const res = await request(app).get("/api/categories").set(authed(accessToken));
    const found = res.body.find((c: { id: string }) => c.id === created.body.id);
    expect(found.lastLoggedAt).toBeNull();
  });

  it("reflects the most recent log, not just any log, once logged more than once", async () => {
    const { accessToken } = await registerAndLogin("last-logged-latest");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Logged a few times", valueType: "boolean" });

    await request(app).post("/api/category-logs").set(authed(accessToken)).send({
      categoryId: created.body.id,
      valueBoolean: true,
      loggedAt: "2026-01-01T09:00:00.000Z",
    });
    const latest = await request(app).post("/api/category-logs").set(authed(accessToken)).send({
      categoryId: created.body.id,
      valueBoolean: false,
      loggedAt: "2026-03-15T09:00:00.000Z",
    });
    await request(app).post("/api/category-logs").set(authed(accessToken)).send({
      categoryId: created.body.id,
      valueBoolean: true,
      loggedAt: "2026-02-01T09:00:00.000Z",
    });

    const res = await request(app).get("/api/categories").set(authed(accessToken));
    const found = res.body.find((c: { id: string }) => c.id === created.body.id);
    expect(found.lastLoggedAt).toBe(latest.body.loggedAt);
  });

  it("is scoped per caller - another user's log against the same system category doesn't count", async () => {
    const owner = await registerAndLogin("last-logged-owner");
    const other = await registerAndLogin("last-logged-other");
    const systemCategory = await prisma.category.create({
      data: { userId: null, name: "Vitest lastLoggedAt system category", valueType: "BOOLEAN" },
    });

    await request(app)
      .post("/api/category-logs")
      .set(authed(other.accessToken))
      .send({ categoryId: systemCategory.id, valueBoolean: true });

    const res = await request(app).get("/api/categories").set(authed(owner.accessToken));
    const found = res.body.find((c: { id: string }) => c.id === systemCategory.id);
    expect(found.lastLoggedAt).toBeNull();

    // The category_logs FK is Restrict, not Cascade (see schema.prisma) - the log created above
    // against this system category has to go first, or deleting the category itself would fail.
    await prisma.categoryLog.deleteMany({ where: { categoryId: systemCategory.id } });
    await prisma.category.delete({ where: { id: systemCategory.id } });
  });
});

describe("categories routes — hide/unhide", () => {
  it("hides a system category from this caller's own list, but not another user's", async () => {
    const caller = await registerAndLogin("hide-caller");
    const other = await registerAndLogin("hide-other");
    const systemCategory = await prisma.category.create({
      data: { userId: null, name: "Vitest hideable system category", valueType: "BOOLEAN" },
    });

    const hideRes = await request(app)
      .post(`/api/categories/${systemCategory.id}/hide`)
      .set(authed(caller.accessToken));
    expect(hideRes.status).toBe(200);

    const callerList = await request(app).get("/api/categories").set(authed(caller.accessToken));
    expect(callerList.body.map((c: { id: string }) => c.id)).not.toContain(systemCategory.id);

    const otherList = await request(app).get("/api/categories").set(authed(other.accessToken));
    expect(otherList.body.map((c: { id: string }) => c.id)).toContain(systemCategory.id);

    await prisma.category.delete({ where: { id: systemCategory.id } });
  });

  it("?includeHidden=true still returns a hidden category, flagged hidden: true", async () => {
    const { accessToken } = await registerAndLogin("hide-include");
    const systemCategory = await prisma.category.create({
      data: { userId: null, name: "Vitest includeHidden system category", valueType: "BOOLEAN" },
    });
    await request(app).post(`/api/categories/${systemCategory.id}/hide`).set(authed(accessToken));

    const res = await request(app)
      .get("/api/categories?includeHidden=true")
      .set(authed(accessToken));
    const found = res.body.find((c: { id: string }) => c.id === systemCategory.id);
    expect(found).toBeDefined();
    expect(found.hidden).toBe(true);

    // Every other (non-hidden) category in the same response is flagged hidden: false, not just
    // omitted - the frontend needs a reliable field to key its Hide/Unhide button off of.
    const somethingElse = res.body.find((c: { id: string }) => c.id !== systemCategory.id);
    if (somethingElse) expect(somethingElse.hidden).toBe(false);

    await prisma.category.delete({ where: { id: systemCategory.id } });
  });

  it("unhides a category, returning it to the default list", async () => {
    const { accessToken } = await registerAndLogin("unhide");
    const systemCategory = await prisma.category.create({
      data: { userId: null, name: "Vitest unhide system category", valueType: "BOOLEAN" },
    });
    await request(app).post(`/api/categories/${systemCategory.id}/hide`).set(authed(accessToken));

    const unhideRes = await request(app)
      .delete(`/api/categories/${systemCategory.id}/hide`)
      .set(authed(accessToken));
    expect(unhideRes.status).toBe(200);

    const listRes = await request(app).get("/api/categories").set(authed(accessToken));
    expect(listRes.body.map((c: { id: string }) => c.id)).toContain(systemCategory.id);

    await prisma.category.delete({ where: { id: systemCategory.id } });
  });

  it("re-hiding an already-hidden category, or unhiding one that was never hidden, is a harmless no-op", async () => {
    const { accessToken } = await registerAndLogin("hide-idempotent");
    const systemCategory = await prisma.category.create({
      data: { userId: null, name: "Vitest idempotent-hide system category", valueType: "BOOLEAN" },
    });

    const firstHide = await request(app)
      .post(`/api/categories/${systemCategory.id}/hide`)
      .set(authed(accessToken));
    expect(firstHide.status).toBe(200);
    const secondHide = await request(app)
      .post(`/api/categories/${systemCategory.id}/hide`)
      .set(authed(accessToken));
    expect(secondHide.status).toBe(200);

    const neverHidden = await registerAndLogin("hide-idempotent-unhide");
    const unhideRes = await request(app)
      .delete(`/api/categories/${systemCategory.id}/hide`)
      .set(authed(neverHidden.accessToken));
    expect(unhideRes.status).toBe(200);

    await prisma.category.delete({ where: { id: systemCategory.id } });
  });

  it("rejects hiding a personal category (own archive action already covers that)", async () => {
    const { accessToken } = await registerAndLogin("hide-personal");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "My own category", valueType: "boolean" });

    const res = await request(app)
      .post(`/api/categories/${created.body.id}/hide`)
      .set(authed(accessToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });

  it("rejects hiding an already-archived system category", async () => {
    const { accessToken } = await registerAndLogin("hide-archived");
    const systemCategory = await prisma.category.create({
      data: {
        userId: null,
        name: "Vitest archived system category",
        valueType: "BOOLEAN",
        archivedAt: new Date(),
      },
    });

    const res = await request(app)
      .post(`/api/categories/${systemCategory.id}/hide`)
      .set(authed(accessToken));
    expect(res.status).toBe(404);

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
