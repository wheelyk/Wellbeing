// The single hardcoded admin account (confirmed directly with the project owner: one admin,
// identified by email, not a DB role/permission column - there's exactly one admin and no plan
// for more). Comparison is case-insensitive since email addresses are conventionally
// case-insensitive and this app's own registration/login already lowercase email on the way in
// (see auth.ts's registerSchema/loginSchema) - matching that same normalization here avoids a
// mismatch if ADMIN_EMAIL is ever set with different casing than how the account was registered.
export function isAdminEmail(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}
