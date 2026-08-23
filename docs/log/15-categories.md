# Custom Categories + Admin-Managed Built-ins

## 2026-08-23 — Task 1: the generic Category model, alongside (not replacing) the four fixed ones

**Task:** [Phase 15, Task 1](../../Tasks.md#phase-15--custom-categories-post-mvp) — the backend
half of a post-MVP feature request: let a user track things beyond mood/symptom/medication/
habit, and let a single admin account add new categories that become built-in for everyone.
Preceded by a design-exploration round comparing three directions (keep the four fixed
categories with per-user on/off toggles; replace them entirely with a fully generic tracker
model; or this third, hybrid option) — the hybrid won specifically because it needed no
migration of existing data and no rewrite of anything already working.

### Background / concepts

#### Why this is additive, not a rewrite

The four existing log types (`Symptom`, `MoodLog`, `Medication`, `Habit`) each have their own
table, their own routes, and their own specialized frontend forms (mood's emoji picker,
medication's taken/not-taken toggle). Replacing them with one generic model would have meant
migrating every existing user's existing rows into a new shape - a real, one-way risk to real
data for a feature that didn't need to touch any of it. Instead, `Category`/`CategoryLog` are
*new* tables that sit alongside the four - a user (or the admin) can create a `Category`, but
`Symptom`/`MoodLog`/`Medication`/`Habit` never change.

#### System-wide vs. personal: reusing a pattern that already existed

`Symptom` already solved almost exactly this problem for one type: `userId` nullable, where
`null` means "a system default, visible to everyone" and a real id means "one user's own custom
symptom." `Category.userId` follows the identical convention - the only difference is *how* a
system-wide row gets created: a system symptom has never had its own creation UI in this app, but
a system-wide `Category` is created deliberately, through a new admin-only route
(`POST /api/admin/categories`), by the one account whose email matches `ADMIN_EMAIL`.

#### The single hardcoded admin: why not a real role system

Confirmed directly with the project owner: there is exactly one admin (them), and no plan for
more. Building a `role`/`isAdmin` database column, a promotion mechanism, and permission
management UI for a single, permanent admin would be real complexity spent on a problem that
doesn't exist yet. `lib/isAdmin.ts`'s `isAdminEmail()` is a one-line comparison against an
`ADMIN_EMAIL` environment variable instead - the same "env var, not a database row" shape this
app already uses for its JWT secrets and VAPID keys. If a second admin is ever genuinely needed,
that's the point at which a real role column would earn its complexity - not before.

#### Archive, not delete: a real correction from the original plan

The first draft of this plan gave `CategoryLog -> Category` the same `Restrict` foreign key
`SymptomLog -> Symptom` already uses (deleting a symptom/category with logs against it fails at
the database level, rather than silently destroying history). That's the right call for a
*personal* symptom, where the blast radius of "permanently stuck because you logged against it
once" is one person's own mistake. It's the wrong call for a system category: the moment *any*
user anywhere logs against a bad built-in the admin wants to retire, that category becomes
undeletable forever under a Restrict-only design. `archivedAt` is the actual "remove" action for
both personal and system categories - excluded from default listings, but a past log against an
archived category still resolves it by id in History. The `Restrict` FK stays too, as a genuine
safety net for the zero-logs accidental-delete case.

### What was done

- **`backend/prisma/schema.prisma`**: `CategoryValueType` enum (`BOOLEAN | NUMERIC | SCALE |
  DURATION` - the same three `HabitType` values plus `SCALE`, a bounded 1-N picker generalizing
  what Mood/Symptom already do with their own fixed scales). `Category` (`userId` nullable,
  `valueType`, `scaleMin`/`scaleMax` for `SCALE` only, `archivedAt`). `CategoryLog` (three
  nullable value columns, exactly one populated per log, matching `HabitLog`'s own shape).
- **`backend/src/lib/isAdmin.ts`** / **`backend/src/middleware/requireAdmin.ts`**: the
  email-comparison helper and the middleware built on it, described above.
- **`backend/src/lib/categoryValueType.ts`**: the lowercase-API-vs-SCREAMING_CASE-database
  translation layer, mirroring `lib/habitType.ts` exactly.
- **`backend/src/routes/categories.ts`** / **`categoryLogs.ts`**: full CRUD for regular users,
  mirroring `symptoms.ts`'s read-scoping (`OR: [{ userId: null }, { userId: req.userId }]`) and
  `habitLogs.ts`'s type-aware value validation (`extractTypedValue`, generalized to four types
  plus `SCALE`'s own bounds check against the category's `scaleMin`/`scaleMax`).
- **`backend/src/routes/adminCategories.ts`**: the same four verbs, scoped to `userId: null` only,
  mounted behind both `requireAuth` and `requireAdmin`.
- **`backend/src/routes/auth.ts`**: `serializeUser()` gains a computed `isAdmin` field. This
  function (not `users.ts`'s `/me` handler) is what both `/login` and `/refresh` use to build the
  `user` object `AuthContext` holds - adding `isAdmin` only to `/me` would have left the
  frontend's session-derived admin state stale until a manual refetch.
- **`backend/src/routes/dashboard.ts`** / **`history.ts`**: a fifth parallel `categoryLog` fetch
  in each route's own existing four-way merge, so a custom-category entry appears in Dashboard's
  recent entries and History exactly like a mood/symptom/medication/habit one, with the same
  `id`/`loggedAt` secondary-sort-key ordering already used for the other four.
- **`backend/src/lib/reminderScheduler.ts`**: `hasLoggedToday`'s four-way `Promise.all` gained a
  fifth check, so a day with only a custom-category entry still counts as "logged" for the daily
  reminder nudge.

### Why it's needed

The whole point of this feature is that a user who only cares about, say, habit-tracking and a
handful of their own custom trackers shouldn't have mood/symptom/medication in their way - but
they also shouldn't lose Dashboard's recent-entries list, History, or the reminder nudge just
because their logging happens through a category instead of a built-in type. Threading category
logs through the same merge/eligibility logic the four built-ins already use is what keeps those
features honest for every kind of entry, not just the original four.

### Decisions

- **Additive, not a replacement** - see "Why this is additive" above. The condition that would
  justify reconsidering this: if custom categories become the *primary* way most users log
  anything, at which point the four built-ins' own bespoke UI might be worth generalizing too -
  not before, and not as an assumption baked in now.
- **One hardcoded admin via `ADMIN_EMAIL`, not a role column** - see "The single hardcoded admin"
  above. Revisit only if a second admin account is genuinely needed.
- **Archive, not hard-delete, for `Category`** - a genuine correction made mid-design (see above),
  not the original plan - caught by a design-review pass before any code was written, not found
  as a bug afterward.

### State at end of this step

Task 1 (backend) is complete, tested, and merged on its own branch. Tasks 2 (user-facing
frontend), 3 (admin screen + History filter), and 4 (Trends support, explicit fast-follow) remain
- see [Tasks.md](../../Tasks.md)'s Phase 15. There is currently no frontend UI for any of this at
all; the API exists and is fully usable via direct HTTP calls (e.g. for manual verification) but
not yet reachable from the app itself.

### Verification

- `npm test` (backend): full suite green (266 tests), including new ownership-scoping tests for
  `categories.ts`/`categoryLogs.ts`, `requireAdmin`/admin-route tests (403 for a non-admin, full
  CRUD for the `ADMIN_EMAIL` account, confirmed a system category it creates is visible to a
  completely different regular user but not editable by them), value-type validation per type
  including `SCALE` bounds, and new category-aware cases added to `dashboard.test.ts`/
  `history.test.ts`/`reminderScheduler.test.ts`.
- `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `npx prettier --check`: all clean.
- Also found and fixed, while running the full suite: a pre-existing, unrelated date-drift bug in
  `trends.test.ts` (a hardcoded absolute log date that had drifted outside the 7-day window the
  test itself queries, now anchored to `today` at run time instead) - confirmed unrelated to this
  feature by reproducing the failure in isolation against the pre-existing code before fixing it.
- Also observed: running the *entire* backend suite occasionally fails a single, different,
  pre-existing test each time (once `habitLogs.test.ts`, unrelated to this feature) - reproduced
  across three full-suite runs, twice passing cleanly (266/266) and once failing one unrelated
  test, consistent with environmental flakiness under heavy parallel database load against a
  single local Postgres instance, not a correctness bug in either the existing code or this
  feature. Not chased further here since it's out of this task's scope, but worth knowing about
  if a future CI run shows a single, unrelated, non-reproducible-in-isolation failure.

---
