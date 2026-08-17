# History

## 2026-08-17 — Phase 9: `GET /api/history` and the History page

**Task:** [Tasks.md](../../Tasks.md) → Phase 9 → "Build a History view listing past entries
across all log types, grouped by date (most recent first)," "Add filtering (by entry type
and/or date range)," and "Each entry shows type, value, and time; tapping opens edit; a delete
affordance is available with confirmation." Also touches `requirements.md` §9's list: browse,
filter/group by date, see type, see recorded values, edit, delete.

**Delivered via branch:** `feature/9-history-page`, branched off `main`. Unlike most earlier
vertical slices in this log (which split model → endpoint → frontend form across several
stacked PRs), this one task's brief asked for the backend endpoint and the frontend page
together in a single PR — there's no new database schema involved (every table this endpoint
reads already exists from the mood/symptom/medication/habit logging slices), so there's no
separate "model" step to stack underneath.

### Background / concepts

#### Why this needs its own endpoint instead of the frontend just calling all four existing list endpoints

- The frontend already has `GET /api/mood-logs`, `GET /api/symptom-logs`,
  `GET /api/medication-logs`, and `GET /api/habit-logs` — in principle the History page could
  call all four itself and merge the results client-side, the same way `SymptomSection` and
  `HabitSection` already cross-reference two lists client-side (a log against its parent
  symptom/habit). Two things make that a worse fit here than for those sections:
  - **Pagination.** Each existing per-type endpoint returns its *entire* list, unbounded — fine
    for "this user's mood logs" (rendered inline, all at once, on the Dashboard), but wrong for
    a history view whose whole point is coping with a large amount of accumulated data over
    time. Fetching all four *complete* lists just to show the first 20 combined entries would
    mean downloading everything anyway, defeating the purpose of paginating at all.
  - **Filtering by date range across all four types at once.** The existing endpoints have no
    `from`/`to` query parameters (deliberately deferred to this exact phase — see the mood-logs
    endpoint's own "Decisions" entry). Doing the date filtering client-side, after fetching
    everything, would run into the same unbounded-download problem as above.
- So `backend/src/routes/history.ts` is a new, read-only endpoint that queries all four
  existing tables server-side (still going through Prisma, still scoped to `req.userId` exactly
  like every other query in this codebase), merges them into one chronological list, and returns
  only the page actually requested. It doesn't replace the four per-type endpoints — those are
  still what the Dashboard's Quick Add sections use, and still what History's delete action
  calls (more on that below) — it's purely an additional, read-optimized *view* over the same
  underlying data.

#### What "pagination" actually means here, and why offset-based (not cursor-based)

- **The problem pagination solves:** without it, "load my history" means "load literally every
  entry I have ever logged, in one response" — fine for a brand-new account with three entries,
  increasingly slow and wasteful for someone who's used this app daily for two years. Pagination
  means the server hands back a bounded *page* of results (here, 20 by default, configurable up
  to 100 via `?limit=`) plus enough information for the client to ask for the next page.
- **Two common styles**, and why this endpoint uses the simpler one:
  - **Offset-based** (`?limit=20&offset=40` means "skip the first 40, give me the next 20").
    Simple to reason about and to jump to an arbitrary page, but can, in the general case,
    return duplicate or skipped rows if data is inserted/deleted *between* two page requests
    (page 2 shifts if something on page 1 was deleted in between). Used here.
  - **Cursor-based** (`?after=<opaque-token>` — "give me the 20 rows after whatever this token
    points at"). More robust against exactly the insert/delete-between-pages problem above, but
    needs a stable sort key to build the cursor from.
  - The reason cursor-based pagination was **not** used here, specifically: a cursor for this
    endpoint would need to encode a position across *four separate tables* at once (mood logs,
    symptom logs, medication logs, habit logs each have their own independent primary keys and
    insertion order) — there's no single underlying table with one natural row-ordering to point
    a cursor at, the way `GET /api/mood-logs` alone would have if it needed pagination. Building
    a correct multi-table cursor is real extra complexity for an MVP where "a user might delete
    an entry between loading page 1 and page 2 of their own history" is a rare, low-stakes edge
    case (worst case: a very occasional duplicate or skipped row in that narrow window) — not
    worth the design cost yet. Offset-based, with the trade-off documented here plainly rather
    than silently, was the pragmatic MVP choice.

#### Merging four independently-sorted lists into one correctly-paginated page

- Given the offset-based choice above, the actual query logic in `history.ts` works like this:
  query each of the (up to four, depending on the `?type=` filter) relevant tables independently,
  each already sorted `loggedAt` descending, each capped at `offset + limit + 1` rows. Combine
  all the results into one array, re-sort that combined array by `loggedAt` descending (breaking
  exact-timestamp ties by `id`, so the order is deterministic and pagination doesn't jitter
  between two requests that happen to tie), then slice out exactly the requested
  `[offset, offset + limit)` window.
- **Why capping each table's own query at `offset + limit + 1` (not something smaller) is
  actually correct, not just "probably enough":** this is a standard technique for merging `k`
  sorted streams (here, `k` = up to 4) and taking the top `N` items of the merged result — as
  long as each individual stream contributes at least its first `N` items to the merge, the
  correct top-`N` merged result is guaranteed to be produced entirely from those contributions
  (an item that would appear in positions `N+1` or later of *its own* table's sorted order can
  never end up in the merged top `N`, so it's safe to never fetch it in the first place). The
  `+1` beyond `offset + limit` specifically exists to compute `hasMore` *exactly* rather than
  guessing — if the merged, capped result has more than `offset + limit` entries in it, there is
  genuinely at least one more entry beyond the current page; if it doesn't, there genuinely
  isn't, because every table was asked for one more than strictly needed and none of them had
  it. (An earlier draft capped at exactly `offset + limit` and inferred `hasMore` from whether
  the merged total exceeded that number — which turned out to have a real edge case: if there
  was exactly one type with entries in the whole page, its query would be truncated at the cap
  with no way to tell whether more existed just past it. Working through that edge case by hand,
  before writing any code, is what led to fetching one extra row per table instead of patching
  the symptom after the fact.)
- This whole merge-then-slice happens in the Node process, in memory, not as one combined SQL
  query — deliberately: mood/symptom/medication/habit logs are four separate Postgres tables
  with no shared "all my entries" table or view to `UNION` across cheaply while also joining in
  the symptom/medication/habit names each one needs for its display label. For the realistic
  size of a single user's paginated history (a handful of small queries capped at roughly 100
  rows each, worst case), doing the merge in application code is simple, correct, and fast
  enough — a materialized cross-table view is a reasonable future optimization if history sizes
  or query volume ever demand it, not something this MVP needs yet.

#### Why the response includes a `label`, not raw per-type fields

- Every other endpoint in this codebase (`GET /api/mood-logs`, etc.) returns bare rows and lets
  the frontend format them for display (see `MoodSection.tsx`'s inline `Mood {log.mood}/5`,
  `HabitSection.tsx`'s `formatHabitValue`, and so on) — each Section component already knows how
  to render its own one log type. `GET /api/history` is different because a single response
  mixes *four* differently-shaped rows together, and — critically — a symptom log's meaningful
  display value depends on a *second* table (the symptom's `name`, via `symptomId`) exactly the
  way `SymptomSection` already resolves it client-side today. Rather than have the History page
  re-implement all four of those formatting rules (and separately fetch symptoms/medications/
  habits just to resolve names, defeating some of the point of a single unified endpoint), the
  backend does the `include: { symptom: true }` / `include: { medication: true }` /
  `include: { habit: true }` joins itself and pre-formats one `label: string` per entry (e.g.
  `"Headache — Severity 6/10"`, `"Ibuprofen — Taken"`, `"Exercise: Done"`). The frontend then
  only ever needs to render `entry.label` plus the small amount of shared metadata (`type`,
  `notes`, `loggedAt`, `id`) every entry has regardless of type.

#### Grouping by date is a *frontend* concern, on purpose

- Tasks.md's wording is "listing past entries... grouped by date." The actual grouping (turning
  a flat, time-sorted list into `{ "Monday, 17 August 2026": [...], "Sunday, 16 August 2026":
  [...] }`-shaped buckets for display) happens entirely in `HistoryPage.tsx`'s `groupByDate`
  helper, not in the API response. The backend's only job is returning entries in the right
  *order* — grouping is a pure, cheap, presentation-only transformation of an already-sorted
  list, and doing it client-side means the API stays simple (a flat paginated list, the same
  shape every other list endpoint in this app already returns) rather than needing to reason
  about "what if a page boundary falls in the middle of a day's entries" as a *server-side*
  concern (it doesn't need to — the frontend just re-groups the flat list it has after every
  fetch, including after "Load more" appends a new page onto the end).
- One deliberate subtlety: grouping uses each entry's **local calendar date** (the viewer's
  browser timezone), not the raw UTC date the timestamp is stored as — built from
  `date.getFullYear()`/`getMonth()`/`getDate()`, not any UTC-based method. An entry logged at
  11pm local time and stored as, say, `2026-08-17T23:00:00-05:00` (which is already
  `2026-08-18T04:00:00Z` in UTC) needs to land in the "August 17th" group for a user in that
  timezone — grouping by the raw UTC date would put it in the wrong day for anyone not in UTC
  themselves.

#### Delete still goes through the four existing per-type endpoints — `/api/history` is read-only

- `GET /api/history` never becomes the target of a `DELETE`. Deleting an entry from the History
  page calls whichever of `DELETE /api/mood-logs/:id` / `/api/symptom-logs/:id` /
  `/api/medication-logs/:id` / `/api/habit-logs/:id` actually owns that entry's `type` — the
  same four endpoints `MoodSection.tsx`/`SymptomSection.tsx`/`MedicationSection.tsx`/
  `HabitSection.tsx` already call from the Dashboard. `HistoryPage.tsx`'s `DELETE_PATH` constant
  is just a `Record<HistoryEntryType, string>` lookup table mapping each of the four `type`
  values the unified endpoint returns back to its owning endpoint's base path. This keeps
  delete logic (ownership checks, cascading behavior, the `{ error: { message, code } }` shape
  on failure) living in exactly one place per log type, rather than duplicating it inside a new
  `/api/history/:id` route that would need to re-derive which underlying table a given `id`
  belongs to before it could do anything.
- The delete flow itself follows the same optimistic-update-with-rollback shape
  `MoodSection.tsx`'s `handleDelete` already established: remove the entry from local state
  immediately (so the UI feels instant), call the DELETE endpoint, and if it fails, put the
  entry back. The one addition beyond that existing pattern: a `window.confirm(...)` guard
  before the optimistic removal even starts, satisfying `requirements.md` §15's "confirmation
  for destructive actions" (already echoed in Tasks.md's Phase 7 cross-cutting item, "Delete
  actions require a lightweight confirmation"). A real `Modal` component doesn't exist in this
  codebase yet (it's still an unchecked Phase 5 primitive) — `window.confirm` is the simplest
  thing that satisfies "a lightweight confirmation" without inventing a one-off custom dialog
  component ahead of that later, shared piece of work.

#### Why editing is *not* built here, on purpose — not an oversight

- `requirements.md` §9 lists "Edit entries" as a History requirement, and Tasks.md's Phase 9
  checklist literally says "tapping opens edit." **This PR deliberately does not build that.**
  A separate, parallel task in this codebase is building reusable, pre-filled entry-edit forms
  that cover all four log types at once (the still-unchecked Phase 7 item: "Edit and delete
  actions available from Dashboard/History for every log type, reusing the same forms pre-filled
  with existing values"). If this task built its own one-off "edit a history entry" flow instead
  of waiting for that shared work, the app would end up with two independent, likely-divergent
  implementations of "edit a mood/symptom/medication/habit log" — one bolted onto History, one
  built properly and shared with the Dashboard — that would need reconciling later anyway. This
  is exactly the same reasoning the mood-logging vertical slice's own Phase 7 entry used to
  justify shipping delete-without-edit on the Dashboard originally: ship what's genuinely usable
  now, without pre-building a piece of a not-yet-started shared task.
- Concretely: every entry in the History list renders a visible, disabled **Edit** button
  (`title="Editing is coming soon"`, with a matching `aria-label`) right next to the working
  Delete button, plus a `// TODO(history-edit): wire this up once the pre-filled entry-edit
  forms land (see Tasks.md Phase 7...)` comment at the exact spot in `HistoryPage.tsx` where the
  click handler will eventually go. The button being *visible but disabled*, rather than simply
  absent, is itself a small deliberate choice: it signals to anyone using the app (or reading
  the code) that editing is a known, planned, near-term capability — not a feature nobody
  thought of yet.
- **Tasks.md reflects this explicitly, not silently.** The Phase 9 checklist item covering this
  ("Each entry shows type, value, and time; tapping opens edit; a delete affordance is available
  with confirmation") is checked off with an inline note that the "opens edit" half specifically
  remains unimplemented and why — see the *What was done* section below and the diff of
  `Tasks.md` in this PR.

### What was done

1. **`backend/src/routes/history.ts` (new).** A single `GET /` route (mounted at
   `/api/history`, behind `requireAuth`, in `app.ts`): validates `?type=mood|symptom|
   medication|habit` (optional), `?from=`/`?to=` (optional, `YYYY-MM-DD`, `from` must not be
   after `to`), and `?limit=`/`?offset=` (optional, `limit` capped at 100, defaulting to 20) via
   Zod; queries the four relevant tables in parallel (`Promise.all`), each scoped to
   `req.userId` and the date range, each with the type-specific `include` needed to resolve a
   display name (`symptom`/`medication`/`habit`); merges, sorts, and paginates them as described
   above; returns `{ entries, limit, offset, hasMore }`.
2. **`backend/src/app.ts`.** One new import and one new mount line:
   `app.use("/api/history", requireAuth, historyRouter)`, alongside the other seven route
   groups, in the same place and style as every other router.
3. **Tests (`backend/src/routes/history.test.ts`, new).** 401-without-a-token; a full unified
   list across all four types (seeded with explicit `loggedAt` timestamps an hour apart so
   ordering assertions are exact, not timing-dependent), asserting both the sort order and each
   type's exact `label` string; filtering by `?type=`; filtering by `?from=`/`?to=` (inclusive
   range); rejecting `from` after `to`; rejecting an invalid `type` or malformed date; a
   dedicated pagination test seeding five same-user mood logs and walking `limit=2` across three
   pages, asserting each page's contents, `hasMore` at every step (`true, true, false`), and that
   no entry appears on more than one page; and a cross-user scoping test confirming a second
   user's entries never leak into the first user's results.
4. **`frontend/src/pages/HistoryPage.tsx` (new).** Fetches `/api/history` on mount and whenever
   the type/from/to filters change (resetting to `offset=0` on any filter change, since a new
   filter invalidates whatever pages were already loaded); renders filter controls (a type
   `<select>`, two `<input type="date">` fields, a "Clear filters" button shown only once a
   filter is active); groups the fetched entries by local calendar date via `groupByDate` and
   renders one heading + list per day; each entry shows its type (as a small uppercase label),
   its pre-formatted `label`, its logged time, a disabled "coming soon" Edit button, and a
   working Delete button (confirmation dialog → optimistic removal → per-type `DELETE` call →
   rollback on failure, as described above); a "Load more" button appears whenever the last
   fetched page reported `hasMore: true`, and fetches+appends the next page without disturbing
   what's already rendered; loading/empty/error states throughout.
5. **`frontend/src/App.tsx`.** Changed exactly the `/history` route's element from
   `<PlaceholderPage title="History" />` to `<HistoryPage />`, plus the corresponding import —
   nothing else in this file touched.
6. **Tests (`frontend/src/pages/HistoryPage.test.tsx`, new).** Rendering grouped entries across
   two distinct calendar days with correct labels/notes; the empty state; the error state; the
   type filter triggering a refetch with the right query string; delete rolling back on a failed
   `DELETE`; delete succeeding and the entry disappearing for good; declining the confirmation
   dialog leaving the entry untouched and firing no second request; "Load more" fetching and
   appending a second page; the Edit button rendering disabled. Each test mocking `fetch` with
   `.mockImplementation(...)` (branching on the request URL/method), not `.mockResolvedValue(...)`
   — this page fires more than one `fetch` call per interaction in several tests (initial load
   then a refetch, or initial load then a DELETE), and `.mockResolvedValue` would hand back the
   same already-consumed `Response` object to every call, which is the exact gotcha
   `docs/log/08-git-github-workflow.md` documents from an earlier PR in this codebase.
7. **`backend`: `npm test`** — 121/121 passing (111 pre-existing, 10 new). **`npm run build`** —
   compiled cleanly. **`npx eslint .`** — clean. **`npx prettier --check .`** — clean (after one
   `--write` pass over the two new backend files).
8. **`frontend`: `npm test`** — 77/77 passing (69 pre-existing, 8 new). **`npm run build`** —
   compiled cleanly (one real `noUnusedParameters` compile error caught and fixed along the way —
   an intentionally-unused mock callback parameter needed the `_`-prefix convention TypeScript
   recognizes). **`npm run lint`** (`oxlint`) — clean (the one pre-existing, unrelated
   `AuthContext.tsx` fast-refresh warning, untouched by this task). **`npx prettier --check .`**
   — clean (after one `--write` pass over the two new frontend files).
9. **Isolated local dev environment**, per this task's own instructions (this branch was built
   in a git worktree alongside other agents working on unrelated features in the same repo):
   backend on port `4102` against a dedicated `welltrack_history` Postgres database (existing
   migrations applied via `prisma migrate deploy`, no new migration needed since this task adds
   no schema), frontend dev server on port `5175`, fresh random JWT secrets, `npm install` run
   fresh in both projects (this worktree had no `node_modules` yet), and `npx prisma db seed`
   run once to populate the usual system symptoms for realistic manual testing.
10. **Real browser verification (Playwright, headless Chromium, against the actual running dev
    servers)** — not just the mocked test suites above. Registered a throwaway user, used the
    Dashboard's existing Quick Add flow to log one real entry of each of the four types (mood,
    symptom, medication, and a newly-created habit), then navigated to History via the actual
    nav-bar link (not a raw URL load): confirmed all four entries render, correctly grouped
    under a single date heading, each with its resolved display name (the symptom and habit
    names, not raw IDs) and correct label; filtered by type and confirmed only the matching
    entry remained visible; cleared the filter and deleted the symptom entry, confirming it was
    genuinely gone afterward; confirmed the Edit buttons render but are disabled. Zero browser
    console errors at any point. Screenshots taken and visually reviewed at three points (all
    entries; filtered; after delete). Cleaned up the two browser-created test users afterward
    (directly via Prisma) and stopped both manually-started dev servers.
11. **`Tasks.md`.** Checked off the first two Phase 9 items ("Build a History view listing past
    entries...grouped by date" and "Add filtering..."). The third item ("Each entry shows type,
    value, and time; tapping opens edit; a delete affordance is available with confirmation")
    is checked off too, since type/value/time/delete are all genuinely done — with an inline
    note that "opens edit" is intentionally deferred to the shared Phase 7 edit-forms task, per
    the *Decisions* section below, so a future reader sees a deliberate choice, not a dropped
    requirement.

### Why it's needed

Every log type built so far (mood, symptoms, medications, habits) can be created and browsed on
the Dashboard, but only as a short "recent entries" list per type, with no way to see everything
together, no way to jump back to a specific past date, and no pagination once that per-type list
grows large. History is the feature that actually makes a multi-week or multi-month wellness
record usable — the point of tracking symptoms/mood/medications/habits over time is being able
to look back and find something, which requirements §9 states directly: "History should make it
straightforward to locate an entry from a previous day."

### Decisions

- **Offset-based pagination, not cursor-based.** Covered in detail above — a correct cursor
  would need to encode a position across four independently-keyed tables at once, which is real
  extra complexity this MVP's realistic history sizes don't yet justify. The trade-off (a rare
  possibility of a duplicate/skipped row if data changes between two page loads) is documented
  here plainly, not hidden.
- **Merging four per-type queries in application code, not one combined SQL query.** No shared
  table or view exists to `UNION` across while also joining in each type's display-name lookup;
  doing the merge in Node, capped correctly per the k-way-merge argument above, is simple and
  fast enough at this data scale.
- **The backend pre-formats a `label` string per entry, rather than returning raw per-type
  fields for the frontend to format.** A single response mixing four differently-shaped rows —
  one of which (symptom) already needs a second-table name lookup — is a natural fit for
  resolving that formatting once, server-side, rather than teaching the History page to
  duplicate four separate formatting rules (and their name-resolution joins) that already exist,
  in slightly different form, across the four Dashboard Section components.
- **Grouping by date is frontend-only.** The API returns a flat, correctly-sorted, paginated
  list; turning that into date-headed groups (using the *viewer's local* calendar date, not UTC)
  is a cheap, pure, presentation-layer concern that doesn't need to complicate the API's shape or
  reasoning about page boundaries falling mid-day.
- **Delete reuses the four existing per-type endpoints; there is no `DELETE /api/history/:id`.**
  Keeps ownership/cascade/error-shape logic for each log type living in exactly one place.
- **`window.confirm` for the delete confirmation, not a custom dialog.** This codebase has no
  `Modal` primitive yet (still an unchecked Phase 5 item) — building a one-off custom
  confirmation dialog just for this feature would likely need reworking once that shared
  component exists; the native browser confirm is the simplest thing that satisfies the
  "lightweight confirmation for destructive actions" requirement today.
- **Editing is explicitly out of scope for this PR**, despite being listed in both
  `requirements.md` §9 and this phase's Tasks.md wording. Covered in detail above: a parallel
  task is building shared, pre-filled edit forms for all four log types at once, and building a
  second, one-off edit flow here would create exactly the kind of divergent-implementation
  problem this codebase has already deliberately avoided elsewhere (e.g. the mood-logging
  slice's original delete-without-edit Dashboard entry). A visibly-present-but-disabled Edit
  button, a `TODO(history-edit)` comment at the exact call-site, and an explicit note on the
  Tasks.md checklist item all exist specifically so this reads as a deliberate, tracked decision
  to any future reader — not a forgotten requirement.

### State at end of this step

A real user can browse their complete history across all four log types in one place, filter it
by type and/or date range, page through it without downloading their entire history at once, and
delete any entry (with confirmation) directly from that view — all verified in a real browser,
not just the automated test suites. Editing from History is intentionally not yet wired up; the
visible, disabled Edit button and the `TODO(history-edit)` comment mark exactly where that will
connect once the shared, pre-filled edit-forms task lands.

### Verification

- Backend: `npm test` (`vitest run`) — 121/121 passing (111 pre-existing, 10 new). `npm run
  build` — compiled cleanly. `npx eslint .` / `npx prettier --check .` — both clean.
- Frontend: `npm test` (`vitest run`) — 77/77 passing (69 pre-existing, 8 new). `npm run build`
  — compiled cleanly. `npm run lint` (`oxlint`) / `npx prettier --check .` — both clean (one
  pre-existing, unrelated warning noted above).
- Real headless-browser walkthrough (Playwright) against the actual running backend (port 4102)
  and frontend (port 5175) dev servers, in this task's own isolated worktree environment: full
  register → log one entry of each of the four types via the Dashboard's existing Quick Add flow
  → navigate to History via the nav bar → confirm correct grouped rendering and resolved names →
  filter by type → clear filter → delete an entry → confirm it's genuinely gone → confirm Edit
  buttons render disabled. Zero browser console errors. Screenshots reviewed at three states.
  Test users and screenshot artifacts cleaned up afterward.

---
