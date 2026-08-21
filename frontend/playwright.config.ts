import { defineConfig } from "@playwright/test";

// Real end-to-end tests, driving a real browser against real running servers (frontend +
// backend + Postgres) - not the mocked-fetch component tests under src/, and not the ad-hoc,
// no-assertions screenshot script in scripts/capture-pr-screenshots.mjs. Matches that script's
// own convention of expecting the servers to already be running rather than trying to start
// Postgres itself here (see README.md's "Running locally" and .github/workflows/e2e.yml for how
// CI stands all three up before running this suite).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Each spec registers its own throwaway user against the same real database, and the account-
  // deletion spec in particular isn't safe to run concurrently with anything else hitting the
  // rate limiter on the same shared local Postgres - one worker keeps every spec's timing
  // predictable rather than fighting over shared backend state.
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Quick Add only exists docked inside BottomNav (see DashboardPage.tsx), which is
    // `md:hidden` - real desktop users reach Quick Add through a different, wider layout this
    // suite doesn't yet cover, but every spec here drives the mobile flow, so the default
    // viewport must actually be mobile-sized or the button is present in the DOM but never
    // visible/clickable. Same Pixel-ish size used throughout this session's manual mobile
    // verification (see docs/design-review-2026-08-20).
    viewport: { width: 412, height: 915 },
  },
});
