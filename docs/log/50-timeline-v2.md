# Timeline v2: Compact Dividers, Newest First, and Tap-to-Log

## 2026-08-31 — The banner moves back up, the per-category list retires, and rows do something

**Task:** A second round of feedback on the just-shipped Timeline panel (task 3 of the Home
Timeline redesign, [#166](49-timeline-panel.md)): reuse the NOW divider's own compact style for
every day heading, default to newest-first with a toggle back to the original order, only offer
the wider range chips once there's data to justify them, move the date/welcome banner back above
Timeline and fold "Log a category" into it as "Log an entry for today," retire the per-category
card list entirely now that Timeline covers what it showed, and let a tap on a Timeline row edit
or log an entry directly.

### Background / concepts

#### A row needs more than a state to be tappable

Every field GET /api/reminders/recent and /api/reminders/upcoming returned before this task was
enough to *describe* a run, but not enough to *act* on one - `category` carried a name and icon,
never an id, and neither endpoint said which `CategoryLog` row (if any) made a "logged" slot
logged. Tapping a row to edit it needs the exact log; tapping one to add an entry needs the exact
category, locked, the same way each of the four now-retired `CategoryLogCard`s used to lock its
own form to itself.

Two small, additive backend changes closed this gap:

- `REMINDER_INCLUDE`'s `category` select gained `id` alongside `name`/`icon` - it already joined
  the row, just never selected the one field a client-side lock needs.
- `reminderRuns.ts` gained `findLoggedTarget`, returning the matched log's `{ id }` instead of a
  bare boolean; `hasLoggedTarget` (used by the scheduler and by /upcoming, neither of which needs
  the id) is now a one-line wrapper around it, so nothing else had to change to keep working.

`/recent`'s own `RecentRun` now carries `categoryId` and `logId`, both nullable - `logId` only
non-null for a **CATEGORY**-target reminder's "logged" row. A GENERAL reminder's "any category log
at all" match is real (`findLoggedTarget` genuinely finds one), but deliberately not exposed: which
log answers "have I logged anything today" is ambiguous by construction, and a row that can't name
one exact entry isn't given an id to point an edit action at. `/upcoming`'s `UpcomingRun` gained
`categoryId` too (for the locked-add case), but no `logId` - a future "logged" row is already
satisfied and has nothing to edit or add (see `timelineRowAction` below).

Editing also needs the log's full stored values, which neither endpoint returns (they're previews,
not the record itself) - `GET /api/category-logs/:id` is new, auth-scoped exactly like the
existing PATCH/DELETE (`404`, not `403`, for another user's log), returning the plain row.

#### One shared modal, three independent triggers

Before this task, "log a category" lived in `CategorySection`: it fetched `/api/categories`, owned
the discovery-and-create modal, listened for `QuickAddFab`'s `dashboardQuickAddEvent`, *and*
rendered every per-category card below it. This task needed the modal machinery to also open
locked to one category (a Timeline "add" tap) or pre-filled for editing (a Timeline "edit" tap) -
two new, more specific requests than the event that already existed was shaped to carry.

Rather than grow `dashboardQuickAddEvent` a payload it never needed for its own two callers
(`QuickAddFab`'s "+" and, new in this task, `DashboardSummary`'s own button), a second event -
`dashboardTimelineActionEvent`, carrying `{ type: "add", categoryId }` or `{ type: "edit", logId }`
- was added alongside it, matching this app's own established "a tiny, loose DOM CustomEvent
contract, not a shared store" pattern. `CategorySection` itself is retired; what remains of it
(the categories fetch, the modal, the create-category sub-flow) moved into a new component,
`CategoryLogger`, which renders no visible chrome of its own and listens for both events.

### What was done

- **Backend**: `REMINDER_INCLUDE.category` selects `id`; `reminderRuns.ts`'s `findLoggedTarget`;
  `/recent`'s `RecentRun` gained `categoryId`/`logId`; `/upcoming`'s `UpcomingRun` gained
  `categoryId`; new `GET /api/category-logs/:id`.
- **`lib/timeline.ts`**: `BaseRun` gained `categoryId`; `RecentRun`/`TimelineRun` gained `logId`.
  New pure functions: `orderRuns` (a plain reverse for "newest first" - see its own comment on why
  reversing the flat list before grouping is enough to reverse everything downstream of it),
  `splitAroundNow` (replaces the inline past/future filter that used to live in `TimelinePanel`,
  now order-aware), `hasLoggedWithinDays` (the range-chip visibility check), and
  `timelineRowAction` (one decision table: edit, locked add, unlocked add, or nothing).
- **`TimelinePanel.tsx`**: day headings now render as a thin rule plus a small pill label - the
  NOW divider's own shape, reused rather than duplicated, just neutral-toned so NOW's brand-blue
  pill still stands out. Defaults to newest-first with a toggle beside the range chips. A second,
  one-off `days=7` probe (re-run whenever any Dashboard section reports a save) decides which of
  the 3/7-day chips to show at all; "Today" is never gated by it. Each row is a real `<button>`
  when `timelineRowAction` returns one, dispatching `dashboardTimelineActionEvent`; the one case
  with nothing to do (a future row already logged) renders as plain, non-interactive text.
- **`CategoryLogger.tsx`** (new): the discovery-and-logging modal, extracted from `CategorySection`
  minus the per-category cards and minus its own visible panel/button. Listens for both
  `dashboardQuickAddEvent` (unlocked) and `dashboardTimelineActionEvent` (locked add, or edit -
  which fetches the log first, since editing needs its full stored values). Falls back to the
  unlocked picker if a Timeline row's `categoryId` is no longer in the fetched list (archived or
  hidden since Timeline's own data loaded) rather than opening a dead form.
- **`DashboardSummary.tsx`**: `streak` dropped from the byline entirely, on direct feedback that it
  wasn't earning its place (the backend still computes and returns it - unused here, same as
  `recentEntries` before it). Gained the "+ Log an entry for today" button, dispatching the same
  `dashboardQuickAddEvent` `QuickAddFab` already does.
- **`DashboardPage.tsx`**: `DashboardSummary` moved back above `TimelinePanel` (it sat below for
  one task - see Decisions). `CategorySection` and its per-category card grid are gone; `CategoryLogger`
  mounts once, rendering nothing visible.
- **Deleted**: `CategorySection.tsx`/`.test.tsx`, `CategoryLogCard.tsx`, `SectionPanel.tsx`/`.test.tsx`
  (the last of these had exactly two callers, both gone).

### Decisions

- **The banner moves back above Timeline.** [Task 3](49-timeline-panel.md) put Timeline first,
  deliberately, on the theory that "what did I log/miss/have coming up" outranks a day-summary
  card. Direct feedback reversed that: a page's own "what day is it, who am I, how do I log
  something" frame reads better first, with the chronological detail underneath it - not a
  contradiction of the earlier reasoning, just a real preference the earlier task didn't have
  in hand yet.

- **Newest-first is the default; the toggle remembers nothing.** Not persisted to `localStorage`
  (unlike the range, which also isn't) - a small, cheap control, not a setting worth carrying
  between sessions yet. Revisit if real usage shows people flipping it every time.

- **Range chips are gated on logged history, not on "is there anything to show."** A reminder with
  nothing logged in the last week can still have plenty *scheduled* a week out, but the chips exist
  to answer "how far back is worth looking," and a chip that would only ever reveal more scheduled
  rows (already visible without widening the window - upcoming reminders repeat) isn't the same
  offer as one that reveals more of what actually happened. "Today" is exempt from the check
  entirely: it's the default view regardless of history.

- **The click action is decided per-row, not per-panel.** `timelineRowAction`'s four-way split
  (edit / locked add / unlocked add / nothing) reads entirely off a row's own `when`, `state`,
  `categoryId` and `logId` - no global "are rows clickable" flag, so a future row that's already
  satisfied correctly renders inert without `TimelinePanel` needing a special case for it.

- **A GENERAL row's "add" opens the full picker; its "logged" state offers nothing.** Logging
  something new is always valid, so an unlocked add makes sense even though there's no one
  category to lock to. Editing does not: `findLoggedTarget`'s GENERAL match is real but arbitrary
  (any category could have satisfied it), so no id is exposed for it to edit, matching the past
  decision to keep `hasLoggedTarget`'s own "any log at all" semantics unnarrowed.

### Verification

- **Frontend: 318 tests across 39 files, green.** `tsc -b`, oxlint, prettier, `npm run build`
  clean. Net: `CategoryLogger.test.tsx` (10, including the regression test below) new;
  `timeline.test.ts` grew from 15 to 28 tests
  (`orderRuns`, `splitAroundNow`, `hasLoggedWithinDays`, `timelineRowAction`); `TimelinePanel.test.tsx`
  grew from 9 to 17 (order default/toggle, chip visibility, the three row-click outcomes);
  `DashboardSummary.test.tsx` grew from 10 to 11 (one streak-specific test removed, two added: no
  streak text anywhere, and the new button's event dispatch); `DashboardPage.test.tsx` unchanged
  in count (2), updated for the new layout and copy.
- **Full local e2e suite (4/4) and `capture-pr-screenshots.mjs`, run directly against real dev
  servers and a real Postgres database** after the `h2:text-is` fixes above - not just trusted to
  CI a third time.
- **Backend: 403 tests across 27 files, green.** Five new this task (three for `/recent`'s
  `categoryId`/`logId` shape, two for the new `GET /category-logs/:id`); two pre-existing
  exact-match tests (one per endpoint) updated for the new fields they now assert against literally
  rather than with `objectContaining`.
- **Driven end-to-end in a real browser**, mobile (412px) and desktop (1280px), against live dev
  servers and a real Postgres database - registered a fresh account, created a boolean category
  (Sertraline) and a scale category (Anxiety), a reminder for each, and logged Sertraline for today
  and yesterday:
  - Banner renders first, with "Logged 1 entry today" and the new button; Timeline renders below
    it with the pill-style TODAY/NOW dividers and both wider-range chips visible (a logged entry
    exists within both windows).
  - Newest-first by default: Anxiety (future) above NOW, Sertraline (past, Logged) below it.
    Toggling to "Oldest first" swapped them, confirmed via `compareDocumentPosition`.
  - Tapping the Anxiety row (due, unlogged) opened "Log an entry" locked to Anxiety - no category
    picker, its scale (1-7) rendered directly.
  - Tapping the Sertraline row (logged) opened "Edit entry" with "Yes" and the real logged
    timestamp already selected - not a blank form.
  - The banner's own button opened the full, unlocked picker (a `<select>` listing both
    categories), confirming it still reaches the same shared modal as the FAB always has.

- **CI caught the same class of stale-selector bug the e2e spec had in the previous PR - twice,
  in two different jobs.** `capture-pr-screenshots.mjs` still clicked `getByRole("button", { name:
  "Add category entry" })` (retired with `CategorySection`) and waited for each category's own
  `<h2>` card heading to appear (retired with `CategoryLogCard`). A repo-wide grep for those
  retired component names (not scoped to `frontend/e2e/`, the earlier PR's own lesson) found that
  and fixed it, plus two now-stale historical comments in
  `dashboardQuickAddEvent.ts`/`dashboardEntryChangedEvent.ts` naming `CategorySection` as a
  component that no longer exists. Pushed, and CI's *e2e* job then failed the same way, in three
  more places (`account-deletion.spec.ts`, `edit-and-delete.spec.ts`,
  `quick-add-and-dashboard.spec.ts`) - a `waitForSelector('h2:text-is("Mood")')`-shaped wait that a
  grep for retired *component names* was never going to find, since the selector itself never
  named one. The real lesson underneath the earlier one: grep for the retired **signal** (here,
  every `h2:text-is` wait in the whole repo) once you know what broke, not only the name of what
  was deleted - a name-based grep only catches call sites that happen to say the name out loud.
  All four sites now wait for the dialog to close (`[role="dialog"]` detaching) as their
  save-succeeded signal instead, since there's no more per-category card to wait on;
  `quick-add-and-dashboard.spec.ts`'s own final per-category assertions (checking each card's
  saved value) moved to History, the one place that still lists all four entries by name and
  value regardless of the retired card list or the fact that none of them has a reminder attached.

- **A real bug this same browser pass caught, that no unit test had.** `handleCategoryCreated`'s
  first version reused `UNLOCKED(next)` - the same helper the plain unlocked-picker path uses,
  which hard-codes "nothing pre-selected" - instead of pre-selecting the category just defined.
  The form silently landed on whichever category sorted first alphabetically (a pre-existing
  system one, ahead of most personal ones) rather than the one the caller had just spent an extra
  step defining; saving without noticing would have logged against the wrong category entirely.
  Caught because the screenshot-preview CI job (see below) exercises exactly this "create a new
  category, then log it" path end to end, using a real value-type mismatch (a boolean category
  landing on a scale one) that surfaced as a missing "Yes"/"No" radio - a symptom obvious enough
  in a screenshot diff to investigate, but not something any existing unit test drove. Fixed by
  setting `initialCategoryId: category.id` explicitly, and a new regression test added
  (`CategoryLogger.test.tsx`, "pre-selects the category just created") - mutation-checked by
  reverting the fix and confirming that exact test fails (`cat-anxiety` instead of the expected
  new id), then reverted back.

### Known limitations and follow-ups

- **The order toggle and range are both session-only state.** Neither survives a reload. Not
  observed as a complaint yet, but worth watching for once more people use the toggle regularly.
- **The range-chip probe is a third request, not folded into the other two.** A `days=7` fetch,
  independent of whatever range is actually selected, runs once on mount and again on every
  `dashboardEntryChangedEvent`. Simpler than teaching either main fetch to answer both questions at
  once, at the cost of one extra request most page loads don't otherwise need.
- **A GENERAL row's "logged" state still can't be edited**, by design (see Decisions) - if this
  turns out to matter in practice, the fix would be narrowing what counts as a GENERAL match in the
  first place, not exposing an arbitrary id.
- **History still looks and filters the way it did before this task.** Reusing Timeline's day-
  divider format there, adding a Group filter alongside Category, and adding quick 7/30/90-day
  range pills is the next task in this same round of feedback - see the mockup this task and that
  one were both scoped from.

---
