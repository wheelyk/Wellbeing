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
