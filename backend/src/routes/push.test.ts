import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-push-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function fakeSubscription(label: string) {
  return {
    endpoint: `https://push.example.com/${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    keys: { p256dh: "fake-p256dh-key", auth: "fake-auth-secret" },
  };
}

describe("GET /api/push/vapid-public-key", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).get("/api/push/vapid-public-key");
    expect(res.status).toBe(401);
  });

  it("returns the configured VAPID public key", async () => {
    const { accessToken } = await registerAndLogin("vapid-key");

    const res = await request(app).get("/api/push/vapid-public-key").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe(process.env.VAPID_PUBLIC_KEY);
  });
});

describe("POST /api/push/subscribe", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).post("/api/push/subscribe").send(fakeSubscription("noauth"));
    expect(res.status).toBe(401);
  });

  it("rejects a malformed subscription body", async () => {
    const { accessToken } = await registerAndLogin("bad-subscription");

    const res = await request(app)
      .post("/api/push/subscribe")
      .set(authed(accessToken))
      .send({ endpoint: "not-a-url" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a subscription owned by the authenticated user", async () => {
    const { accessToken, userId } = await registerAndLogin("create-subscription");
    const subscription = fakeSubscription("create");

    const res = await request(app)
      .post("/api/push/subscribe")
      .set(authed(accessToken))
      .send(subscription);

    expect(res.status).toBe(201);

    const stored = await prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });
    expect(stored).toMatchObject({
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
  });

  it("re-subscribing the same endpoint updates it in place rather than duplicating it", async () => {
    const { accessToken } = await registerAndLogin("resubscribe");
    const subscription = fakeSubscription("resub");

    await request(app).post("/api/push/subscribe").set(authed(accessToken)).send(subscription);
    const secondRes = await request(app)
      .post("/api/push/subscribe")
      .set(authed(accessToken))
      .send({ ...subscription, keys: { p256dh: "updated-p256dh", auth: "updated-auth" } });

    expect(secondRes.status).toBe(201);

    const rows = await prisma.pushSubscription.findMany({
      where: { endpoint: subscription.endpoint },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ p256dh: "updated-p256dh", auth: "updated-auth" });
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app)
      .delete("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/x" });
    expect(res.status).toBe(401);
  });

  it("removes a subscription owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete-subscription");
    const subscription = fakeSubscription("delete");
    await request(app).post("/api/push/subscribe").set(authed(accessToken)).send(subscription);

    const res = await request(app)
      .delete("/api/push/subscribe")
      .set(authed(accessToken))
      .send({ endpoint: subscription.endpoint });

    expect(res.status).toBe(200);
    const stored = await prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });
    expect(stored).toBeNull();
  });

  // Same "don't leak which case it is" ownership check every other delete in this app already
  // follows (see categoryLogs.ts et al.) - a subscription that exists but belongs to someone else
  // is left untouched, not confirmed or denied via a different status code.
  it("never lets one user's unsubscribe remove another user's subscription", async () => {
    const owner = await registerAndLogin("unsubscribe-owner");
    const attacker = await registerAndLogin("unsubscribe-attacker");
    const subscription = fakeSubscription("cross-user");
    await request(app)
      .post("/api/push/subscribe")
      .set(authed(owner.accessToken))
      .send(subscription);

    const res = await request(app)
      .delete("/api/push/subscribe")
      .set(authed(attacker.accessToken))
      .send({ endpoint: subscription.endpoint });

    expect(res.status).toBe(200);
    const stillExists = await prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });
    expect(stillExists).not.toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});
