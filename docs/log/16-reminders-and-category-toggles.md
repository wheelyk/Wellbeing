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

---
