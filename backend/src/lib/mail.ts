import nodemailer from "nodemailer";
import { smtpConfig } from "./mailConfig";

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const mode = process.env.MAIL_TRANSPORT ?? (process.env.NODE_ENV === "test" ? "console" : "smtp");

  // Local console delivery keeps development simple. Production refuses it because a reset
  // link is a credential and must never be copied into hosted application logs.
  if (mode === "console" && ["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    console.log(`[mail:local-only] No email delivered. Reset link: ${resetLink}`);
    return;
  }
  if (mode !== "smtp") {
    throw new Error("Invalid email transport configuration");
  }

  const { from, options } = smtpConfig();
  const transport = nodemailer.createTransport(options);

  try {
    const result = await transport.sendMail({
      from,
      to: { address: to, name: "" },
      subject: "Reset your WellTrack password",
      text:
        "Someone requested a password reset for your WellTrack account.\n\n" +
        `Open this link to choose a new password:\n${resetLink}\n\n` +
        "This link expires in one hour and can only be used once. " +
        "If you did not request this, you can ignore this email.",
    });

    if (!result.accepted?.length || result.rejected?.length) {
      throw new Error("Recipient rejected");
    }
  } catch {
    // Provider errors can include recipient addresses or connection details.
    throw new Error("Password reset email delivery failed");
  } finally {
    transport.close();
  }
}
