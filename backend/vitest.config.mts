import { defineConfig } from "vitest/config";

// One test file at a time, deliberately trading roughly 3.5x the wall clock for a suite that tells
// the truth every run. See docs/log/35-reliable-backend-test-suite.md.
//
// The problem this solves: these are integration tests against a real Postgres, and nearly every
// one registers a user or two first - bcrypt at cost 12, roughly a third of a second of pure CPU
// each. Run at full parallelism across 23 files, that saturates the machine, and a test doing two
// registrations plus its own database round-trips genuinely exceeds vitest's 5-second default. The
// symptom was one to four tests timing out in about one run in three, always inside
// `registerAndLogin`, never with an assertion failure, a different set each time.
//
// Four alternatives were measured before settling here - the default, a raised `testTimeout`,
// `maxWorkers: 4`, and `maxWorkers: 6` with a raised timeout. Every one reduced the rate; none
// eliminated it. This is the only setting that has held across repeated runs.
//
// `.mts` rather than `.ts` because this package is CommonJS, and vitest warns about ESM syntax in a
// file it loads as CJS.
//
// Two things make the cost easier to accept than it first looks. CI does not run this suite at all
// (see .github/workflows - they build, seed and run Playwright), so nothing here affects pipeline
// time; and a test run whose failures have to be re-run to interpret is worth less than a slower
// one whose result can be believed the first time.
//
// What would let this be relaxed: giving each worker its own database (a schema or container per
// worker) and lowering bcrypt's cost factor in the test environment. Either would remove the
// contention this setting works around, at which point full parallelism is safe again.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
