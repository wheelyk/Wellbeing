import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "./prisma";
import { runCategoryPurgeTick } from "./categoryPurgeScheduler";

// Integration tests against the real database - the whole point of this scheduler is a real
// DELETE that has to survive a real foreign-key relation (Reminder -> Category is Restrict, not
// Cascade), which a mocked Prisma client couldn't meaningfully exercise.
const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-category-purge-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

const THIRTY_ONE_DAYS_AGO = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
const TWENTY_NINE_DAYS_AGO = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

describe("runCategoryPurgeTick", () => {
  it("hard-deletes a personal category with no logs, once its 30-day grace period has passed", async () => {
    const { accessToken } = await registerAndLogin("empty-expired");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Reading", valueType: "boolean" });
    // Backdates archivedAt directly - DELETE /api/categories/:id (see categories.test.ts) already
    // covers that the endpoint itself sets it to "now"; this test is specifically about what
    // happens once 30 days have genuinely passed, which nothing can wait for in real time.
    await prisma.category.update({
      where: { id: created.body.id },
      data: { archivedAt: THIRTY_ONE_DAYS_AGO },
    });

    await runCategoryPurgeTick();

    const stillThere = await prisma.category.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });

  it("does NOT purge a personal category whose grace period hasn't passed yet", async () => {
    const { accessToken } = await registerAndLogin("empty-not-expired");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Journaling", valueType: "boolean" });
    await prisma.category.update({
      where: { id: created.body.id },
      data: { archivedAt: TWENTY_NINE_DAYS_AGO },
    });

    await runCategoryPurgeTick();

    const stillThere = await prisma.category.findUnique({ where: { id: created.body.id } });
    expect(stillThere).not.toBeNull();
  });

  it("does NOT purge an expired personal category that still has logs against it", async () => {
    const { accessToken } = await registerAndLogin("has-logs-expired");
    const created = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Meditation", valueType: "boolean" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: created.body.id, valueBoolean: true });
    await prisma.category.update({
      where: { id: created.body.id },
      data: { archivedAt: THIRTY_ONE_DAYS_AGO },
    });

    await runCategoryPurgeTick();

    const stillThere = await prisma.category.findUnique({ where: { id: created.body.id } });
    expect(stillThere).not.toBeNull();
    // The log itself is untouched too - this category is kept exactly as it was, not silently
    // stripped of its history while the category row survives.
    const logCount = await prisma.categoryLog.count({ where: { categoryId: created.body.id } });
    expect(logCount).toBe(1);
  });

  it("never purges a system category, however long ago an admin archived it", async () => {
    const systemCategory = await prisma.category.create({
      data: {
        userId: null,
        name: `Vitest purge-scheduler system category ${Date.now()}`,
        valueType: "BOOLEAN",
        archivedAt: THIRTY_ONE_DAYS_AGO,
      },
    });

    await runCategoryPurgeTick();

    const stillThere = await prisma.category.findUnique({ where: { id: systemCategory.id } });
    expect(stillThere).not.toBeNull();

    await prisma.category.delete({ where: { id: systemCategory.id } });
  });

  it("deletes a disabled Reminder still pointing at an expired, empty category, rather than leaving it orphaned or blocking the purge", async () => {
    const { accessToken, userId } = await registerAndLogin("reminder-cleanup");
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
        enabled: false,
      },
    });
    await prisma.category.update({
      where: { id: created.body.id },
      data: { archivedAt: THIRTY_ONE_DAYS_AGO },
    });

    await runCategoryPurgeTick();

    const categoryGone = await prisma.category.findUnique({ where: { id: created.body.id } });
    expect(categoryGone).toBeNull();
    const reminderGone = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    expect(reminderGone).toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
