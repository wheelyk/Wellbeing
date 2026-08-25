// Drives the register -> dashboard -> logout -> login -> dashboard -> route-guard flow
// through a real headless browser and saves a screenshot at each step. Used by the
// .github/workflows/pr-preview.yml CI job to give reviewers visual proof a PR's frontend
// actually works, not just that its tests pass. Not a Vitest/Playwright *test* (nothing
// asserts pass/fail here) - Phase 13 is where a real, assertion-based e2e suite belongs.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.PREVIEW_BASE_URL ?? "http://localhost:5173";
const outDir = process.env.SCREENSHOT_DIR ?? "pr-screenshots-output";

const email = `pr-preview-${Date.now()}@example.com`;
const password = "Sup3rSecret";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

// AuthProvider now attempts a silent session rehydration (POST /api/auth/refresh) on every
// mount, including this script's very first page load - a fresh browser with no cookie yet
// correctly gets a 401 back, but Chrome logs any non-2xx fetch response as a console error
// regardless of whether the app handles it gracefully. That one specific, expected 401 isn't
// a bug, so it's tracked via the network layer (not guessed from message text) and excluded -
// any other console error, including a 401 from a route that should be authenticated, still
// fails the check normally.
let expectedRehydrationFailures = 0;
page.on("response", (res) => {
  if (res.url().endsWith("/api/auth/refresh") && res.status() === 401) {
    expectedRehydrationFailures += 1;
  }
});

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  if (msg.text().includes("401") && expectedRehydrationFailures > 0) {
    expectedRehydrationFailures -= 1;
    return;
  }
  consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

async function screenshot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
}

await page.goto(`${baseUrl}/register`);
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL("**/dashboard");
await screenshot("01-register-then-dashboard");

await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL("**/login");
await screenshot("02-after-logout-redirected-to-login");

await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL("**/dashboard");
await screenshot("03-login-then-dashboard");

// Logs one real entry of each remaining type, so the before/after comparison this screenshot
// feeds into actually proves the dashboard *functions* - not just that it renders while empty.
// Mirrors the manual verification flow used when DashboardPage was decomposed into per-log-type
// section components (see docs/log/08-git-github-workflow.md). Habit and Symptom folded into
// Category in Phase 17 (see docs/log/17-unify-mood-symptom-habit.md) - there's no dedicated
// "Add symptom entry" button anymore, and every account already sees the 8 seeded system
// categories (former system symptoms) from registration onward, so "Add category entry" opens
// straight into "Log an entry", never an empty "Create your first category" state.
await page.getByRole("button", { name: "Add mood entry" }).click();
await page.getByRole("radio", { name: "Great", exact: true }).click();
await page.getByRole("button", { name: /save entry/i }).click();
await page.waitForTimeout(300);

await page.getByRole("button", { name: "Add medication entry" }).click();
await page.waitForSelector("text=Log a medication");
await page.getByLabel(/medication name/i).fill("Ibuprofen");
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.waitForTimeout(300);
await page
  .getByRole("radiogroup", { name: /was it taken/i })
  .getByRole("radio", { name: "Taken", exact: true })
  .click();
await page.getByRole("button", { name: /save entry/i }).click();
await page.waitForSelector("text=Ibuprofen — Taken");

await page.getByRole("button", { name: "Add category entry" }).click();
await page.waitForSelector("text=Log an entry");
await page.getByRole("button", { name: /add a new category/i }).click();
await page.waitForSelector("text=Create a new category");
await page.getByLabel(/category name/i).fill("Exercise");
await page.getByRole("radio", { name: /yes \/ no/i }).click();
await page.getByRole("button", { name: /create category/i }).click();
await page.waitForSelector("text=Log an entry");
await page.getByRole("radio", { name: "Yes" }).click();
await page.getByRole("button", { name: /save entry/i }).click();
await page.waitForSelector("text=Exercise: Done");

await screenshot("04-dashboard-functioning-with-entries");

await browser.close();

if (consoleErrors.length > 0) {
  console.error("Browser console errors detected:\n" + consoleErrors.join("\n"));
  process.exit(1);
}

console.log(`Screenshots written to ${outDir}/`);
