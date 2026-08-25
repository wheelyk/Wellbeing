# Unify Mood, Symptom, and Habit into the Generic Category Model

## 2026-08-25 — Task 1: per-user system-category hiding

**Task:** [Phase 17, Task 1](../../Tasks.md#task-1--backend-per-user-system-category-hiding) - the
foundation this whole phase's later data migrations depend on: a per-user way to hide a *system*
category (one a user didn't create and can't archive themselves). Built first, ahead of any actual
Mood/Symptom/Habit migration, because Symptom's system symptoms and Mood's new Mood/Energy/Stress
categories (Tasks 4 and 6) both need somewhere for a user to say "I don't personally use this one"
without deleting or archiving something they don't own.

### Background / concepts

#### Why this isn't "replace the four `*Enabled` booleans with one generic list"

The obvious-looking generalization - one per-user "hidden category ids" mechanism replacing
`moodEnabled`/`symptomEnabled`/`medicationEnabled`/`habitEnabled` outright - turns out to be the
wrong shape once you look at what each toggle actually protects. `Habit.userId` was never
nullable: every habit is already a user's own personal category-to-be, so once Habit migrates
(Task 2/3) a user who wants to stop tracking all their habits can just archive each one
individually through the archive action every personal category already has - no toggle needed at
all. `medicationEnabled` stays exactly as it is (Medication isn't part of this unification). The
only genuine remaining gap is a category a user *can't* archive because they don't own it - a
system category (`userId: null`) - which is exactly Symptom's 8 seeded system symptoms and Mood's
new Mood/Energy/Stress categories once they exist. So this task builds the smaller, more precisely
targeted thing: hide/unhide for system categories only, not a universal replacement mechanism.

#### `GET /api/categories`'s two audiences need two different defaults

Dashboard/Quick Add want a hidden category to genuinely disappear - that's the whole point of
hiding it. But Settings' own category-management list (`CategoriesSection`, wired up in Task 3/5)
needs to show a hidden category *with an Unhide action*, or hiding would be a one-way trip with no
way back once a category drops out of the only list that renders it. Rather than a separate
endpoint, `GET /api/categories?includeHidden=true` serves the management view, with each category
serialized with an explicit `hidden: boolean` field the frontend can key an Unhide-vs-Hide button
off of - the default (no query param) stays exactly as strict as before for Dashboard/Quick Add.

### What was done

- **`backend/prisma/schema.prisma`**: `Category` gains `description: String?` - a small, generically
  useful field on its own, and also the only place `Symptom.description` will have to live once
  Task 4 migrates it (Category had nothing equivalent before this). New `HiddenCategory(id,
  userId, categoryId, createdAt)`, `@@unique([userId, categoryId])`, both FKs `onDelete: Cascade` -
  a hidden-category preference has no historical value of its own to protect (unlike
  `CategoryLog`), so cascading it away when either the user or the category itself goes is exactly
  right.
- **`backend/src/routes/categories.ts`**: `createSchema`/`updateSchema` gain `description`
  (optional, nullable on update to allow clearing, matching `icon`'s existing pattern). `GET /`
  excludes any category in the caller's own `hiddenBy` unless `?includeHidden=true`, in which case
  every returned category is serialized with `hidden: boolean`. New `POST /:id/hide` - scoped to
  `userId: null, archivedAt: null` (a personal or already-archived category isn't a valid hide
  target; both come back as the same 404, matching this codebase's established "don't leak which
  case it is" convention) - and `DELETE /:id/hide`, both idempotent (`upsert`/best-effort `delete`,
  matching `categories.ts`'s own repeat-archive tolerance).
- **`backend/src/routes/adminCategories.ts`**: `createSchema`/`updateSchema` also gain
  `description`, so an admin can set one when creating/editing a system category (needed for
  Task 4/6's own migrations, and generally useful on its own).
- **Migration** (`category_description_and_hidden_categories`): clean `prisma migrate dev` run, no
  drift, no manual SQL needed - purely additive (`ADD COLUMN`, `CREATE TABLE`).

### Why it's needed

Closes the gap the built-in toggles leave once "built-in" stops being a fixed set of four backend
models - a user still needs a way to say "not for me" about something an admin (or, later, the
Mood/Symptom migrations) put in front of every account by default.

### Decisions

- **Hide is for system categories only, enforced at the route level, not a general-purpose
  per-category preference.** Rejecting a hide attempt on a personal category with a 404 (rather
  than silently allowing a no-op hide, or a more permissive 400) keeps the two "make this go away"
  tools - archive and hide - mapped onto exactly the ownership situations they each apply to,
  instead of overlapping in a way that would make it unclear which one to reach for.
- **`includeHidden` as a query param on the existing `GET /`, not a separate endpoint** - the
  underlying query is nearly identical either way; a second endpoint would just be the same logic
  behind a different name.

### State at end of this step

The hide/unhide mechanism exists and is fully tested/verified, but nothing uses it yet - no system
categories exist to hide in production today (Symptom/Mood haven't migrated yet), and no frontend
UI calls these endpoints (that's Task 3/5). `Category.description` similarly has no real data yet
outside of what a test or an admin manually sets.

### Verification

- `npm test` (backend): full suite green - 296 tests (up from 289), including 7 new tests in
  `categories.test.ts` (description create/update/clear round-trip; hide/unhide round-trip and its
  per-user scoping; `includeHidden=true` returning the hidden category flagged `hidden: true` and
  everything else flagged `hidden: false`; hide is idempotent both directions; rejects hiding a
  personal category; rejects hiding an already-archived system category). One unrelated,
  pre-existing intermittent timeout in `reminderScheduler.test.ts` on the first full-suite run
  (passed cleanly alone, and on a full-suite re-run) - the same environmental flakiness under heavy
  parallel local database load already documented in `docs/log/15-categories.md`/
  `docs/log/16-reminders-and-category-toggles.md`, not a regression from this task.
- `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `npx prettier --check`: all clean.
- Manual, real-server verification (curl against a running local backend, not just the automated
  suite): created a system category via `/api/admin/categories` with a `description`; confirmed a
  regular user saw it in `GET /api/categories`; hid it and confirmed it disappeared from the
  default list; confirmed `?includeHidden=true` still returned it with `hidden: true`; unhid it and
  confirmed it reappeared in the default list; confirmed attempting to hide a personal category
  correctly 404s. (Along the way, a stray backend process left running from an earlier session -
  serving outdated pre-Task-1 code on the same port - produced a genuine-looking 500 on the very
  first request; killing it and starting a fresh build resolved it immediately, confirming this
  was leftover process state, not a real bug.)

---

## 2026-08-25 — Task 2: Backend — Habit → Category

**Task:** [Phase 17, Task 2](../../Tasks.md#task-2--backend-habit--category) - migrate every
`Habit`/`HabitLog` row into `Category`/`CategoryLog`, then delete the dedicated Habit
routes/model/enum entirely so former-habit data flows through the same generic paths every other
category already uses.

### Background / concepts

#### Why this migration is hand-written, not `prisma migrate dev`-generated

`prisma migrate dev` diffs the schema and generates SQL for the *shape* change (new/dropped
columns, tables, enum values) - it has no way to know that every row in a table being dropped
needs to land, transformed, in a table that already exists. Exactly the same reason
`16-reminders-and-category-toggles.md`'s `generalize_reminders` migration was hand-written: the
data migration (`INSERT ... SELECT ... FROM habits`) has to be interleaved with the schema changes
(dropping `habits`, `habit_logs`, `habit_type`, `HABIT` from the `reminder_target` enum) in an order
the tool can't infer from a schema diff alone.

#### Reusing the same row ids removes the need for a join

`Habit`/`HabitLog`'s column shapes already match `Category`/`CategoryLog`'s almost exactly
(`valueBoolean`/`valueNumeric`/`valueDurationMinutes`/`notes`/`loggedAt`, and `Habit.type` maps
directly onto three of `Category`'s four `valueType`s). The one wrinkle is that
`HabitLog.habitId` needs to become `CategoryLog.categoryId`, pointing at the *new* row, not the
old one. Copying each habit's `id` verbatim into the new `categories` row (rather than letting
Postgres generate a fresh uuid) means `habit_logs.habit_id` already equals the right
`categories.id` with zero transformation - no lookup/join table needed at all, just a straight
`INSERT ... SELECT` from `habit_logs` into `category_logs`.

#### Postgres can't drop one value from an enum directly

Removing `HABIT` from the `reminder_target` enum (now that no reminder can target a Habit)
can't be done with a single `ALTER TYPE ... DROP VALUE` - Postgres has no such statement. The
standard workaround, used identically here: rename the old enum type out of the way, create a new
type under the original name without the unwanted value, repoint the column at the new type via a
`USING` cast, then drop the renamed-away old type.

### What was done

- **`backend/prisma/schema.prisma`**: deleted `HabitType`, `Habit`, `HabitLog` entirely; removed
  `habitEnabled`/`habits`/`habitLogs` from `User`; removed `HABIT` from `ReminderTarget`; updated
  cross-referencing comments on `CategoryValueType`/`Category.scaleMin`/`CategoryLog`/
  `ReminderTarget` that used to point at Habit as a still-live sibling model.
- **Migration** (`habit_to_category`, hand-written): copies every `habits` row into `categories`
  (reusing the same `id`, mapping `type` to the matching `category_value_type`), copies every
  `habit_logs` row into `category_logs` (same `id`, `habit_id` landing directly as `category_id`),
  deletes any existing `HABIT`-target reminder, rebuilds the `reminder_target` enum without
  `HABIT`, then drops `habit_logs`, `habits`, `habit_type`, and `users.habit_enabled`.
- **Deleted**: `backend/src/routes/habits.ts`, `habitLogs.ts`, `lib/habitType.ts`, and their test
  files; unmounted both routers from `app.ts`.
- **`lib/reminderTarget.ts`**/**`lib/reminderScheduler.ts`**: removed `"habit"` from the API
  target list and both switch statements (`reminderCopy`, `hasLoggedTarget`).
- **`routes/users.ts`**/**`routes/auth.ts`**: removed `habitEnabled` from the update schema,
  profile selection, toggle-target map, and `serializeUser`.
- **`routes/dashboard.ts`**: removed `habitSummary` and its two supporting queries/formatter
  entirely - a former habit's today-status now surfaces exactly the way any other category's does,
  through the existing generic `recentEntries`/streak machinery.
- **`routes/history.ts`**: removed the dedicated `"habit"` `HISTORY_TYPE` and its formatter - the
  already-generic `formatCategoryLogValue` branch covers it.
- **`routes/export.ts`**: removed the dedicated `habits`/`habitLogs` fields and replaced them with
  `categories`/`categoryLogs` - this also closes a pre-existing gap noted in the plan: `export.ts`
  never included Category/CategoryLog data of any kind before this task, for *any* category, not
  just former habits.
- **`routes/trends.ts`**: removed habit's own slot in the activity-map `Promise.all` (a former
  habit's logs now count toward `activeDays` via the generic `categoryLogs` bucket, which already
  existed) - no dedicated chart needed since Habit never had one either.
- **Tests**: `users.test.ts`, `dashboard.test.ts`, `export.test.ts`, `history.test.ts`,
  `reminders.test.ts`, `trends.test.ts` updated to create/log categories instead of habits
  wherever a test had been exercising habit-specific code paths; `habits.test.ts`/
  `habitLogs.test.ts` deleted outright (superseded by `categories.test.ts`/`categoryLogs.test.ts`'s
  existing coverage of the same shape).

### Why it's needed

Habit was already structurally almost identical to Category (same three-value-column log shape,
three of four value types) - keeping it as a separate hand-written model/route pair going forward
would mean maintaining two copies of logic that already exists once, generically, for no
behavioral benefit to the user.

### Decisions

- **Archive-not-delete, not cascade-delete, for a migrated habit with logged history** (confirmed
  with the project owner ahead of this plan). A migrated habit is simply a personal category now,
  and personal categories are never hard-deleted while they have logs - `CategoryLog.category` is
  `Restrict`, matching Symptom's own existing pattern. This is a genuine behavior change from
  today's `HabitLog.habit: onDelete: Cascade`, accepted deliberately rather than preserved.
- **`HABIT`-target reminders are dropped, not remapped**, matching Phase 16's own established
  precedent: a user with multiple habits has no single unambiguous destination category for an
  old habit-level reminder, so the migration deletes any such row rather than guessing which
  specific category it should now point at. (This is unlike Task 6's planned `MOOD` remap, where
  exactly one destination category exists.)
- **`export.ts`'s pre-existing Category/CategoryLog gap is fixed now, not deferred** - former-habit
  data needs a home in the export somewhere, and adding the two missing generic fields was the
  natural, minimal way to give it one, rather than inventing a habit-shaped export field that would
  need its own removal later.

### Verification

- Migration verified against real before/after data (not just "it ran"): row counts checked before
  the migration (habits, habit_logs) and after (categories, category_logs) matched exactly; spot-
  checked several individual rows across all three value types (boolean, numeric, duration),
  confirming `id` reuse, correct `valueType` mapping, and `userId`/`loggedAt` preservation; a habit
  with multiple logs was checked to confirm every one of its logs landed against the same new
  category id.
- `npm test` (backend): full suite green - 265 tests across 24 files. One isolated intermittent
  failure in `reminderScheduler.test.ts` on the first full-suite run after this task's changes,
  passing cleanly both alone and on a full-suite re-run - the same pre-existing environmental
  flakiness under heavy parallel local database load documented in `docs/log/15-categories.md`/
  `docs/log/16-reminders-and-category-toggles.md`/Task 1's own entry above, not a regression from
  this task.
- `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `npx prettier --check .`: all clean.
- Manual, real-server verification (curl against a running local backend): registered a fresh
  account, confirmed its profile response no longer carries `habitEnabled`; confirmed
  `GET /api/habits` now 404s; created a boolean category and logged it, then confirmed it renders
  correctly through `GET /api/dashboard` (in `recentEntries`, contributing to the streak),
  `GET /api/history` (`{type: "category", label: "Walk: Done"}`), `GET /api/trends` (marks the
  activity calendar active, contributes no chart of its own), and `GET /api/export`
  (`categories`/`categoryLogs`, with `categoryName` carried onto each log); confirmed
  `POST /api/reminders` with `target: "habit"` now 400s validation while `target: "category"`
  against the same category id still 201s. (As in Task 1, a stray backend process from an earlier
  session was found already bound to port 4000 before this pass - killed and replaced with a fresh
  build before trusting any of the above.)

---

## 2026-08-25 — Task 3: Frontend — Habit retirement

**Task:** [Phase 17, Task 3](../../Tasks.md#task-3--frontend-habit-retirement) - remove every
frontend trace of the dedicated Habit UI now that its backend is gone (Task 2, on its own branch
- see that task's own entry above for the migration this depends on), so a former habit's data
renders and is logged through the exact same generic Category components every other category
already uses.

### Background / concepts

#### Why this task had to land carefully relative to Task 2

Task 2 (backend) and Task 3 (frontend) are genuinely coupled in a way Phase 16's own
backend/frontend split wasn't: Phase 16 generalized reminders *additively* (old and new endpoints
coexisted for a transition window), so either half could merge first without breaking the other.
Task 2 is destructive instead - it deletes `/api/habits`, `/api/habit-logs`, and
`habitSummary`/`habitEnabled` outright. Verifying Task 2 in isolation (its own PR's CI) surfaced
this directly: with Task 2's backend running and the *old* (pre-Task-3) frontend still pointed at
it, `DashboardSummary.tsx`'s `data.habitSummary.loggedCount` throws on every render (`habitSummary`
no longer exists in the response), crashing the dashboard - confirmed via three real e2e failures
in that PR's CI run, not a hypothetical. That means, unlike Task 2/3's own numbering, **Task 3 is
actually safe to merge to `main` on its own first** (an unchanged Task-2-era backend simply ignores
a frontend that no longer asks for Habit data), while **Task 2 is not safe to merge alone** before
Task 3 follows immediately - flagged explicitly on Task 2's own PR.

### What was done

- **Deleted**: `HabitCreateForm.tsx`, `HabitEntryForm.tsx`, `HabitSection.tsx`, and their three
  test files - `CategoryCreateForm.tsx`/`CategoryEntryForm.tsx`/`CategorySection.tsx` already cover
  the identical ground.
- **`AuthContext.tsx`**: removed `habitEnabled` from `AuthUser`.
- **`DashboardPage.tsx`**: removed the `HabitSection` import/render and every `habitEnabled` prop
  pass-through to `DashboardSummary`/`QuickAddFab` - no replacement toggle, since a former habit is
  now just a personal category, archived individually through `CategorySection` like any other.
- **`QuickAddFab.tsx`**: removed the dedicated "Habit" menu item and `habitEnabled` prop/filter -
  logging a former habit now goes through the existing "More…" entry, same as any custom category.
- **`DashboardSummary.tsx`**: removed `habitSummary` from the fetched-data interface, the `"habit"`
  `RecentEntry` type/icon, and the `habitEnabled`-gated summary clause. `hasLoggedAnything` now
  checks only mood/symptomCount/medicationSummary (documented as a deliberate, minor narrowing
  below - see Decisions).
- **`historyLogApi.ts`/`HistoryEditModal.tsx`/`HistoryPage.tsx`**: removed the `"habit"`
  `HistoryEntryType`/`fetchHabitLog`/`fetchHabits`/`habitValueLabel`/`habitLabel` and the modal's
  dedicated `HabitEntryForm` branch - a former habit's entries flow through the already-generic
  `"category"` branch/`categoryValueLabel`/`categoryLabel` in each of these files.
- **`ReminderCreateForm.tsx`**: removed `"habit"` from `ReminderTarget` and its target-picker
  option - matches Task 2's backend already rejecting it.
- **`lib/dashboardQuickAddEvent.ts`/`lib/dashboardEntryChangedEvent.ts`**: removed `"habit"` from
  both event-type unions.
- **Copy text**: updated every user-facing string that listed "habits" as a separate thing
  alongside mood/symptoms/medications (`SettingsPage.tsx`'s reminders/categories/export/delete-
  account sections, `HistoryPage.tsx`, `TrendsPage.tsx`, `ActivityCalendar.tsx`,
  `AdminCategoriesPage.tsx`, `CategorySection.tsx`) to instead read "categories" or omit the clause
  entirely, matching what each surface actually does now.
- **`scripts/capture-pr-screenshots.mjs`** and **`e2e/quick-add-and-dashboard.spec.ts`**: the
  "Habit" quick-add step (dedicated menu item -> `Create your first habit` -> `/api/habits`) was
  replaced with the equivalent Category flow (the "More…" entry -> `Create your first category` ->
  `/api/categories`) - both scripts drive a real browser against a real running app, so they needed
  the same UI-path update as the production code itself.
- **Tests**: `SettingsPage.test.tsx`, `DashboardPage.test.tsx`, `QuickAddFab.test.tsx`,
  `DashboardSummary.test.tsx`, `HistoryPage.test.tsx`, `ActivityCalendar.test.tsx` updated wherever
  they exercised habit-specific UI or asserted on a "four" count that's now three;
  `historyLogApi.test.ts`'s `habitValueLabel`/`habitLabel` tests (boolean/numeric-including-zero/
  duration-including-zero coverage) were converted to test `categoryValueLabel`/`categoryLabel`
  instead - the same real behavior, now reached through the surviving generic functions, plus one
  new case (`"scale"`) that had no test at all before this change.

### Why it's needed

Task 2 already deleted every backend endpoint this frontend code called - leaving it in place
wasn't "harmless dead code," it was a guaranteed runtime crash the moment Task 2's backend shipped
(see Background above).

### Decisions

- **`hasLoggedAnything` no longer counts a same-day category log.** The pre-Task-3 code checked
  `habitSummary.loggedCount > 0`, a genuinely today-scoped count the backend computed specially for
  Habit. No equivalent "categories logged today" count exists in the generic `/api/dashboard`
  response (categories were never summarized this way, and Task 2's plan didn't add one) -
  `recentEntries` alone can't safely substitute, since it's the N most recent entries *overall*,
  not bounded to today, so treating "a category appears in recentEntries" as "logged today" would
  wrongly count something logged days ago. Accepted consequence: a user who logs *only* a category
  today and nothing else sees the "Nothing logged yet today" empty state instead of a technically-
  more-accurate summary line - a narrow, deliberately-chosen gap rather than a wrong finding, and
  one to revisit if/when a real "any category logged today" signal is added to the dashboard
  response.
- **No replacement toggle for former habits**, confirmed by the Phase 17 plan itself: since
  `Habit.userId` was never nullable, every migrated habit is already a personal category a user can
  archive individually - a whole-type toggle would be solving a problem that no longer exists once
  "Habit" stops being one fixed thing and becomes N independent categories.

### Verification

- `npx tsc -b`, `npm run build`: clean.
- `npx vitest run` (frontend): full suite green - 278 tests across 36 files (up from 265 across
  30 files pre-Task-3, net of the 6 deleted Habit-specific test files and several tests
  converted/added in their place).
- `npm run lint` (oxlint), `npx prettier --check .`: clean (two pre-existing, unrelated formatting
  warnings in `e2e/trends-after-seeding.spec.ts`/`BottomNav.tsx` predate this task and were left
  alone, out of scope).
- Manual, real-browser verification (Playwright driving a real Chromium instance against a real
  running backend + frontend dev server, not just the automated suite): to get a backend whose
  schema actually matches Task 2's migrated local database (this branch's own backend still has
  pre-Task-2 code, since Task 2 hasn't merged yet), Task 2's branch was checked out into a separate
  git worktree and run there on port 4000, with this branch's frontend dev server on port 5173
  pointed at it - the same two-process setup the real deployed app uses, just both halves sourced
  from their own not-yet-merged branches. Confirmed end-to-end: registered a fresh account; logged
  a mood entry and a boolean category entry ("Exercise") via `CategorySection`'s own "Add category
  entry" button; Dashboard's summary line rendered three clauses with no crash (`Mood: 5/5 ·
  Symptoms: 0 logged · Medications: 0/0 taken`) and Recent entries showed both; History showed
  "Exercise: Done" under a `CATEGORY` label; Settings' Built-in categories list showed exactly
  three toggles (no Habits row); on a mobile viewport (412×915, matching `BottomNav`'s `md:hidden`
  breakpoint), Quick Add's menu showed Mood/Symptom/Medication/More… (no Habit item), and tapping
  "More…" opened the generic category-log dialog pre-populated with "Exercise". Screenshots
  captured at each step. Both temporary processes and the worktree were torn down afterward.

---

## 2026-08-25 — Task 4: Backend — Symptom → Category

**Task:** [Phase 17, Task 4](../../Tasks.md#task-4--backend-symptom--category) - migrate every
`Symptom`/`SymptomLog` row into `Category`/`CategoryLog` as SCALE (1-10) categories, then delete
the dedicated Symptom routes/model entirely, mirroring Task 2's own Habit migration.

### Background / concepts

#### Why SCALE, and why 1-10 specifically

Symptom's own `severity` field was always an `Int` validated to the 1-10 range
(`symptomLogs.ts`'s `createSchema`) - the exact shape `Category`'s `SCALE` value type already
exists to express (a bounded 1-N picker, sharing `NUMERIC`'s `valueNumeric` storage column). Every
migrated symptom becomes a `SCALE` category with `scaleMin: 1, scaleMax: 10` fixed - not a
per-symptom choice, since every symptom used the identical hardcoded range before this migration
too.

#### A genuine, deliberate behavior change: one combined chart becomes N independent ones

Before this task, `trends.ts` computed a single `symptomSeverity` series/average across *every*
symptom log a user had, regardless of which symptom it was logged against - one combined "Symptom
Severity" chart. After migration, each symptom (system or personal) is its own independent SCALE
category, so it gets its own independent chart through the already-generic `categoryTrends` array,
the same way any other numeric/scale category does. A user tracking both "Headache" and "Joint
pain" now sees two separate lines instead of one blended average - a real, visible change to
Trends, accepted as the natural consequence of symptoms becoming genuinely independent categories
rather than instances of one fixed "Symptom" type. (Mirrors the same kind of accepted UX change
flagged for Task 6's planned Mood split.)

#### Closing the "no admin route for Symptom" gap for free

Symptom never had an admin-only management route - system symptoms only ever came from
`prisma/seed.ts`, with no way to add, rename, or retire one without a direct database edit. Once
migrated, every former system symptom is an ordinary system category (`userId: null`), immediately
manageable through the already-existing `adminCategories.ts` (`GET`/`POST /api/admin/categories`,
`PATCH`/`DELETE /api/admin/categories/:id`) with zero new admin code - the same "closes a
pre-existing gap for free" pattern Task 2 hit for Habit's own missing admin support (there Habit
never needed one, since every habit was already personal; here Symptom did need one, and now has
it).

### What was done

- **`backend/prisma/schema.prisma`**: deleted `Symptom`, `SymptomLog` entirely; removed
  `symptomEnabled`/`symptoms`/`symptomLogs` from `User`; removed `SYMPTOM` from `ReminderTarget`;
  updated cross-referencing comments (`CategoryValueType`, `Category`, `CategoryLog`,
  `ReminderTarget`) that pointed at Symptom as if it were still a live sibling model.
- **Migration** (`symptom_to_category`, hand-written like `habit_to_category`): copies every
  `symptoms` row into `categories` (reusing the same `id`, `description` carried across verbatim,
  `value_type` fixed to `SCALE`, `scale_min`/`scale_max` fixed to `1`/`10`), copies every
  `symptom_logs` row into `category_logs` (same `id`, `symptom_id` landing directly as
  `category_id`, `severity` cast to `value_numeric` via `::float`), deletes any existing
  `SYMPTOM`-target reminder, rebuilds the `reminder_target` enum without `SYMPTOM`, then drops
  `symptom_logs`, `symptoms`, and `users.symptom_enabled`.
- **Deleted**: `backend/src/routes/symptoms.ts`, `symptomLogs.ts`, and their test files; unmounted
  both routers from `app.ts`.
- **`lib/reminderTarget.ts`**/**`lib/reminderScheduler.ts`**: removed `"symptom"` from the API
  target list, `CATEGORY_LEVEL_TARGETS`, and both switch statements (`reminderCopy`,
  `hasLoggedTarget` - `GENERAL`'s own check is now a 3-way, not 4-way, `Promise.all`).
- **`routes/users.ts`**/**`routes/auth.ts`**: removed `symptomEnabled` from the update schema,
  profile selection, toggle-target map, and `serializeUser`.
- **`routes/dashboard.ts`**: removed `symptomCount` and its dedicated query/streak-lookback
  slot/recent-entries branch entirely - a former symptom's today-status now surfaces exactly the
  way any other category's does.
- **`routes/history.ts`**: removed the dedicated `"symptom"` `HISTORY_TYPE` and its inline label
  builder - the already-generic `formatCategoryLogValue` branch covers it.
- **`routes/export.ts`**: removed the dedicated `symptoms`/`symptomLogs` fields - former-symptom
  data (personal ones; system ones are still deliberately excluded, same as before) now flows
  through the existing generic `categories`/`categoryLogs` fields Task 2 already added.
- **`routes/trends.ts`**: removed the dedicated `symptomSeverity` series/average computation and
  its own `symptomLogs` query/bucket entirely (see Decisions below for the resulting behavior
  change) - every migrated symptom category flows through the existing generic `categoryTrends`
  array, which already handles `SCALE` types.
- **Tests**: `dashboard.test.ts`, `export.test.ts`, `history.test.ts`, `reminders.test.ts`,
  `trends.test.ts`, `users.test.ts` updated wherever they exercised symptom-specific code paths or
  asserted on a "four" count that's now three; `symptoms.test.ts`/`symptomLogs.test.ts` deleted
  outright (superseded by `categories.test.ts`/`categoryLogs.test.ts`'s own coverage plus
  `adminCategories.test.ts`'s coverage of what used to be seed-only). `trends.test.ts`'s old
  combined-symptom-averaging test was ported onto `categoryTrends` (a new
  "computes per-day averages... for a scale category" test) rather than being lost, and its old
  per-category-series test was changed from a bare `toHaveLength(1)` assertion to a `.find()` by
  `categoryId`, since every migrated system symptom (14 of them, in the shared local dev database)
  now legitimately shows up in every user's own `categoryTrends` alongside their own category.

### Why it's needed

Symptom was already structurally close to Category (nullable `userId` for system-vs-personal,
`Restrict` on delete - Category literally copied this pattern originally) but duplicated
Category's own machinery for no behavioral benefit, while genuinely lacking things Category already
had for free (an admin route, a description field, per-user hiding).

### Decisions

- **The combined "Symptom Severity" chart splits into N independent per-symptom charts** - stated
  plainly above since it's the one place behavior visibly changes for an existing user with several
  symptoms tracked. Accepted as the correct consequence of "a symptom is now a category, and every
  other category already gets its own independent chart," not something to special-case around.
- **`symptomEnabled` is retired, not preserved** - matching Habit's own precedent from Task 2, and
  confirmed directly in this plan's own Task 1 context: a former symptom is a system-or-personal
  category now, hidden per-row via the `HiddenCategory` mechanism (Task 1) rather than gated by one
  blunt whole-type toggle. The frontend side of this (removing the toggle, adding the per-row
  Hide/Unhide UI) is Task 5, merged into this same branch before this PR was opened - see that
  task's own entry below for why, and Task 2/3's own entries for the precedent this follows.
- **`SYMPTOM`-target reminders are dropped, not remapped** - identical reasoning to Task 2's
  `HABIT` target: a user with several symptoms has no single unambiguous destination category for
  an old symptom-level reminder.

### Verification

- Migration verified against real before/after data: 14 symptoms / 41 symptom logs before;
  categories grew by exactly 14 (28 -> 42) and category_logs grew by exactly 41 (22 -> 63) after;
  spot-checked several migrated rows across both system (`userId: null`, e.g. "Anxiety", "Brain
  fog" - description correctly carried over) and personal symptoms (three separate users' own
  "Headache" symptoms, each becoming its own independent category with the correct owner
  preserved); confirmed every migrated category is `SCALE` with `scaleMin: 1, scaleMax: 10`;
  confirmed a sample of migrated logs carried `severity` into `valueNumeric` correctly (e.g. `8`,
  `6`, `6`) with `valueBoolean`/`valueDurationMinutes` both `null`; confirmed the `reminder_target`
  enum no longer contains `SYMPTOM`; confirmed `users.symptom_enabled` no longer exists.
- `npm test` (backend): full suite green - 240 tests across 22 files (down from 265/24 pre-task,
  net of the two deleted Symptom-specific test files and the tests converted/added in their
  place).
- `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `npx prettier --check .`: all clean.
- See Task 5's own entry below for the combined manual/real-browser verification pass, done once
  the frontend fix was merged into this same branch (same reasoning as Task 2/3: this migration
  alone, without Task 5, would crash the live Dashboard the same way Task 2 alone did before Task 3
  merged in - see that task's own entry for the exact failure mode).

---
