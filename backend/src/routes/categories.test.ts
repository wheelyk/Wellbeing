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

describe("categories routes — groups", () => {
  async function findGroupId(accessToken: string, name: string): Promise<string> {
    const res = await request(app).get("/api/category-groups").set(authed(accessToken));
    return res.body.find((g: { name: string }) => g.name === name).id;
  }

  it("creates a category already assigned to a built-in group, and GET / returns its groupId", async () => {
    const { accessToken } = await registerAndLogin("create-with-group");
    const drinkId = await findGroupId(accessToken, "Drink");

    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Coffee", valueType: "numeric", groupId: drinkId });
    expect(created.status).toBe(201);
    expect(created.body.groupId).toBe(drinkId);

    const listRes = await request(app).get("/api/categories").set(authed(accessToken));
    const entry = listRes.body.find((c: { name: string }) => c.name === "Coffee");
    expect(entry.groupId).toBe(drinkId);
  });

  it("creates a category with no group at all - groupId is null, not required", async () => {
    const { accessToken } = await registerAndLogin("create-no-group");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Reading", valueType: "boolean" });
    expect(created.status).toBe(201);
    expect(created.body.groupId).toBeNull();
  });

  it("rejects creating or editing a category with a groupId that doesn't exist", async () => {
    const { accessToken } = await registerAndLogin("bad-group");
    const created = await request(app).post("/api/categories").set(authed(accessToken)).send({
      name: "Bad",
      valueType: "boolean",
      groupId: "00000000-0000-0000-0000-000000000000",
    });
    expect(created.status).toBe(404);
    expect(created.body.error.code).toBe("GROUP_NOT_FOUND");

    const real = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Fine", valueType: "boolean" });
    const badEdit = await request(app)
      .patch(`/api/categories/${real.body.id}`)
      .set(authed(accessToken))
      .send({ groupId: "00000000-0000-0000-0000-000000000000" });
    expect(badEdit.status).toBe(404);
    expect(badEdit.body.error.code).toBe("GROUP_NOT_FOUND");
  });

  it("rejects assigning a category to another user's private group", async () => {
    const owner = await registerAndLogin("group-owner");
    const intruder = await registerAndLogin("group-intruder");
    const privateGroup = await request(app)
      .post("/api/category-groups")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's private group" });

    const res = await request(app)
      .post("/api/categories")
      .set(authed(intruder.accessToken))
      .send({ name: "Sneaky", valueType: "boolean", groupId: privateGroup.body.id });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("GROUP_NOT_FOUND");
  });

  it("moves a category between groups, and back to Uncategorized with an explicit null", async () => {
    const { accessToken } = await registerAndLogin("move-group");
    const foodId = await findGroupId(accessToken, "Food");
    const drinkId = await findGroupId(accessToken, "Drink");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Smoothie", valueType: "numeric", groupId: foodId });

    const moved = await request(app)
      .patch(`/api/categories/${created.body.id}`)
      .set(authed(accessToken))
      .send({ groupId: drinkId });
    expect(moved.status).toBe(200);
    expect(moved.body.groupId).toBe(drinkId);

    const uncategorized = await request(app)
      .patch(`/api/categories/${created.body.id}`)
      .set(authed(accessToken))
      .send({ groupId: null });
    expect(uncategorized.status).toBe(200);
    expect(uncategorized.body.groupId).toBeNull();
  });
});

describe("categories routes — soft-delete, restore, and the deleted list", () => {
  it("a deleted category appears in GET /deleted with a purgeEligibleAt 30 days out and hasLogs: false", async () => {
    const { accessToken } = await registerAndLogin("deleted-list");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Reading", valueType: "boolean" });

    const beforeDelete = Date.now();
    await request(app).delete(`/api/categories/${created.body.id}`).set(authed(accessToken));

    const res = await request(app).get("/api/categories/deleted").set(authed(accessToken));
    expect(res.status).toBe(200);
    const entry = res.body.find((c: { id: string }) => c.id === created.body.id);
    expect(entry).toBeDefined();
    expect(entry.hasLogs).toBe(false);

    const purgeEligibleAt = new Date(entry.purgeEligibleAt).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    // Allow a few seconds of slack for the request round-trip itself, rather than asserting an
    // exact millisecond match against a clock read before the request was even sent.
    expect(purgeEligibleAt).toBeGreaterThan(beforeDelete + thirtyDaysMs - 5000);
    expect(purgeEligibleAt).toBeLessThan(beforeDelete + thirtyDaysMs + 5000);
  });

  it("hasLogs: true for a deleted category that still has logged entries against it", async () => {
    const { accessToken } = await registerAndLogin("deleted-haslogs");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Meditation", valueType: "boolean" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: created.body.id, valueBoolean: true });

    await request(app).delete(`/api/categories/${created.body.id}`).set(authed(accessToken));

    const res = await request(app).get("/api/categories/deleted").set(authed(accessToken));
    const entry = res.body.find((c: { id: string }) => c.id === created.body.id);
    expect(entry.hasLogs).toBe(true);
  });

  it("GET /deleted never returns another user's deleted categories", async () => {
    const owner = await registerAndLogin("deleted-scope-owner");
    const other = await registerAndLogin("deleted-scope-other");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's private", valueType: "boolean" });
    await request(app).delete(`/api/categories/${created.body.id}`).set(authed(owner.accessToken));

    const res = await request(app).get("/api/categories/deleted").set(authed(other.accessToken));
    expect(res.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it("restores a deleted category, returning it to the default list and off the deleted list", async () => {
    const { accessToken } = await registerAndLogin("restore");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Journaling", valueType: "boolean" });
    await request(app).delete(`/api/categories/${created.body.id}`).set(authed(accessToken));

    const res = await request(app)
      .post(`/api/categories/${created.body.id}/restore`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).toBeNull();

    const listRes = await request(app).get("/api/categories").set(authed(accessToken));
    expect(listRes.body.map((c: { id: string }) => c.id)).toContain(created.body.id);

    const deletedRes = await request(app).get("/api/categories/deleted").set(authed(accessToken));
    expect(deletedRes.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it("returns 404 restoring a category that isn't deleted, doesn't exist, or belongs to another user", async () => {
    const owner = await registerAndLogin("restore-404-owner");
    const other = await registerAndLogin("restore-404-other");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(owner.accessToken))
      .send({ name: "Never deleted", valueType: "boolean" });

    // Not deleted yet.
    const notDeletedRes = await request(app)
      .post(`/api/categories/${created.body.id}/restore`)
      .set(authed(owner.accessToken));
    expect(notDeletedRes.status).toBe(404);

    // Belongs to someone else.
    await request(app).delete(`/api/categories/${created.body.id}`).set(authed(owner.accessToken));
    const wrongOwnerRes = await request(app)
      .post(`/api/categories/${created.body.id}/restore`)
      .set(authed(other.accessToken));
    expect(wrongOwnerRes.status).toBe(404);

    // Doesn't exist at all.
    const missingRes = await request(app)
      .post("/api/categories/00000000-0000-0000-0000-000000000000/restore")
      .set(authed(owner.accessToken));
    expect(missingRes.status).toBe(404);
  });

  it("restoring a category does not re-enable a reminder that was disabled when it was deleted", async () => {
    const { accessToken, userId } = await registerAndLogin("restore-reminder");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Diazepam", valueType: "boolean" });
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        target: "CATEGORY",
        categoryId: created.body.id,
        schedules: ["0 9 * * *"],
        enabled: true,
      },
    });

    await request(app).delete(`/api/categories/${created.body.id}`).set(authed(accessToken));
    const disabled = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    expect(disabled?.enabled).toBe(false);

    await request(app).post(`/api/categories/${created.body.id}/restore`).set(authed(accessToken));
    const stillDisabled = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    expect(stillDisabled?.enabled).toBe(false);

    await prisma.reminder.delete({ where: { id: reminder.id } });
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

describe("categories routes — timing", () => {
  // "Should this category have a timer or a reminder?" turns out to be three different questions,
  // so it is one setting with three modes rather than a flag - see
  // docs/log/39-category-timing.md. Stored per user, not on the category, because a system
  // category is shared and one person's six-hour gap is not a property of Diazepam.
  describe("category timing", () => {
    async function ownCategory(accessToken: string, valueType = "numeric", name = "Diazepam") {
      const res = await request(app)
        .post("/api/categories")
        .set(authed(accessToken))
        .send({ name, valueType });
      expect(res.status).toBe(201);
      return res.body.id as string;
    }

    it("sets a cooldown and returns it on the category list", async () => {
      const { accessToken } = await registerAndLogin("timing-cooldown");
      const categoryId = await ownCategory(accessToken);

      const put = await request(app)
        .put(`/api/categories/${categoryId}/timing`)
        .set(authed(accessToken))
        .send({ mode: "cooldown", intervalMinutes: 360 });

      expect(put.status).toBe(200);
      expect(put.body).toEqual({ mode: "cooldown", intervalMinutes: 360 });

      const list = await request(app).get("/api/categories").set(authed(accessToken));
      const listed = list.body.find((c: { id: string }) => c.id === categoryId);
      expect(listed.timing).toEqual({ mode: "cooldown", intervalMinutes: 360 });
      // A cooldown counts from the last log, and that is already on every category - so the
      // countdown needs no extra request and no server state of its own.
      expect(listed).toHaveProperty("lastLoggedAt");
    });

    it("is null on a category with no timing set, not an object saying 'none'", async () => {
      const { accessToken } = await registerAndLogin("timing-absent");
      const categoryId = await ownCategory(accessToken);

      const list = await request(app).get("/api/categories").set(authed(accessToken));
      expect(list.body.find((c: { id: string }) => c.id === categoryId).timing).toBeNull();
    });

    it("replaces the whole setting when the mode changes, rather than merging", async () => {
      const { accessToken } = await registerAndLogin("timing-replace");
      const categoryId = await ownCategory(accessToken, "duration", "Screen time");

      await request(app)
        .put(`/api/categories/${categoryId}/timing`)
        .set(authed(accessToken))
        .send({ mode: "cooldown", intervalMinutes: 360 });

      const stopwatch = await request(app)
        .put(`/api/categories/${categoryId}/timing`)
        .set(authed(accessToken))
        .send({ mode: "stopwatch" });

      expect(stopwatch.status).toBe(200);
      // The cooldown's six hours must not survive as a stopwatch's interval - carrying a stale
      // field across a mode change is exactly how a setting starts meaning something nobody chose.
      expect(stopwatch.body).toEqual({ mode: "stopwatch", intervalMinutes: null });
    });

    it("can be removed, and removing one that was never set is a no-op", async () => {
      const { accessToken } = await registerAndLogin("timing-remove");
      const categoryId = await ownCategory(accessToken);

      const neverSet = await request(app)
        .delete(`/api/categories/${categoryId}/timing`)
        .set(authed(accessToken));
      expect(neverSet.status).toBe(200);

      await request(app)
        .put(`/api/categories/${categoryId}/timing`)
        .set(authed(accessToken))
        .send({ mode: "reminder", intervalMinutes: 120 });
      await request(app).delete(`/api/categories/${categoryId}/timing`).set(authed(accessToken));

      const list = await request(app).get("/api/categories").set(authed(accessToken));
      expect(list.body.find((c: { id: string }) => c.id === categoryId).timing).toBeNull();
    });

    // The reason this is a per-user row rather than a column: a built-in category is shared, and is
    // also the one kind nobody can edit - so it is exactly where the setting has to work.
    it("can be set on a built-in category without affecting anyone else", async () => {
      const mine = await registerAndLogin("timing-system-mine");
      const theirs = await registerAndLogin("timing-system-theirs");

      const systemCategory = await prisma.category.findFirst({
        where: { userId: null, archivedAt: null },
      });
      expect(systemCategory).not.toBeNull();
      const id = (systemCategory as { id: string }).id;

      const put = await request(app)
        .put(`/api/categories/${id}/timing`)
        .set(authed(mine.accessToken))
        .send({ mode: "cooldown", intervalMinutes: 60 });
      expect(put.status).toBe(200);

      const mineList = await request(app).get("/api/categories").set(authed(mine.accessToken));
      expect(mineList.body.find((c: { id: string }) => c.id === id).timing).toEqual({
        mode: "cooldown",
        intervalMinutes: 60,
      });

      const theirList = await request(app).get("/api/categories").set(authed(theirs.accessToken));
      expect(theirList.body.find((c: { id: string }) => c.id === id).timing).toBeNull();
    });

    it("404s a category the caller cannot see", async () => {
      const { accessToken } = await registerAndLogin("timing-owner");
      const other = await registerAndLogin("timing-other");
      const theirCategory = await ownCategory(other.accessToken, "numeric", "Private");

      const res = await request(app)
        .put(`/api/categories/${theirCategory}/timing`)
        .set(authed(accessToken))
        .send({ mode: "cooldown", intervalMinutes: 60 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
    });

    describe("what each mode will and won't accept", () => {
      it("refuses a stopwatch on anything not measured in minutes", async () => {
        const { accessToken } = await registerAndLogin("timing-stopwatch-wrong");
        const numeric = await ownCategory(accessToken, "numeric", "Units");

        const res = await request(app)
          .put(`/api/categories/${numeric}/timing`)
          .set(authed(accessToken))
          .send({ mode: "stopwatch" });

        expect(res.status).toBe(400);
        expect(res.body.error.details.intervalMinutes[0]).toMatch(/measured in minutes/i);
      });

      it("accepts a stopwatch on a duration category", async () => {
        const { accessToken } = await registerAndLogin("timing-stopwatch-right");
        const duration = await ownCategory(accessToken, "duration", "Exercise");

        const res = await request(app)
          .put(`/api/categories/${duration}/timing`)
          .set(authed(accessToken))
          .send({ mode: "stopwatch" });

        expect(res.status).toBe(200);
      });

      it("refuses an interval on a stopwatch, which measures rather than counts down", async () => {
        const { accessToken } = await registerAndLogin("timing-stopwatch-interval");
        const duration = await ownCategory(accessToken, "duration", "Exercise");

        const res = await request(app)
          .put(`/api/categories/${duration}/timing`)
          .set(authed(accessToken))
          .send({ mode: "stopwatch", intervalMinutes: 30 });

        expect(res.status).toBe(400);
      });

      it("requires a gap for a cooldown, since the gap is the whole setting", async () => {
        const { accessToken } = await registerAndLogin("timing-cooldown-missing");
        const categoryId = await ownCategory(accessToken);

        const res = await request(app)
          .put(`/api/categories/${categoryId}/timing`)
          .set(authed(accessToken))
          .send({ mode: "cooldown" });

        expect(res.status).toBe(400);
        expect(res.body.error.details.intervalMinutes[0]).toMatch(/how long/i);
      });

      it("lets a reminder leave the interval open, to be chosen each time", async () => {
        const { accessToken } = await registerAndLogin("timing-reminder-open");
        const categoryId = await ownCategory(accessToken);

        const res = await request(app)
          .put(`/api/categories/${categoryId}/timing`)
          .set(authed(accessToken))
          .send({ mode: "reminder" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ mode: "reminder", intervalMinutes: null });
      });

      // A reminder interval is handed straight to POST /api/reminders/follow-up, so anything this
      // accepts must be something that endpoint would too - matched deliberately.
      it("holds a reminder interval to the same bounds a follow-up has", async () => {
        const { accessToken } = await registerAndLogin("timing-reminder-bounds");
        const categoryId = await ownCategory(accessToken);

        const tooSoon = await request(app)
          .put(`/api/categories/${categoryId}/timing`)
          .set(authed(accessToken))
          .send({ mode: "reminder", intervalMinutes: 5 });
        expect(tooSoon.status).toBe(400);

        const tooLate = await request(app)
          .put(`/api/categories/${categoryId}/timing`)
          .set(authed(accessToken))
          .send({ mode: "reminder", intervalMinutes: 13 * 60 });
        expect(tooLate.status).toBe(400);
      });

      // A cooldown schedules nothing, so it is allowed to reach further than a reminder can.
      it("allows a cooldown longer than a reminder may be", async () => {
        const { accessToken } = await registerAndLogin("timing-cooldown-long");
        const categoryId = await ownCategory(accessToken);

        const res = await request(app)
          .put(`/api/categories/${categoryId}/timing`)
          .set(authed(accessToken))
          .send({ mode: "cooldown", intervalMinutes: 20 * 60 });

        expect(res.status).toBe(200);
      });

      it("rejects a mode that isn't one of the three", async () => {
        const { accessToken } = await registerAndLogin("timing-bad-mode");
        const categoryId = await ownCategory(accessToken);

        const res = await request(app)
          .put(`/api/categories/${categoryId}/timing`)
          .set(authed(accessToken))
          .send({ mode: "alarm", intervalMinutes: 60 });

        expect(res.status).toBe(400);
      });
    });
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
