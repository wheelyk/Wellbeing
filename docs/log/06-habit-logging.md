# Habit Logging

## 2026-08-16 — Phase 1: `Habit` and `HabitLog` models + migration

**Task:** [Tasks.md](../../Tasks.md) → Phase 1 → "Define `Habit` model: `id`, `user_id`, `name`, `type
(boolean | numeric | duration)`, `created_at`." and "Define `HabitLog` model: `id`, `user_id`,
`habit_id`, `value (shape depends on habit type)`, `notes (optional)`, `logged_at`."

**Delivered via branch:** `feature/1.5-habit-models`, branched off `main` (which already has
`requireAuth` and the full mood-logging vertical slice merged). This starts a new, independent
vertical slice — habit logging — following the exact same shape the mood-logging slice used:
model first, then the CRUD endpoint, then the frontend form.

### Background / concepts

#### The actual problem this task is about: a value whose _shape_ depends on another row

Every previous log table (`MoodLog`) has a fixed, known set of columns — a mood log always has a
`mood` field, always an integer 1–5. A habit log is different: `requirements.md` §6.4 says a
habit can be yes/no, a number, or a duration, and _which one_ is a property of the `Habit` row
the log points back at, not something fixed for the whole table. This is the core modeling
question this task has to answer: how do you store "a value whose type depends on a foreign
key's row" in a relational database, where every row in a table normally has the same columns
meaning the same thing?

Three real options were weighed:

1. **A single polymorphic column** ("polymorphic" here just means a column whose shape/meaning
   isn't fixed — it can hold different kinds of value depending on context, unlike a normal
   column that always means the same thing) (e.g. Prisma's `Json` type, or a `String` that gets
   parsed/coerced depending on context). Simplest schema, but every reader of the table has to
   know, out-of-band, how to interpret whatever's in that column — the database itself can't
   enforce "this is a number" vs. "this is a boolean," and a numeric aggregate query (e.g. "this
   week's average water intake") would need to cast a JSON value out of the column every time,
   rather than operating on a plain typed number.
2. **Separate tables per habit type** (`BooleanHabitLog`, `NumericHabitLog`, `DurationHabitLog`).
   Fully typed at the database level, but means the `GET /api/habit-logs` endpoint (needed
   regardless of habit type, e.g. for a combined activity feed) would have to query three tables
   and merge the results, and every future feature that touches "a habit log" has to handle three
   shapes structurally, not just three cases of one shape.
3. **One table, three nullable typed columns** (`valueBoolean Boolean?`, `valueNumeric Float?`,
   `valueDurationMinutes Int?`), with application code enforcing that exactly the one matching the
   parent habit's `type` is populated and the other two are left `null`. **This is what was
   built.** It keeps `HabitLog` a single table (one query for "all this user's habit logs," same
   as every other log type), keeps each value typed at the database level (a numeric aggregate is
   a plain SQL `AVG(value_numeric)`, not a JSON-extraction expression), and its one real cost — the
   "exactly one of three is set" rule isn't something Postgres or Prisma can express declaratively
   as a constraint referencing a _different_ table's row — is paid once, centrally, in the
   `habit-logs` route's validation code (the next task), not scattered across every future
   consumer of this table the way option 1's "know how to interpret this column" cost would be.

Option 3 was chosen because it's the same trade-off direction the codebase already leans: business
rules that depend on cross-row context (e.g. "you can't edit someone else's mood log") are already
enforced in route handlers, not attempted as database constraints — extending that same pattern to
"you can't set the wrong value column for this habit's type" is consistent, not a new kind of
compromise.

#### `HabitType` as a Prisma `enum`, not a plain `String`

- `type (boolean | numeric | duration)` is a fixed, small, known set of values — a Prisma `enum`
  (`BOOLEAN | NUMERIC | DURATION`) maps to a real Postgres `ENUM` type, so the database itself
  rejects an invalid value like `"weekly"` at the `INSERT`/`UPDATE` level, not just whatever the
  application layer happens to check. A plain `String` column would accept anything and rely
  entirely on Zod validation in the route layer (still needed regardless, since Zod runs before
  the database ever sees the request) — the enum is a second, structural line of defense, the same
  reasoning that justified the foreign-key constraint on `userId` back in the `MoodLog` entry.

#### Cascading deletes, one level deeper than `MoodLog` needed

- `MoodLog` only needed `onDelete: Cascade` from `User`. `HabitLog` needs it from **both** `User`
  _and_ `Habit`: deleting a user should remove their habits and habit logs (same as every other
  log type), but deleting a single `Habit` (without deleting the user) should also remove that
  habit's logs — a `HabitLog` whose parent `Habit` no longer exists has no `type` left to interpret
  its `value*` columns against, so an orphaned log in that state isn't meaningful data worth
  preserving. Both relations are declared with `onDelete: Cascade` for that reason.

#### Two indexes on `HabitLog`, not one

- `@@index([userId, loggedAt])` mirrors `MoodLog`'s composite index — every "this user's recent
  activity" query filters by user and ranges by time together.
- `@@index([habitId, loggedAt])` is new: a future per-habit view ("show me this specific habit's
  history/trend over time") filters by `habitId`, not `userId`, and still ranges by `loggedAt` —
  a query pattern `MoodLog` never had, since there's no equivalent of "one specific habit" to
  drill into for mood.
- `Habit` itself gets a single-column `@@index([userId])` (no second dimension) since "list this
  user's habits" has no secondary sort/range axis the way the log tables do.

### What was done

1. **`backend/prisma/schema.prisma`.** Added the `HabitType` enum, the `Habit` model, and the
   `HabitLog` model as described above, plus the reciprocal `habits`/`habitLogs` fields on `User`.
2. **First migration attempt caught a real naming-convention bug before it shipped.** The first
   `npx prisma migrate dev --name add_habit_and_habit_log` run applied successfully, but manually
   inspecting the resulting table with `psql \d habit_logs` (the same "verify directly against
   Postgres, not just trust the migration output" habit the `MoodLog` entry established) showed
   the three value columns landed as `valueBoolean`, `valueNumeric`, `valueDurationMinutes` —
   camelCase, unlike every other column in the schema (`user_id`, `logged_at`, etc.), because they
   were missing the `@map(...)` snake_case override every other field already has. Since this
   database is a throwaway local instance created solely for this task with zero real data in it,
   the fix was to add the missing `@map` calls, manually drop just the two new tables and the new
   enum type via `psql` (not a full `prisma migrate reset` — Prisma's own safety guard correctly
   refused that command without explicit interactive user consent, and a full reset was overkill
   for undoing two empty tables anyway), delete the one now-stale row from `_prisma_migrations`,
   and re-run `migrate dev` to produce a clean, correctly-named migration on the first real attempt
   that will ever reach a shared or production database.
3. **Migration.** `20260816193218_add_habit_and_habit_log`, applied against the isolated local
   database (`welltrack_habit` — this vertical slice is being built in a separate git worktree
   from any concurrently-running symptom/medication-logging work, each pointed at its own database
   and backend port specifically so local `migrate dev` runs never collide).
4. **`npm run build`** — compiled cleanly (also regenerates the Prisma Client, making
   `prisma.habit.create(...)` / `prisma.habitLog.create(...)` available with full types for the
   next task).
5. **`npm test`** — 38/38 passing, unchanged from before this task (schema-only change, no new
   application code yet).
6. **Manual verification directly against Postgres**: `psql \d habits` and `psql \d habit_logs`,
   confirming exact column names/types (including the corrected `value_boolean` /
   `value_numeric` / `value_duration_minutes` snake_case names, and `logged_at` as
   `timestamp(3) with time zone`), both indexes, the `habit_type` enum, and both cascading foreign
   keys on `habit_logs` (to `users` and to `habits`) all exist for real in the running database.
7. **Lint/format.** `npx eslint .` and `npx prettier --check .` — both clean (no application code
   changed, but run as part of this task's own verification regardless).

### Why it's needed

The habit-logs endpoint (next task) needs somewhere to store data with the right shape and
constraints already in place — including the specific "exactly one value column per type" rule
this schema deliberately leaves for the application layer to enforce, exactly where the next task
picks up.

### Decisions

- **Three nullable typed columns over a single `Json` value column or per-type tables.** Covered
  in detail above — chosen to keep `HabitLog` a single, typed, uniformly-queryable table.
- **`type` immutable after creation, planned for the next task, not this one.** Not yet enforced
  in code (there's no route yet), but noted here since it shapes why the value-column approach
  above is safe: if `type` could change after logs already reference a habit, existing logs'
  populated value column could become mismatched with the (now different) type with no way to
  reconcile old data. Deferred to the next task's PATCH `/api/habits/:id` implementation, but the
  schema decision here assumes it.
- **No `createdAt` on `HabitLog`**, matching `MoodLog`'s precedent — `logged_at` already captures
  the moment that matters (including backfilled past dates); a separate "row inserted at" column
  isn't read by anything planned.
- **Manually corrected the migration rather than shipping the camelCase-column version and fixing
  it in a follow-up migration.** Since nothing had been pushed or merged yet and the local database
  had no real rows, regenerating a single correct migration was strictly better than committing a
  bug and a fix-up migration on top of it — the second option would be the right call once a
  migration has actually reached a shared database (as the earlier "Prisma migration checksum
  mismatch" entry describes for a different scenario), but that constraint didn't apply here yet.

### State at end of this step

`habits` and `habit_logs` exist in this slice's isolated local database with the correct shape,
constraints, and indexes. No API endpoint reads or writes either table yet — that's the next
task, stacked on this branch.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 38/38 passing (unchanged).
- `npx eslint .` / `npx prettier --check .` — both clean.
- `psql \d habits` and `psql \d habit_logs` against the real local database — confirmed column
  names/types, both indexes, the enum type, and both cascading foreign keys directly, not
  inferred from the migration file alone.

---

## 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/habits` and `/api/habit-logs`

**Task:** [Tasks.md](../../Tasks.md) → Phase 3 → Habits → "`GET/POST/PATCH/DELETE /api/habits` —
manage user-defined habits, including `type`." and "`GET/POST/PATCH/DELETE /api/habit-logs` —
record a value appropriate to the habit's type; validate the value shape server-side based on
`type`."

**Delivered via branch:** `feature/3.6-habits-and-habit-logs-endpoints` (stacked on
`feature/1.5-habit-models`) — where the previous task's schema actually gets used for the first
time, the same relationship the mood-logging slice's model → endpoint pair had.

### Background / concepts

#### Two routers, one shared piece of type-aware validation logic

- `habits.ts` manages the parent resource (a user's list of habits and their `type`).
  `habitLogs.ts` manages entries against those habits, and is where the interesting new logic
  lives: **the value shape a request is allowed to submit depends on data read from a different
  table**, not on anything Zod alone can check from the request body in isolation. Zod validates
  _shape_ (is `valueNumeric`, if present, actually a finite number?) but has no way to know "this
  particular request's `habitId` refers to a `NUMERIC` habit, so `valueNumeric` is the only field
  allowed to be present" — that's a database read plus a hand-written check
  (`extractTypedValue` in `habitLogs.ts`), run _after_ Zod's structural validation succeeds and
  _after_ the habit's ownership is confirmed, immediately before anything reaches Prisma.
- The exact rule `extractTypedValue` enforces: **exactly one** of `valueBoolean` /
  `valueNumeric` / `valueDurationMinutes` may be present in the request, and it must be the one
  matching the referenced habit's `type` — zero fields, two-or-more fields, or the "wrong" single
  field are all rejected with `400 VALIDATION_ERROR` and a message naming exactly what went
  wrong. This is the application-level half of the previous task's schema decision: the database
  can't declare "these three columns are mutually exclusive based on a different table's row" as
  a constraint, so this function is where that rule actually lives, and it's covered by nine
  dedicated tests (one per type's happy path, one per type's wrong-field rejection, plus
  no-fields, two-fields, and the duration-specific negative/fractional-minutes rejections).

#### The cross-cutting requirement: `habitId` is never trusted at face value

- This is the single most important check in `habitLogs.ts`, called out explicitly in the task
  brief as "the key defense against ID-tampering," and it's worth being precise about what it
  actually prevents: without it, a logged-in User A could submit `POST /api/habit-logs` with
  `habitId` set to a habit that actually belongs to User B (guessed, enumerated — systematically
  tried in sequence or by pattern rather than found through a legitimate reference — or leaked
  some other way) — and if the server only checked "does a habit with this ID exist," User A's log
  would silently attach itself to User B's habit, corrupting B's data with A's entries.
- The fix is the same `findFirst({ where: { id, userId } })` pattern already established for
  ownership checks throughout this codebase (`moodLogs.ts`, and this task's own `habits.ts`) —
  applied here on the `POST /api/habit-logs` **create** path specifically, which is new: every
  prior use of this pattern was on `PATCH`/`DELETE` of a row the caller already owned by
  definition of "found via their own `userId`." Here, the habit being referenced is a _different_
  row than the one being created, so this is the first place in the app a foreign key from the
  request body — not the URL's `:id` — gets the same ownership check. `PATCH /api/habit-logs/:id`
  needs no equivalent re-check of `habitId`, because that field isn't editable after creation
  (see below) — the ownership check on the log itself, done once at creation time, is sufficient
  for its entire lifetime.
- Tested directly: registering two users, creating a habit as the first, and attempting to log
  against it as the second returns `404 HABIT_NOT_FOUND` (not `403` - the same "don't confirm the
  resource exists" reasoning as every other ownership check in this app) with zero rows created,
  confirmed by querying the database directly afterward rather than trusting the status code
  alone. Also manually reproduced against the real running server via `curl` with two real
  registered users, not just in the automated test.

#### Why `habitId` is immutable on a `HabitLog`, and why `type` is immutable on a `Habit`

- **`HabitLog.habitId`** isn't in `updateSchema` at all — there's no route for "move this log
  onto a different habit." Allowing it would immediately raise the same type-mismatch question
  `extractTypedValue` exists to prevent (a log's already-stored value might no longer match the
  new habit's type), for a feature nothing in the requirements calls for. Simpler to not offer it.
- **`Habit.type`** isn't in `habits.ts`'s `updateSchema` either — only `name` can be changed after
  a habit is created. This was an explicit judgment call the task brief flagged as worth making
  deliberately: once any `HabitLog` rows reference a habit, their `value*` columns were validated
  and stored _at that time_ against the habit's _then-current_ type. If `type` could change
  afterward, every existing log for that habit would become silently inconsistent with its new
  type — a `NUMERIC` habit retroactively turned `BOOLEAN` would leave old rows with a populated
  `value_numeric` and a `null` `value_boolean`, which nothing currently reads as invalid but which
  no longer means what the (new) type claims it should. Immutable-after-creation avoids the
  question entirely rather than trying to migrate or invalidate old logs on a type change, which
  requirements.md doesn't call for and would be a much larger feature (e.g. "what does a partial
  data migration even mean here?"). Tested directly: `PATCH /api/habits/:id` with `{ name, type }`
  in the body updates the name and silently ignores the `type` field (Zod's default behavior for
  keys absent from a schema - not an error, just dropped), confirmed by re-reading the habit
  afterward and asserting its `type` is unchanged.

#### Translating between the database's `HabitType` enum and the API's lowercase strings

- The Prisma schema's enum values are `BOOLEAN` / `NUMERIC` / `DURATION` (Prisma's own SCREAMING_
  CASE convention for generated enums). The JSON API instead accepts and returns lowercase
  `"boolean"` / `"numeric"` / `"duration"` — matching the exact casing `Tasks.md` and
  `requirements.md` already use, and reading more naturally as a TypeScript string-literal union
  on the frontend (`"boolean" | "numeric" | "duration"`) than the database's convention would.
  `backend/src/lib/habitType.ts` is the one place this translation happens (`toPrismaHabitType`
  going in, `toApiHabitType`/`serializeHabit` coming out) - every route imports from there rather
  than each hand-rolling its own mapping, so there's exactly one place to look if the mapping
  ever needs to change.

#### Why `GET /api/habit-logs` doesn't embed the parent habit's name/type in each row

- A frontend rendering a list of habit logs needs to know each log's habit's `name` (to display
  "Exercise: done" rather than a bare UUID) and `type` (to know how to format the value). This
  endpoint deliberately returns bare log rows instead of embedding that via a Prisma `include` -
  the frontend is expected to have already loaded `GET /api/habits` (needed regardless, to power
  the "log against which habit?" picker) and cross-reference by `habitId` client-side. This
  avoids sending the same habit name/type repeated on every one of that habit's log rows, at the
  cost of the frontend needing to join the two lists itself - a reasonable trade for how small
  a user's habit list is expected to stay (a handful of user-defined habits, not hundreds).

### What was done

1. **`backend/src/lib/habitType.ts` (new).** The lowercase-API ↔ uppercase-Prisma-enum
   translation helpers described above.
2. **`backend/src/routes/habits.ts` (new).** Four routes: `GET /` (list, oldest-created-first),
   `POST /` (create, `name` + `type` required), `PATCH /:id` (rename only - `type` silently
   ignored if sent), `DELETE /:id` (cascades to the habit's logs via the schema's `onDelete:
Cascade`). Ownership enforced throughout via the established `findFirst({ where: { id,
userId } })` → `404` pattern.
3. **`backend/src/routes/habitLogs.ts` (new).** `GET /` (list, most-recent-first),
   `POST /` (validates `habitId` ownership, then the type-aware value shape, defaults `loggedAt`
   to now or accepts an explicit backfilled value), `PATCH /:id` (value fields all optional as a
   whole - omit them entirely to only change `notes`/`loggedAt`; if any is present, validated
   against the log's already-established habit type), `DELETE /:id`.
4. **`backend/src/app.ts`.** Mounted both routers behind `requireAuth`, matching the mood-logs
   mount point's shape: `app.use("/api/habits", requireAuth, habitsRouter)` and
   `app.use("/api/habit-logs", requireAuth, habitLogsRouter)`.
5. **Tests.** `habits.test.ts` (13 tests: auth-required, create-per-type, validation rejections,
   scoped listing, rename, type-immutability, 404s for missing/foreign habits, cascading delete)
   and `habitLogs.test.ts` (21 tests: auth-required, one create-happy-path per type, one
   wrong-field-rejection per type, no-value/two-values rejections, negative/fractional-duration
   rejections, the cross-user `habitId`-tampering test, a nonexistent-`habitId` test, backfill
   defaulting, scoped listing, value+notes update, value-shape-mismatch-on-update rejection,
   notes-only update leaving the value untouched, 404s for missing/foreign logs, delete).
6. **`npm test`** — 67/67 passing (38 pre-existing, 29 new).
7. **`npm run build`** — compiled cleanly.
8. **`npx eslint .`** — clean. **`npx prettier --check .`** — clean (after one `--write` pass
   over the new files to match the project's line-wrapping conventions).
9. **Manual end-to-end verification against the compiled, running server** (`npm start`, port
   4103 - this vertical slice's own isolated port, chosen to avoid colliding with other
   concurrently-running local work), via `curl`: registered and logged in a real user, created
   one habit of each type, logged against each (boolean, numeric, and a backfilled duration
   entry with an explicit past `loggedAt`), confirmed a type-mismatched value (`valueNumeric`
   against the boolean habit) is rejected with `400`, updated a log's value and notes, deleted a
   habit and confirmed via a second `GET` that its log was gone too (the cascade, exercised for
   real, not just inferred from the schema). Registered a second real user and confirmed,
   against the live server, that submitting the first user's habit ID returns `404
HABIT_NOT_FOUND` rather than succeeding. Cleaned up both manually-created test users
   afterward via `psql` and stopped the manually-started server.

### Why it's needed

This is the point the habit-logging vertical slice's storage layer (previous task) becomes a
real, usable API - the same significance the mood-logs endpoint task had for that slice. It also
delivers the phase's explicitly-called-out ID-tampering defense for habits specifically, and is
the first endpoint in the app where a request body's foreign key (not just its own URL `:id`)
needs its own ownership check.

### Decisions

- **Value shape as three exclusive optional fields, not a single polymorphic `value` field
  in the request body.** Chosen to mirror the database's three-nullable-columns representation
  exactly (see the previous task's entry) - the request body's shape and the stored row's shape
  are the same, so there's no separate "how does the wire format map onto the columns" mapping
  to get wrong, on top of the type-validation logic that already has to exist.
- **`type` immutable on `Habit`, `habitId` immutable on `HabitLog`.** Both covered in detail
  above - chosen to sidestep data-integrity questions requirements.md doesn't ask this task to
  solve.
- **Lowercase `type` strings in the JSON API, translated from Prisma's SCREAMING_CASE enum.**
  Covered above - an explicit choice to prioritize how the API reads for a frontend consumer over
  minimizing internal translation code.
- **`GET /api/habit-logs` returns bare rows, no embedded habit name/type.** Covered above - the
  frontend is expected to already have `GET /api/habits` loaded and join client-side.
- **Not building the centralized error-handling middleware or the shared `symptom_id`/
  `medication_id`/`habit_id` cross-cutting Tasks.md checklist item in this task.** Same reasoning
  as the mood-logs endpoint entry: this task's own error responses match the established
  `{ error: { message, code } }` shape by hand, and the _centralized_ version - plus confirming
  the equivalent check exists for symptoms/medications, which this vertical slice doesn't touch -
  is left to whichever task actually closes out that phase-wide checklist item, since those other
  log types are out of this slice's scope entirely (built independently, per the task brief).

### State at end of this step

A real, working, tested, auth-protected, type-validating CRUD API for habits and habit logs
exists locally, including the ID-tampering defense the phase specifically calls for. Nothing on
the frontend calls it yet - that's the next task, stacked on this branch.

### Verification

- `npm test` (`vitest run`) — 67/67 passing (38 pre-existing, 29 new).
- `npm run build` — compiled cleanly.
- `npx eslint .` / `npx prettier --check .` — both clean.
- Manual `curl` round-trip against the compiled, running server: created one habit per type,
  logged against each, rejected a type-mismatched value, updated and deleted logs/habits
  (confirming the cascade), and confirmed the cross-user `habitId`-tampering defense with two
  real registered users - not just in the automated test suite.

---

## 2026-08-16 — Phase 7: Habit entry form, wired into the Dashboard

**Task:** [Tasks.md](../../Tasks.md) → Phase 7 → "Habit entry form: input control adapts to habit
type (toggle for boolean, number input for numeric, duration input for duration), date/time
picker."

**Delivered via branch:** `feature/7.4-habit-entry-form` (stacked on
`feature/3.6-habits-and-habit-logs-endpoints`) — the last piece of the habit-logging vertical
slice, where the model and endpoint built in the previous two tasks finally become something a
real person can see and use, the same significance the mood entry form task had for that slice.

### Background / concepts

#### The one real UX problem this task has that mood logging never did: you can't log a habit that doesn't exist yet

- Mood logging has no setup step — every user can immediately record a mood the moment they
  land on the Dashboard. Habits are different: `requirements.md` §6.4 and this task's own brief
  are explicit that a habit is user-defined first, then logged against — so the very first time
  a new user clicks `+ Habit`, there is nothing yet to log against. This is the actual design
  problem this task's UI has to solve that the mood form's simpler "always ready to log" case
  never faced.
- The solution built here is a small state machine (a "state machine" means exactly one of a
  fixed set of named states is active at a time, with specific actions moving it from one to
  another — simpler to reason about than several independent booleans that could disagree) on
  `DashboardPage`, not inside either form
  component: `habitFormMode: "closed" | "log" | "create-habit"`. Clicking `+ Habit` checks
  `habits.length` and picks `"create-habit"` (no habits yet) or `"log"` (at least one exists)
  — the same button does either thing depending on what's actually possible right now, rather
  than the user needing to discover a separate "manage habits" screen before they can use the
  headline feature at all.
- Once `HabitCreateForm` succeeds, its new habit is appended to `habits` state _and_ the
  Dashboard immediately switches to `"log"` mode with that new habit pre-selected
  (`habitToPreselect`) — so "define a habit" chains straight into "log against it" in one
  continuous flow, rather than dropping the user back at an empty screen to click `+ Habit` a
  second time. This chaining is what makes the empty-state genuinely usable end to end, not just
  technically unblocked.
- A second, smaller path into the same create flow: a "+ Add a new habit" link inside
  `HabitEntryForm` itself, for a user who already has habits but wants to define one more without
  backing out of the log form first. Both paths land on the exact same `HabitCreateForm`
  component — there's only one way habits actually get created, just two entry points into it.

#### Why the habit type's input control is three genuinely different components, not one form field that adapts its `type` attribute

- A boolean habit needs a binary choice (rendered as the same `role="radiogroup"`/`role="radio"`
  Yes/No buttons `MoodEntryForm` already established for its rating rows - reused for
  accessibility consistency, not reinvented). A numeric habit needs a free-form number (`<input
type="number" step="any">`, allowing decimals - water intake in liters, for instance, isn't
  always a whole number). A duration habit also uses `<input type="number">`, but constrained to
  non-negative integers only (`min={0} step={1}`) - **minutes, not a separate hours/minutes
  picker**, the simplest reasonable choice for "how long," matching the backend's own
  `valueDurationMinutes` column and avoiding a genuinely more complex custom duration-picker
  widget the requirements don't call for.
- All three are conditionally rendered based on `selectedHabit.type`, and switching the habit
  picker's `<select>` resets every value field back to empty - without that reset, picking a
  different habit after starting to type a numeric value could otherwise submit a stale value
  against the wrong habit's now-different control.
- Client-side validation mirrors the backend's `extractTypedValue` logic from the previous task
  almost exactly (a boolean choice is required, a numeric value must parse to a finite number, a
  duration must be a non-negative integer) - deliberately duplicated rather than shared, since
  one is browser-side UX (fail fast, no round trip) and the other is the actual server-side
  source of truth that can't be bypassed by a modified client; the server still re-validates
  independently regardless of what the form already checked.

#### Extracting `toDateTimeLocalValue` into a shared module

- `MoodEntryForm.tsx` already had a private helper converting a `Date` into the exact string
  format `<input type="datetime-local">` expects (documented in that task's own
  IMPLEMENTATION_LOG.md entry). `HabitEntryForm` needed the identical logic for its own date/time
  picker - copying it a second time would mean two places to keep in sync if the format ever
  needed to change. Moved to `frontend/src/lib/dateTimeLocal.ts` and imported by both forms
  instead; `MoodEntryForm.tsx` itself changed only to import the moved function, no behavior
  difference. This is the first shared utility module in `frontend/src/lib/` - a natural home for
  whatever the next form (symptoms/medications) will inevitably need too.

#### Why `GET /api/habit-logs`'s bare rows (no embedded habit name/type, per the previous task's decision) work fine here

- `DashboardPage` already fetches `GET /api/habits` in parallel with `GET /api/habit-logs` on
  mount (`Promise.all`, matching the loading-state shape the mood section already established)
  and builds a `Map<habitId, Habit>` (`habitsById`, via `useMemo` so it isn't rebuilt on every
  render) purely client-side. `formatHabitValue(log, habit)` then looks up each log's habit
  through that map to decide both what to label the value ("Done"/"Not done" vs. a bare number vs.
  "N min") and to display the habit's `name` instead of a bare UUID. This is exactly the
  client-side join the previous task's entry anticipated when it chose not to embed habit data in
  every log row server-side.

### What was done

1. **`frontend/src/lib/dateTimeLocal.ts` (new).** The extracted `toDateTimeLocalValue` helper,
   described above.
2. **`frontend/src/components/MoodEntryForm.tsx` (small refactor).** Now imports
   `toDateTimeLocalValue` from the new shared module instead of defining its own copy - no
   behavior change, confirmed by the existing `MoodEntryForm.test.tsx` suite still passing
   unmodified.
3. **`frontend/src/components/HabitCreateForm.tsx` (new).** Name field (`TextField`, reused as-
   is) plus a three-option type picker (Yes/No, Number, Duration, each with a one-line example
   hint), Create/Cancel buttons. Submits `POST /api/habits` and calls `onCreated(habit)`.
4. **`frontend/src/components/HabitEntryForm.tsx` (new).** Habit `<select>`, the type-adaptive
   value control described above, optional notes, a `datetime-local` field defaulting to "now"
   (same pattern as `MoodEntryForm`), a "+ Add a new habit" link, Save/Cancel. Submits `POST
/api/habit-logs` and calls `onSaved(log)`.
5. **`frontend/src/pages/DashboardPage.tsx` (extended, not rewritten).** Added the
   `habits`/`habitLogs` state, the parallel fetch-on-mount effect, the three-mode state machine
   described above, and a second "Recent habit entries" section mirroring the mood section's
   shape (loading/error/empty states, a list with per-entry Delete using the same optimistic-
   removal-with-rollback pattern `handleDelete` already established for mood logs). The empty
   state is split into two distinct messages depending on _why_ the list is empty - "you haven't
   created any habits yet" (points at the `+ Habit` button) versus "nothing logged yet" (habits
   exist, just no entries) - since those are different situations needing different guidance,
   unlike mood logging where "empty" only ever means one thing.
6. **Tests.** `HabitCreateForm.test.tsx` (4 tests: required-field validation, a full create
   round-trip asserting the exact request body, a failed-save error message, Cancel) and
   `HabitEntryForm.test.tsx` (7 tests: one happy-path submission per habit type asserting the
   exact value field sent, the corresponding rejection for each type's invalid input, switching
   habits swaps the visible value control, the "+ Add a new habit" link, Cancel).
7. **`npm test`** (frontend) — 35/35 passing (24 pre-existing, 11 new).
8. **`npm run build`** (frontend) — compiled cleanly.
9. **`npx eslint .`** — clean (one pre-existing, unrelated warning in `AuthContext.tsx`, not
   touched by this task). **`npx prettier --check .`** — clean (after one `--write` pass).
10. **Real browser verification**, per the project's UI-change testing rule. Started the actual
    compiled backend (`npm start`, port 4103) and the frontend dev server, then drove a real
    headless Chromium browser through the full flow with a throwaway Playwright script: register
    → land on Dashboard → click `+ Habit` with zero habits defined → confirm the "Create your
    first habit" empty-state form appears → create a boolean habit ("Exercise") → confirm the
    log form opens automatically with it pre-selected → log it as "Yes" with a note → confirm it
    appears in the list as "Exercise: Done" → click `+ Habit` again (now with one habit) → use
    "+ Add a new habit" to create a second, numeric habit ("Water intake") → confirm the log form
    re-opens with the _new_ habit pre-selected and a numeric input control (not the boolean
    toggle) → log `2.5` → confirm both entries are listed with correctly-typed values ("Water
    intake: 2.5", most-recent-first) → delete the most recent entry → confirm exactly that one
    disappears and the other remains. Screenshots taken at each step and visually reviewed, not
    just asserted programmatically. Zero browser console errors at any point. Cleaned up the two
    browser-created test users afterward via `psql`, and had to track down and force-stop one
    orphaned `node` process left listening on port 4103 from an earlier manual-verification step
    whose background task tracking had lost it (confirmed via `Get-NetTCPConnection` and
    `Stop-Process`) before the frontend dev server was also stopped.

### Why it's needed

This closes out the habit-logging vertical slice: a real user can now define a habit of any of
the three supported types and log against it, entirely through the UI, with the same rigor
(tests, build, lint, format, and real-browser verification) every other slice in this codebase
has been held to.

### Decisions

- **A Dashboard-level state machine (`"closed" | "log" | "create-habit"`) rather than baking
  "no habits yet" handling into `HabitEntryForm` itself.** Keeps `HabitEntryForm` focused on one
  job (logging against an already-known list of habits) and `HabitCreateForm` focused on a
  different one (defining a habit) - `DashboardPage` is the one place that knows _when_ each is
  appropriate, the same separation of concerns `MoodEntryForm` already has relative to
  `DashboardPage`'s mood-log fetching/list-rendering responsibilities.
- **Minutes as a plain number field for duration, not a separate hours/minutes picker.** Matches
  the backend's `valueDurationMinutes` column exactly and is the simplest control that satisfies
  "duration input for duration" - a richer picker is a plausible future enhancement but not
  something the requirements or this task ask for.
- **Client-side value validation duplicated from (not shared with) the backend's
  `extractTypedValue`.** Deliberate - one is a same-process TypeScript function callable directly
  from a route handler, the other is a separate browser-side check with a different job (fail
  fast without a network round trip) that can never be the actual source of truth regardless of
  how it's implemented.
- **Extracting `toDateTimeLocalValue` now, rather than after a third form needs it too.** Two
  real, identical copies was already enough duplication to justify the extraction - waiting for a
  third to "prove the pattern" would mean carrying a known-duplicated bug fix across two files in
  the meantime if the format logic ever needed a fix.

### State at end of this step

A real user can register or log in, land on the Dashboard, define a habit of any of the three
types (from a genuine empty state, without leaving the Dashboard), log against it with a value
appropriate to its type, see it appear immediately with the right formatting, and delete it - all
verified directly in a real browser, not just via tests. This closes out the habit-logging
vertical slice: Phase 1.5 (models) → Phase 3.6 (endpoints) → Phase 7.4 (this task) are each their
own PR, stacked in that order, and need merging in that same order once reviewed - the same shape
the mood-logging slice's own three-PR stack took.

### Verification

- `npm test` (frontend, `vitest run`) — 35/35 passing (24 pre-existing, 11 new).
- `npm run build` (frontend) — compiled cleanly.
- `npx eslint .` / `npx prettier --check .` — both clean.
- Real headless-browser walkthrough (Playwright) against the actual running backend and frontend
  dev servers: full register → empty-state → create-habit → log → create-a-second-habit → log →
  delete cycle across two different habit types, screenshots reviewed at each step, zero browser
  console errors.

---

## 2026-08-17 — Phase 7: Edit action for habit entries, reusing the same form

**Task:** [Tasks.md](../../Tasks.md) → Phase 7 → "Edit and delete actions available from
Dashboard/History for every log type, reusing the same forms pre-filled with existing values."
See [Mood Logging](03-mood-logging.md)'s entry of the same date for the full explanation of why
this matters and how the shared pattern works (the optional `editingLog` prop, the `key`-forced
remount, and the replace-in-place-vs-prepend save logic) — this entry covers only what's
specific to Habit, which needed real extra care because of its type-dependent value.

**Delivered via branch:** `feature/7-edit-log-entries` (same branch as the Mood, Symptom, and
Medication edit work — one PR covering all four log types).

### What's specific to Habit

#### The type-dependent value pre-fill

- A `HabitLog` stores its value across three separate nullable columns —
  `valueBoolean`/`valueNumeric`/`valueDurationMinutes` — with exactly one of the three ever
  non-null, matching whichever `type` the parent `Habit` was defined as (this is the same
  three-column shape `formatHabitValue` in `HabitSection.tsx` already reads from to render each
  entry in the list). Pre-filling the _right_ control for editing means reading the _matching_
  field, not just any of the three:
  ```ts
  const [booleanValue, setBooleanValue] = useState<boolean | null>(
    editingLog?.valueBoolean ?? null,
  );
  const [numericValue, setNumericValue] = useState(
    editingLog?.valueNumeric != null ? String(editingLog.valueNumeric) : "",
  );
  const [durationValue, setDurationValue] = useState(
    editingLog?.valueDurationMinutes != null
      ? String(editingLog.valueDurationMinutes)
      : "",
  );
  ```
  This doesn't need any extra "which type is this" branching at pre-fill time — because the
  backend guarantees only one of the three fields is ever non-null for a given log (enforced by
  `extractTypedValue` in `habitLogs.ts`, covered in this slice's own Phase 3 entry), reading all
  three unconditionally is safe: two of the three initializers simply produce `null`/`""` (their
  normal "nothing entered" default) and the one matching the habit's actual type produces the
  real value. The existing `selectedHabit?.type === "boolean"` / `"numeric"` / `"duration"`
  conditional rendering — unchanged from the original entry form — then shows only the one
  control that has a real pre-filled value in it.

#### The habit picker is locked during edit — the one place this task diverges from Mood/Symptom/Medication

- Unlike the other three log types, a habit log's `habitId` is **not** an editable field on
  `PATCH`: the backend's `updateSchema` in `habitLogs.ts` deliberately omits `habitId` entirely
  (see that file's own comment: "which habit a log belongs to isn't editable after creation,
  avoiding the question of what it would even mean to 'move' a log with an already-validated
  value shape onto a habit of a possibly different type" — moving a numeric log onto a boolean
  habit, for instance, has no sensible interpretation). Since re-pointing a log at a different
  habit was never going to work server-side, letting the picker stay interactively open during
  edit would be actively misleading — it would look changeable when it isn't. The fix:
  ```tsx
  <select id="habit-picker" value={habitId} disabled={!!editingLog} ...>
  ```
  and the "+ Add a new habit" link is hidden entirely while editing (`{!editingLog && (...)}`),
  since defining a brand-new habit mid-edit doesn't fit anywhere a locked-habitId edit could use
  it. The submitted `PATCH` body itself never includes `habitId` either — built explicitly
  without it (`...(editingLog ? {} : { habitId: selectedHabit.id })`) rather than relying on the
  backend to silently ignore an extra field, so the request accurately reflects what's actually
  being changed.

### What was done

1. **`frontend/src/components/HabitEntryForm.tsx`.** Added the `editingLog` prop; pre-fills
   `habitId` and the type-matching value field as described above; submits `PATCH
/api/habit-logs/{id}` (without `habitId`) instead of `POST /api/habit-logs` when editing;
   locks the habit `<select>` and hides "+ Add a new habit" during edit; "Save Changes" button
   label.
2. **`frontend/src/components/dashboard/HabitSection.tsx`.** Added `editingLog` state, an "Edit"
   button per entry, the "Log a habit" / "Edit habit entry" heading switch, the `key`-forced
   remount (keyed on `editingLog?.id ?? habitToPreselect ?? "create"`, extending the existing
   preselect-after-create key rather than replacing it), and the replace-in-place
   `handleHabitLogSaved` logic.
3. **Tests.** New `describe("editing an existing entry")` block in `HabitEntryForm.test.tsx`
   with three cases — one per habit type — confirming each type's value control pre-fills from
   the matching field only (boolean also asserts the picker is disabled, the "+ Add a new habit"
   link is gone, and the `PATCH` body has no `habitId`); one new case in `HabitSection.test.tsx`
   (Edit opens the form pre-filled, saving replaces the entry in place). All pre-existing tests
   unchanged and passing.
4. **`npm test`** (frontend, full suite) — 82/82 passing (68 pre-existing, 14 new across all
   four log types).
5. **`npm run build`, `npm run lint`, `npx prettier --check .`** — all clean.
6. **Real browser verification**: created a boolean habit ("Exercise"), logged it as not done,
   edited it via the pre-filled form (confirmed the habit picker showed "Exercise" locked/
   disabled and "No" pre-selected), changed it to "Yes," saved, and confirmed the entry updated
   in place on the dashboard — zero console errors.

### Why it's needed

Same underlying gap as Mood — see that entry for the full reasoning. Habit logging in particular
benefits from a quick correction path since a numeric or duration value is easy to mis-type
(e.g. "80" minutes meant to be "8").

### Decisions

- **Habit picker locked during edit, unlike Symptom's and Medication's.** Not a stylistic
  choice — directly forced by the backend's `updateSchema` genuinely not accepting `habitId` on
  `PATCH`, for the type-safety reason quoted from `habitLogs.ts` above. Symptom and Medication
  don't have this constraint because moving a symptom/medication log to a different
  symptom/medication doesn't raise the same "what does the value even mean now" problem a
  cross-type habit move would.
- **Reading all three value fields unconditionally at pre-fill time**, relying on the backend's
  existing "exactly one is ever non-null" guarantee, rather than branching on `selectedHabit.type`
  first. Simpler code with the same result, since the guarantee already exists and is already
  tested elsewhere (the Phase 3 `habitLogs.ts` entry).

### State at end of this step

A user can correct any already-logged habit entry's value, notes, or timestamp directly from the
Dashboard — with the habit itself intentionally fixed, matching what the backend actually
supports.

### Verification

- `npm test` (frontend, full suite) — 82/82 passing.
- `npm run build`, `npm run lint`, `npx prettier --check .` — all clean.
- Real headless-browser walkthrough: edited a boolean habit entry's value, confirmed the locked
  habit picker, the in-place update, and zero console errors.

---

## 2026-08-17 — Fixed: clearing notes during edit didn't actually clear it

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the same fix described in full in
[Mood Logging](03-mood-logging.md)'s matching entry, applied here to `HabitEntryForm.tsx` and
`backend/src/routes/habitLogs.ts`. Read that entry for the full explanation of the bug and the
reasoning behind the fix; this entry covers only what's specific to Habit.

Habit's `valueBoolean`/`valueNumeric`/`valueDurationMinutes` fields are exempt from this bug —
exactly one of them is always required on every log, so there's no "clear the value back to
unset" state to preserve the way there is for a genuinely optional field. Only `notes` was
affected. `habitLogs.ts`'s `updateSchema` now accepts an explicit `notes: null`, and
`HabitEntryForm.tsx` sends one when an existing note is cleared during edit
(`notes.trim() || (editingLog ? null : undefined)`), matching Mood's fix exactly.

**Verification:** one new backend test (`clears notes when explicitly sent as null`) and one new
frontend test (submits an explicit `null` when notes are cleared during edit) — both passing.
Full `npm test`/`npm run build`/`npm run lint`/`npx prettier --check .` clean in both projects
(see the Mood entry for the combined pass/fail counts across all four types).
