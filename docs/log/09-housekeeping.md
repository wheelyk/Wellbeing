# Housekeeping & Audits

## 2026-08-16 — Reconciling Tasks.md/requirements.md with reality, and adding "change password"

**Task:** Not a single [Tasks.md](../../Tasks.md) checklist item — a two-part request: (1) audit
`Tasks.md` against what's actually been built and check off anything genuinely done but not
yet marked, and (2) add a "change password" capability (distinct from the existing, unbuilt
"forgot password" email-reset flow) as new tracked tasks, since the app now has two real users.

### Background / concepts

#### "Change password" vs. "forgot password" — two genuinely different features

- **Forgot password** (already in `Tasks.md`, still unbuilt): for someone who's _logged out_
  and doesn't remember their password — requests a reset link by email, clicks it, sets a new
  password without ever proving they knew the old one. This is why it fundamentally needs a
  real transactional email service in production; there's no other way to prove "this really is
  the account owner" for someone who isn't authenticated.
- **Change password** (new): for someone who's _already logged in_ and simply wants to update
  their password — provides their _current_ password (proving they're genuinely the account
  owner via something they already know, not an email link) plus a new one. This needs zero
  email infrastructure, which is exactly why it was chosen as the practical next step over
  building out forgot-password first.
- Both are real, distinct requirements — `requirements.md` §5.1 previously only listed the
  forgot/reset flow; added "Change their password while logged in, by providing their current
  password and a new one" as its own bullet, and `Tasks.md` gained matching backend
  (`POST /api/auth/change-password`) and frontend (Settings page form) checklist items.

#### The audit: three items were genuinely done but still showed as unchecked

- **`.env.example` files + `.env` in `.gitignore`** (Phase 0) — both example files exist
  (confirmed directly, not assumed) and the root `.gitignore` already covers `.env`. Checked
  off.
- **CORS configuration restricting allowed origins** (Phase 2) — this was built and verified
  live in production during the deployment work (`cors({ origin: FRONTEND_URL, credentials:
true })`, extensively covered in the earlier FRONTEND_URL/CORS entries) but the checklist
  item was never marked, since that work happened organically during deployment rather than as
  its own dedicated Tasks.md-tracked task. Checked off, with a pointer back to those entries.
- **No plain-text password/health data in logs** (Phase 2) — audited directly rather than
  assumed: `grep -rn "console\." backend/src` turns up exactly one line, in `index.ts`, logging
  only the port number. Register/login responses already have dedicated tests confirming
  `passwordHash` is never present in a response body. Checked off.
- **Root `README.md`** (Phase 0) — a README did exist, but its "Running locally" section still
  had Phase-0-era placeholder wording ("Scaffolding... is added in later setup tasks... Once in
  place, local setup will be:") — technically present, but describing a _future_ state rather
  than the app as it actually exists now. Rewritten with the real, current steps (`docker
compose up -d`, the actual `.env.example` contents, `npx prisma migrate dev`, live URLs) and
  checked off only once accurate — not before.
- **Left alone, deliberately:** Phase 11 (Security Hardening) and Phase 13 (Testing) items,
  even where individual pieces are already true today (e.g., refresh tokens already are
  `HttpOnly`/`Secure`/`SameSite`). Both phases are written as a holistic, one-time audit sweep
  across everything at once, not a checklist to tick opportunistically as individual pieces
  happen to already be true — checking one off in isolation now would misrepresent that the
  full, deliberate review those phases describe has actually happened.

#### A real, self-inflicted Prisma migration checksum mismatch, found while double-checking the README

- While verifying the rewritten README's setup instructions actually work (rather than just
  reading them and assuming), running `npx prisma migrate dev` locally produced: _"The
  migration `20260816095258_rescale_energy_stress_to_1_7` was modified after it was applied. We
  need to reset the 'public' schema... All data will be lost."_
- **What actually happened:** earlier today, that migration was applied locally, _then_ its
  comment text was edited afterward (to correct the non-idempotency claim, per that entry).
  Prisma records a checksum — a short fingerprint computed from a migration file's exact
  contents — for every migration it applies, specifically so it can detect precisely this: a
  file that's been edited _after_ being run, which could otherwise mean the database and the
  migration history have silently diverged from what the files claim happened.
- **Why this is local-only noise, not a real problem for anyone else.** Only _this_ development
  machine ever ran the migration before the comment was corrected. A fresh clone (or Railway's
  production database) only ever sees the already-corrected file and applies it once — its
  recorded checksum matches its content from the very first run, no drift possible. This is a
  problem entirely of editing an already-applied file’s comment on one specific machine, not a
  reflection of anything wrong with the migration itself or the data it already correctly
  produced.
- **Why a full reset (Prisma's own suggested fix) was the wrong call here.** `prisma migrate
reset` drops and rebuilds the entire local database from scratch — the sledgehammer response
  to "the checksum doesn't match," appropriate when there's genuine doubt about what state the
  database is actually in. Here, there was no such doubt: the migration's SQL logic hadn't
  changed at all, only a comment describing it had — so resetting would have been real,
  unnecessary work (and data loss) to fix a problem that was purely bookkeeping.
- **The actual fix: directly correct the stored checksum to match the file's real, current
  content**, rather than pretending nothing changed or nuking the database. Computed the file's
  true SHA-256 checksum (SHA-256 is a standard hashing algorithm: it turns any input, however
  large, into a fixed-length string of characters that changes completely if even a single byte of
  the input changes — the same algorithm Prisma itself uses) with Node's built-in `crypto`
  module, then updated that one row in Prisma's own `_prisma_migrations` bookkeeping table
  directly via `psql` (Postgres's own command-line client — used here to run a raw `UPDATE`
  statement straight against the database, bypassing Prisma entirely) — `prisma migrate resolve
--applied` (the first thing tried) turned out to
  be the wrong tool for this specific situation, since it's meant for migrations _not yet_
  recorded as applied, not for re-syncing the checksum of one that already is. Confirmed fixed
  immediately afterward: `prisma migrate dev` reported "Already in sync," and `prisma migrate
status` reported "Database schema is up to date."
- **The general lesson:** editing an already-applied migration file's _comment_ feels harmless
  — the actual SQL is untouched — but Prisma's checksum tracking doesn't distinguish "the SQL
  changed" from "a comment changed"; it hashes the whole file. Once a migration has been applied
  anywhere, treat the file as frozen, even down to the comments — exactly the same principle
  the earlier "why deleting a merged branch is safe" entry describes for git commits, just
  applied to a different kind of already-committed history.

### What was done

1. **`Documents/requirements.md`.** Added "Change their password while logged in, by providing
   their current password and a new one" to §5.1's capability list.
2. **`Tasks.md`.** Added `POST /api/auth/change-password` (Phase 2) and a matching Settings-page
   form item (Phase 6). Checked off four items confirmed genuinely complete: both Phase 0
   environment/README items, and two Phase 2 items (CORS, no-sensitive-logging) — each verified
   directly rather than assumed, as detailed above.
3. **`README.md`.** Rewrote the stale "Running locally" section to match the app's real, current
   setup (`docker compose up -d`, actual `.env.example` contents, the `npx prisma migrate dev`
   step `npm run dev` doesn't do automatically, live deployment URLs) — verified by actually
   running the documented steps, not just reading them.
4. **Fixed a real local Prisma migration-checksum mismatch**, discovered specifically because
   the README's instructions were being tested for real rather than trusted on sight — detailed
   above.
5. **`npm run build`, `npm test` (34/34)** — confirmed clean after the checksum fix, same as
   before it (no application code changed in this task, only docs and one bookkeeping row).

### Why it's needed

Two different problems, both about a project staying trustworthy as it grows: stale checklists
and a stale README quietly erode confidence in whether _any_ of the tracking documents reflect
reality, and an un-diagnosed migration checksum error would have blocked all future local
development on this machine the next time a migration was touched.

### Decisions

- **Change password before forgot password**, and both added as separate, honestly-scoped
  tasks rather than one combined "password reset" item — covered in detail above.
- **Only checked off Tasks.md items with direct, individual confirmation** — not the two
  holistic audit phases (11, 13), even where some of their content happens to already be true.
- **Fixed the checksum via a direct, targeted correction, not a full database reset** — the
  problem was bookkeeping, not data integrity, so the fix matched that scope exactly.

### State at end of this step

`Tasks.md` and `requirements.md` now accurately reflect both what's built and what's newly
planned. The README's setup instructions were verified to actually work, not just assumed
correct. The local Prisma migration history is back in sync with the actual migration files.

### Verification

- Directly audited (not assumed) every item checked off: `.env.example` file existence,
  `.gitignore` contents, the live CORS configuration, a full `console.*` grep of the backend.
- Actually ran the rewritten README's setup steps against this real local environment —
  `docker compose version`, `npx prisma migrate dev`, `npm run dev` — rather than only reading
  them for plausibility.
- `npx prisma migrate dev` → "Already in sync"; `npx prisma migrate status` → "Database schema
  is up to date" — confirmed the checksum fix directly, not assumed from the `UPDATE` succeeding.
- `npm run build`, `npm test` (34/34) — unchanged, confirming no application behavior shifted.

---

## 2026-08-22 — A general bug/security/test-coverage review, guided by an actual coverage report

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — an open-ended request to look for
bugs, security issues, and testing gaps across the whole codebase, following on from the earlier
timezone bug hunt ([History](11-history.md)) and security audit
([Security & Accessibility Audits](12-security-and-accessibility-audits.md)) done the same week.

### Background / concepts

#### Why a coverage report, not just more grepping

Every earlier review in this project (the History timezone bug, the security audit) worked by
reading code closely and reasoning about it - effective, but it only finds what a person happens
to think to look at. **Code coverage** measures something different and complementary: given the
_existing_ test suite, which lines, branches, and functions did any test actually execute at all?
("Branches" here means each possible path through a conditional — an `if` block _and_ its `else`
count as two separate branches, so branch coverage is a stricter measure than just "did this line
run," since a line can run while only ever taking one of its two possible paths.)
A statement showing 0% coverage isn't necessarily wrong - it might be perfectly correct code - but
it _is_ a guaranteed blind spot: nothing has ever proven it does what it's supposed to, and a
future change to it wouldn't be caught by anything.

`@vitest/coverage-v8` was installed temporarily with `npm install --no-save` for this one-off
pass - the same "don't inherit a permanent new dependency as a side effect of a single audit"
decision already made for `axe-core` during the earlier accessibility audit (see
[Security & Accessibility Audits](12-security-and-accessibility-audits.md)) - and never added to
either `package.json`.

#### What a coverage report can't tell you, and why some 0%-covered lines aren't worth fixing

Not every uncovered line is a real gap worth closing. A handful of patterns showed up repeatedly
and were deliberately left alone:

- **A defensive `return "—";` fallback** at the end of `formatHabitValue` (three separate copies
  of this function exist - see below) that's only reachable if _none_ of a habit log's three
  value columns are set, which the backend's own validation (`habitLogs.ts`'s `extractTypedValue`)
  never allows to happen. Testing it would mean fabricating a log shape the real system can never
  actually produce.
- **The "malformed query string" / "malformed PATCH body" 400 branches**, repeated near-identically
  across almost every route. The underlying Zod validation logic (see the Glossary's "Zod" entry)
  is already proven correct via
  each type's own `POST` tests; re-proving the exact same schema behaves the same way on `GET`/
  `PATCH` too, for every single route, would be repetitive coverage padding rather than a
  meaningfully different risk.

The lines actually worth chasing were the ones representing **real, distinct behavior that had
simply never been exercised** - covered below.

### What was done

1. **Found a real correctness bug: non-deterministic pagination.** Every per-type log-list
   endpoint (mood/symptom/medication/habit logs), plus several of `dashboard.ts`'s own queries,
   ordered strictly by `loggedAt desc` with no secondary sort key. Two logs sharing the exact
   same timestamp - plausible for backfilled entries, or two "now" entries logged moments apart
   that round to the same stored value - have no guaranteed relative order across two separate
   `LIMIT`/`OFFSET` queries (the SQL clauses used throughout this app to fetch one bounded "page"
   of rows at a time — `LIMIT` caps how many rows come back, `OFFSET` skips a number of rows
   before starting; see the History log's own "What pagination actually means here" section for
   the fuller concept), per Postgres's own documented behavior for an ORDER BY that doesn't
   fully disambiguate every row. A tied row could silently land on a different page between one
   request and the next - visible as an entry duplicating or disappearing while paging through
   "load more," and exactly the failure mode History's own edit-by-id lookup
   (`historyLogApi.ts`'s `findLogById`) depends on not happening. An existing test's own comment
   ("five mood logs, one hour apart, _so ordering is deterministic_") shows this was already an
   implicitly known risk that had just never been closed. Fixed by adding `id desc` as a
   secondary sort key everywhere this pattern appeared (see the companion fix commit for the full
   file list) - the standard way to make an `ORDER BY` fully deterministic when the primary sort
   column alone can't guarantee a unique ordering.
2. **Found a real inconsistency while reviewing `history.ts` for the fix above**: every sibling
   route (`dashboard.ts`/`trends.ts`/`users.ts`/`export.ts`) explicitly treats a
   deleted-but-still-tokened caller (a still-validly-signed access token whose user row was
   deleted after issuance - e.g. a second tab calling `DELETE /api/users/me`) as a 404 - but
   `history.ts` only checked user existence when `from`/`to` were present, silently falling back
   to a default timezone the rest of the time. Fixed to check unconditionally, matching every
   sibling route's own documented behavior.
3. **Confirmed that exact 404 behavior had never actually been tested, anywhere it's implemented**
   - 5 routes, each with the same explanatory comment ("Can only happen if the user row was
     deleted after the access token was issued...") and zero tests proving it. Added one
     regression test per route: register, capture a real access token, delete the user row
     directly via Prisma, then confirm the endpoint answers 404 rather than crashing on a null
     user.
4. **Found the same duplicated, partially-untested formatting logic in three separate places**:
   `dashboard.ts` and `history.ts` (backend) and `historyLogApi.ts` (frontend) each have their
   own copy of "format a habit log's value as Done/Not done, a plain number, or N minutes,
   depending on which of its three nullable columns is set" - and every existing test exercising
   any of the three only ever used a _boolean_-type habit. Added tests covering numeric and
   duration values in all three places, including the not-quite-obvious real `0` value case (a
   naive truthiness check, instead of the `!== null` check this code actually uses, would render
   a genuine zero-minute or zero-count entry as the wrong branch entirely - not currently a bug,
   but now a _tested_ non-bug rather than an untested one).
5. **Found `trends.ts`'s own Activity-calendar test didn't test what its title claimed.** "Marks a
   day active... for any of the four log types" only ever seeded a habit log - a medication log's
   own, separate `bucketByDay` call had never been exercised in isolation. Added a second test
   seeding only a medication log to close that specific gap.
6. **Found `Modal.tsx`'s actual focus-trap logic had zero test coverage**, despite every other
   keyboard/dismissal behavior on the same component (Escape, backdrop click, focus return) being
   well-tested. The Tab/Shift+Tab wrap-around behavior - the specific thing that makes this a real
   trapping dialog instead of just a styled overlay a keyboard user could tab straight out of - had
   never been driven by any test. Added one, and **confirmed it actually catches a broken trap**
   by temporarily replacing the real logic with a no-op, watching the new test fail, then
   restoring the real code and watching it pass again - the same before/after discipline this
   project applies to every fix, not just a plausible-looking assertion.
7. **Found `historyLogApi.ts` had no dedicated test file at all.** Added one covering its five
   pure label-formatting functions - the third copy of the habit-value-formatting logic from
   point 4 above, plus mood/symptom/medication labels that had never been unit-tested in
   isolation either (only indirectly, via whatever `HistoryPage.test.tsx` happens to render).

### Why it's needed

A comment explaining _why_ some defensive code exists (e.g. "can only happen if the user row was
deleted mid-session") is a claim about intended behavior, not proof of it - every fix in this
entry closes exactly that gap between "the code is written to handle this" and "something has
actually confirmed it does." The pagination-determinism bug specifically is the kind of thing
that can sit unnoticed for a long time (most backfilled entries won't share an exact timestamp)
and then surface as a confusing, hard-to-reproduce "an entry disappeared from my history" report
once a real user hits it by chance.

### Decisions

- **Coverage as a starting point, not an ending point.** A raw percentage was never the goal -
  several genuinely 0%-covered lines were deliberately left alone (see _Background_ above) because
  closing them would have added test volume without reducing any real risk. Every fix and test
  added here came from actually reading what the uncovered line _does_, not just from the number
  going up.
- **Split into two commits**: one for the actual behavior fix (non-deterministic pagination +
  History's 404 inconsistency) with its own directly-related tests, and one for the remaining
  pure test-coverage additions for behavior that was already correct, just unverified - keeping
  "this changes what the app does" separate from "this only proves what it already did."
- **Proved the new Modal test actually mattered**, rather than trusting that it looked like a
  reasonable assertion - the same "reproduce it, don't just believe it" discipline this project
  has applied to every bug fix so far, applied here to a _test_ instead of a fix.

### State at end of this step

Pagination across every log-list endpoint (and History specifically) is now provably
deterministic. History's deleted-user handling matches its sibling routes. Five previously
undocumented-by-test edge cases (the deleted-user 404, in five routes) now have direct regression
tests. Habit-value formatting is tested for all three real value types in all three places it's
implemented. Modal's focus trap has real coverage. `historyLogApi.ts` has a dedicated test file.

### Verification

- `npx vitest run --coverage` (backend): overall statement coverage rose from 94.92% to 96.75%,
  branch coverage from 81.29% to 85.51% - `dashboard.ts`, `trends.ts`, `users.ts`, and `export.ts`
  all reached 100% branch coverage on their own route files.
- Confirmed the new `moodLogs.ts` tiebreak test actually asserts something meaningful (not just a
  plausible-looking assertion) by checking its expected-order derivation against the two real
  generated ids.
- Confirmed the new Modal focus-trap test catches a real regression: temporarily replaced
  `handleKeyDown`'s Tab-handling condition with a no-op, reran the test suite (the new test
  failed, exactly as expected), then restored the original code and reran (passed).
- `npm test` (backend): 210/210 passing. `npm test` (frontend): 223/223 passing.
- Full Playwright end-to-end suite against real local dev servers: 4/4 passing, confirming the
  ordering/History changes didn't regress any real user-facing flow.

---
