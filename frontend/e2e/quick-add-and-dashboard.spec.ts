import { test, expect } from "@playwright/test";
import { registerAndLandOnDashboard, uniqueTestEmail, openCategoryQuickAdd } from "./helpers";

// Phase 13's first End-to-end checklist item: register -> log in -> Quick Add Mood plus three
// more categories (one scale-typed, standing in for what used to be a dedicated Symptom entry;
// one boolean-typed, standing in for what used to be a dedicated Habit entry; one more
// boolean-typed, standing in for what used to be a dedicated Medication dose) -> verify Dashboard
// reflects them. Registration auto-logs the new user in (see registerAndLandOnDashboard),
// matching how this app's own auth flow actually works - there's no separate "log in" step to
// drive on top of that. Mood, Habit, Symptom, and Medication all folded into Category (see
// docs/log/17-unify-mood-symptom-habit.md and docs/log/19-medication-to-category.md) - "Quick
// add" now opens the single category discovery flow directly, with no menu to pick a type from
// first.
test("register, Quick Add four categories, and see them reflected on Dashboard", async ({
  page,
}) => {
  await registerAndLandOnDashboard(page, uniqueTestEmail("quick-add"));

  // The per-category card list this test used to wait on (a "Recent <name>" heading appearing
  // once a category was logged the first time) is retired along with the "Recent entries"
  // combined card before it - docs/log/50-timeline-v2.md. Waiting for the dialog itself to close
  // is the reliable "did this save" signal that survives that: CategoryLogger only closes it
  // after a save actually succeeds (mirrors the same fix in scripts/capture-pr-screenshots.mjs).
  async function saveAndWaitForClose() {
    await page.getByRole("button", { name: /save entry/i }).click();
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
  }

  // Mood: "Quick add" opens a two-choice menu first (see docs/log/51-one-off-tasks.md);
  // openCategoryQuickAdd picks the category-entry side, landing straight on "Log an entry", not
  // "Create your first category" - every account, even a brand new one, already sees the 11
  // seeded system categories (Mood/Energy/Stress plus every system symptom - see
  // backend/prisma/seed.ts) here, with Mood itself selectable directly from the picker rather
  // than needing to be created.
  await openCategoryQuickAdd(page);
  await page.locator("#category-picker").selectOption({ label: "Mood" });
  await page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: "5" }).click();
  await saveAndWaitForClose();

  // Category #1: a "scale" category (1-10), standing in for what a migrated Symptom now looks
  // like - reached via "+ Add a new category" since a category (Mood) already exists by this
  // point, same as every subsequent category below.
  await openCategoryQuickAdd(page);
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
  await saveAndWaitForClose();

  // Category #2: a "boolean" category, standing in for what a migrated Medication dose now looks
  // like - same "Log an entry" -> "+ Add a new category" path as Category #1 above.
  await openCategoryQuickAdd(page);
  await page.getByRole("button", { name: /add a new category/i }).click();
  await page.waitForSelector("text=Create a new category");
  await page.getByLabel(/category name/i).fill("E2E Test Medication");
  await page.getByRole("radio", { name: /yes \/ no/i }).click();
  await page.getByRole("button", { name: /create category/i }).click();
  await page.waitForSelector("text=Log an entry");
  await page.getByRole("radio", { name: "Yes" }).click();
  await saveAndWaitForClose();

  // Category #3: a second "boolean" category, standing in for what a migrated Habit now looks
  // like - same "Log an entry" -> "+ Add a new category" path as above.
  await openCategoryQuickAdd(page);
  await page.getByRole("button", { name: /add a new category/i }).click();
  await page.waitForSelector("text=Create a new category");
  await page.getByLabel(/category name/i).fill("E2E Test Category");
  await page.getByRole("radio", { name: /yes \/ no/i }).click();
  await page.getByRole("button", { name: /create category/i }).click();
  await page.waitForSelector("text=Log an entry");
  await page.getByRole("radio", { name: "Yes" }).click();
  await saveAndWaitForClose();

  // The summary line on DashboardSummary itself - a plain count now, not a per-type breakdown: an
  // unbounded, user-extensible category set has no fixed "how many were there to log today"
  // denominator the way the original built-ins did (see DashboardSummary.tsx's own comment on
  // why).
  await expect(page.getByText(/Logged 4 entries today/)).toBeVisible();

  // Per-entry verification moved to History: the per-category Dashboard cards these four used to
  // check against are retired outright (docs/log/50-timeline-v2.md), and none of the four has a
  // reminder attached, so none of them appear on the reminder-driven Timeline either. History
  // still lists every entry regardless, its name and formatted value (built from the backend's
  // own formatCategoryLogValue - see backend/src/routes/history.ts) now in separate elements
  // rather than one pre-joined "Name: value" string (docs/log/53-history-redesign.md) - each
  // check below is scoped to the <li> containing the category's own name, since a bare value
  // like "Done" isn't unique across two different boolean categories, and a bare name like
  // "Mood" also isn't unique on this page (the Category filter's own <option> renders it too).
  await page.goto("/history");
  // Mood is a 1-7 scale (see docs/log/21-unify-scale-to-seven.md) - not the 1-5 it originally
  // launched with, hence "5/7" rather than "5/5" below.
  await expect(page.locator("li", { hasText: "Mood" }).getByText("5/7")).toBeVisible();
  await expect(
    page.locator("li", { hasText: "E2E Test Scale Category" }).getByText("6/10"),
  ).toBeVisible();
  await expect(
    page.locator("li", { hasText: "E2E Test Medication" }).getByText("Done"),
  ).toBeVisible();
  await expect(
    page.locator("li", { hasText: "E2E Test Category" }).getByText("Done"),
  ).toBeVisible();
});
