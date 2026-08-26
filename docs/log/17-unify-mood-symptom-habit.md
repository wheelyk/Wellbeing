# Unify Mood, Symptom, and Habit into the Generic Category Model

## 2026-08-25 — Task 1: per-user system-category hiding

**Task:** [Phase 17, Task 1](../../Tasks.md#task-1--backend-per-user-system-category-hiding) - the
foundation this whole phase's later data migrations depend on: a per-user way to hide a _system_
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
only genuine remaining gap is a category a user _can't_ archive because they don't own it - a
system category (`userId: null`) - which is exactly Symptom's 8 seeded system symptoms and Mood's
new Mood/Energy/Stress categories once they exist. So this task builds the smaller, more precisely
targeted thing: hide/unhide for system categories only, not a universal replacement mechanism.

#### `GET /api/categories`'s two audiences need two different defaults

Dashboard/Quick Add want a hidden category to genuinely disappear - that's the whole point of
hiding it. But Settings' own category-management list (`CategoriesSection`, wired up in Task 3/5)
needs to show a hidden category _with an Unhide action_, or hiding would be a one-way trip with no
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

`prisma migrate dev` diffs the schema and generates SQL for the _shape_ change (new/dropped
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
`HabitLog.habitId` needs to become `CategoryLog.categoryId`, pointing at the _new_ row, not the
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
  never included Category/CategoryLog data of any kind before this task, for _any_ category, not
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
backend/frontend split wasn't: Phase 16 generalized reminders _additively_ (old and new endpoints
coexisted for a transition window), so either half could merge first without breaking the other.
Task 2 is destructive instead - it deletes `/api/habits`, `/api/habit-logs`, and
`habitSummary`/`habitEnabled` outright. Verifying Task 2 in isolation (its own PR's CI) surfaced
this directly: with Task 2's backend running and the _old_ (pre-Task-3) frontend still pointed at
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
  `recentEntries` alone can't safely substitute, since it's the N most recent entries _overall_,
  not bounded to today, so treating "a category appears in recentEntries" as "logged today" would
  wrongly count something logged days ago. Accepted consequence: a user who logs _only_ a category
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

Before this task, `trends.ts` computed a single `symptomSeverity` series/average across _every_
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
- **A real gap this local verification missed, caught by CI**: `prisma/seed.ts` (the script that
  seeds the 8 system symptoms into a fresh database) still called `prisma.symptom.create` -
  `tsc --noEmit` doesn't catch this, since `backend/tsconfig.json`'s `include` is `["src"]` only,
  and `prisma/seed.ts` lives outside it (`ts-node` compiles it directly when actually run,
  bypassing that same `include` restriction). The shared local dev database this task's other
  verification ran against had already been migrated mid-development, so `npx prisma db seed`
  never got exercised against it in a way that would have surfaced this. CI's own fresh-database
  e2e job did exercise it, and failed immediately with `TSError: Property 'symptom' does not exist
on type 'PrismaClient'` - a real, useful catch. Fixed by seeding the same 8 rows as `SCALE`
  (1-10) categories instead (`prisma.category.create`, `userId: null`), matching exactly how the
  migration itself maps a `Symptom` onto `Category`; re-verified by running `npx prisma db seed`
  directly against the local dev database (idempotent no-op there, since it already has all 8 from
  the migration) and by the full backend suite staying green afterward. The genuine fresh-database
  create path itself is what CI's own re-run (after this fix) proves, not something this local
  environment could independently confirm without disturbing the shared dev database's existing
  rows.
- See Task 5's own entry below for the combined manual/real-browser verification pass, done once
  the frontend fix was merged into this same branch (same reasoning as Task 2/3: this migration
  alone, without Task 5, would crash the live Dashboard the same way Task 2 alone did before Task 3
  merged in - see that task's own entry for the exact failure mode).

---

## 2026-08-25 — Task 5: Frontend — Symptom retirement

**Task:** [Phase 17, Task 5](../../Tasks.md#task-5--frontend-symptom-retirement) - remove every
frontend trace of the dedicated Symptom UI now that its backend is gone (Task 4, on its own
branch - see that task's own entry for the migration this depends on), and add the per-row
Hide/Unhide action to Settings' Categories list - this is what actually replaces the old blunt
`symptomEnabled` toggle for the 8 former system symptoms.

### Background / concepts

#### Why this task, again, had to land carefully relative to Task 4

Same coupling as Task 2/3: Task 4's backend migration is destructive (deletes
`/api/symptoms`/`/api/symptom-logs`, drops `symptomCount`/`symptomEnabled` from the dashboard/
profile responses entirely). Verifying Task 4 alone would reproduce the exact same
`DashboardSummary.tsx` crash Task 2 did (`data.symptomCount > 0` isn't a direct property-access
crash on its own, but `SymptomSection`'s own two now-404ing fetches, and `symptomEnabled` simply
vanishing from every response, would still break the page in the same class of way) - so Task 5
is merged into Task 4's own branch before that PR is opened, exactly as Task 2/3 were, and this
task's own manual verification pass covers both together.

### What was done

- **Deleted**: `SymptomEntryForm.tsx` (including its inlined "add a symptom" mini-flow, superseded
  by the already-separate `CategoryCreateForm.tsx`) and `SymptomSection.tsx`, plus their test
  files.
- **`AuthContext.tsx`**: removed `symptomEnabled` from `AuthUser`.
- **`DashboardPage.tsx`**: removed the `SymptomSection` import/render and every `symptomEnabled`
  prop pass-through - no replacement toggle, per the plan's own decision (see Task 1's entry): a
  former symptom is a system-or-personal category, hidden per-row or archived like any other.
- **`QuickAddFab.tsx`**: removed the dedicated "Symptom" menu item and `symptomEnabled` prop/
  filter - logging a former symptom now goes through the existing "More…" entry, same as any
  custom category.
- **`DashboardSummary.tsx`**: removed `symptomCount` from the fetched-data interface, the
  `"symptom"` `RecentEntry` type/icon, and the `symptomEnabled`-gated summary clause.
- **`historyLogApi.ts`/`HistoryEditModal.tsx`/`HistoryPage.tsx`**: removed the `"symptom"`
  `HistoryEntryType`/`fetchSymptomLog`/`fetchSymptoms`/`symptomLabel` and the modal's dedicated
  `SymptomEntryForm` branch - a former symptom's entries flow through the already-generic
  `"category"` branch/`categoryValueLabel`/`categoryLabel` in each of these files.
- **`ReminderCreateForm.tsx`**: removed `"symptom"` from `ReminderTarget` and its target-picker
  option - matches Task 4's backend already rejecting it.
- **`TrendsPage.tsx`**: removed the dedicated "Symptom Severity" chart section entirely (and its
  now-unused `symptomSeverity` field/`SYMPTOM_CHART_COLOR`) - every migrated symptom flows through
  the existing generic `categoryTrends` loop instead, each getting its own independent chart (see
  Task 4's own entry on this deliberate behavior change).
- **`SettingsPage.tsx`** (the actual new functionality this task adds, not just cleanup):
  - `CategoriesSection` now fetches `GET /api/categories?includeHidden=true` (Task 1's own
    contract) instead of the plain default list, so a hidden system category still shows up here
    (with an Unhide action) rather than disappearing with no way back.
  - Added `handleHide`/`handleUnhide`, calling Task 1's `POST`/`DELETE /api/categories/:id/hide`,
    offered only for a system category (`!isOwn`) - a personal category is archived instead, same
    as before.
  - Each system category row now shows a "Hidden" badge alongside the existing "Built-in" one when
    `category.hidden` is true, and its action button toggles between "Hide"/"Unhide" accordingly.
  - Removed `symptomEnabled` from `UserProfile`/`CategoryToggles`/`TOGGLE_ITEMS` and every
    profile-fetch/save call site, matching Habit's own precedent from Task 3.
- **Copy text**: updated every user-facing string that listed "symptoms" as a separate thing
  alongside mood/medications (`SettingsPage.tsx`'s categories/export/delete-account sections,
  `HistoryPage.tsx`, `ActivityCalendar.tsx`, `AdminCategoriesPage.tsx`, `CategorySection.tsx`,
  `RatingScale.tsx`) to instead read "categories" or describe former symptoms as system categories.
- **Tests**: `DashboardPage.test.tsx`, `DashboardSummary.test.tsx`, `QuickAddFab.test.tsx`,
  `HistoryPage.test.tsx`, `TrendsPage.test.tsx`, `ActivityCalendar.test.tsx` updated wherever they
  exercised symptom-specific UI; `historyLogApi.test.ts`'s `symptomLabel` test removed (no
  replacement needed - `categoryLabel`'s own coverage already exercises the identical shape).
  `SettingsPage.test.tsx` gained three new tests for the Hide/Unhide mechanism itself (hides a
  system category and shows the Hidden badge/Unhide button; unhides one; never offers Hide/Unhide
  for the user's own category) - genuinely new functionality, not just a migration of existing
  coverage. `TrendsPage.test.tsx`'s "collapses each chart section independently" test was ported
  onto a `categoryTrends` entry standing in for the now-gone Symptom Severity section, so the
  underlying "collapsing one section doesn't affect another" behavior stayed covered.

### Why it's needed

Task 4 already deleted every backend endpoint the old Symptom-specific frontend code called -
leaving it in place would have been a guaranteed runtime break the moment Task 4's backend
shipped, the same class of problem Task 2 caused for Habit before Task 3 landed.

### Decisions

- **Hide/Unhide is the actual replacement for `symptomEnabled`, not a like-for-like toggle** -
  confirmed directly in the plan's own Task 1 context: the 8 former system symptoms are no longer
  one fixed thing a single boolean can gate, so each is hidden independently instead, matching how
  Habit's own whole-type toggle was replaced by per-category archiving in Task 3.
- **The dedicated "Symptom Severity" chart is not replaced with anything bespoke** - every migrated
  symptom already gets its own chart via the generic `categoryTrends` array (Task 4's own
  decision), so Task 5's frontend work here was pure deletion, not a new chart to build.

### Verification

- `npx tsc -b`, `npm run build`: clean.
- `npx vitest run` (frontend): full suite green - 260 tests across 34 files (up from 240/24
  post-Task-4-equivalent-frontend-state, net of 2 deleted Symptom-specific test files, several
  tests converted, and 3 new Hide/Unhide tests added).
- `npm run lint` (oxlint), `npx prettier --check .`: clean (two small pre-existing, unrelated
  warnings - a `vite.config.ts` triple-slash-reference lint note and a `BottomNav.tsx` formatting
  nit - predate this task and were left alone, out of scope).
- **A second real gap, found only once PR #130's own CI ran the e2e suite against a genuinely
  fresh database** (the same class of blind spot as `prisma/seed.ts` above, but this time in
  `frontend/e2e/`): `quick-add-and-dashboard.spec.ts` still drove a "Symptom" Quick Add menu item
  that Task 5 deleted (`QuickAddFab.tsx` no longer has one - former symptoms are logged through
  the generic "More…" entry now, like any other category), and asserted a "Symptoms: N logged"
  Dashboard summary clause that no longer exists. `trends-after-seeding.spec.ts` seeded data
  through the since-deleted `/api/symptoms`/`/api/symptom-logs` endpoints and asserted a fixed
  "Symptom Severity" chart title that Task 4 already replaced with one generic chart per category.
  Neither is caught by `tsc`/`vitest` - both are plain Playwright specs the frontend's own
  component-test run never executes, so nothing short of actually running the e2e suite (or CI's
  own `e2e` job) would have surfaced this. Fixed by rewriting both specs against the generic
  category API/UI: `quick-add-and-dashboard.spec.ts` now creates two personal categories via
  "More…" → "+ Add a new category" (a scale-typed one standing in for a former symptom, a
  boolean-typed one standing in for a former habit) rather than assuming either has a dedicated
  menu item, and its summary-line assertion now expects just the two remaining clauses (Mood,
  Medications); `trends-after-seeding.spec.ts` now creates its own named scale category via
  `POST /api/categories` and seeds `/api/category-logs` against it, asserting that category's own
  chart title rather than a fixed "Symptom Severity" one. Also worth noting as a real discovery
  along the way: a brand-new account is never actually at 0 categories in this app - the 8 seeded
  system categories (former system symptoms) are visible to every user from registration onward,
  so "More…" always opens straight into "Log an entry," never "Create your first category"; the
  original pre-Task-4 test's assumption of an empty-categories first run no longer holds and the
  rewritten spec accounts for this. Verified by actually running the full e2e suite locally
  (`backend` built and started with `NODE_ENV=test`, `frontend` built and served via `vite
preview`, `npx playwright test` from `frontend/`) - all 4 specs green. One environmental false
  positive was diagnosed and ruled out along the way: an initial local run hit the real
  `authRateLimiter` (register got `429`s) despite `NODE_ENV=test` being intended to skip it in this
  app's own middleware - traced to the backend process itself not actually inheriting that env var
  the way it was first started (a shell-backgrounding quirk, confirmed by probing `/api/register`
  directly with `curl` and seeing `429`s even though the intent was to skip the limiter);
  restarting the backend with the env var properly applied made the rate limiter correctly skip
  as designed, and the full suite passed cleanly, including the two rewritten specs.
- **A third instance of the same class of gap**, this time in CI's separate `screenshots` job
  (`.github/workflows/pr-preview.yml`, `frontend/scripts/capture-pr-screenshots.mjs`): a plain
  driver script (not a Vitest/Playwright test - nothing in this repo's own test suites ever
  executes it), still clicked an "Add symptom entry" button that no longer exists and assumed
  "Add category entry" opens an empty "Create your first category" state - the same two now-stale
  assumptions just fixed in the e2e specs above, independently duplicated in this third place.
  Fixed the same way: dropped the dedicated symptom step, and changed the category step to open
  via "Log an entry" -> "+ Add a new category" instead of assuming an empty-categories start.
  Verified by actually running the script locally end-to-end (`SCREENSHOT_DIR=... node
scripts/capture-pr-screenshots.mjs` against the same locally-built backend/frontend used for the
  e2e suite above) and inspecting the resulting `04-dashboard-functioning-with-entries.png`
  directly - confirmed it shows Mood 5/5, Ibuprofen — Taken, and Exercise: Done all present, not
  just that the script exited zero.
- Manual, real-browser verification (Playwright driving a real Chromium instance against a real
  running backend + frontend dev server): Task 4's branch was checked out into a separate git
  worktree and run there on port 4000 (this branch's own backend still has pre-Task-4 code, since
  Task 4 hasn't merged yet), with this branch's frontend dev server on port 5173 pointed at it -
  the same pairing approach Task 3's own verification used. Confirmed end-to-end: registered a
  fresh account; logged a mood entry and a category entry against "Headache" (a migrated system
  symptom, scale 1-10) via `CategorySection`; Dashboard's summary line rendered `Mood: 5/5 ·
Medications: 0/0 taken` with no crash, and Recent entries showed both; Trends rendered one
  independent chart per former system symptom (Anxiety, Brain fog, Depression, Fatigue, Headache,
  Insomnia, Joint pain, Nausea), with Headache's own chart correctly showing `Avg: 6.0` from the
  just-logged entry - not one combined "Symptom Severity" chart; Settings' Built-in categories
  list showed exactly two toggles (Mood, Medications - no Symptoms row), and the Categories list
  showed all 8 former system symptoms tagged "Built-in" with a "Hide" action each; clicking Hide on
  "Anxiety" showed a "Category hidden." confirmation, added a "Hidden" badge next to it, and
  swapped its action to "Unhide." Screenshots captured at each step. History's own equivalent pass
  hit this app's own documented `authRateLimiter` (10 requests per 15 minutes per IP - see
  `docs/log/01-auth-backend.md`) after several repeated verification registrations in quick
  succession; the already-captured Dashboard/Trends/Settings evidence above was judged sufficient
  without re-running it. Both temporary processes and the worktree were torn down afterward.

---

## 2026-08-25 — Task 6: Backend — Mood → Category (Mood/Energy/Stress)

**Task:** [Phase 17, Task 6](../../Tasks.md#task-6--backend-mood--category-moodenergystress) -
the last and structurally hardest of the three migrations: unlike Habit and Symptom, Mood has no
existing per-user "definition" row to copy, and one `MoodLog` row carries up to three values at
once (`mood` required, `energy`/`stress` optional) - fundamentally incompatible with `CategoryLog`'s
"exactly one populated value column per row" shape. Confirmed with the project owner before this
plan was finalized: Mood splits into three independent system categories - Mood (1-5), Energy
(1-7), Stress (1-7) - each logged separately, rather than adding a compound-value mechanism to
`Category` for this one case.

### Background / concepts

#### Why three brand-new system categories, not three migrated ones

Habit and Symptom each had an existing per-row "definition" (a `Habit`/`Symptom` row) whose `id`
the migration could reuse directly for the destination `Category` row - a clean 1:1 copy. Mood has
no such row: every `MoodLog` entry stands alone, with no parent `Mood` table to migrate from. So
this migration's first step is different in kind, not just detail - it _creates_ three new system
categories from nothing, with fixed ids chosen up front (three real, freshly generated UUIDs) so
the rest of the migration can reference them directly without a lookup step.

#### Splitting one row into up to three, and where `notes` goes

A `MoodLog` row's `mood` is always populated; `energy`/`stress` are each independently optional.
Migrating this onto three separate `CategoryLog` rows (one per new category) means each source row
produces between one and three destination rows, sharing the same `loggedAt` but never the same
`id` - unlike Habit/Symptom's clean 1:1 copies (which could safely reuse the source row's own
`id`), a 1:many split needs a freshly generated id per destination row instead. The other genuine
design decision: a source row's own `notes` attaches only to the Mood-value row, not duplicated
across all three - three near-identical notes on three separate History lines would read stranger
than a single note living wherever it obviously "belongs" (the primary value, which was always
already required). This is a real, visible, and permanent behavior change for every already-logged
mood check-in with notes: History used to show one combined line ("Mood 4/5 · Energy 6/7 · Stress
2/7", the note attached to that one line); after this migration it's up to three independent lines
at the same timestamp, and only the Mood one carries the note. Accepted directly as this plan's own
stated consequence of choosing full genericity over today's single-check-in UX.

#### The one deliberate exception to drop-and-reconfigure

Every other retired target (`HABIT`, `SYMPTOM`) had its own existing reminders simply deleted by
that migration - a user with several habits or symptoms has no single, unambiguous category a
stray `HABIT`/`SYMPTOM`-target reminder could be remapped onto, so drop-and-reconfigure was the
only honest option both times. `MOOD` is different in a way that matters: there was always at most
one `MOOD`-target reminder per user (it was a category-level target, like `GENERAL`), and there is
now exactly one obvious destination once Mood becomes a category - the new system Mood category
this same migration creates. So this migration remaps an existing `MOOD`-target reminder to a
`CATEGORY`-target reminder pointing at that category, rather than deleting it - the one place in
this whole phase where "drop and let the user reconfigure" was deliberately not the right call.

### What was done

- **`backend/prisma/schema.prisma`**: deleted `MoodLog` entirely; removed `moodEnabled`/`moodLogs`
  from `User`; removed `MOOD` from `ReminderTarget` (now just `GENERAL`/`MEDICATION`/`CATEGORY`);
  updated cross-referencing comments that pointed at Mood as if it were still a fixed built-in with
  its own dedicated pieces.
- **Migration** (`mood_to_category`, hand-written like the two migrations before it, but the first
  of the three to create brand-new category rows rather than copy existing ones): inserts three
  system categories (`fa29404f-...` Mood 1-5, `16ed42bd-...` Energy 1-7, `e76ae50d-...` Stress
  1-7 - fixed ids chosen up front so later statements can reference them directly); splits every
  `mood_logs` row into up to three `category_logs` rows via three separate `INSERT ... SELECT`
  statements (Mood unconditional, Energy/Stress each gated by `WHERE energy/stress IS NOT NULL`),
  each destination row getting its own `gen_random_uuid()` rather than reusing the source row's id
  (see Background above for why this is genuinely different from Habit/Symptom's own migrations),
  `notes` carried only onto the Mood-value `INSERT`; remaps any existing `MOOD`-target reminder to
  `CATEGORY` pointing at the new Mood category (must run before the enum is narrowed - no row may
  still hold `'MOOD'` once the column is cast onto the replacement type); rebuilds the
  `reminder_target` enum without `MOOD` (same rename-recreate-cast-drop workaround Postgres always
  needs for removing an enum value); drops `mood_logs` and `users.mood_enabled`.
- **Deleted**: `backend/src/routes/moodLogs.ts` and its test file; unmounted from `app.ts`.
- **`lib/reminderTarget.ts`**/**`lib/reminderScheduler.ts`**: removed `"mood"` from the API target
  list and `CATEGORY_LEVEL_TARGETS` (now just `["general"]`), and the `MOOD` case from both switch
  statements (`reminderCopy`, `hasLoggedTarget` - `GENERAL`'s own check is now a 2-way, not 3-way,
  `Promise.all`, since a logged Mood/Energy/Stress entry is just a `CategoryLog` row now).
- **`routes/users.ts`**/**`routes/auth.ts`**: removed `moodEnabled` from the update schema, profile
  selection, toggle-target map (now just `{ medicationEnabled: ReminderTarget.MEDICATION }`), and
  `serializeUser`.
- **`routes/dashboard.ts`**: removed the dedicated `latestMood` query and `mood` response field
  entirely, and the `"mood"` `RecentEntryType`/merge branch - a logged Mood/Energy/Stress entry now
  flows through the same generic category paths every other category already uses, exactly as
  Habit and Symptom did before it.
- **`routes/history.ts`**: removed the dedicated `"mood"` `HISTORY_TYPE` and its `moodLabel`
  builder - the already-generic `formatCategoryLogValue` branch covers it (as three independent
  lines per former check-in, per the Background section above).
- **`routes/export.ts`**: removed the dedicated `moodLogs` field - former-mood data now flows
  through the existing generic `categories`/`categoryLogs` fields.
- **`routes/trends.ts`**: removed the dedicated `moodSeries`/`moodAverage` computation and its own
  `moodLogs` query/bucket entirely - Mood, Energy, and Stress each flow through the existing
  generic `categoryTrends` array as three independent SCALE-category charts, the same fold-in every
  migrated symptom already went through in Task 4.
- **Tests**: `dashboard.test.ts`, `export.test.ts`, `history.test.ts`, `reminders.test.ts`,
  `trends.test.ts`, `users.test.ts` updated wherever they exercised mood-specific endpoints/fields,
  or used `target: "mood"` as a stand-in category-level reminder target (switched to `"general"`,
  the only category-level target left). `trends.test.ts`'s dedicated "for mood" averaging test was
  deleted outright as fully redundant once mood became an ordinary scale category - the existing
  "for a scale category, weighted by individual logs" test already covers the identical
  computation. `moodLogs.test.ts` deleted outright (superseded by `categories.test.ts`/
  `categoryLogs.test.ts`'s own coverage).

### Why it's needed

Closes the last of the three retirements this phase set out to do - Mood was the one genuine
outlier (no definition row, a multi-value log shape), and this migration is the proof that even
that shape fits into the generic model with a deliberate, disclosed reshape (the up-to-three-rows
split) rather than needing a permanent special case.

### Decisions

- **Three brand-new system categories with fixed, pre-chosen ids**, not a lookup-by-name step in
  the migration itself - matches the same "reference a known id directly" pattern Habit/Symptom's
  migrations used, just starting from creation instead of a copy.
- **`notes` lands only on the Mood-value row.** A three-way duplicate would read stranger in
  History than a single note attached to the one value that was always required; this is a real,
  disclosed change to how an old check-in's own note displays, not an oversight.
- **Each destination row gets its own freshly generated id**, rather than reusing the source
  `mood_logs` row's id the way Habit/Symptom's own migrations did - a real, unavoidable difference
  forced by the 1:many split (up to three destination rows per source row), not an inconsistency.
- **`MOOD` is remapped, not dropped**, as the sole deliberate exception to this phase's own
  drop-and-reconfigure precedent - justified specifically because exactly one unambiguous
  destination category exists, which was never true for `HABIT`/`SYMPTOM`.

### Verification

- **Real before/after row counts and spot-checked values** against the shared local dev database:
  94 `mood_logs` rows before -> 49 categories became 52 (+3), 75 `category_logs` became 170 (+94
  Mood +1 Energy +0 Stress, matching this dev database's own real `energy`/`stress` null counts
  exactly). Hand-verified two specific rows end to end: a `mood: 4, energy: 5, stress: null` row
  produced exactly two `category_logs` rows (Mood `valueNumeric: 4`, Energy `valueNumeric: 5`, both
  `notes: null`, same `loggedAt`); a `mood: 1, notes: 'Refactor verification note'` row produced
  exactly one `category_logs` row with the note correctly carried onto it.
- **A dedicated, from-scratch test of the one case the shared dev database couldn't exercise**: the
  dev database had zero `MOOD`-target reminders, so the remap step's actual behavior was otherwise
  unverified. Built a throwaway Postgres database (`welltrack_migration_test`), applied every
  migration up to (but not including) this one, hand-inserted a user with two `mood_logs` rows
  (one with both `energy`/`stress` set, one with neither) and one `MOOD`-target reminder directly
  via raw SQL matching the pre-migration schema, then applied this migration alone and inspected
  the result directly (via `pg`, bypassing Prisma entirely so the check couldn't share any blind
  spot with the code under test): the reminder now reads `target: 'CATEGORY', category_id:
'<Mood's id>'`; the two-value row produced three `category_logs` rows (Mood, Energy, Stress) all
  sharing one `logged_at`, with `notes: 'both set'` on the Mood row only and `null` on the other
  two; the one-value row produced a single Mood-only row; `mood_logs` and `users.mood_enabled` were
  both confirmed gone; the `reminder_target` enum was confirmed to contain exactly `GENERAL`,
  `MEDICATION`, `CATEGORY`. The throwaway database was dropped afterward.
- `npm test` (backend): full suite green - 226 tests across 21 files (down from 240/22 pre-Task-6,
  net of `moodLogs.test.ts`'s deletion, the redundant "for mood" trends test's deletion, and every
  other file's mood-specific cases converted to the generic category equivalent).
- `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `npx prettier --check .`: all clean. A
  stale, overly-broad type annotation in `reminderScheduler.test.ts` (a local helper's `target`
  parameter still listed `"MOOD" | "SYMPTOM" | "HABIT"` as valid options, left over uncorrected
  since Tasks 2 and 4) was tightened to the real current enum while in the area, even though no
  test actually constructed a reminder with any of those three stale values.
- Manual, real-backend verification deferred to Task 7's own entry, once the frontend is merged in
  alongside this branch - same reasoning as Tasks 2/3 and 4/5: this migration alone, without
  Task 7, would break the live Dashboard/Trends/Quick-Add the same way Task 2 alone did before
  Task 3 landed (the frontend still calls `/api/mood-logs` and reads `res.body.mood` until Task 7's
  own changes land).

---

## 2026-08-25 — Task 7: Frontend — Mood retirement

**Task:** [Phase 17, Task 7](../../Tasks.md#task-7--frontend-mood-retirement) - the last task in
this phase: delete the dedicated Mood UI, fold what's left of the built-in-category toggles down to
just Medication, and confirm the whole three-model unification (Habit, Symptom, Mood, all into
Category) actually works end to end.

### Background / concepts

#### Why the summary line shrinks to one clause, not zero

Once Mood is gone, `DashboardSummary`'s top line has exactly one built-in left to summarize
(Medications) - Habit and Symptom never had a clause of their own to begin with (see Tasks 3/5),
so this is the last of three clauses to disappear, not a new reduction of its own. The line still
has a real job left to do (Medications' "N/M taken" count is still meaningful and still gates the
friendly empty state), so it stays - it just never had a second clause to keep it company again
once Mood's was removed.

#### `BuiltInCategoriesSection` had nothing left to be its own section for

Once Habit, Symptom, and Mood are all ordinary categories, `BuiltInCategoriesSection` - a whole
`CollapsibleSection`, its own fetch, its own save button - existed only to hold one checkbox
(Medication). Rather than keep a dedicated section around for one control, it moved directly into
`MedicationsSection` as an inline, auto-saving checkbox (no separate "Save" button - see Decisions
below) - the same shape Hide/Unhide already established for a single-action, no-ceremony toggle in
this same phase.

### What was done

- **Deleted**: `frontend/src/components/MoodEntryForm.tsx`/`.test.tsx`,
  `frontend/src/components/dashboard/MoodSection.tsx`/`.test.tsx` - logging Mood/Energy/Stress now
  happens through `CategorySection`/`CategoryEntryForm` like any other category, each showing up as
  its own card since they're independent categories now.
- **`lib/dashboardQuickAddEvent.ts`**/**`lib/dashboardEntryChangedEvent.ts`**: removed `"mood"` from
  both type unions (now just `"medication" | "category"`).
- **`components/dashboard/QuickAddFab.tsx`**: removed the `"mood"` entry from `QUICK_ADD_ITEMS` and
  the `moodEnabled` prop/filter - logging a former mood check-in now goes through the "More…" entry
  like any other category, exactly as Habit's own quick-add entry already did after Task 3.
- **`components/dashboard/DashboardSummary.tsx`**: removed `mood` from `DashboardSummaryData`,
  `"mood"` from `RecentEntry["type"]`/`ENTRY_TYPE_ICON`, and the `moodEnabled`-gated summary clause;
  `hasLoggedAnything` is now just `data.medicationSummary.total > 0`.
- **`pages/DashboardPage.tsx`**: removed the `MoodSection` import/render and every `moodEnabled`
  prop pass-through.
- **`pages/HistoryPage.tsx`**/**`pages/history/historyLogApi.ts`**/**`pages/history/
HistoryEditModal.tsx`**: removed `"mood"` from `HistoryEntryType`/`TYPE_LABELS`/`DELETE_PATH`,
  `fetchMoodLog`/`moodLabel`, and the entire `MoodEntryForm` edit branch - a former mood check-in's
  history entry now resolves through the same generic `CategoryEntryForm` edit path as any other
  category.
- **`pages/TrendsPage.tsx`**: removed the dedicated Mood `CollapsibleSection`/`TrendLineChart` block,
  the `mood` field from `TrendsData`, and `MOOD_CHART_COLOR` - Mood (like Energy and Stress) now
  gets its own independent chart via the same generic `categoryTrends` array every other scale
  category already uses, the identical fold-in Symptom went through in Task 5.
- **`components/ReminderCreateForm.tsx`**: removed `"mood"` from the `ReminderTarget` type and
  `TARGET_OPTIONS` - a former mood reminder is a `"category"`-target reminder now, matching the
  backend's own Task 6 migration.
- **`auth/AuthContext.tsx`**: removed `moodEnabled` from `AuthUser`.
- **`pages/SettingsPage.tsx`**: removed `moodEnabled` from `UserProfile`, `CategoryToggles`,
  `TOGGLE_FIELD_BY_TARGET`/`TOGGLE_FIELD_LABEL`, `reminderTargetLabel`, and every toggle-related
  call site. Deleted `BuiltInCategoriesSection` entirely; its one remaining checkbox
  (`medicationEnabled`) moved into `MedicationsSection` as an instant-save toggle reading/writing
  `AuthContext` directly (see Decisions below), removed from `SettingsPage`'s own render.
- Copy text updated across `HistoryPage.tsx`, `CategorySection.tsx`, `SettingsPage.tsx`,
  `AdminCategoriesPage.tsx`, `ActivityCalendar.tsx`, `TrendsPage.tsx` wherever it named "mood" as a
  still-separate concept, replaced with historically-accurate "now a category too" framing where
  relevant.
- Several component comments still pointed at the now-deleted `MoodEntryForm.tsx`/`MoodSection.tsx`
  as if they were live siblings (`RatingScale.tsx`, `PeriodSelector.tsx`, `DateTimeField.tsx`,
  `MedicationEntryForm.tsx`, `SectionPanel.tsx`, `useTimedMessage.ts`, `MedicationSection.tsx`) -
  updated to point at `CategoryEntryForm`/`CategorySection` instead, the components that actually
  carry this logic now.
- **Tests**: `DashboardSummary.test.tsx`, `QuickAddFab.test.tsx`, `DashboardPage.test.tsx`,
  `HistoryPage.test.tsx`, `historyLogApi.test.ts`, `TrendsPage.test.tsx`, `SettingsPage.test.tsx`,
  `ActivityCalendar.test.tsx` all updated wherever they exercised the retired Mood UI/fields, or
  used `"mood"` as a stand-in type value no longer valid. Two tests in `HistoryPage.test.tsx` that
  specifically exercised editing a multi-field Mood entry (mood/energy/stress in one form) were
  deleted outright, not converted - that scenario doesn't exist anywhere in the app anymore, since
  editing a former mood check-in now goes through the same single-value `CategoryEntryForm` an
  already-existing category-edit test already covers. `SettingsPage.test.tsx`'s "built-in
  categories" describe block was rewritten into a new "medication toggle" block testing the
  relocated inline checkbox instead.

### Why it's needed

Completes the phase: Mood was the last of the three built-ins folded into Category, and this is the
step that actually removes the frontend code paths a user would otherwise still be using instead of
the generic ones - without it, Task 6's backend migration alone would break the live app the moment
it merged (the frontend would still call the now-deleted `/api/mood-logs` and read a `mood` field
the API no longer returns).

### Decisions

- **The Medication toggle saves instantly on click, with no separate "Save" button** - a deliberate
  change from the old `BuiltInCategoriesSection` form (which needed an explicit "Save category
  settings" click for possibly-multiple pending toggle changes). With only one checkbox left,
  batching a save no longer serves a purpose; matches the already-established Hide/Unhide
  interaction pattern (Task 5) for a single, self-contained action.
- **`BuiltInCategoriesSection` is deleted, not just emptied** - a `CollapsibleSection` wrapping a
  single checkbox would be pure ceremony; folding it into `MedicationsSection` (which already
  exists and already needs its own initial data) is the more honest home for it now.

### Verification

- `npx tsc -b`, `npm run build` (frontend): clean. `npx tsc --noEmit`, `npm run build` (backend,
  re-run after the merge below): clean.
- `npx vitest run` (frontend): full suite green - 232 tests across 32 files (down from 260/34
  pre-Task-7, net of `MoodEntryForm.test.tsx`/`MoodSection.test.tsx`'s deletion, the two redundant
  multi-field mood-edit tests' deletion, and every other file's mood-specific cases converted to
  the generic category equivalent).
- `npm run lint` (oxlint), `npx prettier --check .`: clean (same two pre-existing, unrelated
  warnings noted in earlier tasks' entries - a `vite.config.ts` triple-slash-reference note and a
  `BottomNav.tsx` formatting nit - predate this task and were left alone, out of scope).
- Merged `feature/mood-frontend-retirement` into `feature/mood-to-category-backend` (clean merge,
  no conflicts) before any manual verification or PR, applying the lesson from every earlier
  task-pair in this phase directly instead of discovering the break after the fact. Full backend
  (226/21) and frontend (232/32) suites re-run green on the merged branch; both builds clean.
- **Manual, real-browser verification** (Playwright driving a real Chromium instance, mobile
  viewport 412×915 to match `playwright.config.ts`'s own default - `QuickAddFab` only renders inside
  `BottomNav`, which is deliberately `md:hidden`) against the merged branch's real running
  backend + frontend (`NODE_ENV=test` backend on port 4000, `vite preview` frontend on port 5173):
  registered a fresh account; confirmed no "Add mood entry" button anywhere and Quick Add's menu
  showing only "Medication"/"More…"; clicking "More…" opened straight into "Log an entry" (not the
  empty "Create your first category" state) with the system category picker already listing all 11
  system categories including "Mood" (scale 1-5) - confirming a brand-new account sees these from
  registration onward; logged a Mood entry (4/5) via that picker, confirmed it appeared in Recent
  entries as "Mood — 4/5" and in the Categories card as "Mood: 4/5", with the streak correctly
  advancing to 1 day while the top summary line correctly stayed on its "Nothing logged yet today"
  empty-state message (Medications alone gates that line now, and none were logged - an accepted,
  visible consequence of Mood having no clause of its own, not a bug); Settings showed no "Built-in
  categories" section at all, a "Track medications" checkbox (checked) directly inside Medications,
  and the Categories list showing all 11 system categories (Anxiety, Brain fog, Depression, Energy,
  Fatigue, Headache, Insomnia, Joint pain, Mood, Nausea, Stress) each tagged "Built-in" with the
  correct scale range and a "Hide" action; Trends rendered one independent chart per system
  category, with Mood's own chart correctly showing "Avg: 4.0" and a real data point while
  Energy/Stress and every symptom correctly showed "No data yet" - not one combined fixed Mood
  chart; History showed the same entry as "Category / Mood: 4/5" with working Edit/Delete. One
  benign `401` console message (the app's own silent pre-registration session-rehydration attempt,
  the same documented pattern noted in this project's PR-preview screenshot script) was the only
  console output, confirming no real runtime error anywhere in the flow. Screenshots captured at
  each step. Both temporary servers were torn down afterward.
- **A fourth instance of the same class of gap this phase keeps finding**, again in
  `frontend/e2e/` and `capture-pr-screenshots.mjs`: all four of this repo's e2e specs (not just the
  two already fixed for Symptom in Task 4/5) and the PR-preview screenshot script still drove the
  now-deleted "Mood" Quick Add menu item and `MoodEntryForm`/`/api/mood-logs` directly -
  `account-deletion.spec.ts` and `edit-and-delete.spec.ts` had never needed fixing before now, since
  neither exercises Symptom at all, so they were invisible to every earlier check in this phase.
  Found only by actually running the full local e2e suite before pushing (not by CI, this time) -
  `account-deletion.spec.ts`'s own mood-logging step was swapped for a medication one (the test
  itself never cared which type was logged, just that something real existed before deletion);
  `edit-and-delete.spec.ts` - which does genuinely exercise edit/delete, not just setup - was
  converted to log/edit/delete the seeded system Mood category through `CategoryEntryForm`/
  `/api/category-logs` instead of the deleted `MoodEntryForm`/`/api/mood-logs`, asserting on
  `Edit entry`/`Delete this category entry` (the generic modal titles) rather than the
  now-nonexistent `Edit mood entry`/`Delete this mood entry` copy. `quick-add-and-dashboard.spec.ts`
  and `trends-after-seeding.spec.ts` similarly had their own dedicated mood-logging steps converted
  to select the seeded system Mood category from the picker (`trends-after-seeding.spec.ts`
  specifically now resolves that category's id via a real `GET /api/categories` call rather than
  assuming one). Verified by running the full local e2e suite (all 4 specs green) and the
  screenshot script directly (clean run, screenshot inspected directly showing "Mood — 5/5" and
  "Medications: 1/1 taken" with no Mood summary clause) against the merged branch's real backend +
  frontend, the same way the earlier three gaps in this phase were each finally confirmed fixed.

---
