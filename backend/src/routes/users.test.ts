import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-users-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

async function registerAndLogin(label: string, displayName = "Test User") {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Sup3rSecret", displayName });
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "Sup3rSecret" });
  return {
    email,
    userId: loginRes.body.user.id as string,
    accessToken: loginRes.body.accessToken as string,
  };
}

function authed(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

describe("GET /api/users/me", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user's profile without the password hash", async () => {
    const { accessToken, userId, email } = await registerAndLogin("get");

    const res = await request(app).get("/api/users/me").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: userId,
      email,
      displayName: "Test User",
      timezone: "UTC",
    });
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.passwordHash).toBeUndefined();
  });

  // Regression test for a documented-but-previously-unverified edge case (see this route's own
  // comment: "the user row itself could have been deleted since... a second tab calling
  // DELETE /me").
  it("returns 404 if the user row was deleted after the access token was issued", async () => {
    const { userId, accessToken } = await registerAndLogin("deleted-mid-session");
    await prisma.user.delete({ where: { id: userId } });

    const res = await request(app).get("/api/users/me").set(authed(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});

describe("PATCH /api/users/me", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).patch("/api/users/me").send({ displayName: "New Name" });
    expect(res.status).toBe(401);
  });

  it("updates displayName and timezone together", async () => {
    const { accessToken, userId } = await registerAndLogin("update-both");

    const res = await request(app)
      .patch("/api/users/me")
      .set(authed(accessToken))
      .send({ displayName: "New Name", timezone: "America/Los_Angeles" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: userId,
      displayName: "New Name",
      timezone: "America/Los_Angeles",
    });

    const getRes = await request(app).get("/api/users/me").set(authed(accessToken));
    expect(getRes.body).toMatchObject({
      displayName: "New Name",
      timezone: "America/Los_Angeles",
    });
  });

  it("supports a partial update - only the provided field changes", async () => {
    const { accessToken } = await registerAndLogin("partial", "Original Name");

    const res = await request(app)
      .patch("/api/users/me")
      .set(authed(accessToken))
      .send({ timezone: "Europe/London" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayName: "Original Name", timezone: "Europe/London" });
  });

  it("rejects an empty body", async () => {
    const { accessToken } = await registerAndLogin("empty-body");

    const res = await request(app).patch("/api/users/me").set(authed(accessToken)).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // Regression test: "UTC" is this app's own `User.timezone` schema default (every brand-new
  // account starts with it) and the first option in the frontend's own timezone <select> - but
  // was, until this fix, itself rejected by PATCH /me's own validation on at least one real
  // Node/ICU build (Intl.supportedValuesOf("timeZone") doesn't enumerate "UTC" even though
  // Intl.DateTimeFormat accepts it fine), meaning a brand-new user who'd never touched their
  // timezone couldn't save *any* profile change at all. Found via a real smoke test against the
  // deployed production environment, not local development - see docs/log/07-deployment.md.
  it("accepts 'UTC' as a valid timezone", async () => {
    const { accessToken } = await registerAndLogin("utc-timezone");

    const res = await request(app)
      .patch("/api/users/me")
      .set(authed(accessToken))
      .send({ displayName: "Still Default Timezone", timezone: "UTC" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayName: "Still Default Timezone", timezone: "UTC" });
  });

  it("rejects an invalid timezone string", async () => {
    const { accessToken } = await registerAndLogin("bad-timezone");

    const res = await request(app)
      .patch("/api/users/me")
      .set(authed(accessToken))
      .send({ timezone: "Not/A_Real_Zone" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty display name", async () => {
    const { accessToken } = await registerAndLogin("blank-name");

    const res = await request(app)
      .patch("/api/users/me")
      .set(authed(accessToken))
      .send({ displayName: "  " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("never lets one user's update touch another user's profile", async () => {
    const owner = await registerAndLogin("scope-owner", "Owner");
    const attacker = await registerAndLogin("scope-attacker", "Attacker");

    await request(app)
      .patch("/api/users/me")
      .set(authed(attacker.accessToken))
      .send({ displayName: "Hijacked" });

    const ownerRes = await request(app).get("/api/users/me").set(authed(owner.accessToken));
    expect(ownerRes.body.displayName).toBe("Owner");
  });
});

describe("DELETE /api/users/me", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).delete("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("clears the refresh token cookie on success", async () => {
    const { accessToken } = await registerAndLogin("cookie-clear");

    const res = await request(app).delete("/api/users/me").set(authed(accessToken));

    expect(res.status).toBe(200);
    const setCookieHeader = res.headers["set-cookie"];
    expect(setCookieHeader).toBeDefined();
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    const refreshCookie = cookies.find((c: string) => c.startsWith("refreshToken="));
    expect(refreshCookie).toBeDefined();
    // Clearing a cookie is done by re-setting it with an already-past expiry - Expires=Thu,
    // 01 Jan 1970 is the literal value Express's res.clearCookie writes.
    expect(refreshCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("deletes the user and cascades to every one of their categories (including former custom symptoms, mood check-ins, and medications)", async () => {
    const { accessToken, userId, email } = await registerAndLogin("cascade");

    // Three personal categories - what a user-owned custom symptom, a Mood check-in, and a
    // Medication dose all are now, since Symptom, Mood, and Medication all unified into Category
    // (see docs/log/17-unify-mood-symptom-habit.md and docs/log/19-medication-to-category.md) -
    // so the delete's cascade can be checked against every table Tasks.md calls out by name.
    const symptomRes = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Custom Symptom", valueType: "scale", scaleMin: 1, scaleMax: 10 });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: symptomRes.body.id, valueNumeric: 5 });

    const medicationRes = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Ibuprofen", valueType: "boolean" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: medicationRes.body.id, valueBoolean: true });

    const categoryRes = await request(app)
      .post("/api/categories")
      .set(authed(accessToken))
      .send({ name: "Walk", valueType: "boolean" });
    await request(app)
      .post("/api/category-logs")
      .set(authed(accessToken))
      .send({ categoryId: categoryRes.body.id, valueBoolean: true });

    // Sanity-check the rows genuinely exist before deletion, so the "gone after" assertions
    // below actually prove something.
    expect(await prisma.category.count({ where: { userId } })).toBe(3);
    expect(await prisma.categoryLog.count({ where: { userId } })).toBe(3);

    const res = await request(app).delete("/api/users/me").set(authed(accessToken));
    expect(res.status).toBe(200);

    // Direct DB queries, not just trusting the 200 - every related row must genuinely be gone.
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.category.count({ where: { userId } })).toBe(0);
    expect(await prisma.categoryLog.count({ where: { userId } })).toBe(0);

    // The account is genuinely gone, not just "logged out" - logging in again with the same
    // credentials must fail.
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "Sup3rSecret" });
    expect(loginRes.status).toBe(401);
  });

  it("never lets one user's delete touch another user's account", async () => {
    const victim = await registerAndLogin("delete-scope-victim");
    const attacker = await registerAndLogin("delete-scope-attacker");

    const res = await request(app).delete("/api/users/me").set(authed(attacker.accessToken));
    expect(res.status).toBe(200);

    // Deleting your own account must never remove anyone else's.
    const victimStillExists = await prisma.user.findUnique({ where: { id: victim.userId } });
    expect(victimStillExists).not.toBeNull();
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});
