import { test, expect } from "@playwright/test";
import { registerAndLandOnDashboard, uniqueTestEmail } from "./helpers";

// Phase 13's second End-to-end checklist item: edit and delete an entry end-to-end. Exercises
// both of History's two real actions (see PR #99/#103) - not just the Dashboard section's own
// edit/delete, since History is the page most users will actually reach for after the fact to
// correct or remove something.
test("edit an entry from History, then delete it, with real persistence across a reload", async ({
  page,
}) => {
  await registerAndLandOnDashboard(page, uniqueTestEmail("edit-delete"));

  // Mood unified into Category in Phase 17 (see docs/log/17-unify-mood-symptom-habit.md) - logging
  // it now goes through the generic "Quick add" entry and the system Mood category (seeded for
  // every account, selectable directly from the picker), and editing/deleting both go through
  // CategoryEntryForm/the category-logs endpoint like any other category, not a dedicated
  // MoodEntryForm/mood-logs endpoint of its own anymore. Since Phase 18, saving this first entry
  // also promotes Mood into its own "Recent Mood" Dashboard card (see
  // docs/log/18-per-category-dashboard-cards.md) rather than an inline "Mood: 3/5" line.
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.waitForSelector("text=Log an entry");
  await page.locator("#category-picker").selectOption({ label: "Mood" });
  await page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: "3" }).click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=Recent Mood");

  await page.goto("/history");
  // Mood is a 1-7 scale (see docs/log/21-unify-scale-to-seven.md) - not the 1-5 it originally
  // launched with, hence "/7" rather than "/5" below.
  await page.waitForSelector("text=Mood: 3/7");

  // Edit: change the value and add a note, using the real shared CategoryEntryForm.
  await page.getByRole("button", { name: /^edit entry/i }).click();
  await page.waitForSelector("text=Edit entry");
  await page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: "5" }).click();
  await page.getByLabel(/notes/i).fill("Edited via e2e suite");
  await page.getByRole("button", { name: /save changes/i }).click();

  await expect(page.getByText("Mood: 5/7")).toBeVisible();
  await expect(page.getByText("Edited via e2e suite")).toBeVisible();

  // Reload to prove this is real server-side persistence, not just local React state.
  await page.reload();
  await expect(page.getByText("Mood: 5/7")).toBeVisible();
  await expect(page.getByText("Edited via e2e suite")).toBeVisible();

  // Delete: the real Modal-based confirmation (see PR #99), not a native window.confirm.
  await page.getByRole("button", { name: /^delete entry/i }).click();
  await page.waitForSelector("text=/delete this entry/i");
  // HistoryPage's delete is optimistic - it removes the entry from local state immediately,
  // before the DELETE request has actually resolved (see handleConfirmDelete in
  // HistoryPage.tsx) - so the two expects just below can (and, under CI, sometimes did:
  // https://github.com/wheelyk/Wellbeing/pull/123's failed e2e run) pass before the request has
  // reached the server at all. Waiting for the real response here is what makes the reload right
  // after actually prove server-side persistence, rather than racing an in-flight request that
  // page.reload() would otherwise abort mid-flight (confirmed directly: that abort is exactly
  // what showed up as an HAR status of -1 on the failed run above).
  const deleteResponse = page.waitForResponse(
    (res) => res.request().method() === "DELETE" && res.url().includes("/api/category-logs/"),
  );
  await page.getByRole("button", { name: /^delete$/i }).click();
  await deleteResponse;

  await expect(page.getByText("Mood: 5/7")).not.toBeVisible();
  await expect(page.getByText(/nothing to show yet/i)).toBeVisible();

  // Reload again to prove the delete really reached the server too.
  await page.reload();
  await expect(page.getByText(/nothing to show yet/i)).toBeVisible();
});
