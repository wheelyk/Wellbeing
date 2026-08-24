# Built-in Category Toggles + Per-Target Reminders

## 2026-08-24 — Task 2: the generalized Reminder model, scheduler, and CRUD

**Task:** [Phase 16, Task 2](../../Tasks.md#task-2--backend-generalized-reminder-model-scheduler-and-crud)
— the foundational backend piece: replace the single per-user reminder
(`reminderEnabled`/`reminderTime`/`lastReminderSentDate`) with a per-target model, so a reminder
can be attached to General (the original whole-app nudge), Mood, Symptom, Habit
(category-level - no per-instance granularity for these three), a **specific Medication by name**
(e.g. "Diazepam" at 10:00, "Sertraline" at 08:30 - two fully independent reminders), or a
**specific custom Category**, each with **multiple fixed times per day** (e.g. 09:00/12:00/15:00,
approximating "every 3 hours" as fixed times - confirmed directly with the project owner that
real recurring-interval logic is explicitly out of scope, fixed times is the whole point).

Built (with the user's plan approval) alongside a separate, previously-shelved-then-revived
request: letting a user toggle each of the four built-in categories on/off (Phase 16's Task 1,
tracked separately since its own "disable matching reminders" rule depends on this task's model).

### Background / concepts

#### Why "once per day" couldn't survive unchanged

The old model's `lastReminderSentDate` was a single date string on `User` - "has *the* reminder
already fired today?" only ever had one possible answer to track. Once a single `Reminder` can
carry several independent times (e.g. "09:00" and "18:00"), that single-date gate breaks: the
09:00 firing would set `lastReminderSentDate` to today, which would then incorrectly suppress the
18:00 firing on the exact same reminder. The fix is a new `ReminderSend` table - one row per
`(reminder, date, time)` that has actually fired, so each of a reminder's own times gets its own
independent "already sent today" gate instead of sharing one.

#### Why `Reminder.medicationId`/`categoryId` are separate nullable columns, not a generic "targetId"

A single generic `targetId: String?` column would be simpler to look at, but it can't be a real
foreign key to two different tables at once - Postgres (and Prisma) foreign keys point at exactly
one table. Two separate nullable columns, each with its own real foreign-key relation
(`medicationId` -> `Medication`, `categoryId` -> `Category`), is what lets the database itself
enforce "this points at a real, existing medication" / "...category" rather than trusting an
untyped string blindly - the same reason `CategoryLog`'s own three nullable value columns exist
instead of one untyped JSON blob.

#### Why `Reminder.category` is `Restrict`, but the practical effect is "archiving disables it"

`CategoryLog` already established the pattern this project uses for Category: `categories.ts`'s
own `DELETE` route never actually deletes a row, only sets `archivedAt` (see
`docs/log/15-categories.md`'s Task 1 entry for why - a system category with real logging history
shouldn't become silently unrecoverable). Because of that, giving `Reminder.category` an
`onDelete: Cascade` relation would almost never do anything in practice - the hard-delete path it
guards against essentially never happens. Instead, both `categories.ts`'s and
`adminCategories.ts`'s archive routes now also set `enabled: false` on every `Reminder` targeting
the category being archived (across *every* user, not just the one archiving it, since a
system-wide category can have many different users' own reminders pointed at it) - "stop trying
to fire" is the real thing that needed to happen, not a delete that was never actually reachable.

### What was done

- **`backend/prisma/schema.prisma`**: new `ReminderTarget` enum (`GENERAL | MOOD | SYMPTOM |
  HABIT | MEDICATION | CATEGORY`). New `Reminder` (`userId`, `target`, `medicationId String?`,
  `categoryId String?`, `times String[]` - a plain Postgres text array, not a separate join
  table, mirroring how `HabitLog`'s own type-conditional value columns are validated in
  application code rather than a DB constraint - `enabled`, `createdAt`). New `ReminderSend`
  (`reminderId`, `date`, `time`, `sentAt`, unique on `(reminderId, date, time)`). The old
  `User.reminderEnabled`/`reminderTime`/`lastReminderSentDate` columns are dropped outright - **not
  migrated forward** (confirmed directly with the project owner: anyone with the old reminder
  enabled will need to reconfigure it after this deploys).
- **`backend/src/lib/reminderTarget.ts`** (new): the lowercase-API-vs-SCREAMING_CASE-database
  translation layer for `ReminderTarget`, mirroring `lib/habitType.ts`/`categoryValueType.ts`.
- **`backend/src/routes/reminders.ts`** (new): full CRUD at `/api/reminders`. `POST` validates
  the `target`/`medicationId`/`categoryId` pairing (`medication` requires an owned
  `medicationId` and forbids `categoryId`; `category` requires a visible, non-archived
  `categoryId` and forbids `medicationId`; every other target forbids both), validates `times`
  (deduped, sorted, capped at 6, each a valid `HH:mm`), and 409s if a reminder for the same
  `(user, target, medication-or-category)` already exists - an app-level check, not a DB
  constraint, matching this codebase's established preference for this class of invariant.
  `target`/`medicationId`/`categoryId` are immutable after creation (only `times`/`enabled` are
  editable), the same reasoning as `Habit.type`. `DELETE` is a real hard delete - unlike
  `Category`, a `Reminder` has no historical value of its own once removed.
- **`backend/src/lib/reminderScheduler.ts`**: `hasLoggedToday` becomes `hasLoggedTarget` - a
  switch on the reminder's own `target` hitting just the one relevant log table (`GENERAL` keeps
  the original blanket five-table check). `runReminderTick()` now fetches every enabled
  `Reminder`, batch-fetches **today's** `ReminderSend` rows for every candidate reminder in one
  query (not one query per (reminder, time) pair), and only bothers computing `hasLoggedTarget`
  for a reminder at all if at least one of its times is actually due and not already sent -
  keeping a 5-minute tick cheap regardless of how many reminders exist overall. Notification copy
  is now target-specific ("Time to take Diazepam (2mg)." / "Time to log Water intake." / etc.)
  rather than one fixed string for everyone.
- **`backend/src/lib/reminderEligibility.ts`**: `shouldSendReminder` keeps its exact pure-function
  shape, now evaluating one `(time, alreadySentThisSlot, hasLoggedTarget)` triple per call instead
  of one whole user per call - the caller (the scheduler) calls it once per time on a reminder,
  not once per reminder.
- **`backend/src/routes/categories.ts`** / **`adminCategories.ts`**: their archive (`DELETE`)
  routes now also disable every `Reminder` targeting the category being archived.
- **`backend/src/routes/users.ts`**: `reminderEnabled`/`reminderTime` removed from
  `updateSchema`/`PROFILE_SELECT` entirely - reminders are no longer a `User` concern at all.

### Why it's needed

The whole point of this generalization is the concrete example that prompted it: a user taking
Diazepam every morning at 10:00 and Sertraline every morning at 08:30 needs two fully independent
reminders, each with its own schedule and its own "have I taken *this one* today" check - the old
one-reminder-per-user model couldn't express that at all, and hard-coding "which medication" into
a single reminder wouldn't scale to a second one.

### Decisions

- **Not auto-migrating the old single reminder** - confirmed directly with the project owner
  (the simpler, lower-risk choice, at the cost of one existing account's reminder silently
  stopping until reconfigured).
- **`times` as a native array, not a join table** - nothing beyond a `Reminder`'s own row ever
  needs to reference one specific time in isolation; `ReminderSend` references a time by its
  string value directly, not by a foreign key to a per-time row.
- **`Reminder.medication` is `Cascade`, `Reminder.category` is `Restrict` (with an explicit
  archive-time disable)** - a real, deliberate asymmetry, not an oversight: `Medication` has a
  genuine hard-delete path (`medications.ts`'s own `DELETE`), so a reminder about a deleted
  medication really has nothing left to be about; `Category` never hard-deletes at all, so the
  cascade would be dead code, and the archive-time disable is what actually does the job.
- **Real hard delete for `Reminder` itself** - unlike a log entry or a category, there's no
  historical value in keeping a deleted reminder's row around.

### State at end of this step

The backend for per-target reminders is complete, tested, and fully independent of Task 1's
built-in-category toggles (which are tracked separately since their own "disable matching
reminders" rule reads from this task's `Reminder` model). There is currently no frontend for any
of this - `RemindersSection` in Settings still references the old, now-removed `User` fields and
will need its own rewrite (Task 5) before reminders are reachable from the app again at all.

### Verification

- `npm test` (backend): full suite green (285 tests), including a new `reminders.test.ts`
  (ownership/validation CRUD, duplicate-target 409, cross-user isolation, and the
  archive-disables-reminders behavior across two different users), a rewritten
  `reminderEligibility.test.ts` for the per-slot pure-function shape, and a rewritten
  `reminderScheduler.test.ts` covering GENERAL/MEDICATION/CATEGORY targets, two independent times
  firing separately on one reminder, a medication-specific reminder correctly ignoring a
  *different* medication's own log, and disabled reminders never firing.
- `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `npx prettier --check`: all clean.
- The schema migration itself was applied directly to the local dev database (via `prisma db
  push --accept-data-loss`, after explicit confirmation this was the local dev DB - not
  production - and explicit user consent for the destructive column drop, per Prisma's own
  built-in AI-safety guardrail for this exact class of command), then reconciled into a proper
  versioned migration file (`20260824000000_generalize_reminders`) for Railway's own `prisma
  migrate deploy` step at actual deploy time.
- Observed (not a regression): a few unrelated, pre-existing tests intermittently timed out
  across two full-suite runs before a third ran clean at 285/285 - the same environmental
  flakiness under heavy parallel local database load already documented in
  `docs/log/15-categories.md`'s Task 1 entry, not caused by this feature.

---

## 2026-08-24 — Task 1: built-in category toggles

**Task:** [Phase 16, Task 1](../../Tasks.md#task-1--backend-built-in-category-toggles) - let a
user turn each of the four built-in categories (Mood/Symptom/Medication/Habit) on or off
individually, hiding it from Dashboard/Quick Add without touching any data already logged under
it. Implemented after Task 2 (above), since this task's own cross-feature rule - turning a
category off also disables any `Reminder` aimed at it - reads from Task 2's `Reminder` model.

### Background / concepts

#### A real bug found while generating this task's own migration

Starting this task's migration turned up a genuine mistake in Task 2's schema, unrelated to the
toggle columns themselves: `Reminder.category` (`categoryId String?`) had no explicit `onDelete`,
and its own schema comment claimed "Restrict is Prisma's default for a relation with no onDelete
specified" - true only for a **required** relation. For an **optional** one (which this is - the
same reasoning `CategoryLog.category` uses does *not* transfer, because `CategoryLog.categoryId`
is non-nullable), Prisma's actual unspecified-onDelete default is `SetNull`. The hand-written
`migration.sql` from Task 2 said `RESTRICT` (matching the intended design), but what `prisma db
push` actually applied to the dev database - back when Task 2's migration history was reconciled
via `prisma migrate resolve --applied` rather than genuinely replayed - was `SetNull`, since that
reflected the schema as literally written at the time, not the comment's stated intent. This
surfaced as `prisma migrate dev` refusing to run for this task's own change, reporting drift
between the actual database and migration history and asking to reset the whole dev database.

Rather than reset (real, if disposable, local data), the actual constraint was inspected directly
(`pg_get_constraintdef` via a scratch script - `psql` isn't installed in this environment, so a
one-off Prisma `$queryRawUnsafe` stood in for it), confirmed as the `SetNull` mismatch above, and
corrected in two steps: the live constraint was fixed via `$executeRawUnsafe` to match what
Task 2's own already-applied migration history says (`RESTRICT`) - restoring consistency without
any data loss - and then `schema.prisma` was corrected to declare `onDelete: Restrict` explicitly
rather than leaving it implicit, so the true default can never silently diverge from the intended
design again. `SetNull` would have been a real bug in production: a hard-deleted category (however
rare) would have silently left a `CATEGORY`-target `Reminder` pointing at nothing, rather than
blocking the delete the way the design always intended.

### What was done

- **`backend/prisma/schema.prisma`**: four new `User` booleans, all `@default(true)`:
  `moodEnabled`, `symptomEnabled`, `medicationEnabled`, `habitEnabled`. Also fixes
  `Reminder.category`'s `onDelete` to be explicit `Restrict` (see above).
- **`backend/src/routes/users.ts`**: `updateSchema`/`PROFILE_SELECT` extended with all four
  fields. `PATCH /me` also disables (`enabled: false`, never a delete) every `Reminder` whose
  `target` matches a toggle flipped to `false` in the same request - `MOOD`/`SYMPTOM`/`HABIT`
  directly, `MEDICATION` for every reminder regardless of which specific medication it names.
  Fires whenever the field is sent as `false` at all (not only on a genuine true→false
  transition) - a harmless no-op on repeat, the same tolerance `categories.ts`'s own repeat-archive
  already has. Turning a category back on deliberately does **not** re-enable those reminders.
- **`backend/src/routes/auth.ts`**: `serializeUser()` (shared by `/login` and `/refresh`) gains all
  four fields - the same lesson `isAdmin` already established: `AuthContext` is populated from
  session endpoints, not `GET /api/users/me`, so a flag added only there would leave the frontend's
  session-derived state stale until a manual refetch.
- **Migration** (`category_toggles`): adds the four `users` columns; the `Reminder.category` FK
  fix above required no new migration statement of its own, since the live constraint was already
  hand-corrected to match what the schema now states explicitly.

### Why it's needed

Toggling categories off was explored earlier in the project and shelved in favor of the
custom-category hybrid that shipped in Phase 15; the user asked for it back in addition to (not
instead of) that hybrid. The reminder side-effect exists so a disabled category can't keep quietly
pushing notifications for something the user just said they don't want to see or log anymore.

### Decisions

- **Disable-only, no auto-re-enable on toggle-back-on** - re-enabling a reminder is a decision the
  user makes explicitly from the reminders list (Task 5), never an automatic side effect of an
  unrelated toggle, so a notification can never silently resume without a fresh confirmation.
- **Fixed the `Reminder.category` FK bug as part of this task, not a separate PR** - it was found
  while doing this task's own migration work and touches the same file/relation Task 1 already
  needed to reason about; deferring it to a later, unrelated PR would have meant carrying a known,
  understood correctness bug in already-merged `main` for no benefit.

#### A CI-only e2e failure this task's own PR turned up (in an unrelated test)

The GitHub Actions run for this task's PR (#123) failed `e2e/edit-and-delete.spec.ts` - a test
about editing and deleting a Mood entry from History, nothing this task touches. The trace
(downloaded via `gh run download`, then read directly as HAR-shaped JSON lines - `psql` isn't
installed in this environment, so `pg_get_constraintdef` via a scratch Prisma script had already
stood in for it once already in this same task, see above) showed the `DELETE
/api/mood-logs/:id` request itself recorded with HAR status `-1` - Playwright's convention for "the
browser aborted this request before a response arrived." The cause was in the test, not this PR's
own code: `HistoryPage.tsx`'s delete is optimistic - `handleConfirmDelete` calls `setEntries(...)`
to remove the row from local state *before* `await`-ing the `DELETE` call - so the test's very next
two assertions (row gone, "nothing to show yet" visible) pass instantly, well before the network
request has actually reached the server. The test then called `page.reload()` immediately after,
with nothing gating that reload on the request having actually finished - so on an unlucky timing
draw, `page.reload()` aborts the still-in-flight `DELETE` before the server responds, and the
subsequent reload's `GET /api/history` genuinely finds the row still there (the delete never
happened at all, not just "hadn't been reflected in the UI yet"). By contrast,
`account-deletion.spec.ts`'s own "prove real persistence" step is safe from this exact race because
it waits on `page.waitForURL(...)`, itself gated on the app only navigating after its own delete
request resolves - `edit-and-delete.spec.ts` had no equivalent gate. This is very likely why this
one had never failed before: every prior run's `DELETE` request just happened to finish inside the
(previously slightly wider, now apparently slightly narrower) window between the optimistic UI
update and the reload - a pure timing coincidence, not a guarantee the test's structure ever
provided. Fixed by having the test `await page.waitForResponse(...)` for the real `DELETE` response
before reloading, matching how `account-deletion.spec.ts` already avoids the same class of race.
Verified locally: 5 back-to-back runs of the fixed spec alone, then the full local e2e suite (4/4)
and full frontend unit suite (277/277), all green.

### State at end of this step

Backend toggles are complete, tested, and wired to the reminder model. No frontend yet - `AuthUser`
doesn't carry the four flags, Settings has no toggle UI, and Dashboard/QuickAdd/Summary don't
conditionally render on them (Task 3).

### Verification

- `npm test` (backend): full suite green (289 tests), including new `users.test.ts` cases for the
  toggle defaults, independent updates, presence on `/login`/`/refresh` (not just `GET /me`), and
  the toggle-disables-reminder / toggle-back-on-does-not-re-enable behavior.
- `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `npx prettier --check`: all clean.
- The FK drift was resolved without a database reset: the live `reminders_category_id_fkey`
  constraint was inspected directly, confirmed to be `SetNull` against an intended/`RESTRICT`
  migration history, corrected in place, then a clean `prisma migrate dev` produced the real
  migration for the toggle columns with no further drift.
- CI's own e2e job (`E2E Tests`) failed on this task's first push, on a genuine pre-existing race
  in `edit-and-delete.spec.ts` unrelated to this task's own changes (see above) - fixed in the test,
  verified with 5 repeated local runs of that spec plus the full local e2e suite (4/4) and full
  frontend unit suite (277/277), all green; re-pushed for CI to confirm.

---

## 2026-08-24 — Task 3: frontend built-in category toggles

**Task:** [Phase 16, Task 3](../../Tasks.md#task-3--frontend-built-in-category-toggles) - the
frontend half of Task 1's backend toggles: a Settings section to flip Mood/Symptom/Medication/
Habit on or off, and Dashboard/Quick Add/the summary line actually respecting that choice.

### Background / concepts

#### Props instead of a second `useAuth()` call, in `QuickAddFab` and `DashboardSummary`

`DashboardPage.tsx` already calls `useAuth()` for the display name/email greeting, so it already
has `user.moodEnabled` etc. in hand. `QuickAddFab` and `DashboardSummary` could each have called
`useAuth()` themselves instead - but both already have dedicated test files that render them
*without* an `AuthProvider` ancestor at all (`QuickAddFab.test.tsx`, `DashboardSummary.test.tsx`),
since neither needed any auth state before this task. Adding `useAuth()` inside either one would
have made every existing test in both files throw immediately (`useAuth must be used within an
AuthProvider`), forcing a rewrite of tests that have nothing to do with this feature just to wrap
them in a provider and mock `/api/auth/refresh`. Passing the four flags down as plain optional
props (each defaulting to `true`) instead means both components stay exactly as easy to unit-test
as they were, every pre-existing test in both files keeps passing completely unchanged, and the
new toggle-filtering tests are just as easy to write as passing a different prop value.

#### The `updateUser` gap in `AuthContext`

Session state (`AuthContext`'s `user`) previously only ever changed via `login`/`register`/
`rehydrateSession` - there was no way for a page to say "the server just confirmed this specific
field changed, patch it into the current session." Without something filling that gap, saving a
toggle in Settings would only be reflected on Dashboard after a full reload (forcing
`rehydrateSession` to re-run) - workable, but a jarring UX for something the user just did.
`AuthContext` gained a small `updateUser(patch)` that merges a partial update into the existing
session user in place, and `BuiltInCategoriesSection`'s save handler calls it with the server's
own response right after a successful `PATCH` - the same underlying lesson `isAdmin` already
taught (session-derived state has to be pushed to, it doesn't refetch itself), just generalized
into a reusable mechanism instead of a one-off fix.

#### A same-page accessible-name collision, twice

Two unrelated naming collisions turned up while wiring this in:

- The Reminders section's existing Save button is already named exactly "Save" (a bare string,
  not "Save reminders"). The new toggle section's button, if also named "Save," would make
  `getByRole("button", { name: /^save$/i })` ambiguous on this page. Renamed the new button to
  "Save category settings" rather than touching the already-shipped Reminders section over a
  collision the new code caused.
- The toggle checkboxes were first written with each item's description nested *inside* the same
  `<label>` as the checkbox text (e.g. "Mood" plus "Daily mood check-ins." both inside one
  `<label>`) - which folds both into the checkbox's single accessible name ("Mood Daily mood
  check-ins."), breaking a clean `getByLabelText(/^mood$/i)` lookup. Fixed by moving each
  description to a sibling `<p>` outside the `<label>`, so only the short label text contributes
  to the accessible name.

### What was done

- **`frontend/src/auth/AuthContext.tsx`**: `AuthUser` gains `moodEnabled`/`symptomEnabled`/
  `medicationEnabled`/`habitEnabled`. New `updateUser(patch)` on the context value (see above).
- **`frontend/src/pages/SettingsPage.tsx`**: new `BuiltInCategoriesSection` (own `GET`/`PATCH
  /api/users/me`, matching the page's existing self-contained-section convention), placed above
  the existing custom-`CategoriesSection`. Calls `updateUser` on a successful save.
- **`frontend/src/pages/DashboardPage.tsx`**: `MoodSection`/`HabitSection`/`MedicationSection`/
  `SymptomSection` each conditionally rendered on `user?.xEnabled ?? true` (the `?? true` treats
  a still-loading/absent session the same as "enabled," matching the backend's own default, so
  nothing flashes away and back while `rehydrateSession` is still in flight). `CategorySection`
  (custom categories) is unconditional - untouched by this feature. The same four flags are passed
  down as props to `DashboardSummary` and `QuickAddFab`.
- **`frontend/src/components/dashboard/QuickAddFab.tsx`**: four new optional props (all default
  `true`), used to filter `QUICK_ADD_ITEMS` before rendering the menu. The "More…" (`category`)
  entry is never filtered - it isn't one of the four built-ins this feature covers.
- **`frontend/src/components/dashboard/DashboardSummary.tsx`**: the same four optional props,
  used to build the summary line's clauses - a disabled category's clause is omitted outright
  (not shown as "0"). If every category ends up disabled while there's still `hasLoggedAnything`
  from stale pre-toggle data, falls back to the friendly "Nothing logged yet today" empty state
  rather than rendering an empty line.
- **Deliberately unchanged: `HistoryPage.tsx`.** Toggling a category off only affects new logging
  surfaces; it was never meant to hide anything already logged.

### Why it's needed

Direct continuation of Task 1 - the backend toggle columns existed but had no way to be set or
respected from the actual app.

### Decisions

- **Props over a second `useAuth()` call in leaf components** - see above; keeps two already
  well-covered, auth-agnostic components' test files untouched.
- **`updateUser` merges immediately rather than the page navigating away/reloading** - saving a
  toggle should feel instant, not require a manual refresh to see it take effect on Dashboard.

### State at end of this step

Toggling a built-in category off now actually hides it from Dashboard, Quick Add, and the summary
line, immediately in the same session and confirmed to survive a real reload. Phase 16's frontend
work remaining: Task 4 (Medications management UI) and Task 5 (reminders management rewrite -
`RemindersSection` in Settings still references the `User` fields Task 2 removed from the backend
and is currently non-functional; out of scope for this task).

### Verification

- `npm test` (frontend): full suite green (285 tests, up from 277) - 8 new tests covering
  `DashboardPage` (a disabled category's section and Quick Add entry both disappear, others
  unaffected), `QuickAddFab` (default-all-shown plus selective filtering), `DashboardSummary`
  (a disabled category's clause omitted; all-disabled falls back to the empty state), and
  `SettingsPage` (toggle defaults load correctly, an already-off category loads as unchecked,
  saving persists and confirms).
- `npx tsc -b`, `npm run build`: clean. `npx oxlint`: only two pre-existing warnings, both in
  files this task didn't touch (`vite.config.ts`'s triple-slash reference,
  `AuthContext.tsx`'s pre-existing `useAuth`-alongside-`AuthProvider` fast-refresh warning - the
  latter already existed before this task's `updateUser` addition). `npx prettier --check`: one
  genuine issue in this task's own `SettingsPage.tsx` edit, fixed; two remaining warnings are in
  files this task never touched (`BottomNav.tsx`, `e2e/trends-after-seeding.spec.ts` - confirmed
  via `git status` showing no changes to either).
- Manual, real-browser verification (Playwright script against the built frontend + a running
  backend, not just the automated suites): registered a fresh account, confirmed all four
  sections and Quick Add entries present by default; toggled Medications off in Settings and
  saved; confirmed the Medications section and its Quick Add entry both disappeared *immediately*
  on navigating back to Dashboard with no page reload (proving `updateUser` actually propagates
  in-session, not just after a fresh `rehydrateSession`); confirmed Mood stayed untouched
  throughout; reloaded the page and confirmed Medications stayed hidden (real server-side
  persistence, not just in-memory state that a reload would have reset).

---

## 2026-08-24 — Task 4: Medications management (closes a pre-existing gap)

**Task:** [Phase 16, Task 4](../../Tasks.md#task-4--frontend-medications-management-closes-a-pre-existing-gap)
- a "Medications" Settings section to list, rename/redose, and delete a user's own medications.
Not a technical dependency of the reminders work (medications already fully worked via the
existing inline add-affordance) - closes a real, independently-discovered gap: `PATCH`/`DELETE
/api/medications/:id` have existed on the backend since Phase 4, with no frontend caller at all
until this task. The only way to create a medication was buried inside `MedicationEntryForm`'s own
"+ Add another medication" affordance while logging a dose - there was nowhere to rename one,
fix a typo'd dosage, or remove one no longer taken, and (looking ahead to Task 5) nowhere to set
one up *before* ever logging a dose against it, which per-medication reminders need.

### Background / concepts

#### A real hard delete, not an archive - and why the confirmation says so explicitly

`CategoriesSection`'s own delete action archives (`archivedAt`, never a real `DELETE`), because a
system category with real logging history behind it needs to stay resolvable in History
indefinitely (see `docs/log/15-categories.md`). `Medication` has no such constraint - there's no
system-wide medication concept, and `medications.ts`'s `DELETE` route (unchanged by this task) has
always been a genuine hard delete that cascades to every `MedicationLog` against it
(`onDelete: Cascade` in `schema.prisma`). Reusing `CategoriesSection`'s own confirmation wording
("existing entries are kept...") here would have been actively *wrong* - it would tell a user their
logged doses are safe when this action removes them permanently. The new section's own
confirmation says exactly what happens instead: "This also permanently deletes every logged entry
for it."

#### A standalone create form, not a reused one

`MedicationEntryForm.tsx` already has its own inline "add a medication" flow (the pre-existing
affordance this task's gap analysis singled out) - but its `onCreated`-equivalent hands back
`(log, medication)` together, shaped around "a dose was just logged against a medication that may
have just been created inline in the same submit." Settings' own create flow only ever needs the
medication itself, with no dose attached. Rather than contort one component to serve both shapes,
`MedicationCreateForm.tsx` is a new, smaller, standalone form (mirrors `CategoryCreateForm.tsx`'s
own role for categories) - name plus an optional dosage, `POST /api/medications`, nothing else.

### What was done

- **`frontend/src/components/MedicationCreateForm.tsx`** (new): name + optional dosage form,
  `POST /api/medications`, mirroring `CategoryCreateForm.tsx`'s shape minus the value-type picker
  (`Medication` has no equivalent of `Category.valueType`).
- **`frontend/src/pages/SettingsPage.tsx`**: new `MedicationsSection` (list/edit/delete, plus the
  new create form), placed between `BuiltInCategoriesSection` and the existing custom-
  `CategoriesSection`. Reuses the already-exported `Medication` type from
  `MedicationEntryForm.tsx` rather than redefining it.

### Why it's needed

Directly closes the gap found while researching Task 2/5: without this, "set up a Diazepam
reminder before ever logging a dose" (the whole point of Task 5's per-medication reminders) would
have had no way to create the medication in the first place outside of logging a dose first.

### Decisions

- **A real hard delete with an explicit, accurate warning** - see above; reusing Category's own
  "kept" wording would have misrepresented what actually happens.
- **A new standalone create form rather than reusing `MedicationEntryForm`'s inline one** - the two
  call sites hand back meaningfully different shapes (medication alone vs. medication-plus-log);
  forcing one shared component to serve both would have made both worse.

### State at end of this step

Medications can now be listed, created, renamed/redosed, and deleted entirely from Settings -
independently verified (via a real Playwright script against the built frontend and a running
backend, not just the automated suites) to be the exact same backend-owned list
`MedicationEntryForm`'s own picker on Dashboard reads from, not a separate parallel one. Phase 16's
only remaining piece is Task 5 (reminders management rewrite) - `RemindersSection` in Settings
still references `User` fields Task 2 removed from the backend and remains non-functional until
that task lands.

### Verification

- `npm test` (frontend): full suite green (291 tests, up from 285) - 6 new tests covering the
  empty state, listing with dosage, create, edit, delete (asserting the exact cascade-warning
  confirmation text), and declined-confirmation-does-nothing.
- `npx tsc -b`, `npm run build`: clean. `npx oxlint`: only the same two pre-existing warnings noted
  in Task 3's entry, in files this task didn't touch either. `npx prettier --check`: clean on this
  task's own files after one `--write` pass; the same two pre-existing, untouched-by-this-task
  files as Task 3 remain (confirmed via `git status`).
- Manual, real-browser verification (Playwright against the built frontend + a running backend):
  registered a fresh account, confirmed the empty state; created "Diazepam" with dosage "2mg" and
  confirmed it listed correctly; confirmed it also appeared in Dashboard's real
  `MedicationEntryForm` picker (proving one shared backend list, not a UI-only duplicate); edited
  the dosage to "5mg" and confirmed it persisted in the list; deleted it, confirming the real
  confirm-dialog text read "This also permanently deletes every logged entry for it," and that the
  empty state returned afterward.

---
