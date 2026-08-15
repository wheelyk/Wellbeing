import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { requireAuth } from "./requireAuth";
import { signAccessToken } from "../lib/jwt";

// requireAuth has no real protected route to attach to yet in this codebase (that arrives
// with the mood-logs endpoint) - so it's tested here against a minimal throwaway route that
// exists only for this test file, exactly as a real protected route would use it.
function buildTestApp() {
  const app = express();
  app.get("/protected", requireAuth, (req, res) => {
    res.json({ userId: req.userId });
  });
  return app;
}

describe("requireAuth", () => {
  it("attaches req.userId and calls next() for a valid access token", async () => {
    const app = buildTestApp();
    const token = signAccessToken("user-123");

    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("user-123");
  });

  it("rejects a request with no Authorization header", async () => {
    const app = buildTestApp();

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MISSING_ACCESS_TOKEN");
  });

  it("rejects an Authorization header that isn't a Bearer token", async () => {
    const app = buildTestApp();

    const res = await request(app).get("/protected").set("Authorization", "Basic somevalue");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MISSING_ACCESS_TOKEN");
  });

  it("rejects an expired access token", async () => {
    const app = buildTestApp();
    const expired = jwt.sign({ sub: "user-123" }, process.env.JWT_ACCESS_SECRET as string, {
      expiresIn: -1,
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("rejects a token signed with the refresh-token secret", async () => {
    const app = buildTestApp();
    const wrongSecret = jwt.sign({ sub: "user-123" }, process.env.JWT_REFRESH_SECRET as string);

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${wrongSecret}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("rejects a garbage token", async () => {
    const app = buildTestApp();

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });
});
