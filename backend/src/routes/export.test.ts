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
    expect(res.body.moodLogs).toEqual([]);
    expect(res.body.symptoms).toEqual([]);
    expect(res.body.symptomLogs).toEqual([]);
    expect(res.body.medications).toEqual([]);
    expect(res.body.medicationLogs).toEqual([]);
    expect(res.body.habits).toEqual([]);
    expect(res.body.habitLogs).toEqual([]);
    expect(typeof res.body.exportedAt).toBe("string");
  });

  it("gathers one logged entry of each type, plus its parent definition", async () => {
    const { accessToken } = await registerAndLogin("full");
    const loggedAt = "2026-08-17T09:00:00.000Z";

    const symptomRes = await request(app)
      .post("/api/symptoms")
      .set(authed(accessToken))
      .send({ name: "Headache" });
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(accessToken))
      .send({ symptomId: symptomRes.body.id, severity: 6, loggedAt });

    await request(app).post("/api/mood-logs").set(authed(accessToken)).send({ mood: 4, loggedAt });

    const medicationRes = await request(app)
      .post("/api/medications")
      .set(authed(accessToken))
      .send({ name: "Lisinopril", dosage: "10mg" });
    await request(app)
      .post("/api/medication-logs")
      .set(authed(accessToken))
      .send({ medicationId: medicationRes.body.id, taken: true, loggedAt });

    const habitRes = await request(app)
      .post("/api/habits")
      .set(authed(accessToken))
      .send({ name: "Walk", type: "boolean" });
    await request(app)
      .post("/api/habit-logs")
      .set(authed(accessToken))
      .send({ habitId: habitRes.body.id, valueBoolean: true, loggedAt });

    const res = await request(app).get("/api/export").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.symptoms).toMatchObject([{ name: "Headache" }]);
    expect(res.body.symptomLogs).toMatchObject([{ severity: 6, symptomName: "Headache" }]);
    expect(res.body.moodLogs).toMatchObject([{ mood: 4 }]);
    expect(res.body.medications).toMatchObject([{ name: "Lisinopril", dosage: "10mg" }]);
    expect(res.body.medicationLogs).toMatchObject([{ taken: true, medicationName: "Lisinopril" }]);
    expect(res.body.habits).toMatchObject([{ name: "Walk", type: "boolean" }]);
    expect(res.body.habitLogs).toMatchObject([{ valueBoolean: true, habitName: "Walk" }]);
  });

  it("never returns another user's data", async () => {
    const userA = await registerAndLogin("iso-a");
    const userB = await registerAndLogin("iso-b");
    const loggedAt = "2026-08-17T09:00:00.000Z";

    await request(app)
      .post("/api/mood-logs")
      .set(authed(userB.accessToken))
      .send({ mood: 1, loggedAt });
    const symptomRes = await request(app)
      .post("/api/symptoms")
      .set(authed(userB.accessToken))
      .send({ name: "User B's symptom" });
    await request(app)
      .post("/api/symptom-logs")
      .set(authed(userB.accessToken))
      .send({ symptomId: symptomRes.body.id, severity: 3, loggedAt });

    const res = await request(app).get("/api/export").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userA.userId);
    expect(res.body.moodLogs).toEqual([]);
    expect(res.body.symptoms).toEqual([]);
    expect(res.body.symptomLogs).toEqual([]);
  });

  it("excludes system-default symptoms from the symptoms definitions list", async () => {
    const { accessToken } = await registerAndLogin("system-symptom");

    // No user-created symptoms at all - only whatever system-default rows (Symptom.userId
    // null) exist in the seeded database, which must not appear in this user's own export.
    const res = await request(app).get("/api/export").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.symptoms).toEqual([]);
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
