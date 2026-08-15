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
  it("logs in with correct credentials and returns valid access + refresh tokens", async () => {
    const email = uniqueEmail("login-success");
    createdEmails.push(email);

    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Sup3rSecret", displayName: "Login Test" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "Sup3rSecret" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email, displayName: "Login Test" });
    expect(res.body.user.passwordHash).toBeUndefined();

    const accessPayload = jwt.verify(
      res.body.accessToken,
      process.env.JWT_ACCESS_SECRET as string,
    ) as jwt.JwtPayload;
    const refreshPayload = jwt.verify(
      res.body.refreshToken,
      process.env.JWT_REFRESH_SECRET as string,
    ) as jwt.JwtPayload;

    expect(accessPayload.sub).toBe(res.body.user.id);
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

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});
