import { test, expect } from "@playwright/test";
import { registerAndLandOnDashboard, uniqueTestEmail } from "./helpers";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";

// Phase 13's third End-to-end checklist item: view Trends after seeding a few days of data.
// Quick Add only ever creates "now" entries, so a real multi-day trend can't be produced by
// driving the UI alone in a test that has to run in seconds, not days. Instead this seeds
// directly through the same real backend API the app itself calls, using /api/category-logs' own
// explicit `loggedAt` backfill support - still the real server and real database, just skipping
// the UI for the setup step, the way a fixture is supposed to. Both series used to be seeded
// against dedicated models of their own (Mood via /api/mood-logs; Symptom via /api/symptoms +
// /api/symptom-logs), each with its own fixed chart title ("Mood", "Symptom Severity"); both
// unified into Category in Phase 17 (see docs/log/17-unify-mood-symptom-habit.md), so the mood
// series now logs against the seeded system Mood category and the second series creates its own
// scale-typed category via /api/categories - both charts are titled with their own category's
// name now, not a fixed label.
test("Trends reflects mood and category entries seeded across several days", async ({ page }) => {
  const email = uniqueTestEmail("trends");
  await registerAndLandOnDashboard(page, email);

  // The access token lives only in the frontend's in-memory module state, unreachable from
  // outside the page - but /api/auth/refresh reads the same httpOnly refresh cookie the
  // browser already holds from registering above, and page.request shares this browser
  // context's cookie jar, so this mints a real Bearer token without touching any UI.
  const refreshRes = await page.request.post(`${API_URL}/api/auth/refresh`);
  expect(refreshRes.ok()).toBe(true);
  const { accessToken } = (await refreshRes.json()) as { accessToken: string };
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // The system Mood category (seeded for every account - see backend/prisma/seed.ts) rather than
  // one this test creates itself.
  const categoriesRes = await page.request.get(`${API_URL}/api/categories`, {
    headers: authHeaders,
  });
  expect(categoriesRes.ok()).toBe(true);
  const categories = (await categoriesRes.json()) as Array<{ id: string; name: string }>;
  const moodCategoryId = categories.find((c) => c.name === "Mood")?.id;
  if (!moodCategoryId) throw new Error("Expected a seeded system 'Mood' category");

  const categoryName = "E2E Trends Category";
  const categoryRes = await page.request.post(`${API_URL}/api/categories`, {
    headers: authHeaders,
    data: { name: categoryName, valueType: "scale", scaleMin: 1, scaleMax: 10 },
  });
  expect(categoryRes.ok()).toBe(true);
  const { id: categoryId } = (await categoryRes.json()) as { id: string };

  // Three days of data, well inside the default 7-day Trends period, each with a distinct
  // mood/category value so a flat "all the same number" chart couldn't accidentally pass this.
  const daysAgo = [2, 1, 0];
  const moodValues = [3, 4, 5];
  const categoryValues = [4, 6, 8];

  for (let i = 0; i < daysAgo.length; i++) {
    const loggedAt = new Date(Date.now() - daysAgo[i] * 24 * 60 * 60 * 1000).toISOString();

    const moodLogRes = await page.request.post(`${API_URL}/api/category-logs`, {
      headers: authHeaders,
      data: { categoryId: moodCategoryId, valueNumeric: moodValues[i], loggedAt },
    });
    expect(moodLogRes.ok()).toBe(true);

    const categoryLogRes = await page.request.post(`${API_URL}/api/category-logs`, {
      headers: authHeaders,
      data: { categoryId, valueNumeric: categoryValues[i], loggedAt },
    });
    expect(categoryLogRes.ok()).toBe(true);
  }

  await page.goto("/trends");

  // The two CollapsibleSection titles switch from "No data yet" to a real "Avg: X.X" only once
  // the backend's own trends aggregation (backend/src/routes/trends.ts) has picked the seeded
  // rows up - this is the actual end-to-end assertion, not just "the page didn't crash."
  const expectedMoodAvg = (moodValues.reduce((a, b) => a + b, 0) / moodValues.length).toFixed(1);
  const expectedCategoryAvg = (
    categoryValues.reduce((a, b) => a + b, 0) / categoryValues.length
  ).toFixed(1);

  await expect(page.getByText(`Mood — Avg: ${expectedMoodAvg}`)).toBeVisible();
  await expect(page.getByText(`${categoryName} — Avg: ${expectedCategoryAvg}`)).toBeVisible();

  // The Activity calendar independently confirms the same three days show as logged, via each
  // day's own accessible label rather than the chart averages above.
  await expect(page.getByRole("group", { name: /Mood chart/i })).toBeVisible();
  await expect(
    page.getByRole("group", { name: new RegExp(`${categoryName} chart`, "i") }),
  ).toBeVisible();
});
