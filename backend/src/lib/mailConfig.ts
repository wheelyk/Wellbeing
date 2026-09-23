import type SMTPTransport from "nodemailer/lib/smtp-transport";

interface MailConfig {
  from: string;
  options: SMTPTransport.Options;
}

// Kept separate so deployment configuration can be checked without sending email.
export function smtpConfig(): MailConfig {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, MAIL_FROM } = process.env;
  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !MAIL_FROM || ![465, 587].includes(port)) {
    throw new Error(
      "Email configuration requires SMTP_HOST, SMTP_USER, SMTP_PASSWORD, MAIL_FROM and SMTP_PORT (465 or 587)",
    );
  }
  return {
    from: MAIL_FROM,
    options: {
      host: SMTP_HOST,
      port,
      secure: port === 465,
      // Port 465 starts inside TLS. Port 587 starts plain and must successfully upgrade using
      // STARTTLS before credentials or message content are sent.
      requireTLS: port === 587,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    },
  };
}
