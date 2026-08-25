import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-reminders-route-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function createMedication(accessToken: string, name = "Diazepam") {
  const res = await request(app).post("/api/medications").set(authed(accessToken)).send({ name });
  return res.body.id as string;
}

async function createCategory(accessToken: string, name = "Water intake") {
  const res = await request(app)
    .post("/api/categories")
    .set(authed(accessToken))
    .send({ name, valueType: "numeric" });
  return res.body.id as string;
}

describe("reminders routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/reminders");
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post("/api/reminders")
      .send({ target: "general", times: ["20:00"] });
    expect(postRes.status).toBe(401);
  });

  it("creates a GENERAL reminder with a single time", async () => {
    const { accessToken, userId } = await registerAndLogin("general-create");

    const res = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", times: ["20:00"] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId, target: "general", times: ["20:00"], enabled: true });
  });

  it("dedupes and sorts times", async () => {
    const { accessToken } = await registerAndLogin("dedupe-sort");

    const res = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "mood", times: ["15:00", "09:00", "15:00"] });

    expect(res.status).toBe(201);
    expect(res.body.times).toEqual(["09:00", "15:00"]);
  });

  it("rejects an invalid time and more than the maximum number of times", async () => {
    const { accessToken } = await registerAndLogin("bad-times");

    const badFormat = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "mood", times: ["8:00pm"] });
    expect(badFormat.status).toBe(400);

    const tooMany = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({
        target: "mood",
        times: ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"],
      });
    expect(tooMany.status).toBe(400);
  });

  it("creates a MEDICATION reminder for a specific, owned medication", async () => {
    const { accessToken } = await registerAndLogin("medication-create");
    const medicationId = await createMedication(accessToken);

    const res = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "medication", medicationId, times: ["10:00"] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ target: "medication", medicationId });
    expect(res.body.medication).toMatchObject({ name: "Diazepam" });
  });

  it("rejects a MEDICATION reminder with no medicationId, or one owned by another user", async () => {
    const owner = await registerAndLogin("medication-owner");
    const intruder = await registerAndLogin("medication-intruder");
    const medicationId = await createMedication(owner.accessToken);

    const missing = await request(app)
      .post("/api/reminders")
      .set(authed(owner.accessToken))
      .send({ target: "medication", times: ["10:00"] });
    expect(missing.status).toBe(400);

    const wrongOwner = await request(app)
      .post("/api/reminders")
      .set(authed(intruder.accessToken))
      .send({ target: "medication", medicationId, times: ["10:00"] });
    expect(wrongOwner.status).toBe(404);
    expect(wrongOwner.body.error.code).toBe("MEDICATION_NOT_FOUND");
  });

  it("creates a CATEGORY reminder for a specific, visible category", async () => {
    const { accessToken } = await registerAndLogin("category-create");
    const categoryId = await createCategory(accessToken);

    const res = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "category", categoryId, times: ["09:00"] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ target: "category", categoryId });
    expect(res.body.category).toMatchObject({ name: "Water intake" });
  });

  it("rejects mixing medicationId/categoryId with the wrong target, or with each other", async () => {
    const { accessToken } = await registerAndLogin("mixed-ids");
    const medicationId = await createMedication(accessToken);
    const categoryId = await createCategory(accessToken);

    const moodWithMedication = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "mood", medicationId, times: ["09:00"] });
    expect(moodWithMedication.status).toBe(400);

    const medicationWithCategory = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "medication", medicationId, categoryId, times: ["09:00"] });
    expect(medicationWithCategory.status).toBe(400);
  });

  it("409s creating a second reminder for the same (target, medication/category)", async () => {
    const { accessToken } = await registerAndLogin("duplicate");

    const first = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "mood", times: ["09:00"] });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "mood", times: ["15:00"] });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("REMINDER_ALREADY_EXISTS");
  });

  it("allows two independent reminders for two different medications", async () => {
    const { accessToken } = await registerAndLogin("two-medications");
    const diazepam = await createMedication(accessToken, "Diazepam");
    const sertraline = await createMedication(accessToken, "Sertraline");

    const first = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "medication", medicationId: diazepam, times: ["10:00"] });
    const second = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "medication", medicationId: sertraline, times: ["08:30"] });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("lists only the authenticated user's own reminders", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");
    await request(app)
      .post("/api/reminders")
      .set(authed(userA.accessToken))
      .send({ target: "general", times: ["20:00"] });
    await request(app)
      .post("/api/reminders")
      .set(authed(userB.accessToken))
      .send({ target: "general", times: ["21:00"] });

    const res = await request(app).get("/api/reminders").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userId).toBe(userA.userId);
  });

  it("updates times and enabled, but not target/medicationId/categoryId", async () => {
    const { accessToken } = await registerAndLogin("update");
    const created = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "symptom", times: ["09:00"] });

    const res = await request(app)
      .patch(`/api/reminders/${created.body.id}`)
      .set(authed(accessToken))
      .send({ times: ["09:00", "15:00"], enabled: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      target: "symptom",
      times: ["09:00", "15:00"],
      enabled: false,
    });
  });

  it("returns 404 updating or deleting a reminder that doesn't exist, or belongs to another user", async () => {
    const owner = await registerAndLogin("update-owner");
    const intruder = await registerAndLogin("update-intruder");
    const created = await request(app)
      .post("/api/reminders")
      .set(authed(owner.accessToken))
      .send({ target: "general", times: ["20:00"] });

    const missing = await request(app)
      .patch("/api/reminders/00000000-0000-0000-0000-000000000000")
      .set(authed(owner.accessToken))
      .send({ enabled: false });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("REMINDER_NOT_FOUND");

    const wrongOwner = await request(app)
      .patch(`/api/reminders/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ enabled: false });
    expect(wrongOwner.status).toBe(404);

    const deleteWrongOwner = await request(app)
      .delete(`/api/reminders/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteWrongOwner.status).toBe(404);
  });

  it("deletes a reminder for real (not archived)", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const created = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", times: ["20:00"] });

    const res = await request(app)
      .delete(`/api/reminders/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.reminder.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });

  it("archiving a category disables (not deletes) every reminder targeting it, across users", async () => {
    const owner = await registerAndLogin("archive-owner");
    const other = await registerAndLogin("archive-other");
    const categoryId = await createCategory(owner.accessToken, "Shared water tracker");

    const ownerReminder = await request(app)
      .post("/api/reminders")
      .set(authed(owner.accessToken))
      .send({ target: "category", categoryId, times: ["09:00"] });
    expect(ownerReminder.status).toBe(201);

    // A second user's own reminder against the same category, created directly via Prisma (not
    // the real route) since a personal category is only visible to its owner - a system-wide
    // category is the realistic case where a different user's own reminder would exist against
    // it, but the archive route's disabling side effect should cover *any* reminder row
    // referencing the category id regardless of how it was created, so this still exercises the
    // "across users" part of the behavior directly.
    const otherReminder = await prisma.reminder.create({
      data: { userId: other.userId, target: "CATEGORY", categoryId, times: ["10:00"] },
    });

    await request(app).delete(`/api/categories/${categoryId}`).set(authed(owner.accessToken));

    const [ownerReminderAfter, otherReminderAfter] = await Promise.all([
      prisma.reminder.findUnique({ where: { id: ownerReminder.body.id } }),
      prisma.reminder.findUnique({ where: { id: otherReminder.id } }),
    ]);
    expect(ownerReminderAfter?.enabled).toBe(false);
    expect(otherReminderAfter?.enabled).toBe(false);
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  await prisma.reminderSend.deleteMany({ where: { reminder: { userId: { in: userIds } } } });
  await prisma.reminder.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.medication.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
