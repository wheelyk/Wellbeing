import { afterEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { sendPasswordResetEmail } from "./mail";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function configureSmtp(port = "587") {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MAIL_TRANSPORT", "smtp");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_PORT", port);
  vi.stubEnv("SMTP_USER", "test-user");
  vi.stubEnv("SMTP_PASSWORD", "test-secret");
  vi.stubEnv("MAIL_FROM", "WellTrack <reset@example.com>");
}

describe("sendPasswordResetEmail", () => {
  it.each([
    ["587", false, true],
    ["465", true, false],
  ])("uses encrypted SMTP settings for port %s", async (port, secure, requireTLS) => {
    configureSmtp(port);
    const sendMail = vi.fn().mockResolvedValue({
      accepted: ["user@example.com"],
      rejected: [],
    });
    const close = vi.fn();
    const createTransport = vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail,
      close,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendPasswordResetEmail(
      "user@example.com",
      "https://wellbeing.example/reset-password?token=secret-token",
    );

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: Number(port), secure, requireTLS }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { address: "user@example.com", name: "" },
        subject: "Reset your WellTrack password",
        text: expect.stringContaining("token=secret-token"),
      }),
    );
    expect(log).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("refuses console delivery in production", async () => {
    configureSmtp();
    vi.stubEnv("MAIL_TRANSPORT", "console");
    const log = vi.spyOn(console, "log");

    await expect(sendPasswordResetEmail("user@example.com", "secret")).rejects.toThrow(
      "configuration",
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("rejects incomplete SMTP configuration", async () => {
    configureSmtp();
    vi.stubEnv("SMTP_PASSWORD", "");

    await expect(sendPasswordResetEmail("user@example.com", "secret")).rejects.toThrow(
      "Email configuration requires",
    );
  });

  it("sanitizes provider failures and closes the transport", async () => {
    configureSmtp();
    const close = vi.fn();
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error("private provider details")),
      close,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);

    await expect(sendPasswordResetEmail("user@example.com", "secret")).rejects.toThrow(
      "Password reset email delivery failed",
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
