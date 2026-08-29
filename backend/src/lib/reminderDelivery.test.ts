import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import ece from "http_ece";
import { prisma } from "./prisma";
import { runReminderTick } from "./reminderScheduler";

// The one test in this project that sends a *real* push notification.
//
// Every other reminder test mocks `web-push`, which means they prove the scheduler decides
// correctly but say nothing about whether anything is actually delivered - see
// docs/log/34-real-push-delivery-test.md. This one removes that mock entirely and runs the whole
// chain for real:
//
//   cron expression -> scheduler tick -> web-push (real VAPID signing, real aes128gcm
//   encryption) -> HTTP POST -> decrypt -> assert the exact notification text
//
// The push service itself is stood in for by a local server, because a subscription endpoint is
// just a URL: web-push does not know or care that FCM isn't on the other end.
//
// One accommodation is needed. web-push calls `https.request` unconditionally (real endpoints are
// always TLS), so for the duration of this file `https.request` delegates to `http.request`
// against the local server. That swaps out *transport only* - every piece of work web-push
// actually does is real: the VAPID JWT is genuinely signed, the payload is genuinely ECDH-derived
// and aes128gcm-encrypted, and a real socket carries it. The alternative was a self-signed
// certificate, which would have meant either committing a private key or depending on openssl
// being installed - for no additional coverage of this project's own code.
//
// The only link left unverified is the third-party service handing the message to a browser,
// which is infrastructure this project neither owns nor can exercise.

interface CapturedPush {
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

let server: http.Server;
let realHttpsRequest: typeof https.request;
let endpointBase: string;
let captured: CapturedPush[] = [];
// What the fake push service should answer with - overridden by the 410 test below.
let responseStatus = 201;

// A real P-256 keypair and auth secret, exactly as a browser's PushManager would produce. Holding
// the private key is what makes decryption - and therefore asserting the real payload - possible.
const subscriberKeys = (() => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  return {
    ecdh,
    authSecret,
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: authSecret.toString("base64url"),
  };
})();

function decryptPush(body: Buffer): { title: string; body: string } {
  const plaintext = ece.decrypt(body, {
    version: "aes128gcm",
    privateKey: subscriberKeys.ecdh,
    authSecret: subscriberKeys.authSecret,
  });
  return JSON.parse(plaintext.toString("utf8"));
}

const createdEmails: string[] = [];

async function registerUser(label: string, timezone = "UTC") {
  const email = `vitest-delivery-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return prisma.user.create({
    data: { email, displayName: label, passwordHash: "not-used-by-this-test", timezone },
  });
}

async function subscribe(userId: string, label: string) {
  return prisma.pushSubscription.create({
    data: {
      userId,
      endpoint: `${endpointBase}/push/${label}`,
      p256dh: subscriberKeys.p256dh,
      auth: subscriberKeys.auth,
    },
  });
}

beforeAll(async () => {
  realHttpsRequest = https.request;
  https.request = ((...args: Parameters<typeof http.request>) =>
    http.request(...args)) as unknown as typeof https.request;

  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        captured.push({ headers: req.headers, body: Buffer.concat(chunks) });
        res.writeHead(responseStatus);
        res.end();
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      endpointBase = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  https.request = realHttpsRequest;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  await prisma.reminderSend.deleteMany({ where: { reminder: { userId: { in: userIds } } } });
  await prisma.reminder.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.categoryLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  captured = [];
  responseStatus = 201;
  vi.useFakeTimers();
  // 20:05 UTC on a Saturday, so "0 20 * * *" is due and "0 20 * * 1-5" is not.
  vi.setSystemTime(new Date("2026-08-22T20:05:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reminder push delivery (no web-push mock)", () => {
  it("delivers a real, decryptable notification for a due cron schedule", async () => {
    const user = await registerUser("due");
    await subscribe(user.id, "due");
    const category = await prisma.category.create({
      data: { userId: user.id, name: "Diazepam", valueType: "BOOLEAN" },
    });
    await prisma.reminder.create({
      data: {
        userId: user.id,
        target: "CATEGORY",
        categoryId: category.id,
        schedules: ["0 20 * * *"],
      },
    });

    await runReminderTick();

    expect(captured).toHaveLength(1);

    // The payload really was encrypted for this subscriber, and decrypts to the exact copy the
    // scheduler composed - not a mock's idea of it.
    expect(decryptPush(captured[0].body)).toEqual({
      title: "WellTrack",
      body: "Time to log Diazepam.",
    });
  });

  it("signs the request with VAPID and the encoding a push service requires", async () => {
    const user = await registerUser("headers");
    await subscribe(user.id, "headers");
    await prisma.reminder.create({
      data: { userId: user.id, target: "GENERAL", schedules: ["0 20 * * *"] },
    });

    await runReminderTick();

    expect(captured).toHaveLength(1);
    const { headers } = captured[0];
    // Without these a real push service rejects the request outright, so asserting them is what
    // makes the local stand-in a meaningful substitute rather than a permissive sink.
    expect(headers.authorization).toMatch(/^vapid /i);
    expect(headers["content-encoding"]).toBe("aes128gcm");
    expect(headers.ttl).toBeDefined();
    expect(Number(headers["content-length"])).toBeGreaterThan(0);
  });

  it("sends nothing at all on a day the schedule excludes", async () => {
    const user = await registerUser("excluded");
    await subscribe(user.id, "excluded");
    await prisma.reminder.create({
      // Weekdays only, and the clock above is pinned to a Saturday.
      data: { userId: user.id, target: "GENERAL", schedules: ["0 20 * * 1-5"] },
    });

    await runReminderTick();

    expect(captured).toHaveLength(0);
  });

  it("delivers the general reminder's own wording, not a category's", async () => {
    const user = await registerUser("general");
    await subscribe(user.id, "general");
    await prisma.reminder.create({
      data: { userId: user.id, target: "GENERAL", schedules: ["0 20 * * *"] },
    });

    await runReminderTick();

    expect(decryptPush(captured[0].body)).toEqual({
      title: "WellTrack",
      body: "You haven't logged anything today yet.",
    });
  });

  it("drops a subscription the push service reports as gone", async () => {
    const user = await registerUser("gone");
    const subscription = await subscribe(user.id, "gone");
    await prisma.reminder.create({
      data: { userId: user.id, target: "GENERAL", schedules: ["0 20 * * *"] },
    });
    // 410 Gone is what a real service returns once a user has unsubscribed or cleared site data.
    responseStatus = 410;

    await runReminderTick();

    expect(captured).toHaveLength(1);
    // Previously only provable against a mocked error object; here the status genuinely comes back
    // over HTTP from the endpoint web-push actually called.
    expect(await prisma.pushSubscription.findUnique({ where: { id: subscription.id } })).toBeNull();
  });
});
