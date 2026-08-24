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
