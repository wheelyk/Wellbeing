import { test, expect } from "@playwright/test";
import { registerAndLandOnDashboard, uniqueTestEmail } from "./helpers";

// Phase 13's first End-to-end checklist item: register -> log in -> Quick Add a symptom, mood,
// medication, and habit -> verify Dashboard reflects them. Registration auto-logs the new user
// in (see registerAndLandOnDashboard), matching how this app's own auth flow actually works -
// there's no separate "log in" step to drive on top of that.
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

  // Symptom
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByRole("menuitem", { name: /symptom/i }).click();
  await page.waitForSelector("text=Log a symptom");
  await page.locator("select").first().selectOption({ index: 1 });
  await page
    .getByRole("radiogroup", { name: /severity/i })
    .getByRole("radio", { name: "6" })
    .click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=/Severity 6\\/10/");

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

  // Habit
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByRole("menuitem", { name: /habit/i }).click();
  await page.waitForSelector("text=Create your first habit");
  await page.getByLabel(/habit name/i).fill("E2E Test Habit");
  await page.getByRole("radio", { name: /yes \/ no/i }).click();
  await page.getByRole("button", { name: /create habit/i }).click();
  await page.waitForSelector("text=Log a habit");
  await page.getByRole("radio", { name: "Yes" }).click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=E2E Test Habit: Done");

  // The unified "Recent entries" card at the top of Dashboard is the actual assertion this
  // scenario cares about: one card reflecting all four just-logged entries together, not just
  // each type's own section (already implicitly checked by the waitForSelector calls above).
  // Scoped to #recent-entries-content specifically: medication/habit entries also render their
  // own near-identical "<name> — <status>" line inside their own section further down the page,
  // and an unscoped getByText would match both (Playwright's strict mode correctly rejects that
  // as ambiguous).
  const recentEntries = page.locator("#recent-entries-content");
  // The symptom line here reads "<symptom name> — 6/10" (the name comes from whichever system
  // symptom the picker's index:1 option happens to be, so this doesn't hardcode a name) - a
  // different format from the per-type Symptoms section further down the page, which instead
  // reads "<name> · Severity 6/10" (see the SymptomEntryForm/history label helpers).
  await expect(recentEntries.getByText(/Mood — 5\/5/)).toBeVisible();
  await expect(recentEntries.getByText(/— 6\/10/)).toBeVisible();
  await expect(recentEntries.getByText(/E2E Test Medication — Taken/)).toBeVisible();
  await expect(recentEntries.getByText(/E2E Test Habit — Done/)).toBeVisible();

  // And the summary line at the very top of the same card.
  await expect(
    page.getByText(/Mood: 5\/5.*Symptoms: 1 logged.*Medications: 1\/1 taken.*Habits: 1\/1 logged/),
  ).toBeVisible();
});
