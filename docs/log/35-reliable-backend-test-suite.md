# Making the Backend Suite Tell the Truth Every Run

## 2026-08-29 — Resolving the parallelism trade-off in favour of reliability

**Task:** The open decision recorded at the end of
[34-real-push-delivery-test.md](34-real-push-delivery-test.md). The backend suite failed
intermittently — one to four tests, roughly one run in three — and the trade between speed and
reliability was left as a project call rather than smuggled into an unrelated change. The call
came back: **favour reliability.**

### Background / concepts

#### What was actually wrong

These are integration tests against a real Postgres (a deliberate choice — see `CLAUDE.md`'s
Testing Requirements), and nearly every one registers a user or two before it can do anything.
Registration means **bcrypt at cost 12**, roughly a third of a second of pure CPU, and it is
deliberately expensive: that is the whole point of a password hash.

Twenty-three test files running in parallel on twelve cores therefore spend most of their time
competing for CPU, not waiting on the database. A test doing two registrations plus its own
round-trips can genuinely exceed vitest's five-second default — so it fails as a _timeout_, never
an assertion, in a different place each run.

#### Why "just raise the timeout" wasn't enough

It was the obvious fix and it was tried. Four configurations were measured before settling:

| Configuration                    | Result                          |
| -------------------------------- | ------------------------------- |
| Default                          | 1–4 failures in most runs       |
| Raised `testTimeout` (20s)       | Reduced, ~1 run in 4 still fell |
| `maxWorkers: 4`                  | Reduced, still intermittent     |
| `maxWorkers: 6` + raised timeout | Reduced, still intermittent     |
| **`fileParallelism: false`**     | **Held across repeated runs**   |

Every partial measure moved the rate without removing the cause. Raising a ceiling doesn't help
when the machine is saturated; it just moves where the queue overflows.

### What was done

`backend/vitest.config.mts` sets `fileParallelism: false` — one test file at a time. Nothing else:
no timeout change, no worker tuning, because with the contention gone none of it is needed and
config that isn't earning its place is just future confusion.

`.mts` rather than `.ts` because this package is CommonJS and vitest warns about ESM syntax in a
file it loads as CJS — a warning seen and fixed during an earlier attempt at this.

### Why it's needed

A suite that fails one run in three trains you to re-run it rather than read it. At that point it
has stopped being a signal: every genuine failure has to compete with the assumption that it's
"just the flakiness again." That is a worse position than a slower suite, and it gets worse the
longer it persists.

### Decisions

- **Reliability over speed, confirmed explicitly** rather than assumed. The suite goes from ~35s to
  ~140s. That's a real cost and worth naming plainly.
- **Two facts make the cost easier to accept than it first appears.** CI does not run this suite at
  all — the workflows build, migrate, seed and run Playwright, so nothing here touches pipeline
  time (see the follow-up below, because that's arguably its own problem). And a slow result you
  can believe is worth more than a fast one you have to re-run to interpret.
- **Nothing else changed.** No timeout bump, no worker cap. Each was measured, none was necessary
  once files ran one at a time, and shipping a setting "just in case" makes the next person wonder
  which part is load-bearing.
- **The exit condition is written down** rather than left implicit: give each worker its own
  database (a schema or container per worker) and lower bcrypt's cost factor in the test
  environment, and full parallelism becomes safe again. This setting is a workaround for a
  contention problem, not a permanent preference.

### Verification

- **Six consecutive full runs, 274/274 every time**, at ~140s each. That sample matters: under the
  previous configuration the observed rate (~1 run in 3) would have predicted roughly two failing
  runs across six, so six clean runs is evidence rather than luck.
- `npx tsc --noEmit`, `npm run lint`, `npm run format:check`: clean.
- Not proven: behaviour on a machine with a different core count. The cause is a ratio between
  parallel work and available CPU, so a machine with fewer cores would have been affected sooner
  and more often, not less — this setting removes the ratio from the equation entirely, which is
  why it should hold anywhere.

### Known follow-ups

- **The backend suite doesn't run in CI at all.** Discovered while checking what this change would
  cost in pipeline time: `.github/workflows/e2e.yml` and `pr-preview.yml` build the app, run
  migrations, seed and drive Playwright — but never `npm test`. So 274 tests, including every route
  and scheduler test and the new real-push-delivery one, gate nothing on a pull request. That's a
  larger gap than the flakiness this entry fixes, and now that the suite is trustworthy, adding it
  to CI is the natural next step.
- **The real fix for the contention**, per the exit condition above, if the runtime ever becomes a
  genuine obstacle.

---
