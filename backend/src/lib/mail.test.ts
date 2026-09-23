import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPasswordResetEmail } from "./mail";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureResend() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MAIL_TRANSPORT", "resend");
  vi.stubEnv("RESEND_API_KEY", "re_test-secret");
  vi.stubEnv("MAIL_FROM", "WellTrack <reset@example.com>");
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sendPasswordResetEmail", () => {
  it("sends the reset message through Resend's HTTPS API", async () => {
    configureResend();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "message-123" }));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendPasswordResetEmail(
      "user@example.com",
      "https://wellbeing.example/reset-password?token=secret-token",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer re_test-secret",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(JSON.parse(String(options.body))).toEqual({
      from: "WellTrack <reset@example.com>",
      to: ["user@example.com"],
      subject: "Reset your WellTrack password",
      text: expect.stringContaining("token=secret-token"),
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses console delivery in production", async () => {
    configureResend();
    vi.stubEnv("MAIL_TRANSPORT", "console");
    const log = vi.spyOn(console, "log");

    await expect(sendPasswordResetEmail("user@example.com", "secret")).rejects.toThrow(
      "configuration",
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("rejects incomplete Resend configuration", async () => {
    configureResend();
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(sendPasswordResetEmail("user@example.com", "secret")).rejects.toThrow(
      "Email configuration requires",
    );
  });

  it.each([
    ["network failure", () => Promise.reject(new Error("private network details"))],
    ["provider rejection", () => Promise.resolve(jsonResponse(403, { message: "private" }))],
    ["malformed success", () => Promise.resolve(jsonResponse(200, {}))],
  ])("sanitizes a %s", async (_label, responseFactory) => {
    configureResend();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(responseFactory));

    await expect(sendPasswordResetEmail("user@example.com", "secret")).rejects.toThrow(
      "Password reset email delivery failed",
    );
  });
});
