import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

function getCookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const match = raw?.find((c) => c.startsWith(`${name}=`));
  return match?.split(";")[0].split("=")[1];
}

describe("POST /api/auth/register", () => {
  it("creates a new user and never returns the password hash", async () => {
    const email = uniqueEmail("success");
    createdEmails.push(email);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Sup3rSecret", displayName: "Test User" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email, displayName: "Test User", timezone: "UTC" });
    expect(res.body.id).toBeDefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.password).toBeUndefined();
  });

  it("defaults displayName to the email's local part when omitted", async () => {
    const email = uniqueEmail("nodisplayname");
    createdEmails.push(email);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Sup3rSecret" });

    expect(res.status).toBe(201);
    expect(res.body.displayName).toBe(email.split("@")[0]);
  });

  it("rejects an invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "Sup3rSecret" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a password that is too short or missing a number", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail("weakpw"), password: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.password).toBeDefined();
  });

  it("rejects a duplicate email with 409", async () => {
    const email = uniqueEmail("dup");
    createdEmails.push(email);

    const first = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Sup3rSecret" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "AnotherPass1" });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("never stores the plain-text password", async () => {
    const email = uniqueEmail("hash-check");
    createdEmails.push(email);

    await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).not.toBe("Sup3rSecret");
    expect(stored.passwordHash.startsWith("$2")).toBe(true);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials, returns an access token, and sets a refresh cookie", async () => {
    const email = uniqueEmail("login-success");
    createdEmails.push(email);

    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Sup3rSecret", displayName: "Login Test" });

    const res = await request(app).post("/api/auth/login").send({ email, password: "Sup3rSecret" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email, displayName: "Login Test" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();

    const accessPayload = jwt.verify(
      res.body.accessToken,
      process.env.JWT_ACCESS_SECRET as string,
    ) as jwt.JwtPayload;
    expect(accessPayload.sub).toBe(res.body.user.id);

    const refreshCookie = getCookie(res, "refreshToken");
    expect(refreshCookie).toBeDefined();
    const setCookieHeader = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("refreshToken="),
    ) as string;
    expect(setCookieHeader).toMatch(/HttpOnly/);
    expect(setCookieHeader).toMatch(/Path=\/api\/auth/);

    const refreshPayload = jwt.verify(
      refreshCookie as string,
      process.env.JWT_REFRESH_SECRET as string,
    ) as jwt.JwtPayload;
    expect(refreshPayload.sub).toBe(res.body.user.id);
    expect(refreshPayload.exp).toBeGreaterThan(accessPayload.exp as number);
  });

  it("rejects a wrong password with 401", async () => {
    const email = uniqueEmail("login-wrongpw");
    createdEmails.push(email);

    await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "NotTheRightPass1" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an email with no matching account with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail("login-nosuchuser"), password: "Sup3rSecret" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an invalid email format with 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "Sup3rSecret" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a missing password with 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail("login-nopw") });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/refresh", () => {
  async function loginAndGetRefreshCookie(label: string) {
    const email = uniqueEmail(label);
    createdEmails.push(email);

    await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "Sup3rSecret" });

    return {
      email,
      userId: loginRes.body.user.id,
      refreshCookie: getCookie(loginRes, "refreshToken") as string,
    };
  }

  it("issues a new access token and rotates the refresh cookie", async () => {
    const { userId, refreshCookie } = await loginAndGetRefreshCookie("refresh-success");

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `refreshToken=${refreshCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();

    const accessPayload = jwt.verify(
      res.body.accessToken,
      process.env.JWT_ACCESS_SECRET as string,
    ) as jwt.JwtPayload;
    expect(accessPayload.sub).toBe(userId);

    const newRefreshCookie = getCookie(res, "refreshToken");
    expect(newRefreshCookie).toBeDefined();
    const rotatedPayload = jwt.verify(
      newRefreshCookie as string,
      process.env.JWT_REFRESH_SECRET as string,
    ) as jwt.JwtPayload;
    expect(rotatedPayload.sub).toBe(userId);
  });

  it("rejects a missing refresh cookie with 401", async () => {
    const res = await request(app).post("/api/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MISSING_REFRESH_TOKEN");
  });

  it("rejects a garbage refresh token with 401 and clears the cookie", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "refreshToken=not-a-real-token");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    const clearedCookie = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("refreshToken="),
    );
    expect(clearedCookie).toMatch(/refreshToken=;/);
  });

  it("rejects a token signed with the access-token secret with 401", async () => {
    const forged = jwt.sign(
      { sub: "00000000-0000-0000-0000-000000000000" },
      process.env.JWT_ACCESS_SECRET as string,
    );

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `refreshToken=${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("rejects a well-formed refresh token for a deleted user with 401", async () => {
    const { email, refreshCookie } = await loginAndGetRefreshCookie("refresh-deleted-user");
    await prisma.user.delete({ where: { email } });
    createdEmails.splice(createdEmails.indexOf(email), 1);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `refreshToken=${refreshCookie}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the refresh cookie so a real browser-like client stops sending it", async () => {
    const email = uniqueEmail("logout-success");
    createdEmails.push(email);

    // supertest's plain `request(app)` sends one request per call with no memory of
    // previous responses' Set-Cookie headers — fine for the other tests, which each set
    // the cookie explicitly, but logout's whole effect *is* changing what a browser sends
    // on the *next* request, which needs an agent that behaves like a real cookie jar.
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email, password: "Sup3rSecret" });
    await agent.post("/api/auth/login").send({ email, password: "Sup3rSecret" });

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);
    const clearedCookie = (logoutRes.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("refreshToken="),
    );
    expect(clearedCookie).toMatch(/refreshToken=;/);

    // The agent has now dropped the cookie (per the Set-Cookie clear above), so this
    // reproduces what a real logged-out browser would send: nothing.
    const refreshAfterLogout = await agent.post("/api/auth/refresh");
    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.error.code).toBe("MISSING_REFRESH_TOKEN");
  });

  it("succeeds even when no refresh cookie is present", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});
