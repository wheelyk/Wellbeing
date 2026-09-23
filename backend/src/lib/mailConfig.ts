interface MailConfig {
  from: string;
  apiKey: string;
}

// Kept separate so deployment configuration can be checked without sending email. Resend's API
// key is server-only: never expose it through a VITE_ variable or include it in a browser bundle.
export function resendConfig(): MailConfig {
  const { RESEND_API_KEY, MAIL_FROM } = process.env;
  if (!RESEND_API_KEY || !MAIL_FROM) {
    throw new Error("Email configuration requires RESEND_API_KEY and MAIL_FROM");
  }
  return { from: MAIL_FROM, apiKey: RESEND_API_KEY };
}
