import { test, expect } from "@playwright/test";
import { registerAndLandOnDashboard, uniqueTestEmail, E2E_PASSWORD } from "./helpers";

// Phase 13's fourth End-to-end checklist item: account deletion end-to-end, confirming data is
// gone. "Gone" means two separate things worth checking independently: the session itself (the
// user is logged out and can't just refresh back in) and the underlying data (the same email can
// register a brand-new, empty account afterwards - it wouldn't be able to if the old user row,
// and the unique constraint on email, were still sitting in the database per Cascade deletes in
// schema.prisma).
test("deleting an account ends the session and really removes the data", async ({ page }) => {
  const email = uniqueTestEmail("delete");
  await registerAndLandOnDashboard(page, email);

  // Logs a category entry, just to have some real data on the account before deleting it - the
  // point of this test is "does deleting really remove whatever was logged," not which type of
  // entry that happens to be. Medication itself unified into Category (Phase 19, see
  // docs/log/19-medication-to-category.md) - "Quick add" now opens the category discovery flow
  // directly, with no menu to pick a type from first.
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.waitForSelector("text=Log an entry");
  await page.getByRole("button", { name: /add a new category/i }).click();
  await page.waitForSelector("text=Create a new category");
  await page.getByLabel(/category name/i).fill("E2E Test Medication");
  await page.getByRole("radio", { name: /yes \/ no/i }).click();
  await page.getByRole("button", { name: /create category/i }).click();
  await page.waitForSelector("text=Log an entry");
  await page.getByRole("radio", { name: "Yes" }).click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=Recent E2E Test Medication");

  // The "Delete account" CollapsibleSection starts expanded by default (no localStorage entry
  // yet in this fresh browser context), so - unlike a section a user has previously collapsed -
  // no click on its own header is needed to reveal the confirmation field.
  await page.goto("/settings");
  await page.getByLabel(/type delete to confirm/i).fill("DELETE");
  await page.getByRole("button", { name: /permanently delete my account/i }).click();

  await page.waitForURL("**/login");
  await expect(page.getByText(/account has been deleted/i)).toBeVisible();

  // The session is really gone, not just the visible route - a refresh must not silently log
  // back in via a still-valid refresh cookie (the DELETE handler's own cascade wipes the user
  // row the refresh token's userId would otherwise still resolve to).
  await page.reload();
  await expect(page).toHaveURL(/\/login/);

  // The account row is really gone (not just logged out of) - the same email can register a
  // brand-new account from scratch, which would fail with EMAIL_TAKEN if the old row survived.
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");

  // And it's a genuinely fresh account with no leftover history from the deleted one.
  await page.goto("/history");
  await expect(page.getByText(/nothing to show yet/i)).toBeVisible();
});
