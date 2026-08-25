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
