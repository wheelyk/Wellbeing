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
