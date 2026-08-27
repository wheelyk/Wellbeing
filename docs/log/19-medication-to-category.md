# Medication → Category, and History filtered by category

## 2026-08-27 — Task 1: Backend — Medication → Category unification

**Task:** [Phase 19, Task 1](../../Tasks.md#task-1--backend-medication--category-unification) -
direct user request: now that Habit, Symptom, and Mood have all unified into Category (Phase 17),
Medication is the one remaining fixed built-in type. Folding it in too means every loggable thing
in this app is now a `Category`, which is also the prerequisite for Task 3/4's own History filter
redesign (filtering by an actual category, not a two-option type split that's meaningless once
there's only one type left).

### Background / concepts

#### Why Medication maps cleanly onto Category, unlike the earlier three unifications

Each of Habit, Symptom, and Mood needed its own bespoke mapping decision (Habit was nearly
identical already; Symptom needed a fixed severity scale generalized into `SCALE`; Mood needed to
split one compound log row into up to three). Medication turns out to be the simplest of all four:
`MedicationLog.taken` is a single boolean, which is exactly `CategoryValueType.BOOLEAN` - the same
shape a former `Habit` already used. The one field with nowhere obvious to go was `dosage` - and
Category already grew a generic `description` field in Phase 17 specifically as "not used by any
built-in category yet, but gives a home to context a category's own name doesn't capture on its
own." A former medication's dosage is exactly that kind of context, so it moves there verbatim
(e.g. `"200mg"`), rather than needing a new column.

#### Why the reminder migration remaps (not drops) - the cleanest case of the four

Habit and Symptom's own migrations *dropped* any existing reminder targeting them, on the
reasoning that there was no single unambiguous destination category for a whole-type reminder.
Mood's migration *remapped* instead, since there was always at most one `MOOD`-target reminder per
user with exactly one destination (the new system Mood category). Medication is actually the
cleanest remap case of all: because each medication becomes its own category (reusing its own id,
the same 1:1 mapping `habit_to_category` used), a `MEDICATION`-target reminder pointing at
`medicationId` X has exactly one correct destination - a `CATEGORY`-target reminder pointing at
`categoryId` X (the same id). No ambiguity, no one-to-many splitting - just a straight
`UPDATE ... SET target = 'CATEGORY', category_id = medication_id`.

### What was done

- **Migration** (`prisma/migrations/20260827090000_medication_to_category/migration.sql`, hand-
  written like every other unification migration in this project - interleaves data migration
  with schema changes in an order `prisma migrate dev` can't infer on its own):
  1. Every `Medication` row becomes a `Category` row, reusing its own id, `valueType = 'BOOLEAN'`,
     `description` = its old `dosage`.
  2. Every `MedicationLog` row becomes a `CategoryLog` row, reusing its own id, `value_boolean` =
     `taken`, `category_id` = the same id Step 1 gave that medication.
  3. Any existing `MEDICATION`-target `Reminder` is remapped to `CATEGORY`, `category_id` =
     `medication_id` (see above for why this is safe and unambiguous).
  4. `medication_logs` and `medications` are dropped; `reminders.medication_id` is dropped.
  5. `MEDICATION` is removed from the `reminder_target` enum (Postgres's rename-recreate-swap
     workaround, same as every earlier enum-shrink migration in this project).
  6. `users.medication_enabled` is dropped.
- **Deleted** `backend/src/routes/medications.ts`, `medicationLogs.ts`, and their test files;
  unmounted both from `app.ts`.
- **Folded Medication out of every route that special-cased it:**
  - `dashboard.ts`: `medicationSummary` (a `{taken, total}` pair) is gone, replaced by a plain
    `loggedTodayCount: number` - an unbounded, user-extensible category set has no fixed "how many
    were there to log today" denominator the way the original built-ins did, so a plain count is
    the honest replacement. `recentEntries` and the streak's lookback query both simplified from a
    two-table merge (medication logs + category logs) down to a single `categoryLog` query.
  - `history.ts`: simplified from a two-table k-way merge down to a single sorted `categoryLog`
    query with a plain `skip`/`take` - the `?type=` filter is dropped entirely here (see Task 3 for
    its replacement, `?categoryId=`).
  - `export.ts`: drops the dedicated `medications`/`medicationLogs` fields - the already-generic
    `categories`/`categoryLogs` fields cover former medications for free.
  - `reminderTarget.ts`: `"medication"` removed from `API_REMINDER_TARGETS`.
  - `reminderScheduler.ts`: the `MEDICATION` case folds into `CATEGORY` in both `reminderCopy` (a
    category's own `description` now supplies the "(2mg)"-style suffix a medication's `dosage`
    used to) and `hasLoggedTarget`; `GENERAL`'s blanket check simplifies from two tables to one.
  - `reminders.ts`: the whole `medicationId`/medication-ownership-check branch is gone from
    `createSchema`, `REMINDER_INCLUDE`, `serializeReminder`, and the `POST /` handler.
  - `trends.ts`: its own separate `medicationLogs` query (used only to mark a day "active") is
    gone - `categoryLogs` already covers every former medication's activity too.
  - `users.ts`: the entire `medicationEnabled` toggle mechanism (`updateSchema`'s field,
    `PROFILE_SELECT`, `TOGGLE_TARGETS`, and the "disable reminders on toggle-off" logic in
    `PATCH /me`) is deleted outright, not just the one field - Medication was the last surviving
    whole-type toggle, so nothing remains to toggle. The equivalent behavior for a category still
    exists via `categories.ts`'s own archive action, which already disables any reminder targeting
    an archived category.
  - `auth.ts`: `serializeUser` (shared by `/login` and `/refresh`) drops `medicationEnabled`.
- **Tests**: `medications.test.ts`/`medicationLogs.test.ts` deleted outright (superseded by
  `categories.ts`/`categoryLogs.ts`'s own existing coverage, same as Habit's own test deletion in
  Phase 17). Every other affected test file (`dashboard.test.ts`, `history.test.ts`,
  `export.test.ts`, `reminders.test.ts`, `reminderScheduler.test.ts`, `trends.test.ts`,
  `users.test.ts`) updated in place - medication-specific setup replaced with an equivalent boolean
  category, and toggle-specific tests removed where the mechanism itself no longer exists.

### Why it's needed

Direct user request, and the prerequisite for Task 3/4's History filter redesign - a two-option
Medication/Category type filter stops making sense the moment there's only one type left.

### Decisions

- **Dosage lives in `Category.description`, not a new column** - reuses Phase 17's own generic
  field exactly as its own comment anticipated, rather than growing the schema further.
- **Reminder migration remaps, not drops** - the cleanest of the four unifications' own reminder
  migrations, since medication-to-category is a genuine 1:1 id-preserving mapping with zero
  ambiguity (see Background above).
- **No medication-specific "fast path" preserved anywhere** - a former medication is logged,
  edited, reminded about, and displayed through exactly the same generic Category machinery as any
  other boolean category, with no special-cased UI or endpoint kept around for it.
- **The `medicationEnabled` toggle mechanism is deleted entirely, not just its one field** -
  Medication was the last remaining whole-type toggle; nothing is left to generalize it into, so
  the mechanism (schema field, `PROFILE_SELECT`, `TOGGLE_TARGETS`, disable-on-toggle-off logic) is
  simply gone. Task 2 removes its remaining frontend traces.

### Verification

- `npm test` (backend): full suite green - 200 tests across 19 files (down from 207/21, reflecting
  the two deleted test files plus several tests removed for a mechanism that no longer exists, not
  a coverage regression - the equivalent behavior is covered elsewhere, noted per-file above).
- `npx tsc --noEmit`, `npx eslint .`, `npx prettier --check .`: all clean.
- Manual, real-database verification (not just "the migration ran without erroring"): ran the
  migration against the local dev database (which already held real medications/medication logs
  and reminders from earlier manual testing sessions), then queried directly via `psql`:
  confirmed `medications`/`medication_logs` tables no longer exist; confirmed every migrated
  `BOOLEAN` category and its logs landed in `categories`/`category_logs` (75 boolean categories,
  73 of their own logs, counts consistent with what existed pre-migration); confirmed every
  `reminders.target` value is now either `GENERAL` or `CATEGORY` - no row was left holding
  `MEDICATION` (which the enum-narrowing step would have failed on if any had survived
  un-remapped).

---

## 2026-08-27 — Task 3: Backend — History filtered by category, not type

**Task:** [Phase 19, Task 3](../../Tasks.md#task-3--backend-history-filtered-by-category-not-type) -
`GET /api/history`'s old `?type=` filter (Medication vs. Category) was already dropped in Task 1,
alongside the two-table merge it existed to choose between - it had nowhere meaningful left to
point once there was only one type. This task adds what actually replaces it: a `?categoryId=`
filter, letting a user isolate one specific category's own history (e.g. just "Ibuprofen," or just
"Reading") instead of the old all-or-nothing type split.

### What was done

- **`history.ts`**: `querySchema` gains an optional `categoryId` field; the main query's `where`
  clause applies it alongside the existing `userId` scope, so an arbitrary or shared system
  category id can never leak another user's data - it just returns however many of the caller's
  own logs match, the identical defense `categoryLogs.ts`'s own Phase 18 `?categoryId=` filter
  already relies on.
- **Tests**: two new tests mirroring `categoryLogs.test.ts`'s own precedent exactly - filtering
  returns only that one category's own entries; a shared system category's id never returns
  another user's own logs against it.

### Why it's needed

Without this, Task 4's frontend filter would have nothing real to call - the whole point of
replacing the Type dropdown with a Category one is letting the user actually narrow results by
category, which only works once the backend can filter by `categoryId`.

### Decisions

- **Applied underneath `userId`, not instead of it** - identical ownership-boundary reasoning to
  every other per-user filter in this codebase; scoping order (userId first, categoryId as a
  further narrowing) is what makes a tampered or shared id harmless rather than a data leak.

### Verification

- `npm test` (backend): full suite green - 202 tests across 19 files (2 new).
- `npx tsc --noEmit`, `npx eslint .`, `npx prettier --check .`: all clean.

---
