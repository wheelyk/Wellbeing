# Per-Category Dashboard Cards

## 2026-08-26 — Task 1: Backend — category activity/filtering support

**Task:** [Phase 18, Task 1](../../Tasks.md#task-1--backend-category-activityfiltering-support) -
direct user feedback on the live app after Phase 17 landed: once Habit, Symptom, and Mood all
became ordinary categories, the single "Your categories" card on Dashboard mixed every category's
entries together under one vague heading, unlike `MedicationSection`'s own dedicated "Recent
medications" card - repetitive and unclear what belonged where. Confirmed directly with the project
owner: each category a user has actually logged at least once should get its own "Recent `<name>`"
card, with its own "+" logging directly to that one category. This task is the small backend
prerequisite Task 2 (the actual Dashboard redesign) needs: a way to know _which_ categories a user
has ever logged, and a way to page through _one_ category's own history independently of every
other category's.

### Background / concepts

#### Why `lastLoggedAt`, not just a boolean `hasLogs` flag

The frontend needs two things out of this, not one: whether a category gets a card _at all_, and
what order those cards render in. A plain boolean would answer the first question but not the
second - Task 2's own design (confirmed with the project owner) sorts cards most-recently-logged
first, the same "Recent" framing every other section already uses. Returning the actual timestamp
answers both from one field, computed by one `groupBy` query alongside the existing category list
fetch - no extra round trip, and no separate endpoint needed.

#### Scoped to the caller specifically, not "has anyone logged this category"

A system category (`userId: null`) can be logged by any number of different users. `lastLoggedAt`
answers "has _this caller_ logged it," not "has it ever been logged by anyone" - the same ownership
boundary every other per-user field in this API already respects. A brand-new user must not see a
system category's card just because some other user happens to log it constantly.

### What was done

- **`backend/src/routes/categories.ts`**: `GET /` now runs a second query alongside the existing
  category fetch - `prisma.categoryLog.groupBy({ by: ["categoryId"], where: { userId: req.userId },
_max: { loggedAt: true } })` - and serializes each category with a new `lastLoggedAt: string |
null` field (`null` if the caller has never logged it, an ISO timestamp of their own most recent
  log against it otherwise).
- **`backend/src/routes/categoryLogs.ts`**: `GET /` gains an optional `?categoryId=` query filter,
  narrowing the returned page to just that one category's logs - still scoped to `userId: req.userId`
  underneath, so passing another category's id can never leak a different category's (or another
  user's) data, it just returns however many of the caller's _own_ logs match.
- **Tests**: `categories.test.ts` gained three new tests (`lastLoggedAt` is `null` before any log;
  reflects the most recent of several logs, not just any one of them; is scoped per-caller even
  against a shared system category). `categoryLogs.test.ts` gained two new tests (`?categoryId=`
  returns only that category's own logs for the caller; never returns another user's logs even when
  the id names a shared system category both users have logged).

### Why it's needed

Without this, Task 2's per-category cards would have no way to know which categories to render a
card for (short of fetching a user's _entire_ combined log history client-side just to compute
distinct category ids - wasteful, and breaks down once a user has more logs than one page), or to
page through one category's own history independently of every other category's.

### Decisions

- **One `groupBy` query, not a per-category subquery** - keeps `GET /api/categories`'s cost fixed
  at two queries total regardless of how many categories exist, rather than N+1.
- **`lastLoggedAt` added to the existing `GET /api/categories` response**, not a separate endpoint -
  every other consumer of that endpoint (the Quick Add category picker, Settings' management list,
  `RemindersSection`'s own category picker) is unaffected by an extra field they simply don't read,
  and Task 2 gets everything it needs from a fetch that already has to happen anyway.

### Verification

- `npm test` (backend): full suite green - 231 tests across 21 files (5 new: 3 in
  `categories.test.ts`, 2 in `categoryLogs.test.ts`).
- `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `npx prettier --check .`: all clean.
- Manual, real-server verification (curl against a running local backend, not just the automated
  suite): created a category, confirmed `GET /api/categories` returned `lastLoggedAt: null` for it;
  logged one entry against it, confirmed the same category's `lastLoggedAt` in a fresh `GET
/api/categories` call now matched that log's own `loggedAt` exactly; confirmed `GET
/api/category-logs?categoryId=<id>` returned exactly that one log.

---

## 2026-08-26 — Task 2: Frontend — split "Your categories" into per-category cards

**Task:** [Phase 18, Task 2](../../Tasks.md#task-2--frontend-split-your-categories-into-per-category-cards)
- the actual Dashboard redesign Task 1 was the backend prerequisite for. Two design questions were
put directly to the project owner before building this, since guessing wrong risked making a
brand-new account's Dashboard *more* cluttered, not less (11 system categories, each with an empty
card, greeting every new user): should a category's card appear only once logged, or always for
every unhidden category regardless of history; and should each card get its own "+", or should
logging still go through one shared picker. Both were answered with the recommended option: **only
once logged**, and **each card gets its own +**.

### Background / concepts

#### Why the orchestrator/card split, not one bigger component

`CategorySection` used to be both "fetch everything" and "render one merged list." It's now split
into two roles: `CategorySection` fetches `/api/categories` once and decides *which* categories get
a card and in what order (derived purely from `lastLoggedAt`, Task 1's new field); `CategoryLogCard`
is a self-contained card - own fetch (`?categoryId=`, Task 1's other new bit), own pagination, own
edit/delete, own "+" - one instance per qualifying category. This mirrors `MedicationSection`'s own
shape almost exactly, which is what made this tractable: `SectionPanel`'s existing design (each
instance is an independent grid child, keyed by its own `storageKey`) already supported rendering an
arbitrary number of these as siblings with zero changes to `DashboardPage.tsx` itself.

#### Why "only once logged" needs no special-casing for hidden categories

`GET /api/categories`'s default response (no `?includeHidden=true`) already excludes any category
the caller has hidden via Settings (Phase 17) - this is the same fetch Quick Add and Dashboard have
always used. A hidden category therefore never appears in `CategorySection`'s own `categories` state
at all, so it can neither get a card nor appear in the discovery picker - "hide" and "only-once-
logged" compose for free, without either mechanism needing to know about the other.

#### Why a card that loses its last log has to disappear itself, not wait for a reload

The "only appears once logged" rule has a symmetric case the two clarifying questions didn't cover
explicitly: what happens when a user deletes the *one* log a category has, from that category's own
card? Leaving an empty card sitting there until the next full page reload would undercut the exact
tidiness this feature exists for. `CategoryLogCard` calls a new `onEmptied` callback the instant its
own local log list goes to zero with no further page behind it; `CategorySection` responds by
setting that category's local `lastLoggedAt` back to `null`, which drops it out of the rendered card
list on the next render - no re-fetch needed, matching how *appearing* is already handled (see
`handleDiscoveryLogSaved` below).

#### Reusing `CategoryEntryForm` instead of a second form component

Phase 18's Task 2 prep (in this same branch) added an optional `hideCategoryPicker` prop to
`CategoryEntryForm` rather than writing a second, parallel form - `CategoryLogCard` passes a
single-element `categories={[category]}` array plus `initialCategoryId={category.id}` and
`hideCategoryPicker`, which is enough for the form's existing `categoryId`/`selectedCategory`
resolution logic to work exactly as it already did; only the JSX for the picker `<select>` itself is
conditionally skipped.

### What was done

- **New `frontend/src/components/dashboard/CategoryLogCard.tsx`**: one dedicated card per
  already-logged category. Titled `Recent <icon> <name>`, `storageKey="category-<id>"` (unique per
  card, so each remembers its own collapsed state and is independently reachable as a Quick Add
  scroll target). Its own paginated fetch (`/api/category-logs?categoryId=<id>&limit=&offset=`), own
  Load more/less, own Edit/Delete per entry, own "+" opening `CategoryEntryForm` locked to that one
  category. Log rows show just the value (e.g. `6`, `Done`, `5/5`) rather than repeating the
  category's own name on every row - the old merged list needed the name on each row because rows
  from different categories were interleaved; a card scoped to one category doesn't need that
  repetition, which is itself a direct fix for the "lots of repetition" complaint that started this
  phase.
- **Rewrote `frontend/src/components/dashboard/CategorySection.tsx`** as the orchestrator: fetches
  `/api/categories` once, derives `categoriesWithLogs` (`lastLoggedAt !== null`, sorted
  most-recently-logged first) and renders one `CategoryLogCard` per entry. A single, always-present
  "Log a category" panel (same `SectionPanel`, `storageKey="category-discovery"`) remains as the one
  entry point for logging a category for the first time or defining a brand-new one - still reachable
  from `QuickAddFab`'s "More…" via the same `listenForDashboardQuickAdd("category", ...)` wiring as
  before. Its own picker only offers categories that don't already have a card
  (`undiscoveredCategories`); if every visible category already has one, its "+" goes straight to
  "Create a new category" instead of an empty picker. Saving through it updates that category's
  `lastLoggedAt` locally (from the new log's own `loggedAt`), which is what promotes it into its own
  card immediately, with no extra fetch.
- **Local `DashboardCategory = Category & { hidden: boolean; lastLoggedAt: string | null }` type** in
  `CategorySection.tsx` - the base `Category` type (in `CategoryCreateForm.tsx`) is left alone since a
  freshly-created category (from `CategoryCreateForm`'s `onCreated`) has neither field; this mirrors
  `SettingsPage.tsx`'s own pre-existing `ManagedCategory` pattern for the same reason.
- **`frontend/scripts/capture-pr-screenshots.mjs`** (the script `.github/workflows/pr-preview.yml`
  runs to post before/after screenshots on every PR): updated its two post-save assertions, which
  waited for text like `Mood: 5/5` and `Exercise: Done` from the old merged list - now waits for each
  category's own card title (`Recent Mood`, `Recent Exercise`) instead, since that text no longer
  exists anywhere on the page.
- **Tests**: `CategorySection.test.tsx` rewritten for the new architecture - a logged category gets
  its own titled card showing just the value; a never-logged category gets no card; empty/error
  states; edit-in-place (confirming the picker is genuinely hidden on a card's own edit form); a
  card disappearing once its last entry is deleted; a category being promoted into its own card via
  the discovery flow. `DashboardPage.test.tsx`'s two references to the old "Your categories" title
  updated to "Log a category" (a composition-level guard, not a re-test of `CategorySection`'s own
  behavior - unaffected otherwise).

### Why it's needed

This is the actual fix for the reported problem: one shared card mixing every category's entries
under a vague heading, unlike Medication's own dedicated card, reading as repetitive and unclear.

### Decisions

- **Visibility and sort order both come from one field (`lastLoggedAt`), never re-fetched** - a
  category's card appears the instant its `lastLoggedAt` turns non-null in local state (on discovery
  save) and disappears the instant it turns `null` again (on last-log delete), keeping the two rules
  ("only once logged" and "removed if it becomes unlogged again") mechanically identical instead of
  needing separate code paths.
- **The discovery picker excludes categories that already have a card.** Logging an
  already-carded category through the shared picker instead of that card's own "+" would leave the
  new entry invisible in that card's own list until a reload (each card only fetches its own history
  once, on mount) - excluding already-carded categories from the picker steers users to the correct,
  already-live entry point instead of leaving a silent staleness gap.
- **Log rows inside a card show only the value, not `<name>: <value>`** - deliberate, not an
  oversight; see the "What was done" note above.

### Verification

- `npx vitest run` (frontend): full suite green - 234 tests across 32 files.
- `npx tsc -b`, `npm run build`, `npx oxlint` (lint), `npx prettier --check`: all clean, no new
  warnings introduced.
- Manual, real-browser verification via Playwright against the actual running dev servers (backend
  on :4000, frontend on :5173, real Postgres) - not just the automated suite:
  - Ran the updated `capture-pr-screenshots.mjs` end to end against a freshly registered account:
    registered, logged Mood (5/5) via the discovery picker, logged a Medication, created a brand-new
    "Exercise" category and logged it - confirmed `Recent Mood`, `Recent Exercise`, and `Recent
    medications` all render as separate cards, each with its own "+" and Edit/Delete, with the
    "Log a category" panel unaffected above them. No unexpected browser console errors.
  - A second ad hoc script (not committed - scratch only) confirmed the two behaviors screenshots
    alone don't prove: clicking a card's own "+" (e.g. Mood's) opens a dialog titled "Log Mood" with
    the category `<select>` genuinely absent from the DOM (not just visually hidden); and hiding
    Mood via Settings' existing Hide action, then returning to Dashboard, removes the "Recent Mood"
    card entirely (count: 0) without needing a full page reload.
- Not proven by any of the above: behavior under concurrent edits from two open tabs, or with a
  very large number of categories (dozens) - out of scope for this task's verification, same as
  every other Dashboard section's own existing coverage.

---
