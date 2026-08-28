# Category Groups

## 2026-08-28 — Organizing categories into collapsible groups, with hide/rename for groups themselves

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item - direct product feedback after
reviewing a design mockup of Settings' own category list, which had grown long and flat (every
system category from every former built-in, plus each user's own, in one undifferentiated list -
see [docs/log/17-unify-mood-symptom-habit.md](17-unify-mood-symptom-habit.md) and
[19-medication-to-category.md](19-medication-to-category.md) for how it got that way). The mockup
was iterated on directly with the project owner (six named groups - Medicine, Symptom, Mind &
Mood, Activity, Drink, Food - each collapsible, plus confirmation that grouping should eventually
show everywhere, not just Settings) before any code was written. Scope for this task specifically
was narrowed and confirmed up front: **group management (create, hide, rename) and a grouped
Settings UI only** - reordering, drag-and-drop, a favorites/star quick-filter, and extending
grouping display to Dashboard/Quick Add/History are all deliberately deferred, not attempted here.

### Background / concepts

#### Why "hide," not "delete," for groups - and why hide is offered on *every* group, not just built-in ones

`Category` already draws a sharp line between **hide** (a per-user preference toggle, reversible,
offered only for a *system* category the caller doesn't own - see
[docs/log/17-unify-mood-symptom-habit.md](17-unify-mood-symptom-habit.md)) and **delete**
(owner-only, a real 30-day soft-delete with restore - see
[22-category-soft-delete-with-undo.md](22-category-soft-delete-with-undo.md)), because a personal
category can carry real logged history that must never quietly vanish, while a system category a
user doesn't want to see has no history of the user's own to protect - hiding it is enough.

A `CategoryGroup` is different from both: it carries **no logged history of its own** (only the
categories inside it do, and those keep their own independent hide/delete state regardless of what
happens to their group). There's also no delete mechanism for a group yet. Put those two facts
together and hiding is the *only* tool available to get a regretted custom group out of view - so,
unlike `Category`, `CategoryGroup`'s hide is offered on **any** visible group, built-in or the
caller's own, not restricted to system-owned ones. This was stated to the project owner up front,
along with the matching call that **rename stays owner-only** (matching how category editing
already works) - neither was contested.

### What was done

1. **Backend - two new models** (`schema.prisma`): `CategoryGroup` (`id`, nullable `userId` -
   `null` = built-in/system, set = personal, mirroring `Category`'s own convention exactly; `name`;
   optional `icon`; `createdAt`) and `HiddenGroup` (`userId`, `groupId`, unique on the pair) - a
   direct structural copy of `Category`/`HiddenCategory`. `Category` itself gained a nullable
   `groupId` (`onDelete: SetNull` - a category is never deleted just because its group somehow
   went away) plus an index on it.
2. **Backend - the data migration** (`backend/prisma/migrations/20260828061220_category_groups/`):
   seeds the six confirmed groups with **fixed UUIDs** (the same "hardcode the id so a later
   `UPDATE` can reference it directly" pattern already used for Mood/Energy/Stress in
   [17-unify-mood-symptom-habit.md](17-unify-mood-symptom-habit.md)), then assigns every existing
   seeded system category into its matching group: the eight severity-style symptoms into
   "Symptom," Mood/Energy/Stress into "Mind & Mood." Verified directly against the real local dev
   database via `psql` (not just "it ran without erroring," per this project's own working
   principle) - confirmed exactly 6 groups, the right 8 categories under Symptom, the right 3 under
   Mind & Mood, and confirmed unrelated leftover system categories (a stray "Screen time," "Water
   intake (global)," and a Vitest test artifact) were correctly left ungrouped rather than
   guessed-assigned.
3. **Backend - `backend/src/routes/categoryGroups.ts`** (new router, mounted at
   `/api/category-groups`): `GET /` (built-ins plus the caller's own, `includeHidden=true` opt-in
   the same way `categories.ts` already works), `POST /`, `PATCH /:id` (owner-scoped, undifferentiated
   404 for "doesn't exist" vs. "not yours," matching `categories.ts`), and `POST`/`DELETE /:id/hide`
   (scoped to *any* visible group per the Decisions above, not just system ones).
4. **A real bug caught before it shipped, not by a failing test but by reasoning through the
   query**: the natural first draft of `GET /`'s `orderBy` was `[{ userId: "asc" }, { createdAt:
   "asc" }]`, intended to put system groups (`userId: null`) first. Postgres sorts `NULL` **last**
   in ascending order by default, so this would have done the opposite - pushed every built-in group
   after every personal one. Fixed by dropping `userId` from the backend `orderBy` entirely (now
   just `createdAt: "asc"`, which is what keeps the six seeded groups in their intended order within
   whichever partition they land in) and doing the system-vs-personal split client-side instead, in
   `SettingsPage.tsx`'s own `sections` computation. Documented in-line in `categoryGroups.ts` so a
   future edit doesn't accidentally reintroduce the same ordering bug.
5. **Backend - `categories.ts` and `adminCategories.ts` extended** to accept and validate
   `groupId` on create/edit. New `isGroupIdValid()` helper (mirroring the ID-tampering-defense
   pattern already established in `reminders.ts`'s own `categoryId` handling) scopes the lookup to
   groups the caller can actually see before trusting a foreign id from the request body, 404ing
   with `GROUP_NOT_FOUND` otherwise. `adminCategories.ts` gets its own tighter
   `isSystemGroupIdValid()` (system groups, `userId: null`, only) - an admin creating a system
   category must never be able to assign it into a regular user's private group. This admin-route
   extension wasn't originally in scope, but leaving it out would have created a real functional
   gap: system categories can only ever be touched through the owner-scoped `/api/categories` route
   (which 404s on `userId: null` rows) or the admin route, so without this, a newly admin-created
   system category could never be assigned to any group at all.
6. **Frontend - `CategoryCreateForm.tsx`**: `Category` gained a required `groupId: string | null`
   field; a new exported `CategoryGroup` type mirrors what `GET /api/category-groups` returns; a new
   optional `groups` prop drives an optional group `<select>` in the form (only rendered when at
   least one group is offered, so a caller that hasn't been updated to pass groups yet renders
   exactly as before).
7. **Frontend - `SettingsPage.tsx`'s `CategoriesSection`, a near-total rewrite**: fetches groups
   alongside categories on mount; a new `GroupSection` component renders one collapsible block per
   group (plus a synthetic "Uncategorized" block, shown only when at least one category actually has
   no group) with a header row (icon, name, Built-in/Hidden tags, category count, expand/collapse
   chevron) and, beside it, independent Hide/Unhide and (owner-only) Rename actions. Categories
   within each group reuse a newly extracted `CategoryRow` component (a near-verbatim pull-out of
   the row rendering that already existed, just parameterized) whose inline edit form now also
   offers the same group `<select>`, so moving a category between groups (or back to Uncategorized,
   via an explicit empty selection) happens from the category's own Edit action. A "+ New group"
   button/inline form sits alongside the existing "+ New category" one.
8. **A structural HTML/React problem, and how it was solved**: `CollapsibleSection` (the component
   every other Settings section already uses) renders its *entire* header as one clickable
   `<button>` - there's no room inside it for a second, independent Hide/Rename action without
   nesting a `<button>` inside a `<button>` (invalid HTML, and it would also toggle the section on
   every click). `GroupSection` is instead built directly on `useCollapsedState` - the same hook
   `CollapsibleSection` itself is built on - giving full control over the header layout, mirroring
   the "toggle plus independent action button" header `SectionPanel.tsx` had already established
   elsewhere in this codebase for the identical reason. (Calling `useCollapsedState` once per group,
   inside `GroupSection` rather than inside a `.map()` callback in the parent, is also what keeps
   this a valid use of React's rules of hooks - a hook can only be called inside a component or
   another hook, never inside a loop body directly.)
9. **Tests**: `categoryGroups.test.ts` (new, 10 tests) covers auth, listing (built-ins plus own,
   never another user's), create/validate, rename (including explicit-`null` icon clearing, and
   404s for missing/another's/built-in), hide/unhide for both built-in and owned groups (including
   `includeHidden=true` visibility and per-caller isolation), and idempotent re-hide/unhide.
   `categories.test.ts` gained 6 tests for `groupId` on create/edit (correct value round-tripped,
   `null` for none, rejecting an invalid or another user's private group, moving between groups and
   back to `null`). `adminCategories.test.ts` gained 1 test (admin assigns a system category to
   "Medicine," then is rejected assigning to a regular user's private group). `CategoryEntryForm.test.tsx`
   needed `groupId: null` added to its four pre-existing `Category` fixtures once the field became
   required (the only test file `tsc -b` flagged - other files build category-shaped objects more
   loosely and aren't type-checked against `Category` directly). `SettingsPage.test.tsx`'s own
   `routedFetchMock` helper gained an automatic default for `GET /api/category-groups` (an empty
   array, unless a test overrides it) - without it, every existing category-list test failed, since
   `CategoriesSection`'s `Promise.all([fetch categories, fetch groups])` now rejects as a whole the
   moment either half is unhandled by the mock, tripping the section's own `.catch(() =>
   setLoadError(true))` and rendering "Couldn't load your categories" instead of any content.

### Why it's needed

Directly addresses the product feedback that started this: a category list that had grown long and
flat as more built-ins folded into the generic `Category` model over several prior tasks now reads
as six named, collapsible groups instead - closer to how a user actually thinks about "my
medicines" vs. "my symptoms" vs. everything else, and a foundation the deferred favorites/reorder/
drag-and-drop work can build on without redesigning the data model again.

### Decisions

- **Scope: Settings-only, hide + rename only.** Confirmed directly and stated up front: reorder and
  drag-and-drop "could follow on" (the project owner's own words) rather than landing in this task;
  a delete action for groups, the ⭐ favorites/quick-filter idea, and extending grouped display to
  Dashboard/Quick Add/History are all likewise deferred, not attempted here.
- **Hide is available on any visible group - built-in or the caller's own - unlike `Category`'s
  system-only hide.** See the Background section above for the full reasoning: a group carries no
  history of its own, and there's no delete mechanism for one yet, so hiding is the only way to get
  a regretted custom group out of view. **Rename stays owner-only**, matching how category editing
  already works - a built-in group's name is never editable by a regular user, mirroring how a
  built-in category's name isn't either.
- **`orderBy` deliberately omits `userId`** on the backend, partitioning system-vs-personal groups
  client-side instead - see the Postgres `NULL`-sorts-last bug above. Anywhere else in this codebase
  that sorts by a nullable `userId` column should check for the same trap before assuming ascending
  order puts `null` first.
- **The admin route was extended too, even though it wasn't originally in scope**, once it became
  clear that skipping it would make a newly admin-created system category permanently ungroupable -
  see point 5 above.
- **Not resolved in this task**: `AdminCategoriesPage.tsx` (the admin-facing frontend page) still
  doesn't pass a `groups` prop to `CategoryCreateForm`, so an admin can't yet actually *use* the
  group-assignment support just added to `adminCategories.ts` through the UI - only directly via the
  API. Left as a known, named gap rather than silently expanded into scope.

### Verification

- `npm test` (backend): full suite green - 229 tests across 21 files (10 new in
  `categoryGroups.test.ts`, 6 new in `categories.test.ts`, 1 new in `adminCategories.test.ts`).
- `npx vitest run` (frontend): full suite green - 203 tests across 30 files (all 40 of
  `SettingsPage.test.tsx`'s own tests, including every pre-existing category test, pass against the
  new grouped DOM structure once the mock's default `/api/category-groups` handler was added).
- `npx tsc -b`/`npx tsc --noEmit` (both projects), `npm run lint` (oxlint/eslint, both projects),
  `npx prettier --check .` (both projects), `npm run build` (frontend): all clean.
- The migration's data correctness was verified directly against the real local dev database via
  `psql` (see point 2 above), not just "it ran without erroring," per this project's own stated
  working principle.
- Manual, real-browser, end-to-end verification via a temporary Playwright script (not committed)
  against real running dev servers (backend :4000, frontend :5173, real Postgres) at a 412×915
  mobile viewport, with browser console errors tracked and asserted to be zero throughout: registered
  a fresh account; confirmed Symptom and Mind & Mood show their pre-assigned seeded categories;
  created a custom group ("Work Stuff," icon 💼); created a new category assigned to it via the
  group picker; confirmed the built-in Symptom group has no Rename button (only Hide) while the
  custom group has both; renamed the custom group ("Work Stuff" → "Work Life"); hid and unhid both
  the custom group and a built-in one (Food), confirming the Hidden tag and Unhide action appear and
  the group stays visible in this management list throughout (since Settings fetches
  `includeHidden=true`); moved the category back to Uncategorized via its own Edit form and
  confirmed the synthetic "Uncategorized" section appeared with it inside. Screenshots taken at each
  step and reviewed directly.
- Not proven by any of the above: behavior once grouping is extended beyond Settings (Dashboard,
  Quick Add, History), since that's explicitly out of scope for this task - those surfaces still
  show categories exactly as they did before this change.

---
