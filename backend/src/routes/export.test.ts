import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-export-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

describe("GET /api/export", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).get("/api/export");
    expect(res.status).toBe(401);
  });

  it("suggests a download filename via Content-Disposition, and exposes it cross-origin", async () => {
    const { accessToken } = await registerAndLogin("filename");
    const res = await request(app).get("/api/export").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /^attachment; filename="welltrack-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    // Content-Disposition isn't a CORS-safelisted response header - without this, a real
    // cross-origin browser fetch() (this app's frontend and backend run on different origins,
    // see cors() in app.ts) would find res.headers.get("Content-Disposition") null client-side,
    // even though supertest sees it fine here talking to the app in-process. See
    // api/client.ts's apiFetchFile and this route's own comment for the full story.
    expect(res.headers["access-control-expose-headers"]).toBe("Content-Disposition");
  });

  it("returns an empty-but-well-formed export for a brand-new user", async () => {
    const { accessToken } = await registerAndLogin("empty");
    const res = await request(app).get("/api/export").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: expect.stringContaining("vitest-export-empty") });
    // Never leak the password hash, even though it lives on the same underlying User row.
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.medications).toEqual([]);
    expect(res.body.medicationLogs).toEqual([]);
    expect(res.body.categories).toEqual([]);
    expect(res.body.categoryLogs).toEqual([]);
    expect(typeof res.body.exportedAt).toBe("string");
  });

  it("gathers one logged entry of each type, plus its parent definition", async () => {
    const { accessToken } = await registerAndLogin("full");
    const loggedAt = "2026-08-17T09:00:00.000Z";

    const symptomRes = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Headache", valueType: "scale", scaleMin: 1, scaleMax: 10 });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: symptomRes.body.id, valueNumeric: 6, loggedAt });

    // A personal category standing in for what a Mood check-in now looks like (Mood unified into
    // Category in Phase 17 - see docs/log/17-unify-mood-symptom-habit.md).
    const moodRes = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Mood", valueType: "scale", scaleMin: 1, scaleMax: 5 });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: moodRes.body.id, valueNumeric: 4, loggedAt });

    const medicationRes = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({ name: "Lisinopril", dosage: "10mg" });
    await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId: medicationRes.body.id, taken: true, loggedAt });

    const categoryRes = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Walk", valueType: "boolean" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: categoryRes.body.id, valueBoolean: true, loggedAt });

    const res = await request(app).get("/api/export").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.medications).toMatchObject([{ name: "Lisinopril", dosage: "10mg" }]);
    expect(res.body.medicationLogs).toMatchObject([{ taken: true, medicationName: "Lisinopril" }]);
    expect(res.body.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Headache", valueType: "scale" }),
        expect.objectContaining({ name: "Mood", valueType: "scale" }),
        expect.objectContaining({ name: "Walk", valueType: "boolean" }),
      ]),
    );
    expect(res.body.categoryLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ valueNumeric: 6, categoryName: "Headache" }),
        expect.objectContaining({ valueNumeric: 4, categoryName: "Mood" }),
        expect.objectContaining({ valueBoolean: true, categoryName: "Walk" }),
      ]),
    );
  });

  it("never returns another user's data", async () => {
    const userA = await registerAndLogin("iso-a");
    const userB = await registerAndLogin("iso-b");
    const loggedAt = "2026-08-17T09:00:00.000Z";

    const categoryRes = await request(app)
      .post("/api/categories")
      .set(authed(userB.accessToken))
      .send({ name: "User B's category", valueType: "boolean" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(userB.accessToken))
      .send({ categoryId: categoryRes.body.id, valueBoolean: true, loggedAt });

    const res = await request(app).get("/api/export").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userA.userId);
    expect(res.body.categories).toEqual([]);
    expect(res.body.categoryLogs).toEqual([]);
  });

  it("excludes system-default categories from the categories definitions list", async () => {
    const { accessToken } = await registerAndLogin("system-category");

    // No user-created categories at all - only whatever system-default rows (Category.userId
    // null, including every former system symptom migrated in Phase 17 - see
    // docs/log/17-unify-mood-symptom-habit.md) exist in the seeded database, which must not
    // appear in this user's own export.
    const res = await request(app).get("/api/export").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([]);
  });

  // Regression test for a documented-but-previously-unverified edge case (see this route's own
  // comment: "user row could have been deleted since the access token was issued").
  it("returns 404 if the user row was deleted after the access token was issued", async () => {
    const { userId, accessToken } = await registerAndLogin("deleted-mid-session");
    await prisma.user.delete({ where: { id: userId } });

    const res = await request(app).get("/api/export").set(authed(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
