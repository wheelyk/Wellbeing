import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, setAccessToken, ApiError } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("attaches the access token as a Bearer header when one is set", async () => {
    setAccessToken("token-abc");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/whatever");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer token-abc");
  });

  it("does not attach a token or attempt refresh when skipAuth is set", async () => {
    setAccessToken("token-abc");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/auth/login", { skipAuth: true });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("on a 401, refreshes the access token and retries the request once", async () => {
    setAccessToken("expired-token");
    const fetchMock = vi
      .fn()
      // Original request, rejected as expired.
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: "expired" } }))
      // Refresh call succeeds with a new token.
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "fresh-token" }))
      // Retried original request, now succeeds.
      .mockResolvedValueOnce(jsonResponse(200, { data: "secret" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ data: string }>("/api/protected");

    expect(result).toEqual({ data: "secret" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("/api/auth/refresh");
    const [, retryOptions] = fetchMock.mock.calls[2];
    expect(retryOptions.headers.Authorization).toBe("Bearer fresh-token");
  });

  it("throws the original 401 as an ApiError when the refresh attempt itself fails", async () => {
    setAccessToken("expired-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { message: "expired", code: "TOKEN_EXPIRED" } }),
      )
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: "no refresh cookie" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/protected")).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_EXPIRED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws an ApiError carrying the server's error details on non-401 failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: { message: "Invalid registration details", code: "VALIDATION_ERROR" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error: unknown = await apiFetch("/api/auth/register", { skipAuth: true }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).code).toBe("VALIDATION_ERROR");
  });
});
