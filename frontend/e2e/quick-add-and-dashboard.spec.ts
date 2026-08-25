import { test, expect } from "@playwright/test";
import { registerAndLandOnDashboard, uniqueTestEmail } from "./helpers";

// Phase 13's first End-to-end checklist item: register -> log in -> Quick Add a mood, two
// categories (one scale-typed, standing in for what used to be a dedicated Symptom entry; one
// boolean-typed, standing in for what used to be a dedicated Habit entry), and a medication ->
// verify Dashboard reflects them. Registration auto-logs the new user in (see
// registerAndLandOnDashboard), matching how this app's own auth flow actually works - there's no
// separate "log in" step to drive on top of that. Both Habit and Symptom folded into Category in
// Phase 17 (see docs/log/17-unify-mood-symptom-habit.md), reached through the "More…" entry
// instead of either's own former menu item - there's no "symptom" menu item to select anymore.
test("register, Quick Add all four log types, and see them reflected on Dashboard", async ({
  page,
}) => {
  await registerAndLandOnDashboard(page, uniqueTestEmail("quick-add"));

  // Mood
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByRole("menuitem", { name: /mood/i }).click();
  await page.getByRole("radio", { name: "Great", exact: true }).click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=Mood 5/5");

  // Category #1: a "scale" category (1-10), standing in for what a migrated Symptom now looks
  // like. "More…" opens straight into "Log an entry", not "Create your first category" - every
  // account, even a brand new one, already sees the 8 seeded system categories (former system
  // symptoms - see backend/prisma/seed.ts) here, so "+ Add a new category" is always how this
  // test reaches the create form, never the empty-state path.
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByRole("menuitem", { name: /more/i }).click();
  await page.waitForSelector("text=Log an entry");
  await page.getByRole("button", { name: /add a new category/i }).click();
  await page.waitForSelector("text=Create a new category");
  await page.getByLabel(/category name/i).fill("E2E Test Scale Category");
  await page.getByRole("radio", { name: /scale/i }).click();
  await page.getByLabel(/low end/i).fill("1");
  await page.getByLabel(/high end/i).fill("10");
  await page.getByRole("button", { name: /create category/i }).click();
  await page.waitForSelector("text=Log an entry");
  await page
    .getByRole("radiogroup", { name: "E2E Test Scale Category" })
    .getByRole("radio", { name: "6" })
    .click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=E2E Test Scale Category: 6/10");

  // Medication
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByRole("menuitem", { name: /medication/i }).click();
  await page.waitForSelector("text=Log a medication");
  await page.getByLabel(/medication name/i).fill("E2E Test Medication");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(300);
  await page
    .getByRole("radiogroup", { name: /was it taken/i })
    .getByRole("radio", { name: "Taken", exact: true })
    .click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=E2E Test Medication — Taken");

  // Category #2: a "boolean" category, standing in for what a migrated Habit now looks like -
  // same "Log an entry" -> "+ Add a new category" path as Category #1 above.
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByRole("menuitem", { name: /more/i }).click();
  await page.waitForSelector("text=Log an entry");
  await page.getByRole("button", { name: /add a new category/i }).click();
  await page.waitForSelector("text=Create a new category");
  await page.getByLabel(/category name/i).fill("E2E Test Category");
  await page.getByRole("radio", { name: /yes \/ no/i }).click();
  await page.getByRole("button", { name: /create category/i }).click();
  await page.waitForSelector("text=Log an entry");
  await page.getByRole("radio", { name: "Yes" }).click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=E2E Test Category: Done");

  // The unified "Recent entries" card at the top of Dashboard is the actual assertion this
  // scenario cares about: one card reflecting all four just-logged entries together, not just
  // each type's own section (already implicitly checked by the waitForSelector calls above).
  // Scoped to #recent-entries-content specifically: medication/category entries also render
  // their own near-identical "<name> — <status>" line inside their own section further down the
  // page, and an unscoped getByText would match both (Playwright's strict mode correctly rejects
  // that as ambiguous).
  const recentEntries = page.locator("#recent-entries-content");
  await expect(recentEntries.getByText(/Mood — 5\/5/)).toBeVisible();
  await expect(recentEntries.getByText(/E2E Test Scale Category — 6\/10/)).toBeVisible();
  await expect(recentEntries.getByText(/E2E Test Medication — Taken/)).toBeVisible();
  await expect(recentEntries.getByText(/E2E Test Category — Done/)).toBeVisible();

  // And the summary line at the very top of the same card - just two clauses now: Category
  // (including every former habit and symptom) has no summary clause of its own, unlike the two
  // remaining fixed built-ins (see DashboardSummary.tsx's own comment on why).
  await expect(page.getByText(/Mood: 5\/5.*Medications: 1\/1 taken/)).toBeVisible();
});
