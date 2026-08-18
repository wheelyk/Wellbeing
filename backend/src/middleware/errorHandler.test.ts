import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

describe("centralized error handling", () => {
  it("returns the standard JSON error shape (not an HTML page) when a route handler throws unexpectedly", async () => {
    // Simulates an ordinary, expected-to-happen-eventually failure mode - a transient database
    // error - rather than a contrived edge case. login's `prisma.user.findUnique` call has no
    // surrounding try/catch, so this exercises exactly the kind of unhandled rejection an async
    // Express 5 route handler forwards automatically to error-handling middleware.
    const spy = vi
      .spyOn(prisma.user, "findUnique")
      .mockRejectedValueOnce(new Error("connection reset"));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "someone@example.com", password: "Sup3rSecret" });

    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: { message: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
    });

    spy.mockRestore();
  });
});
