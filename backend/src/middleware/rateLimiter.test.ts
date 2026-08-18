import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createAuthRateLimiter } from "./rateLimiter";

// Builds a fresh, throwaway app for each test rather than reusing the real `authRouter` - a
// rate limiter keeps its own in-memory hit-count store per instance, so testing a brand-new
// instance here can never leak state into (or be affected by) the real `authRateLimiter`
// singleton the actual app uses, or any other test file in this suite.
function buildTestApp(overrides?: { skip?: boolean }) {
  const app = express();
  app.get("/test", createAuthRateLimiter(overrides), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("authRateLimiter", () => {
  it("blocks a client after exceeding the configured limit within the window", async () => {
    const app = buildTestApp({ skip: false });

    // The real configuration allows 10 requests per window - exhaust exactly that many first.
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/test");
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get("/test");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: { message: "Too many attempts. Please try again later.", code: "RATE_LIMITED" },
    });
  });

  it("is inert by default while NODE_ENV is 'test' (as it always is during this suite)", async () => {
    const app = buildTestApp(); // no override - uses the real skip-in-tests behavior

    for (let i = 0; i < 15; i++) {
      const res = await request(app).get("/test");
      expect(res.status).toBe(200);
    }
  });
});
