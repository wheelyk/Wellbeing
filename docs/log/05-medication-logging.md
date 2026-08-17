# Medication Logging

## 2026-08-16 — Phase 1: `Medication` + `MedicationLog` models + migration

**Task:** [Tasks.md](../../Tasks.md) → Phase 1 → "Define `Medication` model: `id`, `user_id`, `name`,
`created_at`." and "Define `MedicationLog` model: `id`, `user_id`, `medication_id`, `taken
(boolean)`, `notes (optional)`, `logged_at`."

**Delivered via branch:** `feature/1.5-medication-models` (branched from `main`). This is the
first step of a new vertical slice — medication logging — following the exact same shape as
the earlier mood-logging slice (model → scoped CRUD endpoint → frontend form). Unlike that
slice, both models for this domain are defined together in one branch rather than split further,
since `Medication` (the user's list of medication names) and `MedicationLog` (each taken/not-
taken record) are small enough, and tightly enough coupled, that splitting them into separate
PRs would add process overhead without adding any real independent value — the log endpoint
can't be tested meaningfully without the medication list existing to reference in the first
place.

### Background / concepts

#### Two tables, not one — why "medication" and "medication log" are different things

- Requirements §6.3 describes recording "whether a medication was taken" — but a medication
  itself (e.g. "Ibuprofen") is a *thing a user takes repeatedly*, while each taken/not-taken
  record is a separate event in time. Collapsing these into one table (say, a `taken` column
  directly on a `medications` row) would only be able to represent the *most recent* status,
  losing all history — the same one-to-many relationship reasoning as `User` → `MoodLog` from
  the earlier entry, just one level deeper here: `User` has many `Medication`s, and each
  `Medication` has many `MedicationLog`s.

#### `MedicationLog` carries both `userId` and `medicationId` — and why that's not redundant

- Every `MedicationLog` already reaches its owning user indirectly, by following
  `medicationId` → `Medication.userId`. Storing `userId` directly on `MedicationLog` too is a
  deliberate denormalization, copying the same shape `MoodLog` already uses (a direct `userId`
  column on every log table, not just on the "parent" record) — it's what lets `GET
  /api/medication-logs` filter and index directly on `[userId, loggedAt]` without an extra join
  through `Medication` on every read, exactly like `MoodLog`'s existing composite index.
- **This column is not, on its own, a security boundary.** Nothing at the database level stops
  a row's `userId` from disagreeing with its `medication.userId` — that would require a check
  constraint spanning two tables, which Postgres doesn't support directly. The actual defense
  against a user submitting *another* user's `medicationId` (the ID-tampering concern Tasks.md's
  Phase 3 cross-cutting item calls out) has to live in the application layer, in the next task's
  route: before creating or updating a `MedicationLog`, the code must look up the referenced
  `Medication` scoped to `req.userId` and reject the request if it's not found or not theirs.
  This migration only builds the storage shape that check will write into — it doesn't replace
  the check itself.

#### Cascading deletes, two levels deep

- `Medication.user @relation(..., onDelete: Cascade)` means deleting a `User` also deletes all
  of their `Medication` rows. `MedicationLog.medication @relation(..., onDelete: Cascade)` means
  deleting a `Medication` also deletes all of *its* `MedicationLog` rows. Together, these chain:
  deleting a `User` cascades to their `Medication`s, which cascades again to every
  `MedicationLog` referencing those medications — satisfying Phase 1's "removing a `User`
  removes all associated logs" requirement without the application needing to manually delete
  in the right table order. `MedicationLog.user` also has its own direct `onDelete: Cascade` to
  `User`, belt-and-suspenders with the same reasoning as the denormalized `userId` column above:
  since `userId` is stored directly rather than only reachable via `medicationId`, it needs its
  own cascade rule too, or deleting a user would leave that column's foreign key constraint
  unsatisfiable.

### What was done

1. **`backend/prisma/schema.prisma`.** Added `Medication` (`id`, `userId`, `name`, `createdAt`)
   and `MedicationLog` (`id`, `userId`, `medicationId`, `taken`, `notes`, `loggedAt` with
   `@db.Timestamptz(3) @default(now())`, matching `MoodLog`'s timestamp handling exactly), plus
   the reciprocal `medications`/`medicationLogs` fields on `User`. `Medication` gets a
   `@@index([userId])` (every "list my medications" query and the ownership check both filter by
   this); `MedicationLog` gets `@@index([userId, loggedAt])` (list/range queries, same shape as
   `MoodLog`) and `@@index([medicationId])` (used when checking a medication's own log history,
   and by the foreign key itself).
2. **Migration.** `npx prisma migrate dev --name add_medication_and_medication_log` — generated
   and applied `20260816123825_add_medication_and_medication_log` against this worktree's
   isolated local database (`welltrack_medication` — a separate database inside the same shared
   Postgres container other concurrent work uses, so this migration couldn't collide with
   anyone else's in-progress schema changes).
3. **`npm run build`** — compiled cleanly (regenerates the Prisma Client, making
   `prisma.medication.create(...)` / `prisma.medicationLog.create(...)` etc. available with full
   TypeScript types for the next task).
4. **`npm test`** — 34/34 passing, unchanged (this task adds no application code, only schema).
5. **Manual verification directly against Postgres**, not just the migration command's own
   output: `psql \d medications` and `\d medication_logs` against the real running database,
   confirming column types (including `timestamp(3) with time zone` on `logged_at`), both
   indexes, and both cascading foreign keys exist for real.
6. **Lint/format** — `npx eslint .` clean, `npx prettier --check .` clean.

### Why it's needed

The medication-logs endpoint (next task) needs somewhere to store data, with the ownership
relationships already in place, before any API code is written against it — same reasoning as
the `MoodLog` model entry.

### Decisions

- **One branch for both models, not two.** Documented above — `Medication` and `MedicationLog`
  are too tightly coupled to usefully review or test independently (a `MedicationLog` can't
  exist without a `Medication` to reference), unlike, say, the earlier auth-middleware and
  `MoodLog` split, where the middleware had genuine standalone value and no dependency on the
  model.
- **Direct `userId` on `MedicationLog`, denormalized from `Medication.userId`.** Matches
  `MoodLog`'s existing shape rather than introducing a new "look it up via a join" pattern for
  just this one table — consistency with the established convention, plus the indexing benefit
  described above.
- **No `description` or dosage/schedule fields on `Medication`.** Kept to exactly what
  `requirements.md` §6.3 and `Tasks.md` specify (name only) — the MVP is "was this medication
  taken," not a full medication-management feature.

### State at end of this step

`medications` and `medication_logs` exist in the local (isolated, per-worktree) database with
the correct shape, constraints, and indexes. No API endpoint reads or writes either table yet —
that's the next task.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 34/34 passing (unchanged).
- `psql \d medications` / `\d medication_logs` against the real local database — confirmed
  column types, indexes, and both cascading foreign keys directly.
- `npx eslint .` and `npx prettier --check .` — both clean.

---

## 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/medications` and `/api/medication-logs`

**Task:** [Tasks.md](../../Tasks.md) → Phase 3 → Medications → "`GET/POST/PATCH/DELETE
/api/medications` — manage the user's medication list." and "`GET/POST/PATCH/DELETE
/api/medication-logs` — record taken/not-taken status per medication per date."

**Delivered via branch:** `feature/3.6-medication-endpoints` (stacked on
`feature/1.5-medication-models`) — the same "model → scoped CRUD route" pattern the mood-logs
endpoint established, applied here for the first time to a domain with *two* related tables
instead of one.

### Background / concepts

#### Two routers, because there are genuinely two resources

- `medications.ts` manages the user's medication *list* (create "Ibuprofen" once, rename or
  delete it later) — a small, low-frequency resource. `medicationLogs.ts` manages the
  taken/not-taken *events* against that list (potentially several per day, per medication) — a
  high-frequency resource, same shape as `MoodLog`. Splitting these into two route files
  (mounted separately in `app.ts`, at `/api/medications` and `/api/medication-logs`) keeps each
  file focused on one resource's CRUD, rather than one file juggling two different validation
  schemas and two different Prisma models.

#### The ID-tampering defense, concretely — not just "scope the query," but "verify the reference"

- Every route already scopes its *own* table's queries by `req.userId` (`findFirst({ where: {
  id, userId } })`), the same pattern `MoodLog` uses. But `MedicationLog` also carries a
  *second* foreign key — `medicationId`, pointing at a different table the caller doesn't own
  outright, they only own indirectly through their own `Medication` rows. A client can put
  **any** string in the `medicationId` field of a `POST /api/medication-logs` body, including
  another user's real medication ID copied or guessed from elsewhere. Scoping the *log's own*
  query by `userId` does nothing to stop that, because the log doesn't exist yet — there's
  nothing to scope. This is exactly the ID-tampering scenario Tasks.md's Phase 3 cross-cutting
  item warns about, and it needs its own explicit check, separate from ownership-scoping a
  lookup of an existing row.
- The fix, in `medicationLogs.ts`'s `medicationBelongsToUser` helper: before ever writing a
  `MedicationLog` referencing a given `medicationId`, look that medication up scoped to
  `req.userId` (`prisma.medication.findFirst({ where: { id: medicationId, userId } })`) and
  reject with `404 MEDICATION_NOT_FOUND` if nothing comes back. From the caller's perspective, a
  real medication belonging to someone else and a `medicationId` that doesn't exist at all are
  indistinguishable — same "don't confirm existence to an unauthorized caller" reasoning as the
  404-not-403 pattern elsewhere in this codebase, just applied to a body field instead of a URL
  param.
- **This check runs on both `POST` and `PATCH`.** It would be easy to add it only to `POST`
  (where a new `medicationId` is always supplied) and miss that `PATCH` can *also* supply a new
  `medicationId`, re-pointing an existing, legitimately-owned log at a different medication —
  including someone else's. `medicationLogs.ts`'s `PATCH /:id` handler explicitly re-runs the
  same check whenever the update body includes `medicationId`, and a test
  (`rejects re-pointing an existing log at another user's medicationId via PATCH`) proves this
  specifically, not just the `POST` case.

#### `taken` is a required boolean, unlike mood-logs' required numeric field

- `z.boolean()` for `taken` rejects anything that isn't literally `true`/`false` — no coercion
  from `"true"`/`1`/etc. — the same "be strict about what a field actually means" approach
  `moodField`'s `z.number().int().min(1).max(5)` already uses for mood. A truthy-but-wrong value
  like the string `"yes"` fails validation with `VALIDATION_ERROR` rather than silently being
  interpreted as `true`.

### What was done

1. **`backend/src/routes/medications.ts` (new).** `GET /` (list the caller's medications), `POST
   /` (create, `name` required non-empty string), `PATCH /:id` / `DELETE /:id` (ownership-scoped
   via `findFirst`, `404 MEDICATION_NOT_FOUND` if missing or not owned).
2. **`backend/src/routes/medicationLogs.ts` (new).** `GET /` (list the caller's medication logs,
   most recent first), `POST /` (validates `medicationId` + `taken` required, `notes` optional,
   `loggedAt` optional ISO datetime defaulting to now — same backfill pattern as mood-logs — and
   runs the ID-tampering check above before creating), `PATCH /:id` (ownership-scoped lookup of
   the log itself, plus the ID-tampering re-check if `medicationId` is included in the body),
   `DELETE /:id`.
3. **`backend/src/app.ts`.** Mounted both routers behind `requireAuth`, at `/api/medications` and
   `/api/medication-logs`.
4. **Tests (`medications.test.ts`, `medicationLogs.test.ts`).** Mirrors `moodLogs.test.ts`'s
   coverage (no-token rejection, create/list/update/delete, validation rejection, cross-user 404
   on PATCH/DELETE with a `findUnique` afterward proving zero effect) for both resources, plus
   two tests specific to this task's key risk: creating a medication log against another user's
   `medicationId` (expects `404 MEDICATION_NOT_FOUND`, and confirms via
   `prisma.medicationLog.findMany` that no log was actually created), and re-pointing an
   existing log at another user's `medicationId` via `PATCH` (same expectation, confirms the
   existing log's `medicationId` is unchanged afterward).
5. **`npm test`** — 53/53 passing (34 pre-existing, 19 new).
6. **`npm run build`** — compiled cleanly.
7. **Lint/format** — `npx eslint .` clean; `npx prettier --check .` initially flagged the two new
   test files (long single-line `request(app)...` chains it wanted wrapped), fixed with `npx
   prettier --write`, then re-ran the full suite to confirm the reformatting changed no behavior
   (still 53/53).
8. **Manual end-to-end verification against the compiled, running server** (`npm start` on this
   worktree's isolated port, `4102`), via `curl`: registered and logged in a real user, confirmed
   `/api/medications` returns `401` with no token, then create → list → (log create → list →
   update → delete) → delete for both resources, each response matching expectations. Separately
   registered a second "attacker" user and confirmed, against the real running server (not just
   the test suite), that `POST /api/medication-logs` with the first user's real `medicationId`
   returns `404 MEDICATION_NOT_FOUND` rather than creating a log. Cleaned up both manually-created
   test users afterward via `psql` and stopped the manually-started server.

### Why it's needed

This is the second full log-type CRUD API in the app (after mood), and the first one where a
log references a second, separately-owned resource rather than standing alone — proving out the
ID-tampering defense pattern the rest of Phase 3 (symptoms, habits) will each need in their own
way (symptom logs reference symptoms, which can also be system-owned; habit logs reference
habits) once those slices land.

### Decisions

- **Two separate route files, not one combined `medications.ts`.** Covered above — each
  resource has its own validation schema, its own not-found error code
  (`MEDICATION_NOT_FOUND` vs. `MEDICATION_LOG_NOT_FOUND`), and mixing them would blur which
  "not found" a given 404 refers to.
- **`404`, not `400`, for a `medicationId` that doesn't belong to the caller.** The field itself
  is present and well-formed (a non-empty string, satisfying Zod) — the problem is what it
  *refers to*, which is a lookup failure, not a shape failure. This mirrors how `PATCH
  /api/mood-logs/:id` already distinguishes "malformed body" (`400 VALIDATION_ERROR`) from "body
  well-formed but the referenced row isn't yours" (`404`) for the URL param; applied here to a
  body field pointing at a different resource instead.
- **No `MEDICATION_NOT_FOUND` vs. a more specific "not yours" code.** Same reasoning as the
  existing 404-not-403 pattern — a more specific error would leak that the ID is real but
  belongs to someone else.
- **Not building the Phase 3 cross-cutting items (centralized error middleware, centralized
  validation) in this task.** Same call as the mood-logs entry: those are their own separate
  Tasks.md items, deliberately left for a dedicated task rather than bundled into each
  individual endpoint's PR.

### State at end of this step

A real, working, tested, auth-protected CRUD API for both medications and medication logs
exists locally, including the ID-tampering defense specifically tested and manually verified
against a real running server. Nothing on the frontend calls it yet — that's the next task.

### Verification

- `npm test` (`vitest run`) — 53/53 passing (34 pre-existing, 19 new).
- `npm run build` — compiled cleanly.
- `npx eslint .` and `npx prettier --check .` — both clean (after one `prettier --write` pass on
  the new test files, followed by a full re-run of the suite to confirm no behavior changed).
- Manual `curl` round-trip against the compiled, running server (port `4102`): unauthenticated
  request → `401`; full lifecycle for both resources; and a live cross-user attempt to create a
  medication log against another real user's `medicationId` → confirmed `404
  MEDICATION_NOT_FOUND` against the actual running server, not just the automated test.

---

## 2026-08-16 — Phase 7: Medication entry form, wired into the Dashboard

**Task:** [Tasks.md](../../Tasks.md) → Phase 7 → "Medication entry form: medication picker (or quick
'mark as taken/not taken'), optional notes, date/time picker." → requirements §6.3.

**Delivered via branch:** `feature/7.4-medication-entry-form` (stacked on
`feature/3.6-medication-endpoints`). This is the last piece of the medication-logging vertical
slice — the same significance the mood entry form task had for mood logging: everything built
so far (models, CRUD endpoints, the ID-tampering defense) finally becomes something a real
person can see and use.

### Background / concepts

#### What requirements §6.3 actually asks for, and how that shaped the form

- §6.3 is explicit that medication logging should be low-friction: "Users must be able to
  record whether a medication was taken," with the dashboard summary shown as a plain
  "Medications: 1/2 taken" — the emphasis throughout is on speed (tap to record a status), not
  on a heavy data-entry form. But the API underneath needs a real `medicationId` on every log —
  there has to be *some* mechanism for choosing which medication a log is about. The form
  reconciles these by keeping medication selection itself as large, single-tap buttons (a
  `role="radiogroup"` of medication names, the same accessible-custom-control pattern
  `MoodEntryForm`'s emoji buttons already established) rather than a `<select>` dropdown or a
  multi-step wizard, and by making the taken/not-taken choice two big tappable tiles rather than
  a checkbox buried in a longer form.
- **The bootstrap problem, and how it's resolved without a separate "manage medications"
  screen.** A brand-new user has zero medications — Tasks.md's Phase 7 item only calls for the
  entry *form*, not a separate medication-management page (that's implied by the `/api/medications`
  CRUD endpoints existing, but building a dedicated management UI isn't this task's scope). The
  form solves this inline: if the user has no medications yet, it skips straight to a small
  "add a medication" field instead of showing an empty, useless picker; once at least one
  medication exists, picking one is the default view, with a "+ Add another medication" toggle
  available at any time for adding more without leaving the log-entry flow.

#### Why `onSaved` passes back the medication, not just the log

- `MedicationLog` (from the API) only stores `medicationId` — not the medication's name. The
  Dashboard's log list needs the name to display anything meaningful ("Ibuprofen — Taken", not
  "5c38bf16… — Taken"). The straightforward fix would be re-fetching `/api/medications` after
  every save, but that's an unnecessary round-trip: the form, at the moment it submits, already
  has the full `Medication` object in memory (either from its initial fetch, or from having just
  created it inline seconds earlier). `MedicationEntryForm`'s `onSaved: (log, medication) =>
  void` callback signature hands both back to the Dashboard in one step, which folds the
  medication into its own local list (skipping the add if it's already there, to avoid
  duplicates when logging a second entry against an existing medication) without a second
  network request.

#### Why medications and medication logs are fetched together on the Dashboard

- `DashboardPage`'s new `useEffect` calls `Promise.all([apiFetch("/api/medications"),
  apiFetch("/api/medication-logs")])` rather than two independent, unrelated effects — both
  results are needed together before the log list can render anything meaningful (a log with no
  matching medication name to show), so tying their loading/error state together avoids a flash
  of "Medication" placeholder text while the medications list is still in flight separately.

### What was done

1. **`frontend/src/components/MedicationEntryForm.tsx` (new).** Fetches the user's medications
   on mount; if none exist, shows an inline "add a medication" field first; otherwise shows a
   radiogroup of medication-name buttons (with a "+ Add another medication" toggle always
   available) for picking which one this log is about. A required two-option "Was it taken?"
   radiogroup (large tappable tiles, ✅/❌), an optional notes textarea, and a `datetime-local`
   field defaulting to now (same `toDateTimeLocalValue` helper `MoodEntryForm` uses, duplicated
   locally rather than shared - neither component has a shared utils module yet). Submits via
   `apiFetch("/api/medication-logs", { method: "POST", ... })` and calls `onSaved(log,
   medication)` on success.
2. **`frontend/src/pages/DashboardPage.tsx` (extended).** Added medication state (medications,
   medication logs, loading/error, form-visibility) alongside the existing mood state; a `+
   Medication` button that reveals the form inline (same pattern as `+ Mood`); a "Recent
   medications" list showing each log's medication name (looked up from the fetched medications
   list), taken/not-taken status and icon, optional notes, timestamp, and a working delete
   (optimistic removal, rolled back on failure) - directly mirroring the mood section's
   structure line for line.
3. **Tests (`MedicationEntryForm.test.tsx`).** Requiring a medication to be selected before
   submit is possible; requiring taken/not-taken to be chosen; a full submission producing the
   exact expected request body and calling `onSaved` with both the created log and the selected
   medication; a failed save showing a friendly error; a user with zero medications adding one
   inline and having it auto-selected; Cancel calling `onCancel`.
4. **`npm test`** (frontend) — 26/26 passing (18 pre-existing, 8 new).
5. **`npm run build`** (frontend) — compiled cleanly.
6. **Lint/format** — `npm run lint` (oxlint) clean except one pre-existing warning in
   `AuthContext.tsx`, unrelated to this change (confirmed via `git diff` against the previous
   branch, that file is untouched here); one unsafe-optional-chaining warning in the new test
   file, fixed by replacing a chained `?.` with an explicit `if (!postCall) throw ...` guard
   before indexing into the mock call. `npx prettier --check .` clean after one `--write` pass
   on `DashboardPage.tsx`.
7. **Real browser verification**, per the project's UI-change testing rule. Started the actual
   compiled backend (`npm start`, this worktree's isolated port `4102`) and the frontend dev
   server, then drove a real headless Chromium browser through the full flow with a throwaway
   Playwright script: register → land on Dashboard → open the medication form → add a first
   medication ("Ibuprofen") inline, since none existed yet → mark it Taken with a note → Save →
   confirm it appears in the list with the right name, status, note, and timestamp → open the
   form again, this time picking the *existing* medication from the picker rather than adding a
   new one → mark it Not taken → Save → confirm both entries are listed → delete both → confirm
   the list returns to its empty state. No browser console errors at any point. Screenshots
   taken at each step and visually reviewed, not just asserted programmatically. Cleaned up the
   browser-created test user afterward and stopped both manually-started servers.

### Why it's needed

This closes out the medication-logging vertical slice, the same way the mood entry form task
closed out mood logging - proving the whole chain (model → ID-tampering-safe endpoint →
low-friction frontend) works end to end for a domain with a real second referenced resource,
not just a single flat log table.

### Decisions

- **Inline "add a medication" within the log-entry form, no separate management page.** Covered
  above - Tasks.md scopes this task to the entry form specifically; a dedicated "manage your
  medications" screen (rename/delete existing medications from a list, not just add) isn't
  called for here and would duplicate work if built ad hoc now versus deliberately later.
- **Delete only, no edit, in this slice.** Same call as the mood entry form entry: "reusing the
  same form pre-filled with existing values" is its own explicit, broader Tasks.md item covering
  all four log types at once, not something to partially pre-build here.
- **Medication picker as large tap-buttons, not a `<select>` dropdown.** A native `<select>`
  would be more compact for a user with many medications, but requirements §6.3's low-friction
  framing and the existing `MoodEntryForm` precedent (emoji buttons, not a dropdown, for a
  similar "pick one of a few options" choice) both favor large, unambiguous tap targets over
  dropdown compactness for what's expected to be a short, everyday list.
- **`onSaved(log, medication)` two-argument callback**, instead of re-fetching medications after
  every save or making the Dashboard respawn its own separate "did a new medication just get
  created" tracking. Covered above - avoids an unnecessary round-trip and keeps the medication
  the form just used as the single source of truth for that save.

### State at end of this step

A real user can register or log in, land on the Dashboard, add their first medication inline
while logging it, mark subsequent doses taken or not taken (with optional notes and a backdated
time), see each entry appear immediately with the right medication name, and delete entries -
verified directly in a real browser, not just via tests. This closes out the medication-logging
vertical slice: Phase 1.5 (models) → Phase 3.6 (endpoints) → Phase 7.4 (this task) are each their
own PR, stacked in that order, and need merging in that same order once reviewed.

### Verification

- `npm test` (frontend, `vitest run`) — 26/26 passing (18 pre-existing, 8 new).
- `npm run build` (frontend) — compiled cleanly.
- `npm run lint` (oxlint) and `npx prettier --check .` — both clean (one pre-existing, unrelated
  warning aside; one new-test-file lint warning fixed).
- Real headless-browser walkthrough (Playwright) against the actual running backend and frontend
  dev servers: full register → add medication inline → log taken → log not-taken (existing
  medication) → view both → delete both cycle, screenshots reviewed at each step, zero browser
  console errors.

---

## 2026-08-17 — An optional dosage field, so "Diazepam 2mg" isn't crammed into the name

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the user asked whether Medication
could get an extra field the way Habit has one, specifically for dosage, after noticing that
without it, the only way to record "2mg" at all was typing the whole thing — name and dosage
together — into the single `name` field.

### Background / concepts

#### Where the new field belongs: on `Medication`, not `MedicationLog` — the same place Habit's `type` lives

- Discussed with the user directly before building anything (this was an exploratory "could we"
  question first): the real design choice is whether dosage is a property of *which medication
  this is* (fixed once, like `Habit.type`) or a property of *this particular occasion* (re-entered
  every log, for doses that vary - titrating, PRN). Went with the former, matching what the user
  described and what `Habit.type` already established as this project's pattern for "a
  once-per-definition detail every log against it inherits" - a field on the parent record, read
  by every log through the relation, rather than duplicated onto every individual log row.
- **This directly answers the user's own framing of the problem.** "Diazepam 2mg" typed into the
  one existing `name` field was the workaround forced by there being nowhere else for the dosage
  to go. Splitting it into `name: "Diazepam"` + `dosage: "2mg"` on the same `Medication` row is
  the minimal fix - no new table, no new relation, just one new nullable column.

#### Nullable, not required - existing medications and future ones without a dosage stay valid

- `dosage String?` (nullable) rather than required, so every `Medication` row created before this
  migration (`name` only, no `dosage` at all) remains perfectly valid with no backfill needed -
  it just reads as `dosage: null`, which the frontend already treats as "don't show it." A
  required field would have needed either a default value (meaningless for medications where a
  fixed dose genuinely doesn't apply, e.g. an as-needed inhaler) or a data migration to backfill
  something into every existing row.

### What was done

1. **`schema.prisma` + migration.** Added `dosage String?` to `Medication`. `npx prisma migrate
   dev --name add_medication_dosage` generated a single additive `ALTER TABLE ... ADD COLUMN`
   statement - no data migration needed, per the nullable design above.
2. **`backend/src/routes/medications.ts`.** Added `dosage: z.string().trim().min(1).optional()`
   to `createSchema` (rejects a dosage that's present but empty/whitespace-only, same pattern as
   every other optional string field in this codebase) and passed it through on create. The
   `PATCH` route needed no changes at all - `updateSchema` is already `createSchema.partial()`
   and passes `parsed.data` straight to Prisma, so a new optional field on `createSchema`
   automatically becomes independently updatable too.
3. **`MedicationEntryForm.tsx`.** Added a second, optional `TextField` ("Dosage (optional)",
   placeholder "e.g. 2mg") right below the existing medication-name field in the inline "add a
   medication" flow, and included `dosage` in the `POST /api/medications` body when the user
   entered one. The medication picker's radio buttons now show the dosage next to the name (e.g.
   "Diazepam — 2mg") when present, via a conditionally-rendered `<span>` - a medication with no
   dosage renders exactly as before, nothing new visible.
4. **`MedicationSection.tsx`.** Replaced the existing `medicationNameById` map (name only) with a
   `medicationById` map plus a `medicationLabel()` helper, so the "Recent medications" list shows
   `"Diazepam — 2mg — Taken"` when a dosage exists, or just `"Diazepam — Taken"` when it doesn't -
   same em-dash convention the picker uses, applied consistently in both places.
5. **Tests.** Backend: three new cases in `medications.test.ts` (creating with a dosage, rejecting
   a present-but-empty one, updating just the dosage via `PATCH`). Frontend: two new cases in
   `MedicationEntryForm.test.tsx` (the picker showing a medication's dosage; adding a new
   medication with a dosage, asserting the exact POST body) and one in `MedicationSection.test.tsx`
   (the recent-entries list including the dosage in its label). Existing `Medication`-typed test
   fixtures across both files needed `dosage: null` added to satisfy the now-widened interface.
6. **A test-writing detail worth remembering:** an early version of the two new picker tests
   asserted the radio button's accessible name as the *exact* string `"Diazepam — 2mg"` and failed
   even though the rendered markup was visibly correct (`Diazepam` then a `<span>— 2mg</span>`) -
   the accessible-name algorithm concatenates the button's own text and its child span's text in a
   way that didn't exactly match a hand-typed literal string (extra/different whitespace around
   the JSX-inserted text node). Switched both assertions to a partial regex
   (`/diazepam.*2mg/i`) instead of over-specifying the exact accessible-name string byte-for-byte -
   the thing actually worth testing is "the dosage shows up," not the precise whitespace the
   browser's accessible-name algorithm produces around a JSX expression.
7. **`npm run build`, `npm run lint`, `npx prettier --check .`** (both projects) - all clean after
   one formatting pass on a new test file.
8. **`npm test`** - 66/66 frontend tests passing (12 new/updated across three files), 113/113
   backend tests passing (3 new).
9. **Real browser verification.** Rebuilt the backend (regenerating the Prisma client against the
   new schema) and drove the actual flow with Playwright against real running dev servers:
   registered, added "Diazepam" with dosage "2mg" via the new field, confirmed the picker showed
   "Diazepam — 2mg" selected, logged it as taken, and confirmed the recent-entries list read
   exactly "Diazepam — 2mg — Taken" - zero console errors throughout.

### Why it's needed

Without a dedicated field, dosage information either got crammed into the medication name (as the
user described - "Diazepam 2mg" as one string) or left out entirely. Neither is a good outcome for
an app whose whole point is tracking health information accurately: cramming it into the name
breaks anything that might ever want to treat dosage as structured data later (filtering, display
formatting, a future "did the dose change over time" feature), and leaving it out just loses real
information the user wanted to record.

### Decisions

- **On `Medication`, fixed per medication - not re-entered on every `MedicationLog`.** Covered
  above - matches how `Habit.type` already works in this codebase, and matches the common case
  (most people take a consistent dose) over the less common variable-dose case, which was
  explicitly discussed as the tradeoff before building anything.
- **Nullable, not required**, so no backfill migration was needed and an as-needed medication with
  no fixed dose remains representable.
- **No `description` field added** (unlike `Symptom`, which has one) - dosage is the one specific
  thing asked for; a general free-text description wasn't requested and would just be a second,
  overlapping way to say the same kind of thing a future dosage-adjacent note might want.

### State at end of this step

A user can record a medication's dosage (e.g. "2mg") alongside its name, see it displayed
everywhere the medication name already shows (the picker, the recent-entries list), and existing
medications created before this change continue to work exactly as before with no dosage shown.

### Verification

- `npm test` (backend) - 113/113 passing, including 3 new dosage-specific cases.
- `npm test` (frontend) - 66/66 passing, including 12 new/updated cases across
  `MedicationEntryForm.test.tsx`, `MedicationSection.test.tsx`, and their existing fixtures.
- `npm run build`, `npm run lint`, `npx prettier --check .` (both projects) - all clean.
- Real headless-browser walkthrough (Playwright) against genuinely running dev servers: added a
  medication with a dosage via the new field, confirmed it appeared correctly in both the picker
  and the logged-entry list, zero console errors.

---

## 2026-08-17 — Phase 7: Edit action for medication entries, reusing the same form

**Task:** [Tasks.md](../../Tasks.md) → Phase 7 → "Edit and delete actions available from
Dashboard/History for every log type, reusing the same forms pre-filled with existing values."
See [Mood Logging](03-mood-logging.md)'s entry of the same date for the full explanation of why
this matters and how the shared pattern works (the optional `editingLog` prop, the `key`-forced
remount, and the replace-in-place-vs-prepend save logic) — this entry covers only what's
specific to Medication.

**Delivered via branch:** `feature/7-edit-log-entries` (same branch as the Mood, Symptom, and
Habit edit work — one PR covering all four log types).

### What's specific to Medication

- `MedicationEntryForm`'s `onSaved` callback has always taken *two* arguments —
  `(log: MedicationLog, medication: Medication) => void` — because a newly-created log might
  reference a medication that was itself just created inline, moments earlier, in the same form
  (the "no medications yet, add one" flow from the original entry form task). That two-argument
  shape is unchanged for edits: `onSaved` still receives both the updated log and the
  `Medication` object it belongs to (looked up from the form's already-fetched `medications`
  list by `selectedMedicationId`), so `MedicationSection` can keep folding a possibly-new
  medication into its local state exactly the same way for both create and edit.
- Like Symptom (and unlike Habit), a medication log's `medicationId` is a legitimate, editable
  `PATCH` field on the backend (`medicationLogsRouter.patch` re-runs the same
  `medicationBelongsToUser` ownership check used on create when `medicationId` is present in the
  body), so the medication picker stays enabled during edit rather than being locked.
- `selectedMedicationId` now initializes from `editingLog?.medicationId ?? null` instead of
  always starting `null` — the one field-specific wrinkle, since this form (unlike Mood's) loads
  its picker options asynchronously (`GET /api/medications` on mount) rather than receiving them
  as a prop; the pre-selected id is simply matched against that list once it arrives, the same
  way a user's own manual selection would be.

### What was done

1. **`frontend/src/components/MedicationEntryForm.tsx`.** Added the `editingLog` prop; pre-fills
   `selectedMedicationId`/`taken`/`notes`/`loggedAt`; submits `PATCH
   /api/medication-logs/{id}` instead of `POST /api/medication-logs` when editing; "Save
   Changes" button label.
2. **`frontend/src/components/dashboard/MedicationSection.tsx`.** Added `editingLog` state, an
   "Edit" button per entry, the "Log a medication" / "Edit medication entry" heading switch, the
   `key`-forced remount, and the replace-in-place `handleMedicationSaved` logic (still folding a
   newly-created medication into local state, as before).
3. **Tests.** New `describe("editing an existing entry")` block in
   `MedicationEntryForm.test.tsx` (pre-fill assertions, PATCH request assertions, `onSaved`
   called with both the updated log and the resolved medication) and one new case in
   `MedicationSection.test.tsx` (Edit opens the form pre-filled, saving replaces the entry in
   place). All pre-existing tests unchanged and passing.
4. **`npm test`** (frontend, full suite) — 82/82 passing (68 pre-existing, 14 new across all
   four log types).
5. **`npm run build`, `npm run lint`, `npx prettier --check .`** — all clean.
6. **Real browser verification**: logged a medication entry (Ibuprofen, Not taken), edited it to
   Taken via the pre-filled form, confirmed the change persisted and displayed correctly — zero
   console errors.

### Why it's needed

Same underlying gap as Mood — see that entry for the full reasoning. Medication adherence
specifically is data this app's whole premise depends on being trustworthy; a quick correction
for a mis-tapped "Taken/Not taken" beats deleting and re-logging.

### Decisions

- **Medication picker stays enabled during edit**, matching Symptom's reasoning (a legitimate,
  ownership-checked `PATCH` field) rather than Habit's locked one.
- **`onSaved`'s two-argument shape kept unchanged for edits** — reusing the exact same contract
  `MedicationSection` already relied on, rather than inventing a different callback shape just
  for the edit path.

### State at end of this step

A user can correct any already-logged medication entry — including which medication it's
attributed to and whether it was taken — directly from the Dashboard.

### Verification

- `npm test` (frontend, full suite) — 82/82 passing.
- `npm run build`, `npm run lint`, `npx prettier --check .` — all clean.
- Real headless-browser walkthrough: edited a medication entry's taken status, confirmed the
  in-place update and zero console errors.
