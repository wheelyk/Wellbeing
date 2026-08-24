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

  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByRole("menuitem", { name: /mood/i }).click();
  await page.getByRole("radio", { name: "Neutral", exact: true }).click();
  await page.getByRole("button", { name: /save entry/i }).click();
  await page.waitForSelector("text=Mood 3/5");

  await page.goto("/history");
  await page.waitForSelector("text=Mood 3/5");

  // Edit: change the mood and add a note, using the real shared MoodEntryForm.
  await page.getByRole("button", { name: /^edit mood entry/i }).click();
  await page.waitForSelector("text=Edit mood entry");
  await page.getByRole("radio", { name: "Great", exact: true }).click();
  await page.getByLabel(/notes/i).fill("Edited via e2e suite");
  await page.getByRole("button", { name: /save changes/i }).click();

  await expect(page.getByText("Mood 5/5")).toBeVisible();
  await expect(page.getByText("Edited via e2e suite")).toBeVisible();

  // Reload to prove this is real server-side persistence, not just local React state.
  await page.reload();
  await expect(page.getByText("Mood 5/5")).toBeVisible();
  await expect(page.getByText("Edited via e2e suite")).toBeVisible();

  // Delete: the real Modal-based confirmation (see PR #99), not a native window.confirm.
  await page.getByRole("button", { name: /^delete mood entry/i }).click();
  await page.waitForSelector("text=/delete this mood entry/i");
  // HistoryPage's delete is optimistic - it removes the entry from local state immediately,
  // before the DELETE request has actually resolved (see handleConfirmDelete in
  // HistoryPage.tsx) - so the two expects just below can (and, under CI, sometimes did:
  // https://github.com/wheelyk/Wellbeing/pull/123's failed e2e run) pass before the request has
  // reached the server at all. Waiting for the real response here is what makes the reload right
  // after actually prove server-side persistence, rather than racing an in-flight request that
  // page.reload() would otherwise abort mid-flight (confirmed directly: that abort is exactly
  // what showed up as an HAR status of -1 on the failed run above).
  const deleteResponse = page.waitForResponse(
    (res) => res.request().method() === "DELETE" && res.url().includes("/api/mood-logs/"),
  );
  await page.getByRole("button", { name: /^delete$/i }).click();
  await deleteResponse;

  await expect(page.getByText("Mood 5/5")).not.toBeVisible();
  await expect(page.getByText(/nothing to show yet/i)).toBeVisible();

  // Reload again to prove the delete really reached the server too.
  await page.reload();
  await expect(page.getByText(/nothing to show yet/i)).toBeVisible();
});
