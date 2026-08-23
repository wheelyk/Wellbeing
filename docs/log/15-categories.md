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

## 2026-08-23 — Task 2: user-facing frontend (Dashboard, Quick Add, Settings)

**Task:** [Phase 15, Task 2](../../Tasks.md#task-2--frontend-user-facing-custom-categories) —
letting a regular user actually create and log against their own categories from the app itself,
on top of Task 1's backend.

### What was done

- **`frontend/src/components/CategoryCreateForm.tsx`** (new): the same role
  `HabitCreateForm.tsx` plays for habits - a small, focused "define a category" form, generalized
  to four value types (boolean/numeric/scale/duration) instead of habit's original three, plus an
  optional icon field (categories are dynamic, so their icon can't live in a fixed frontend
  lookup table the way the four built-ins' icons do).
- **`frontend/src/components/CategoryEntryForm.tsx`** (new): generalizes `HabitEntryForm.tsx`'s
  type-branching pattern to all four value types. The new "scale" type reuses `RatingScale.tsx`
  directly (previously used only by Mood's energy/stress and Symptom's severity) rather than a
  new control - the values array is built from the selected category's own `scaleMin`/`scaleMax`,
  so an out-of-range value can't be picked in the UI at all, on top of the server's own bounds
  check.
- **`frontend/src/components/dashboard/CategorySection.tsx`** (new): unlike the four fixed
  Dashboard sections (`MoodSection.tsx` etc. - one file each, by this project's own established
  "adding a log type means adding a file" convention), this one is deliberately the exception -
  data-driven, looping over whatever `GET /api/categories` returns, since custom categories are
  unbounded and created at any time by a user or the admin, unlike the four fixed types.
- **`frontend/src/components/dashboard/QuickAddFab.tsx`**: gained one 5th static "More…" entry
  dispatching the `"category"` quick-add type - its existing four-item array stays exactly as
  hardcoded as it already was (that convention is deliberate, per its own code comment, and this
  is additive to it, not a departure from it).
- **`frontend/src/pages/SettingsPage.tsx`**: a new `CategoriesSection`, following the existing
  `SectionCard`+`CollapsibleSection` convention every other Settings section already uses. Lists
  every visible category (the user's own plus any system/admin ones), with inline rename and
  archive for the user's own only - a system category simply shows no actions at all, mirroring
  how the backend's own routes 404 on a system category's id for a regular user's mutation
  attempt (there's nothing to protect by disabling a button that would fail anyway, but a
  visibly-absent action reads more clearly than one that errors on click).
- **`frontend/src/components/dashboard/DashboardSummary.tsx`**: the "Recent entries" merge now
  includes a `"category"` type with an embedded `categoryId`/`icon` - rendered using that
  category's own icon, falling back to a generic one only if none was set.
- **`frontend/src/lib/dashboardQuickAddEvent.ts`** / **`dashboardEntryChangedEvent.ts`**: both
  type unions widened to include `"category"`.

### Why it's needed

A backend API with no way to reach it from the app isn't a usable feature yet - this task is
what actually lets a user (not just a direct HTTP client) create their own category and see it
show up everywhere Task 1 wired it into (Dashboard's recent entries, the reminder nudge).

### Decisions

- **`CategorySection` is the one Dashboard section allowed to be data-driven**, deliberately
  breaking the "one file per log type" convention the other four sections follow - noted directly
  in its own code comment so it doesn't read as an oversight or an inconsistency to "fix" later.
- **`QuickAddFab`'s four-item array stays hardcoded** - adding a 5th static "More…" entry (rather
  than making the whole array data-driven) was the resolution to a real tension flagged during
  planning: an unbounded, admin-and-user-created category list can't live inside an array meant
  to stay a fixed, deliberately-hardcoded four.
- **Settings shows no action at all for a system category**, rather than a disabled Edit/Archive
  button - a category a user can never mutate doesn't need a control that would only ever explain
  itself with an error.

### State at end of this step

Tasks 1 and 2 are complete: a user can create a personal category from either Dashboard's Quick
Add ("More…") or Settings, log entries against it, see those entries in Dashboard's recent
entries, and rename/archive their own categories from Settings. Still missing: an admin screen
for creating system-wide categories (Task 3 - until then, a system category can only be created
directly against the database, e.g. via `prisma.category.create`), and History's type filter
doesn't yet know about `"category"` as an option (also Task 3). Trends has no per-category chart
yet (Task 4, explicit fast-follow).

### Verification

- `npm test` (frontend): full suite green (262 tests), including new
  `CategoryCreateForm`/`CategoryEntryForm`/`CategorySection` test files and a new
  `SettingsPage — categories` describe block (list/create/edit/archive, and confirming a system
  category never shows Edit/Archive).
- `npx tsc --noEmit`, `npm run build`, `npm run lint` (oxlint), `npx prettier --check`: all clean.
- **Manual, real-browser verification** against the actual running dev servers (not just
  automated tests): registered a throwaway account, used Quick Add's new "More…" entry to create
  a scale category ("Energy level", 1-5, with an icon), logged an entry against it, confirmed it
  appeared in Dashboard's Recent Entries with its own icon, confirmed the same category appeared
  in Settings with working Edit/Archive controls, archived it, and deleted the account - a real
  Playwright run driving the actual UI, not a mocked one, then deleted afterward (this was a
  one-off verification script, not a permanent addition to the e2e suite).

---

## 2026-08-23 — Task 3: admin screen + History integration

**Task:** [Phase 15, Task 3](../../Tasks.md#task-3--frontend-admin-screen--history-integration) —
the last required piece: a screen for the one hardcoded admin to add system-wide categories, and
History learning about the new `"category"` type. (Task 4, Trends support, remains an explicit,
non-blocking fast-follow.)

### What was done

- **`frontend/src/auth/AuthContext.tsx`**: `AuthUser` gains `isAdmin: boolean` (already present
  on the backend's login/refresh/`/me` responses since Task 1).
- **`frontend/src/auth/RequireAdmin.tsx`** (new): mirrors `RequireAuth.tsx`'s exact shape,
  checking `user?.isAdmin` instead of `isAuthenticated`. Nested *inside* a `RequireAuth` route in
  `App.tsx` (authentication is already settled by the time this ever runs), and redirects to
  `/dashboard`, not `/login`, on failure - a non-admin authenticated user isn't unauthenticated,
  so a different redirect target reflects that.
- **`frontend/src/pages/admin/AdminCategoriesPage.tsx`** (new), routed at `/admin/categories`:
  lists every system-wide category, with create/edit/archive for all of them (there's no
  ownership distinction to make here - every row shown exists on this page only because it's
  already system-wide). `CategoryCreateForm.tsx` gained an optional `createEndpoint` prop
  (defaulting to `/api/categories`) so this page can reuse the exact same form, pointed at
  `/api/admin/categories` instead.
- **`frontend/src/pages/SettingsPage.tsx`**: a "Manage global categories (admin)" link, rendered
  only when `user?.isAdmin` - the only surface this ever needs, since there's exactly one admin
  account.
- **`frontend/src/pages/HistoryPage.tsx`**: `HistoryEntryType`/`TYPE_LABELS`/`DELETE_PATH` gained
  a `"category"` entry. Deliberately one broad "Category" filter bucket, not one filter option
  per individual category - the backend's own `/api/history?type=` has always been type-level
  granularity for the other four types too (never "just this one symptom"), so this matches that
  existing precedent instead of introducing a finer filter dimension nothing else here has.
- **`frontend/src/pages/history/HistoryEditModal.tsx`** / **`historyLogApi.ts`**: gained a
  `"category"` branch reusing `CategoryEntryForm.tsx` directly (the same "reuse the Dashboard's
  own form for History's edit dialog" pattern the other four types already use), plus
  `fetchCategoryLog`/`fetchCategories`/`categoryLabel` mirroring the existing habit equivalents.

### Why it's needed

An admin who can only create categories by hand-writing a database row isn't really a feature -
this is what makes "an admin adds a new built-in category for everyone" something that actually
happens through the app. History's own gap (not recognizing `"category"` as a real type at all)
would otherwise have made every custom-category entry silently disappear from History's filter
options and its edit flow, even though Dashboard already fully supported them after Task 2.

### Decisions

- **`RequireAdmin` redirects to Dashboard, not Login.** A non-admin authenticated user has a
  perfectly valid session - "you're logged in, but this page isn't for you" is a different case
  from "you're not logged in at all," and the redirect target should say so.
- **History's "Category" filter is type-level, not per-category.** Adding true per-category
  filtering would need a new backend query parameter (`categoryId`, not just `type`) - a real,
  separate feature, not implied by this task's own scope. Matching the granularity every other
  filter option already has is the honest version of "extend the filter," not a shortcut.
- **`AdminCategoriesPage` is its own separate component, not a shared one with Settings'
  `CategoriesSection`.** The two have genuinely different semantics (ownership-scoped partial
  edit rights vs. blanket edit rights over everything shown) - a shared component would need to
  grow conditional logic for a distinction that only really exists between these two call sites,
  the same "three similar lines beat a premature abstraction" call this project makes elsewhere.

### State at end of this step

All three required tasks for custom categories are complete: a user can create their own
categories (Task 2) or see ones the admin created for everyone (Task 3), log entries against any
of them, and see those entries in Dashboard, History (including its own edit/delete/filter), and
counted toward streaks/reminders (Task 1). Only Task 4 (Trends support for numeric/scale custom
categories) remains, tracked as an explicit, non-blocking fast-follow in
[Tasks.md](../../Tasks.md).

### Verification

- `npm test` (frontend): full suite green (275 tests), including new `RequireAdmin.test.tsx`,
  `AdminCategoriesPage.test.tsx`, and category-aware additions to `HistoryPage.test.tsx`
  (rendering, filtering, deleting, and a full pre-filled-edit-and-save round trip) and
  `SettingsPage.test.tsx` (admin link shown/hidden correctly).
- `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npx prettier --check`: all clean.
- **Real-browser manual verification** against the actual running dev servers: logged in as the
  real `admin-dev@example.com` account (matching `backend/.env`'s `ADMIN_EMAIL`), confirmed
  Settings shows the admin link, created a system-wide category via `/admin/categories`, logged
  out. Registered a completely different, brand-new regular user; confirmed navigating directly
  to `/admin/categories` redirects them to Dashboard; confirmed the new category appeared in
  their Settings with no admin link and no edit/archive controls; logged an entry against it via
  Quick Add's "More…"; confirmed it appeared correctly in History filtered by "Category". Cleaned
  up afterward: archived the test category via the admin API, deleted the regular throwaway
  account.

---
