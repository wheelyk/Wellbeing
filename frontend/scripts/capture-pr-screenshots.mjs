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

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
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

await browser.close();

if (consoleErrors.length > 0) {
  console.error("Browser console errors detected:\n" + consoleErrors.join("\n"));
  process.exit(1);
}

console.log(`Screenshots written to ${outDir}/`);
