# Timeline Gets a Third Source: Unscheduled Category Logs

## 2026-09-01 — A category with no reminder was invisible on Timeline, even after being logged

**Task:** A real bug report, with two screenshots: Home's Timeline showed only 2 entries for the
day (a reminder-driven "Candesartan" and "Sertraline" dose), while History showed 11 entries
logged the same day - the other 9 being ad-hoc symptom-tracking categories (Anxiety, Depression,
Headache, Nap, Fatigue, and others) with no reminder attached to any of them. "Timeline on home
page does not show all the categories logged, think it should."

### Background / concepts

#### Why this happened: Timeline's data model was reminders-and-tasks-only

Timeline (see [task 49](49-timeline-panel.md) and [task 50](50-timeline-v2.md)) is built by
merging two calls - `GET /api/reminders/recent` (the past) and `GET /api/reminders/upcoming` (the
future) - plus, since [task 51](51-one-off-tasks.md), a third for one-off Tasks. All three are
fundamentally *schedule*-shaped: a row exists because a reminder or a task said something should
happen at a particular time. A category log with no reminder behind it - which is most real
symptom-tracking in practice, logged whenever something is actually noticed rather than on a
fixed schedule - was never represented in any of the three sources, so it was structurally
impossible for Timeline to show it, no matter how recently it was logged. History, by contrast,
already reads directly from `CategoryLog` rows via `GET /api/history` and has no such gap - which
is exactly why the two pages disagreed.

#### The fix: reuse `GET /api/history` as a fourth Timeline source, not a new endpoint

`GET /api/history` already returns exactly the rows Timeline is missing - every `CategoryLog` for
the account, most recent first. Reusing it directly (rather than inventing new backend
infrastructure) meant two small, additive changes to the existing route:

- **A `?days=` query param**, read the identical "N calendar days back, through today" way the
  other three endpoints' own `days` already works (see `TIMELINE_RANGES`) - so Timeline can ask
  for "everything logged in the last N days" the same way it already asks the other three,
  without the frontend ever computing a `from`/`to` date string itself. That would have meant
  client-side date arithmetic against the *browser's* clock/timezone, not the account's own - the
  same class of bug this project has already hardened against elsewhere (every other date/time on
  Timeline is resolved server-side, in the account's timezone, never derived from `new Date()` in
  the browser). `days` is purely additive: `from`/`to` still work exactly as before for History's
  own filters, and are only skipped when `days` is given and `from` is absent.
- **`date`/`time` fields on each entry**, resolved server-side the identical way every other
  Timeline row already provides them - History's own frontend still computes its own local
  day-grouping key from `loggedAt` directly (deliberately, in the browser's local timezone - see
  `HistoryPage.tsx`'s own comment) and simply ignores these two new fields; nothing about its
  existing behaviour changes.

#### The one real design problem: not showing the same log twice

A `CATEGORY`-target reminder's own "logged" row (from `/recent`) already represents one specific
`CategoryLog` - its `logId` names it exactly (see `reminderRuns.ts`'s `findLoggedTarget`). Merging
in `/api/history`'s own rows naively would show that exact same log a second time, once as the
reminder's own row and once as its own "unscheduled" row. The fix (`mergeWithCategoryLogs` in
`lib/timeline.ts`) collects every `logId` already present among a `CATEGORY`-target reminder's
logged rows and excludes any history entry sharing one of those ids.

A `GENERAL`-target reminder's own "logged" row is different: its match is real (something was
logged that satisfied it) but deliberately ambiguous - a `GENERAL` reminder doesn't name a single
category, so there's no one `CategoryLog` it can point at, and `RecentRun` never gives it a
`logId` at all (confirmed by reading `reminderRuns.ts`: `logId` is only ever populated for
`CATEGORY`). That means a `GENERAL` row never suppresses anything here - the specific entry that
satisfied it still shows up as its own row too. This is deliberate, not a gap: the `GENERAL` row
says "you logged something," and its own category-log row is what actually says what.

### What was done

- **`backend/src/routes/history.ts`**: added `?days=` (validated against the same three values
  `TIMELINE_RANGES` offers - 1/3/7) and `date`/`time` fields on each `HistoryEntry`, both
  resolved via the account's own timezone using the same `timezone.ts` helpers every other route
  already uses.
- **`frontend/src/lib/timeline.ts`**: added `ApiCategoryLogEntry`/`CategoryLogHistoryResponse`
  (mirroring the route's response shape) and `CategoryLogRun` (tagged `kind: "categoryLog"`,
  `when: "past"` always - a category log always has a real, already-happened `loggedAt`, unlike a
  reminder slot or a Task); extended the `TimelineEntry` union to include it. Added
  `mergeWithCategoryLogs` (the dedup merge described above) and a shared `compareChronological`
  helper factored out of what `mergeWithTasks` already did inline. Added `describeCategoryLog`
  (the row's notes, same shape as `describeTask`) and `categoryLogValueTone` (the
  success/neutral pill-tone decision, moved here from a hand-duplicated copy in `HistoryPage.tsx`
  - see Decisions below).
- **`frontend/src/components/dashboard/TimelinePanel.tsx`**: `load()`'s `Promise.all` grew a
  fourth call, `GET /api/history?days=${range}`; its response is mapped to `CategoryLogRun[]` and
  folded in via `mergeWithCategoryLogs`. New `CategoryLogRowItem` component renders each row -
  time, icon+name, notes, and a value pill - matching the same structural pattern every other
  Timeline row already uses. Tapping it dispatches `{type: "edit", logId}` on the existing
  `dashboardTimelineActionEvent`, which `CategoryLogger.tsx` already fully handles (confirmed by
  reading it - no changes needed there at all).
- **`frontend/src/pages/HistoryPage.tsx`**: its own local `historyValueTone` function (and the
  success/neutral decision it made) deleted in favor of importing the now-shared
  `categoryLogValueTone` from `lib/timeline.ts`; the Tailwind class map itself (`HISTORY_VALUE_TONE`)
  stays local to each file, since the two pages don't need pixel-identical styling, only the same
  underlying tone decision.

### Decisions

- **Reused `/api/history` rather than building a new endpoint.** It already returned exactly the
  rows Timeline needed; the only real gaps were a convenience query param and two fields every
  other Timeline row already had. Building a parallel endpoint would have meant either
  duplicating History's own query logic or the two pages drifting apart again the next time one
  changed.
- **`categoryLogValueTone` extracted to `lib/timeline.ts`, not left duplicated.** This was flagged
  as a known limitation in [task 53](53-history-redesign.md) ("a second, hand-copied pill palette
  this task closes," in that doc's own words) - it stayed duplicated until there were genuinely
  two real call sites needing the identical logic, which this task creates. The Tailwind class
  map itself is intentionally *not* shared - only the underlying success/neutral decision is.
- **Dedup keys off `logId`, allowing a `GENERAL`-satisfied log to still show its own row.** See
  Background above - this is the one place the merge has to actively avoid a mistake (a literal
  duplicate for a `CATEGORY` reminder) while deliberately not "fixing" something that only looks
  like a duplicate (a `GENERAL` reminder's row plus the specific log it does not - and cannot -
  name).

### Verification

- **Backend: 3 new tests in `history.test.ts`** (`?days=` filtering with relative timestamps, an
  explicit `from` winning over `days` when both are given, `date`/`time` resolved in a non-UTC
  account timezone), plus the full backend suite: **434 tests across 29 files, green.**
  Mutation-tested: temporarily hard-coded `from = explicitFrom` (dropping the `days` fallback),
  confirmed the new `days` test failed with the wrong result (all entries returned instead of
  the filtered window), restored.
- **Frontend: full suite, 368 tests across 40 files, green.** `npx tsc -b`, `oxlint`, and
  `prettier --check` all clean on every touched file. New coverage: 6 new tests in
  `timeline.test.ts` for `mergeWithCategoryLogs` (adds an unscheduled log; drops a
  `CATEGORY`-reminder-duplicate; keeps a log even when a `GENERAL` reminder's own row shares its
  day; drops only the matching log out of a batch, not the whole batch; sorts chronologically
  against existing entries; handles empty either side) plus `describeCategoryLog` and
  `categoryLogValueTone`; a new `describe("category logs")` block in `TimelinePanel.test.tsx`
  (renders the row with notes and pill; interleaves with reminder rows; the dedup case
  specifically, asserting exactly one "Anxiety" row when a history entry shares a reminder's
  `logId`; dispatches the edit action on tap); the two existing "asks every endpoint" /
  "re-asks every endpoint on range change" tests extended to assert the new
  `/api/history?days=N` call too.
- **Verified against the real running app.** Backend and frontend dev servers on fresh, unused
  ports (4501/5183) after confirming via `Get-CimInstance Win32_Process` that the project's usual
  default ports (4000/4100/4300) were already owned by the backend test suite's own run, not
  anything safe to reuse or touch. Registered a fresh account, logged an ad-hoc entry against a
  seeded system category with no reminder attached (Headache, via Quick Add), and confirmed:
  - the entry now renders on Home's own Timeline panel (`17:00 · Headache · 6/7`), directly under
    the NOW divider - the exact scenario from the original bug report;
  - it still renders on History too, unchanged;
  - switching the range chip away from "Today" doesn't lose it (the 3-day chip wasn't offered in
    this run, correctly - nothing had been logged further back yet for this brand-new account).
- **Not independently reproduced in the browser: the dedup case itself** (a `CATEGORY`-target
  reminder's logged row not duplicating its own history entry). Setting that up manually requires
  creating a reminder with a due schedule and logging through it, which has no existing
  browser-driven helper in this project's e2e suite to build on quickly; this specific behaviour
  is instead covered directly and exactly by the automated `mergeWithCategoryLogs` and
  `TimelinePanel.test.tsx` tests above, which construct the precise `logId`-sharing scenario and
  assert against it.

### Known limitations and follow-ups

- **The dedup case above is unit/component-tested but not end-to-end-tested in a real browser.**
  If a real production report ever surfaces a duplicate row for a reminder-satisfied log, that
  would be the concrete case that justifies adding a reminder-creation helper to
  `frontend/e2e/helpers.ts` and a dedicated e2e spec, rather than adding one speculatively now.
