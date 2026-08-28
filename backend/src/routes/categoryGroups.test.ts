import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-category-groups-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("category-groups routes", () => {
  it("rejects every method with no access token", async () => {
    const getRes = await request(app).get("/api/category-groups");
    expect(getRes.status).toBe(401);

    const postRes = await request(app).post("/api/category-groups").send({ name: "Work" });
    expect(postRes.status).toBe(401);
  });

  it("lists the 6 seeded built-in groups plus the caller's own, but not another user's", async () => {
    const owner = await registerAndLogin("list-owner");
    const other = await registerAndLogin("list-other");

    await request(app)
      .post("/api/category-groups")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's custom group" });
    await request(app)
      .post("/api/category-groups")
      .set(authed(other.accessToken))
      .send({ name: "Other's custom group" });

    const res = await request(app).get("/api/category-groups").set(authed(owner.accessToken));

    expect(res.status).toBe(200);
    const names: string[] = res.body.map((g: { name: string }) => g.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Medicine",
        "Symptom",
        "Mind & Mood",
        "Activity",
        "Drink",
        "Food",
        "Owner's custom group",
      ]),
    );
    expect(names).not.toContain("Other's custom group");
  });

  it("creates a personal group with an icon, always owned by the caller", async () => {
    const { accessToken, userId } = await registerAndLogin("create");

    const res = await request(app)
      .post("/api/category-groups")
      .set(authed(accessToken))
      .send({ name: "Work Stress", icon: "💼" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId, name: "Work Stress", icon: "💼" });
  });

  it("rejects creating a group with no name", async () => {
    const { accessToken } = await registerAndLogin("validation");

    const res = await request(app).post("/api/category-groups").set(authed(accessToken)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("renames the caller's own group, including clearing its icon with an explicit null", async () => {
    const { accessToken } = await registerAndLogin("rename");
    const created = await request(app)
      .post("/api/category-groups")
      .set(authed(accessToken))
      .send({ name: "Work Stress", icon: "💼" });

    const renamed = await request(app)
      .patch(`/api/category-groups/${created.body.id}`)
      .set(authed(accessToken))
      .send({ name: "Career", icon: null });

    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Career", icon: null });
  });

  it("returns 404 renaming a group that doesn't exist, or belongs to another user", async () => {
    const owner = await registerAndLogin("rename-404-owner");
    const other = await registerAndLogin("rename-404-other");
    const created = await request(app)
      .post("/api/category-groups")
      .set(authed(owner.accessToken))
      .send({ name: "Owner's group" });

    const wrongOwnerRes = await request(app)
      .patch(`/api/category-groups/${created.body.id}`)
      .set(authed(other.accessToken))
      .send({ name: "Hijacked" });
    expect(wrongOwnerRes.status).toBe(404);

    const missingRes = await request(app)
      .patch("/api/category-groups/00000000-0000-0000-0000-000000000000")
      .set(authed(owner.accessToken))
      .send({ name: "Anything" });
    expect(missingRes.status).toBe(404);
  });

  it("never allows renaming a built-in group", async () => {
    const { accessToken } = await registerAndLogin("rename-builtin");
    const listRes = await request(app).get("/api/category-groups").set(authed(accessToken));
    const medicine = listRes.body.find((g: { name: string }) => g.name === "Medicine");

    const res = await request(app)
      .patch(`/api/category-groups/${medicine.id}`)
      .set(authed(accessToken))
      .send({ name: "Renamed" });

    expect(res.status).toBe(404);
  });

  it("hides a built-in group and an owned custom group alike, offering Unhide instead", async () => {
    const { accessToken } = await registerAndLogin("hide");
    const listRes = await request(app).get("/api/category-groups").set(authed(accessToken));
    const symptom = listRes.body.find((g: { name: string }) => g.name === "Symptom");
    const custom = await request(app)
      .post("/api/category-groups")
      .set(authed(accessToken))
      .send({ name: "Errands" });

    const hideSystem = await request(app)
      .post(`/api/category-groups/${symptom.id}/hide`)
      .set(authed(accessToken));
    expect(hideSystem.status).toBe(200);
    const hideOwn = await request(app)
      .post(`/api/category-groups/${custom.body.id}/hide`)
      .set(authed(accessToken));
    expect(hideOwn.status).toBe(200);

    const defaultList = await request(app).get("/api/category-groups").set(authed(accessToken));
    const defaultNames: string[] = defaultList.body.map((g: { name: string }) => g.name);
    expect(defaultNames).not.toContain("Symptom");
    expect(defaultNames).not.toContain("Errands");

    const includeHiddenList = await request(app)
      .get("/api/category-groups?includeHidden=true")
      .set(authed(accessToken));
    const symptomEntry = includeHiddenList.body.find((g: { name: string }) => g.name === "Symptom");
    expect(symptomEntry.hidden).toBe(true);

    const unhide = await request(app)
      .delete(`/api/category-groups/${symptom.id}/hide`)
      .set(authed(accessToken));
    expect(unhide.status).toBe(200);
    const afterUnhide = await request(app).get("/api/category-groups").set(authed(accessToken));
    expect(afterUnhide.body.map((g: { name: string }) => g.name)).toContain("Symptom");
  });

  it("hiding a group is per-caller - doesn't affect another user's own view of the same built-in group", async () => {
    const owner = await registerAndLogin("hide-scope-owner");
    const other = await registerAndLogin("hide-scope-other");
    const listRes = await request(app).get("/api/category-groups").set(authed(owner.accessToken));
    const activity = listRes.body.find((g: { name: string }) => g.name === "Activity");

    await request(app)
      .post(`/api/category-groups/${activity.id}/hide`)
      .set(authed(owner.accessToken));

    const otherList = await request(app).get("/api/category-groups").set(authed(other.accessToken));
    expect(otherList.body.map((g: { name: string }) => g.name)).toContain("Activity");
  });

  it("re-hiding an already-hidden group, or unhiding one that was never hidden, is a harmless no-op", async () => {
    const { accessToken } = await registerAndLogin("hide-idempotent");
    const listRes = await request(app).get("/api/category-groups").set(authed(accessToken));
    const drink = listRes.body.find((g: { name: string }) => g.name === "Drink");

    const first = await request(app)
      .post(`/api/category-groups/${drink.id}/hide`)
      .set(authed(accessToken));
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/category-groups/${drink.id}/hide`)
      .set(authed(accessToken));
    expect(second.status).toBe(200);

    const unhideNever = await request(app)
      .delete("/api/category-groups/00000000-0000-0000-0000-000000000000/hide")
      .set(authed(accessToken));
    expect(unhideNever.status).toBe(200);
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
