import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app";

describe("trust proxy configuration", () => {
  // Regression test for a real production bug: Railway (this app's host) sits in front of this
  // process as a reverse proxy, so every real request's actual client IP arrives via
  // `X-Forwarded-For`, not the raw socket address. Without `app.set("trust proxy", 1)` (see
  // app.ts), Express ignores that header entirely and every request resolves to the exact same
  // `req.ip` regardless of who's really making it - which collapsed authRateLimiter's per-IP
  // bucket (rateLimiter.ts) into one shared budget for the entire userbase, letting a handful of
  // unrelated requests lock every real user out of registering/logging in for 15 minutes. This
  // test asserts two requests with different `X-Forwarded-For` values are correctly identified
  // as different clients - confirmed to fail (both resolving to the same IP) before this fix.
  it("resolves req.ip from X-Forwarded-For, distinguishing different real clients", async () => {
    const app = createApp();
    app.get("/__test-client-ip", (req, res) => res.json({ ip: req.ip }));

    const first = await request(app)
      .get("/__test-client-ip")
      .set("X-Forwarded-For", "203.0.113.10");
    const second = await request(app)
      .get("/__test-client-ip")
      .set("X-Forwarded-For", "198.51.100.20");

    expect(first.body.ip).toBe("203.0.113.10");
    expect(second.body.ip).toBe("198.51.100.20");
    expect(first.body.ip).not.toBe(second.body.ip);
  });
});
