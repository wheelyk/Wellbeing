# The Timeline Panel

## 2026-08-30 — Past, now, and future in one list

**Task:** Task 3, the last of the Home Timeline design: merge `/upcoming` ([#160–163](45-coming-up-panel.md)),
`/recent` ([#164](47-recent-reminders.md)), and `DashboardSummary`'s own Recent Entries list into a single
chronological panel — what was logged, what was missed, what's coming up, with a clear line for
"now" in between.

### Background / concepts

#### Two servers, no client-side merge logic beyond concatenation

`/recent` returns rows at or before the current moment; `/upcoming` returns rows strictly after it
([documented on both routes](42-upcoming-reminders.md)). That means the two lists are already in
the right order _relative to each other_ — every `/recent` row genuinely precedes every
`/upcoming` row, including on a shared "today". `mergeRuns` is therefore concatenation, not a sort:

```ts
export function mergeRuns(
  recent: RecentRun[],
  upcoming: UpcomingRun[],
): TimelineRun[] {
  return [
    ...recent.map((run): TimelineRun => ({ ...run, when: "past" })),
    ...upcoming.map((run): TimelineRun => ({ ...run, when: "future" })),
  ];
}
```

The `when` tag is the only genuinely new idea in the merge. It is what lets the panel draw the NOW
divider correctly even though a single calendar day ("Today") can legitimately hold rows from
_both_ responses — grouping by date alone would put them in one section (which is exactly what we
want), but only `when` says where inside that section the divider goes.

#### One shared range value, not two independently-derived windows

The design's own mockup drew symmetric windows — "3 days" as yesterday, today, tomorrow. Building
that literally would need each endpoint to accept day-counts (2, 4) that neither `/recent` nor
`/upcoming` validates, for a one-off UI. Instead, `/upcoming`'s own accepted values were realigned
from `1/7/30` to `1/3/7` (its old panel is retired in this same task, so nothing else depends on
the old set), and the Timeline sends the _same_ `days` value to both endpoints. Each side already
reads "N days" as "N days including today, in its own direction" — a convention both had
independently before this panel existed — so this is one input asking each endpoint for exactly
what it already knows how to answer. The visible window is `2N − 1` calendar days for `N > 1`
(today is shared by both sides), not `N` — stated plainly as a deliberate simplification, not the
design's literal table.

### What was done

- **`lib/timeline.ts`** — replaces `lib/upcoming.ts` entirely. Unifies `RecentRun`/`UpcomingRun`
  into `TimelineRun`, adds `mergeRuns`, extends day-labeling with "Yesterday", and extends
  `describeRun`/`stateLabel` to cover the new `missed` state.
- **`TimelinePanel`** — replaces `UpcomingRemindersPanel` entirely. Fetches both endpoints in
  parallel, merges, groups by day, and renders a NOW divider inside whichever day is "today".
- **`DashboardSummary`'s Recent Entries list is retired** — the whole disclosure section, its
  load-more/load-less pagination, and its day-grouping are gone. What remains is the date heading,
  the identity/streak byline (from [task 2](48-dashboard-heading-merge.md)), and the "logged N
  today" sentence. `/api/dashboard`'s own `recentEntries` field is untouched on the backend; nothing
  on the client reads it any more.
- **`Reminder`'s `/upcoming` day options realigned to `1/3/7`**, matching `/recent`, with the schema
  now derived from the options constant rather than duplicated as a second literal array (the two
  could previously drift silently — they already had, once, before this change: the schema still
  said `["1","7","30"]` after a comment above it claimed the constant was the source of truth).

### Decisions

- **Recent Entries is retired now, not deferred again.** [Task 2](48-dashboard-heading-merge.md)
  deliberately kept it, because the Timeline that would replace it didn't exist yet and removing it
  early would have been a real regression for no reason. It exists now — keeping both would show
  the same past entries twice on one page, which is worse than either alone.

- **The NOW divider is placed by `when`, not by re-deriving "already happened" from the run's own
  time.** `when` is exactly that answer, decided once at the point the two responses are merged;
  recomputing it from `run.time` against the current clock a second time is the kind of duplicated
  logic this whole feature exists to avoid (see `/upcoming`'s and `/recent`'s own shared-rules
  rationale).

- **A "logged" run explains itself only looking forward.** An upcoming slot silenced by an earlier
  log today is worth saying plainly ("Already logged, so this one won't fire"); a past row that
  reads "logged" already carries that fact in its pill and its place in the list, and repeating it
  in words would be redundant. This is a real bug I introduced and caught myself before it shipped
  — see below.

- **The 12-row cap applies to the merged total**, not per side. A past-heavy account and a
  future-heavy account are capped the same way; the header count stays the real total regardless.

### Verification

- **Frontend: 302 tests across 40 files, green.** `tsc -b`, oxlint, prettier, `npm run build` clean.
  Net count: `lib/timeline.test.ts` (15) and `TimelinePanel.test.tsx` (9) added; `lib/upcoming.test.ts`
  and `UpcomingRemindersPanel.test.tsx` deleted; `DashboardSummary.test.tsx` trimmed from 19 to 10 as
  its Recent Entries tests were removed with the feature.
- **Backend: 398 tests across 27 files, green**, unchanged in count (three tests added for the
  realigned day options and volume, two adjusted to use `7` instead of the now-invalid `30`).
- **Every new rule mutation-checked**, each reverted straight after:

  | Mutation                                                    | Caught by                              |
  | ----------------------------------------------------------- | -------------------------------------- |
  | Merge order swapped (future before past)                    | 2 tests                                |
  | Day grouping ignores date, merges everything into one group | `names yesterday, today and tomorrow…` |
  | `repeatCount > 1` guard dropped to a bare truthiness check  | `ignores a repeatCount of exactly one` |

- **A real bug caught before it shipped, not by a test but by re-reading my own diff.** The first
  version of `describeState` returned `null` for every `logged` run, unconditionally — correct for
  a past row (redundant to repeat), wrong for a future one (loses "Already logged, so this one
  won't fire", the exact behaviour `/upcoming`'s own panel already had). Fixed by branching on
  `run.when`, with a test added for both branches specifically so a future regression would fail
  loudly rather than silently losing the explanation again.

- **Driven end to end in a real browser**, mobile and desktop, against real servers and a real
  database — a category already logged today, one due but never logged, and one still ahead of
  "now":

  ```
  Timeline | 3 | Today | 3 days | 7 days | TODAY |
    08:00 | 🧠 Anxiety | Logged
    08:00 | 💊 Diazepam | No dose logged that day | Missed
    NOW
    23:00 | 💧 Water
  ```

  And at the 3-day range, with genuine multi-day overlap and volume:

  ```
  Timeline | 15 | FRI 28 AUGUST … YESTERDAY … TODAY (NOW divider correctly inside it) … TOMORROW
  …and 3 more.
  ```

  The 12-row cap, the day labels (including the newly-added "Yesterday"), and the NOW divider's
  placement were all exercised together, not just individually in unit tests.

**What this does not prove.** Only one account and a handful of reminders were exercised in the
browser — no test has seen a genuinely large merged list, a `truncated: true` from either server
simultaneously, or dark mode. The two requests race in principle (a request landing exactly on a
midnight rollover could see `recent.today` and `upcoming.today` disagree by one day); `upcoming.today`
is used as the tiebreak, and this has not been observed happening, only reasoned about.

### Known limitations and follow-ups

- **Rows are read-only.** Tapping one might reasonably jump to that category or offer a snooze —
  unchanged from the note in [45](45-coming-up-panel.md).
- **The cap doesn't distinguish past from future.** A very past-heavy 7-day view could crowd out
  what's coming up entirely; not observed with real data yet, but worth watching for.
- **`formatEntryDateLabel` in `lib/entryDateLabel.ts` is now unused** (only `DashboardSummary`'s
  retired Recent Entries list called it; `formatEntryDateTime` from the same file is still used by
  `CategoryLogCard`). Left in place rather than deleted — a small, harmless cleanup for later, not
  this task's job.
- **Two requests, not one.** `TimelinePanel` fires `/recent` and `/upcoming` in parallel on every
  render and range change; a single combined endpoint was considered and rejected as premature -
  the two already exist independently, are independently tested, and are each useful on their own
  (a future task might want "recent" alone, e.g. on a history-adjacent page).

**Follow-up, caught by CI after the PR opened:** `e2e/quick-add-and-dashboard.spec.ts` still
asserted against the now-deleted `#recent-entries-content` (its four Quick-Add-logged entries have
no reminder attached, so they were never going to appear in Timeline either - Timeline only ever
shows reminder-driven runs). This is exactly the "repo-wide grep for the copy, not a search scoped
to where I was just told the problem was" lesson from [45](45-coming-up-panel.md)'s own follow-up,
recurring: a grep across `frontend/e2e/` and `frontend/scripts/` for the retired selector and the
old "Name — value" copy found this one real hit (plus two harmless stale comments, left as-is).
Fixed by asserting against each category's own card instead - scoped by its heading, since that
card already renders the same just-saved value (`CategoryLogCard`'s `formatCategoryLogValue`) and
always did; the combined-card check was redundant with per-card checks even before this task,
not something Timeline needed to replace. Verified by running the full local e2e suite against
real dev servers and a real Postgres database (not just the one previously-failing spec) - 4/4
green.

---
