// Placeholder/mock email provider — Tasks.md's Phase 2 forgot-password item explicitly allows
// this for local dev, and docs/log/01-auth-backend.md's 2026-08-16 entry ("...why forgot
// password specifically needs email") already worked through why a *real* send needs a genuine
// transactional email provider (Resend, Postmark, SendGrid, AWS SES, etc.), each requiring its
// own account, API key, and verified sending domain. That's a product/infra decision this
// project has deliberately left open, not something to pick unilaterally while just wiring up
// the forgot-password endpoint - so this module exists purely to give that endpoint *something*
// to call in the meantime.
//
// In place of an actual send, this just logs the reset link to the server console, clearly
// labeled so nobody mistakes this console output for a real delivered email once a real
// provider is wired in later. The function is `async` (even though this implementation never
// awaits anything) so that swapping in a real provider later - which *would* need to await a
// network call - is a drop-in change for every caller, not a signature change.
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  console.log(
    `[mail:placeholder] Password reset requested for ${to}. ` +
      `No real email provider is configured yet, so nothing was actually delivered - ` +
      `this is the link a real email would have contained: ${resetLink}`,
  );
}
