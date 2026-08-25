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
