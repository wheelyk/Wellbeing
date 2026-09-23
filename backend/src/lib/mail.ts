import { resendConfig } from "./mailConfig";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const mode =
    process.env.MAIL_TRANSPORT ?? (process.env.NODE_ENV === "test" ? "console" : "resend");

  // Local console delivery keeps development simple. Production refuses it because a reset
  // link is a credential and must never be copied into hosted application logs.
  if (mode === "console" && ["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    console.log(`[mail:local-only] No email delivered. Reset link: ${resetLink}`);
    return;
  }
  if (mode !== "resend") {
    throw new Error("Invalid email transport configuration");
  }

  const { from, apiKey } = resendConfig();
  const text =
    "Someone requested a password reset for your WellTrack account.\n\n" +
    `Open this link to choose a new password:\n${resetLink}\n\n` +
    "This link expires in one hour and can only be used once. " +
    "If you did not request this, you can ignore this email.";

  try {
    // Railway blocks outbound SMTP on Free, Trial, and Hobby plans. HTTPS uses the same normal
    // web connection as every other API call, so it works on every Railway plan and still keeps
    // the provider credential entirely on the backend.
    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Reset your WellTrack password",
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error("Provider rejected message");

    const result = (await response.json()) as { id?: unknown };
    if (typeof result.id !== "string" || !result.id) throw new Error("Provider omitted message id");
  } catch {
    // Provider errors can include recipient addresses or configuration details. The public route
    // and hosted logs deliberately receive only this stable message; delivery diagnostics remain
    // available in Resend's own authenticated dashboard.
    throw new Error("Password reset email delivery failed");
  }
}
