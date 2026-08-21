import type { Page } from "@playwright/test";

// A fresh, unique account per test run, the same "obviously-labeled test address" convention
// this project's own capture-pr-screenshots.mjs script already uses - never a shared/reused
// login, so tests can't interfere with each other's data even when they touch the same real
// database.
export function uniqueTestEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const E2E_PASSWORD = "Sup3rSecretE2E";

// Registers a brand-new account and waits for the auto-login redirect to /dashboard - the
// starting point every spec in this suite begins from.
export async function registerAndLandOnDashboard(page: Page, email: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
}
