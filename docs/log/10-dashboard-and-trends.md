# Dashboard & Trends

## 2026-08-17 — Phase 4 + Phase 8: `GET /api/dashboard` and the real Dashboard summary card

**Task:** [Tasks.md](../../Tasks.md) → Phase 4 → "Implement `GET /api/dashboard?date=YYYY-MM-DD`…"
and → Phase 8 → "Today's summary card," "Logging consistency indicator," "Recent entries list,"
"Loading and empty states."

**Delivered via branch:** `feature/4-8-dashboard-summary-streak`. This is the first task to
touch all four existing log types (mood, symptom, medication, habit) from a single endpoint and
a single frontend component, rather than building one log type end to end at a time the way
Phases 1/3/7 did — everything those earlier vertical slices built is what this task reads from.

### Background / concepts

#### Why "which calendar day" needs its own dedicated logic

Every log so far stores `loggedAt` as a precise instant (a `timestamptz` — see the Mood Logging
log's first entry for why). But the dashboard needs to answer a fuzzier question: "what did this
user log **today**?" — and "today" is genuinely ambiguous without more context. The same instant
in time is a different calendar date depending on where you are: 11pm on August 16th in Los
Angeles is already 7am on August 17th in London. `User.timezone` (stored since the very first
`User` model, defaulted to `"UTC"`, but never actually _used_ for anything until this task) is
what resolves that ambiguity — "today" has to mean "today, in this specific user's timezone," not
the server's own timezone (which, on a real hosting platform, is usually UTC and has nothing to
do with where any given user actually lives).

This project has no timezone library installed (no `date-fns-tz`, `luxon`, etc.) — rather than add
one for a single small task, `backend/src/lib/timezone.ts` is a small, hand-written wrapper
around JavaScript's own built-in `Intl.DateTimeFormat`, which already knows how to convert
between UTC instants and any IANA timezone's wall-clock time without any extra dependency. Two
tricks worth understanding, since they're not obvious the first time you see them:

- **`formatDateInTimezone`** turns a UTC instant into a `"YYYY-MM-DD"` string _as seen from a
  given timezone_, using `new Intl.DateTimeFormat("en-CA", { timeZone, ... })`. The `"en-CA"`
  locale is a deliberate trick, not a typo — Canadian English happens to format dates as
  `YYYY-MM-DD` by default, which is exactly the shape needed, with no manual string-splicing.
- **`getDayRangeUtc`** solves the harder, opposite problem: given a calendar day like
  `"2026-08-16"` and a timezone, what UTC instant does that day's _midnight_ actually correspond
  to? There's no single built-in for this, so it's solved by a "guess, measure, correct" approach
  (see the long comment in `zonedWallClockToUtc` in `timezone.ts` for the full walkthrough): guess
  the answer is "midnight, read as if it were already UTC," ask `Intl` what that guessed instant's
  wall-clock time looks like _in the target timezone_, and the gap between the guess and that
  reading is exactly the timezone's UTC offset at that moment — which is then used to correct the
  guess. This is what turns `?date=2026-08-16` into a precise `WHERE loggedAt >= start AND
loggedAt < end` database query.

#### What a "pure function" is, and why the streak calculation was written as one

Tasks.md specifically calls for the streak calculation to be "a pure, standalone,
unit-testable function." A **pure function** is one whose output depends _only_ on its inputs —
call it twice with the same arguments and you always get the same answer, and it never reads or
changes anything outside itself (no database call, no `new Date()` to check "now," no network
request). `calculateStreak(loggedDates: Set<string>, today: string)` in
`backend/src/lib/streak.ts` is exactly this: given a set of calendar-day strings and a reference
"today," it returns `{ current, daysLoggedThisWeek }` — nothing more.

This matters concretely for testing. A function that isn't pure — say, one that queries Prisma
and calls `new Date()` internally — can only be tested by standing up a real (or mocked) database
and finding some way to control what "now" means during the test, which is exactly the kind of
setup that makes tests slow, flaky, and awkward to write for edge cases. A pure function can be
tested by just constructing the input by hand: `calculateStreak(new Set(["2026-08-16",
"2026-08-17"]), "2026-08-17")` and asserting on the result — no server, no database, no faked
clock. `backend/src/lib/streak.test.ts` has eight such cases (no logs at all, an active streak, a
streak still valid before today's first log, a fully broken streak, a streak with a gap in the
middle, days-logged-this-week both mid-week and across a week boundary, and a streak spanning a
month/year boundary) — all of them instant to run and easy to reason about, specifically because
the function itself knows nothing about dates in the real-world sense, only abstract day strings.

The route handler (`backend/src/routes/dashboard.ts`) is where the "impure" parts live: it reads
the real database, converts real `loggedAt` timestamps into calendar-day strings using the
timezone helpers above, and only _then_ hands the resulting `Set<string>` to the pure function.
That split — impure I/O at the edges, pure logic in the middle — is a common, deliberately useful
pattern: it's what makes the interesting logic (the actual streak math) testable in isolation from
everything that's slow or hard to control about talking to a real database.

#### Why the resolved `?date=` doubles as the streak's own "today"

The endpoint accepts an optional `?date=YYYY-MM-DD`, defaulting to "today" (in the user's
timezone) when omitted — this is what Tasks.md's own wording flags as making the endpoint
"trivially testable for a fixed date." That resolved date isn't just used for the day's mood/
symptom/medication/habit summary; it's _also_ used as the streak calculation's reference point for
"today" (see `calculateStreak(loggedDates, date)` in the route). This was a deliberate design
choice: it means the entire response is a pure function of one input (the resolved date, plus
whatever's actually in the database), so `dashboard.test.ts`'s integration tests can assert exact
values for a fixed date without any dependency on when the test suite happens to run.

#### The habit/medication "summary" design (not fully spelled out by requirements.md)

Requirements §7 gives one worked example — `Medications: 1/2 taken` — but doesn't define exactly
what the two numbers mean, and gives no habit example at all. Two decisions, made explicit here
since nothing forced a single obvious answer:

- **`medicationSummary`** counts `MedicationLog` _entries_ for the day, not the user's medication
  _list_: `total` is how many medication logs exist for the day (taken or not), `taken` is how
  many of those were marked taken. A user who takes the same medication twice a day and logs both
  will see `2/2`, not `1/1` capped at their medication count — this matches a log-entry-centric
  reading of "medications: 1/2 taken," the same way `symptomCount` counts symptom _log_ entries,
  not distinct symptoms.
- **`habitSummary`** is the one place this task's own instructions explicitly left the shape
  open ("design this reasonably … e.g. count of habits logged today vs. total habits defined").
  It returns `{ loggedCount, totalHabits }` — how many _distinct_ habits (not raw log rows) have
  at least one entry today, versus how many habits the user has defined in total. Distinct habits,
  not raw log count, so logging the same habit twice in a day doesn't inflate "how many of my
  habits did I touch today" past the number of habits that actually exist.

#### Why the streak's lookback is bounded to 90 days, not the user's whole history

Computing a streak correctly requires knowing about every calendar day with at least one entry,
going back as far as the streak could possibly extend — in principle, a user's entire history.
Querying a user's _entire_ logging history on every single dashboard load gets slower the longer
someone uses the app, which runs directly against Phase 4's own cross-cutting requirement to keep
these queries efficient and bounded. `STREAK_LOOKBACK_DAYS = 90` caps the query at the same 90-day
ceiling this app's own Trends feature already uses as its longest period (`?period=90d`), on the
reasoning that a "currently active" streak worth showing is realistically well under 90 days, and
capping it there keeps the query's cost independent of how long someone's been using the app. A
user with, hypothetically, a 200-day unbroken streak would see it read as capped at 90 — an
accepted, documented tradeoff, not a bug.

#### Why the frontend summary card polls instead of updating instantly

The four Quick Add sections already on the Dashboard (`MoodSection`, `HabitSection`,
`MedicationSection`, `SymptomSection`) were built, on purpose, as fully self-contained
components — each owns its own fetch, its own state, and its own save/delete handling, with zero
shared state between them (see the Git & GitHub Workflow log's entry on decomposing
`DashboardPage.tsx` for why). That design is exactly what made this task easy to add without
touching any of those four files — but it also means there's no existing shared store the new
`DashboardSummary` card could subscribe to in order to learn "a new mood log was just saved."

This was caught directly during manual browser verification, not guessed at in advance: after
using the Mood/Symptom/Medication/Habit Quick Add buttons, the summary card at the top of the
page kept showing "Nothing logged yet today" even though all four new entries were visibly
sitting in their own sections just below it — a real bug a first glance at the code wouldn't have
caught, since each individual piece (the fetch, the render) was working correctly in isolation.

The fix, kept entirely inside `DashboardSummary.tsx` so it needed no changes to any of the four
sections: the component now re-fetches `GET /api/dashboard` on a 10-second interval, plus
immediately whenever the browser tab regains focus, on top of its original fetch-on-mount. This
is a deliberately simple "eventually consistent" fix, not real-time push — a genuinely instant
update would need either a shared data-fetching layer (e.g. a client-side cache with
invalidation, something like React Query) or a cross-component event bus, either of which is a
bigger, unrequested change to introduce for one task. The 10-second interval is documented
in-code as a known, accepted tradeoff, and confirmed to actually work end to end (see
Verification below) rather than left as a theoretical fix.

### What was done

1. **`backend/src/lib/timezone.ts` (new).** `formatDateInTimezone`, `getDayRangeUtc`,
   `todayInTimezone`, `addDaysToDateStr`, `dayOfWeek` — the timezone-aware building blocks
   described above, covered by `timezone.test.ts` (UTC vs. Pacific vs. Tokyo calendar-day
   resolution around real midnight boundaries, day-range correctness, date-string arithmetic
   across month/year boundaries).
2. **`backend/src/lib/streak.ts` (new).** The pure `calculateStreak` function described above,
   plus `streak.test.ts`'s eight scenarios.
3. **`backend/src/routes/dashboard.ts` (new).** `GET /` (mounted at `/api/dashboard`, behind
   `requireAuth`): validates an optional `?date=` with Zod, fetches the caller's `timezone`,
   resolves the target calendar day, and returns `{ date, mood, symptomCount,
medicationSummary, habitSummary, recentEntries, streak }` — all four log tables queried
   in parallel via `Promise.all`, all scoped to `req.userId`. `recentEntries` merges the ten
   most recent rows from each of the four log tables, sorts them together by `loggedAt`, and
   caps the combined result at 10. Covered by `dashboard.test.ts`: missing-token rejection,
   malformed `?date=`, an empty-but-well-formed response for a brand-new user, a full
   one-of-each-type summary (including the "second habit never logged" case, to exercise
   `totalHabits` genuinely differing from `loggedCount`), date-scoping (a log on one day doesn't
   leak into another day's summary), the timezone edge case (an 11pm-Pacific entry that's already
   the next calendar day in UTC, resolving to the correct day and streak for that user), and
   cross-user isolation.
4. **`backend/src/app.ts`.** One new import, one new mounted route
   (`app.use("/api/dashboard", requireAuth, dashboardRouter)`) — no other changes.
5. **`frontend/src/components/dashboard/DashboardSummary.tsx` (new).** Fetches
   `GET /api/dashboard` on mount (plus the polling/focus-refetch described above), and renders:
   the resolved date (reformatted for readability, but never re-derived — see the code comment
   on `formatDisplayDate` for why it's pinned to UTC-midnight parsing/formatting so a browser in
   a different timezone from the backend's resolved date can't silently shift it by a day), the
   summary line (`Mood: 4/5 · Symptoms: 2 logged · Medications: 1/2 taken · Habits: 1/3 logged`,
   matching requirements §7's example), a plain-sentence streak/days-logged-this-week line (no
   badges, no "don't break the chain" language, per §7's explicit "informational, not gamified"
   requirement), and the merged recent-entries list. Loading and error states match the pattern
   already used by the four Section components; a first-time user with nothing logged sees a
   dedicated friendly empty-state sentence instead of a summary line reading "0 logged" four
   times over.
6. **`frontend/src/pages/DashboardPage.tsx`.** One new import, one new `<DashboardSummary />`
   line placed above the four existing sections — the page's existing "Welcome, {name}" heading
   and the four sections themselves are untouched. `DashboardSummary`'s own date heading is
   deliberately an `<h2>`, not a second `<h1>`, so the page keeps exactly one top-level heading.
7. **`frontend/src/pages/DashboardPage.test.tsx`.** This existing composition-level test had to
   be updated (not just left alone) — it previously mocked every `fetch` call to return `[]`
   unconditionally, which crashed the new `DashboardSummary` (expecting an object, not an array)
   the moment it was wired in. The mock now special-cases the `/api/dashboard` URL to return a
   well-formed empty summary object, and the test additionally asserts the summary's empty-state
   text renders alongside the four sections.
8. **Full verification**, both projects — see below.
9. **Real browser verification** — see below.

### Why it's needed

This is the piece that turns four independently-useful log types into a single, coherent picture
of "how am I doing" — the actual point of a wellness-tracking app's home screen, per requirements
§7. Without it, a user would have to mentally re-derive their own day's summary by scrolling
through four separate lists.

### Decisions

- **The resolved `?date=` doubles as the streak's reference "today"** — covered above; chosen so
  the whole response is a pure function of one input, for both testability and, if the frontend
  ever wants to let a user browse a past day's dashboard, for correctness (a past day's streak
  should be "as of that day," not "as of right now").
- **`medicationSummary` counts log entries, `habitSummary` counts distinct habits** — an
  intentional, documented asymmetry between the two, covered above; each was chosen to match the
  most natural reading of that specific field, not to be consistent with each other for its own
  sake.
- **90-day streak lookback, not unbounded** — covered above; a bounded, efficient query was
  prioritized over correctness for a hypothetical multi-month unbroken streak.
- **Polling instead of an event bus for the frontend summary card** — covered above; the simplest
  fix that required zero changes to the four out-of-scope Section components, at the cost of up
  to 10 seconds of staleness rather than instant updates.
- **`DashboardPage.tsx`'s edit footprint kept to two lines** (one import, one JSX line) — per this
  task's own shared-file discipline, to minimize collision risk with other agents/PRs touching the
  same file; the pre-existing "Welcome, {name}" heading and paragraph were left in place rather
  than rewritten to also describe the new summary card.

### State at end of this step

`GET /api/dashboard` is live, tested, and scoped correctly per-user; the Dashboard's home screen
now shows a real, auto-refreshing summary card above the four existing Quick Add sections,
verified end to end in a real browser: a fresh user sees a friendly empty state, and after
logging one entry of each type, the summary card correctly reflects a `4/5` mood, `1` symptom,
`1/1` medications taken, `1/1` habits logged, a `1`-day streak, and all four entries in the
recent-entries list — with zero browser console errors throughout. `GET /api/trends` (the rest of
Phase 4) is not part of this task and remains unbuilt; this log file's name is reserved for that
future entry to be appended here too.

### Verification

- Backend: `npm run build` — compiled cleanly. `npm test` (`vitest run`) — 137/137 passing (all
  pre-existing tests unaffected, plus new coverage in `streak.test.ts`, `timezone.test.ts`, and
  `dashboard.test.ts`). `npx eslint .` — clean. `npx prettier --check .` — clean.
- Frontend: `npm run build` (`tsc -b && vite build`) — compiled cleanly. `npm test`
  (`vitest run`) — 74/74 passing (all pre-existing tests unaffected, plus new coverage in
  `DashboardSummary.test.tsx` and an updated `DashboardPage.test.tsx`). `npm run lint`
  (`oxlint`) — clean (same one pre-existing, unrelated `AuthContext.tsx` warning as every prior
  entry). `npx prettier --check .` — clean.
- Real browser verification (Playwright, against the actual running dev servers, in this task's
  own isolated backend/frontend ports and database — never the shared local one): registered a
  throwaway user, confirmed the empty-state summary card, then used the Mood/Symptom/Medication/
  Habit Quick Add buttons in turn (creating a custom symptom and a new medication/habit inline,
  since this isolated database has no seeded system symptoms). Screenshotted the page immediately
  after logging (catching the staleness bug described above) and again after the summary card's
  10-second poll interval elapsed, confirming it then correctly showed all four entries, the
  right summary line, and the streak. Zero browser console errors observed at any point. The
  throwaway browser-created users were deleted from the database afterward, and the manual
  verification script was not committed.

---

## 2026-08-17 — Phase 4 + Phase 10: `GET /api/trends` and the Trends page

**Task:** [Tasks.md](../../Tasks.md) → Phase 4 → "Implement `GET /api/trends?period=7d|30d|90d`…"
and → Phase 10 → "Period selector," "Symptom severity chart," "Mood line chart," "Calendar-style
activity view," "Copy review," "Empty/low-data states."

**Delivered via branch:** `feature/10-trends`, branched off the not-yet-merged
`feature/4-8-dashboard-summary-streak` rather than off `main`, specifically to reuse two pieces
that branch had just built: `backend/src/lib/timezone.ts` (the timezone-aware calendar-day
helpers) and `backend/src/routes/dashboard.ts` (the reference implementation of "resolve the
user's timezone, then query a date range" that this task's own route follows).

### Background / concepts

#### Why this task reuses `timezone.ts` instead of writing its own date math

The previous log entry above explains in detail why "which calendar day does a timestamp belong
to" needs the user's own timezone, not the server's or UTC's, and why this project hand-rolls that
logic around `Intl.DateTimeFormat` rather than installing a timezone library. Trends needs exactly
the same building blocks — `todayInTimezone` to resolve "today" for whichever user is asking,
`addDaysToDateStr` to walk backward from today to build a 7/30/90-day window, and `getDayRangeUtc`
to turn that window into a bounded `WHERE loggedAt >= start AND loggedAt < end` query — so this
task imports the existing module rather than re-deriving any of it. This is the same "impure I/O
at the edges, pure/shared logic in the middle" idea the Dashboard entry describes: the route
handler is the only new "impure" code here; the date-math itself is untouched, already-tested
library code.

#### Two different averages, and why they're not the same number

`GET /api/trends`'s response includes both a **per-day average** (one number for each calendar
day in the period, used to plot the line chart) and a single **overall period average** (the
"Avg: 5.2" headline number, per requirements §10's own example). These are two genuinely different
calculations, not the same number reused: the overall average is the mean of _every individual
logged value_ in the period, while each day's plotted point is the mean of _just that day's_
values. Concretely, a day with three same-symptom logs (severities 4, 8, and — say — a third one)
contributes all three raw values to the overall average, weighted equally with every other log,
but only one plotted point (its own day's mean) to the line chart. The alternative — averaging the
_daily averages_ together for the headline number — would let a single lightly-logged day count
exactly as much as a heavily-logged day, which reads less intuitively as "my average severity this
period." `trends.test.ts`'s "computes per-day averages and an overall period average" test spells
out a worked example of this distinction with three symptom logs across two days.

#### `null`, not `0`, for a day/period with nothing logged

Symptom severity and mood are both 1-based scales (1–10 and 1–5 respectively) — there is no valid
"0" reading, so a `0` average would be ambiguous between "actually logged some very-low readings"
(impossible on this scale, but still a bad precedent) and "nothing was logged here." Every average
in the response — per-day and overall — is `number | null`, with `null` meaning "no data," so the
frontend can render an honest empty state ("No data yet" / "Not enough data yet for this period")
instead of a misleading `Avg: 0.0`. This is the same reasoning `dashboard.ts` uses for `mood: null`
when nothing's logged for the day, applied consistently here.

#### Why the line chart breaks at gaps instead of interpolating across them

A day with no entry is plotted as a gap in the line, not bridged by a straight line to the next
real reading. Drawing a continuous line across several unlogged days would visually suggest a
smooth, gradual trend on days when, in reality, nothing is known at all — exactly the kind of
unsupported implication requirements §10/§14 rule out ("must avoid claiming that one factor causes
another," "descriptive rather than diagnostic"). `TrendLineChart.tsx` builds the SVG path as
several separate contiguous segments (broken at every `null`), rather than one path spanning the
whole period.

#### A real accessibility bug caught only by testing the hit targets, not by reading the code

The line chart's data points are exposed to keyboard/screen-reader users via one invisible,
focusable `<rect role="button" aria-label="...">` per day, layered under the visible line/circle
marks. The first working version wrapped the entire `<svg>` in `aria-hidden="true"` (intending to
silence the purely decorative line/circles/gridlines, since the wrapping `<div role="group"
aria-label="...">` already announces the chart's overall purpose) — but `aria-hidden` on an
ancestor hides _every_ descendant from the accessibility tree, including ones that are themselves
interactive and focusable. That silently made every one of those hit-target buttons unreachable by
assistive technology, while looking completely correct by eye (the chart still rendered and looked
right) and even still receiving actual keyboard focus in a real browser (tabIndex isn't blocked by
aria-hidden, only _announcement_ is) — the kind of bug that's easy to miss without a test that
specifically queries the accessibility tree. `TrendLineChart.test.tsx`'s
`getByRole("button", { name: ... })` assertions caught this immediately (the elements simply
couldn't be found), which is what led to the fix: `aria-hidden="true"` was moved off the `<svg>`
and onto each individual decorative mark (the gridlines, the path, the circles, the axis-label
text) instead, leaving the `<svg>` itself and its interactive hit-target `<rect>`s in the
accessibility tree.

#### A second bug real-browser verification caught that the component tests couldn't

jsdom (the DOM implementation the frontend's Vitest suite runs against) doesn't perform real layout
— elements have no actual computed pixel size or position — so a whole category of purely-visual
bugs can pass every automated test and still be wrong on screen. Real Playwright browser
verification (see below) caught exactly one such bug here: the chart's leftmost and rightmost data
points were plotted with their x-coordinate exactly on the SVG's own left/right edge (`x = 0` and
`x = CHART_WIDTH`), which puts a 4px-radius circle marker's _center_ on the boundary — half the
circle rendered outside the visible chart, clipped off. The fix was a `HORIZONTAL_PADDING`
constant (mirroring the vertical padding that already existed for the same reason on the y-axis),
so the plotted x-range is inset from both edges by a few pixels. This is called out explicitly as
an example of why this project's standing habit of real-browser verification (not just trusting a
green test suite) matters — it's specifically the kind of defect a mocked/jsdom test suite cannot
see.

### What was done

1. **`backend/src/routes/trends.ts` (new).** `GET /` (mounted at `/api/trends`, behind
   `requireAuth`): validates an optional `?period=7d|30d|90d` with Zod (defaulting to `7d`),
   fetches the caller's `timezone`, resolves the period's date range via `timezone.ts`, and runs
   four `Promise.all`-parallel, `userId`-scoped, `loggedAt`-range-bounded queries (symptom logs,
   mood logs, medication logs, habit logs — the same four log types and the same bounded-query
   discipline `dashboard.ts` already established). Returns `{ period, startDate, endDate, days,
symptomSeverity: { series, average }, mood: { series, average }, activity: { days } }` —
   `days` is the single ordered list of "YYYY-MM-DD" strings every other series lines up against,
   so the frontend never has to re-derive its own date math for x-axis alignment. Covered by
   `trends.test.ts`: missing-token rejection, an invalid `?period=`, the default-to-7d behavior,
   correct date-range/array-length resolution for all three periods, a fully empty (`null`
   averages, all-`false` activity) response for a brand-new user, the per-day-vs-overall-average
   distinction described above (with a hand-checked worked example), the activity map correctly
   marking a day active from a habit log alone, entries outside the requested period being
   excluded, timezone-aware day resolution (mirroring `dashboard.test.ts`'s own LA timezone case),
   and cross-user isolation.
2. **`backend/src/app.ts`.** One new import, one new mounted route
   (`app.use("/api/trends", requireAuth, trendsRouter)`) — no other changes.
3. **`frontend/src/components/trends/PeriodSelector.tsx` (new).** A `role="radiogroup"` of three
   plain buttons (7/30/90 days) — the same accessible "choose exactly one of a small fixed set"
   pattern `MoodEntryForm.tsx`'s mood-choice control already uses, reused here rather than a
   native `<select>` for the same large-tap-target reasoning (requirements §15).
4. **`frontend/src/components/trends/TrendLineChart.tsx` (new).** A small hand-rolled SVG line
   chart — no charting library is installed in this project (see Decisions below for why one
   wasn't added). Renders a single series against a fixed domain (1–10 for severity, 1–5 for
   mood), with gap-broken line segments (see above), a keyboard-focusable/hoverable tooltip per
   data point (including days with no data, announced as "No data logged" rather than silently
   doing nothing), sparse first/middle/last x-axis date labels, and the "Not enough data yet for
   this period" empty state when every point in the period is null.
5. **`frontend/src/components/trends/ActivityCalendar.tsx` (new).** A Monday-first
   (matching `streak.ts`'s own week convention) calendar grid, one cell per day in the period,
   with a checkmark glyph (not just a color change) marking a logged day — so the distinction
   doesn't rely on color alone, per requirements §15.
6. **`frontend/src/pages/TrendsPage.tsx` (new), replacing `<PlaceholderPage title="Trends" />`
   in `frontend/src/App.tsx`.** Fetches `GET /api/trends` on mount and whenever the selected
   period changes, and composes the three components above into three cards, each with a
   requirements-§10-formatted average headline ("Symptom Severity — Avg: 5.2" / "Mood — Avg:
   3.4"). An explicit "not a diagnosis, not a claim about what's causing what" sentence sits under
   the page's own heading, once, rather than repeated per chart.
7. **Full verification**, both projects — see below.
8. **Real browser verification** — see below, including the two bugs described above that it
   specifically caught.

### Why it's needed

This is the last piece of the MVP's three core screens (Dashboard, History, Trends) that turns raw
logged entries into the "simple visual analytics" requirements §10 calls for — without it, a
user's only way to see how they've been doing over time would be scrolling through raw History
entries by hand.

### Decisions

- **No charting library installed.** The two line charts are hand-rolled SVG (~150 lines total),
  not a dependency like Recharts/Chart.js/Victory. For two single-series line charts and one
  calendar grid, a library's bundle-size and API-learning cost outweighed the benefit; the app's
  existing visual style (plain Tailwind utility classes, no component library) also made a
  hand-rolled chart easier to keep visually consistent with the rest of the app than adapting a
  library's own theming system. This is a judgment call the task instructions explicitly left
  open, documented here per that instruction, not a default assumed without consideration — a
  richer future trends feature (e.g. multi-series overlays, zooming) would likely tip this
  decision the other way.
- **Overall period average = mean of every raw log value, not mean-of-daily-averages** — covered
  above; chosen to match the more intuitive reading of a single "average this period" number.
- **`null`, not `0`, for "nothing logged"** — covered above; consistent with `dashboard.ts`'s own
  `mood: null` precedent.
- **The line breaks at data gaps rather than interpolating** — covered above; a deliberate
  requirements-§10/§14 compliance choice (descriptive, not suggestive of an invented trend across
  unlogged days), not just an implementation shortcut.
- **`aria-hidden` moved from the whole `<svg>` onto each individual decorative mark** — covered
  above; a real accessibility bug fix, not a style preference, caught by the component's own tests
  before it ever reached a real browser.
- **Horizontal chart padding, matching the pre-existing vertical padding** — covered above; a
  visual-only fix that only real-browser verification (not the jsdom-based test suite) could have
  caught.
- **`TrendsPage.tsx`'s edit footprint to `App.tsx` kept to one line** (swapping the `/trends`
  route's element), and `dashboard.ts`/`DashboardPage.tsx`/the four Section components were left
  completely untouched — per this task's own shared-file discipline, to minimize collision risk
  with the still-unmerged Dashboard branch this one was built on top of.

### State at end of this step

`GET /api/trends` is live, tested, and scoped correctly per-user for all three periods; the Trends
page now renders real symptom-severity and mood line charts with correct period averages, plus a
calendar-style activity view, verified end to end in a real browser: registered a throwaway user,
backdated symptom/mood/medication/habit entries across the last ~20 days via direct API calls,
then drove the actual Trends page — confirmed the 7-day, 30-day, and 90-day views each show a
sensible date range and a correctly-recomputed average, confirmed the activity calendar's checkmark
grid lines up with the seeded days, and confirmed a data point's tooltip appears correctly on
keyboard focus — with zero browser console errors throughout. `docs/log/10-dashboard-and-trends.md`
(this file) now has both halves of its originally-reserved scope filled in.

### Verification

- Backend: `npm run build` — compiled cleanly. `npm test` (`vitest run`) — 149/149 passing (all
  pre-existing tests unaffected, plus new coverage in `trends.test.ts`). `npx eslint .` — clean.
  `npx prettier --check .` — clean.
- Frontend: `npm run build` (`tsc -b && vite build`) — compiled cleanly. `npm test`
  (`vitest run`) — 90/90 passing (all pre-existing tests unaffected, plus new coverage in
  `PeriodSelector.test.tsx`, `TrendLineChart.test.tsx`, `ActivityCalendar.test.tsx`, and
  `TrendsPage.test.tsx`). `npm run lint` (`oxlint`) — clean (same one pre-existing, unrelated
  `AuthContext.tsx` warning as every prior entry). `npx prettier --check .` — clean.
- Real browser verification (Playwright, against the actual running dev servers, in this task's
  own isolated backend/frontend ports and database): registered a throwaway user via the API,
  backdated 7 rounds of symptom/mood/medication/habit entries across the last 20 days (also via
  the API, faster and more reliable than driving ~28 individual form submissions through the UI),
  then logged in and navigated to Trends through the real UI. Confirmed the 7-day view's computed
  averages ("Symptom Severity — Avg: 5.0", "Mood — Avg: 3.0") matched the seeded data, switched to
  30-day and 90-day (averages correctly shifted to 5.1/2.9 once the further-back entry entered the
  window), confirmed the activity calendar's weekly grid and checkmarks lined up with the seeded
  days for all three periods, and confirmed a data point's tooltip renders the right value on
  keyboard focus. Screenshotted all three periods plus the tooltip state. Zero browser console
  errors observed at any point. This pass is what caught both bugs described above (the
  `aria-hidden` accessibility bug was actually caught earlier, by the component test suite itself;
  the edge-clipped marker was caught only here). The throwaway browser-created user was left in
  this task's own isolated per-task database (not the shared local one), and the manual
  verification script was not committed.

---

## 2026-08-18 — A real user-reported bug: "Recent entries" looked wrong, but the counts were right

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a genuine bug report against the
deployed app, investigated and fixed the same way any other bug in this log has been: read the
real code first, confirm the actual cause, then fix it.

### Background / concepts

**The report**: a screenshot of the live dashboard showing "Habits: 0/1 logged" and
"Medications: 0/0 taken" for today, directly above a "Recent entries" list that clearly showed a
habit ("Nap") and a medication ("Diazepam") entry. On its face, that looks like a contradiction —
if a habit and a medication were logged, why does the summary say zero?

**Reading `backend/src/routes/dashboard.ts` first, not guessing**, showed this is two different
queries with two different, both-intentional scopes:

- The summary line's counts (`medicationSummary`, `habitSummary`) only ever count logs whose
  `loggedAt` falls within **today's** date range (`getDayRangeUtc(date, user.timezone)`).
- `recentEntries` has **no date filter at all** — it deliberately pulls the most recent 10 logs
  across a user's _entire history_, precisely so the list isn't empty on a day someone hasn't
  logged much yet (see that route's own comments).

So "0/1 habits today" next to a habit entry in Recent Entries isn't a contradiction once you know
Recent Entries can show _any_ day, not just today — the Nap and Diazepam entries were actually
from the day before. The screenshot itself had the proof, once looked at carefully: sorted
most-recent-first, its second row showed a _later_ clock time than its first row (a mood log at
17:07 listed right after one at 10:04) — only possible if the 17:07 entry was from an earlier
calendar day, since the two rows only ever showed a time, never a date.

**The actual bug, once found**: not the data or the counts — those were both correct — but that
`frontend/src/components/dashboard/DashboardSummary.tsx` displayed only a time
(`formatEntryTime`) next to each recent entry, with nothing to distinguish "today at 10:04" from
"yesterday at 17:07." A real UX gap, confirmed directly against the actual rendered output rather
than assumed from the report alone.

### What was done

1. Added `formatEntryDateLabel(loggedAt)` to `DashboardSummary.tsx`: compares the entry's calendar
   day against today (in the browser's own local timezone, matching `formatEntryTime`'s existing,
   already-established convention for this same list) and returns `"Today"`, `"Yesterday"`, or a
   short date like `"Aug 10"` (adding the year only if it's not the current one).
2. Each recent entry now renders as `{label} — {value} — {dateLabel}, {time}` — e.g.
   `Nap — 30 min — Yesterday, 4:28 PM` — instead of just `{label} — {value} — {time}`.
3. Three new tests in `DashboardSummary.test.tsx`, computed relative to the real current time
   (`daysAgoIso(n)`) rather than mocking the clock, so they stay correct no matter when the suite
   actually runs: an entry from today labels as "Today," one from yesterday labels as "Yesterday"
   (and explicitly _not_ "Today"), and one from 10 days back shows an actual date with neither
   relative word.
4. Verified against the real backend, not just the component's own tests: registered a throwaway
   user, logged one mood entry with today's timestamp and one with yesterday's via the real
   `POST /api/mood-logs` endpoint (backdating via an explicit `loggedAt`, same mechanism the
   Trends verification above used), and confirmed `GET /api/dashboard`'s actual `recentEntries`
   response carries exactly the two differently-dated timestamps the component's tests already
   proved render correctly.

### Why it's needed

The underlying data and counts were never wrong — the bug was that the UI gave no way to tell
"this happened today" apart from "this happened at some point in the past," which is exactly the
kind of thing a user has to notice by feeling confused, not by anything failing loudly. A
dashboard whose numbers are correct but whose list looks like it disagrees with them is still a
real usability bug, even though nothing in the code was throwing errors or returning wrong data.

### Decisions

- **Fixed the display, not the query.** `recentEntries` staying unscoped by date is a deliberate,
  already-documented design choice (see the original dashboard entry above) — the fix belongs in
  how it's _labeled_, not in narrowing what it returns, which would have quietly changed a
  different, working feature (a genuinely empty-feeling dashboard on a light-logging day) to fix
  an unrelated display gap.
- **Local-timezone comparison, matching `formatEntryTime`'s existing convention** — this component
  never fetches the user's app-configured profile timezone, only `DashboardSummary`'s parent date
  heading does (from the backend-resolved `date` field). Introducing a second, different notion of
  "today" into the same card (profile timezone for the heading, browser-local for the list) would
  be more confusing than the two only disagreeing in the rare case someone is using the app from a
  different timezone than the one saved in their own profile.
- **Computed test timestamps relative to real "now," not fake timers** — matches this file's (and
  this component's test file's) existing convention of not introducing `vi.useFakeTimers()`
  anywhere in this suite; also sidesteps a real gotcha where faking timers can interfere with
  React Testing Library's own `findBy*`/`waitFor` polling.

### Verification

- `npx vitest run src/components/dashboard/DashboardSummary.test.tsx` — 9/9 passing (6 pre-existing
  plus 3 new).
- `npm test` (frontend, full suite) — 121/121 passing.
- `npm run build`, `npm run lint` (`oxlint`), `npx prettier --check .` — all clean.
- Real backend verification: registered a throwaway user, logged one mood entry timestamped today
  and one timestamped yesterday via the actual `POST /api/mood-logs` endpoint, confirmed
  `GET /api/dashboard`'s real response returns both with the exact, correctly-different `loggedAt`
  values the component's tests already prove render as "Today" and "Yesterday."

---

## 2026-08-18 — Bounding the Dashboard's per-type log lists: real pagination, not just a display fix

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a follow-up performance/usability fix
against an existing gap, found and fixed the same way the "Recent entries" bug above was: read the
real code, confirm the actual cause, then fix it.

### Background / concepts

Each Dashboard section component (`MoodSection`, `SymptomSection`, `MedicationSection`,
`HabitSection`) renders "Recent \_\_\_ entries" by calling its own single-table endpoint —
`GET /api/mood-logs`, `/api/symptom-logs`, `/api/medication-logs`, `/api/habit-logs`. Unlike
`GET /api/history` (paginated from the start — see the History log) or `GET /api/dashboard`'s own
`recentEntries` (deliberately capped at 10 across all types), these four endpoints had never been
bounded at all: each one ran a plain `findMany` scoped only by `userId`, returning a user's _entire_
history of that log type on every single Dashboard visit. Fine for a new user with a handful of
entries; a real problem for someone who has been logging daily for months — a slower query on every
page load and an ever-taller page.

The fix follows the same offset/limit shape History already established, via a new shared helper
(`backend/src/lib/pagination.ts`) rather than duplicating the pattern four times: `fetchPage()`
asks Prisma for one row more than the page size (`take: limit + 1`); if that extra row comes back,
there's more to load (`hasMore: true`) — this answers "is there more?" without a second `COUNT(*)`
query per page.

### What was done

1. Added `backend/src/lib/pagination.ts`: `paginationQuerySchema` (zod — coerces `limit`/`offset`
   from query-string values, `limit` clamped 1-100, `offset` >= 0, both optional),
   `DEFAULT_LOG_LIST_LIMIT = 10`, and the `fetchPage()` helper described above.
2. Updated all four single-table GET routes (`moodLogs.ts`, `symptomLogs.ts`, `medicationLogs.ts`,
   `habitLogs.ts`) to validate `req.query` against that schema, default to `limit=10, offset=0`, and
   return `{ entries, limit, offset, hasMore }` instead of a bare array.
3. Updated the four matching Dashboard section components to fetch the first page of 10 on mount,
   track `hasMore`, and render a "Load more" button (only when `hasMore` is true) that fetches the
   next page at `offset = <current entry count>` and appends the results.
4. New/updated tests: backend route tests cover the default-limit page, a custom `limit`/`offset`,
   and the `hasMore` boundary (exactly `limit` rows left vs. more remaining); frontend section tests
   cover the initial bounded render, a "Load more" click appending the next page, and the button
   disappearing once `hasMore` is false.

### Why it's needed

An unbounded per-type query is the same problem the History page already solved, just not yet
applied to the Dashboard's own section lists — left alone, it would keep getting slower and the
page keep getting taller for exactly the users who have used the app the longest, which is the
opposite of what should happen.

### Decisions

- **Reused History's page shape (`{ entries, limit, offset, hasMore }`) instead of inventing a new
  one** — a future shared data-fetching layer won't need to special-case these four endpoints
  differently from `/api/history`.
- **Default limit of 10, smaller than History's 20** — these lists back a compact "recent entries"
  section under a Quick-Add button, not a full browsing page (see the comment at the top of
  `pagination.ts`).
- **Verified no other consumer read these four endpoints' old bare-array shape before changing it.**
  `HistoryPage.tsx` references the same four URL paths, but only as `DELETE` targets after fetching
  its own list from the separate, already-paginated `/api/history` endpoint — so changing what
  `GET /api/mood-logs` (etc.) returns doesn't break it. Checked this before making the change, not
  discovered as a break afterward.

### Verification

- Hit an unrelated environment snag first: the local Postgres test database is a Docker container,
  and Docker Desktop wasn't running, so the entire backend suite initially failed with
  `ECONNREFUSED` — nothing to do with this change. Started Docker Desktop, confirmed the
  `wellbeing-postgres-1` container came up, then reran.
- `npm test` (backend): 169/169 passing (16 files).
- `npm test` (frontend): 125/125 passing (21 files).
- `npm run build` in both `/backend` and `/frontend` — clean.
- Real end-to-end check against a live, Postgres-backed dev server — not mocks: registered a
  throwaway user via the real API, created one medication and 15 medication logs through the actual
  `POST` endpoints, confirmed `GET /api/medication-logs` returns exactly 10 entries with
  `hasMore: true` at offset 0, 5 more with `hasMore: false` at offset 10, and an empty page beyond
  that. Then, through a headless-browser script driving the real running frontend, logged in through
  the actual login form and confirmed the Medication section rendered exactly 10 entries with a
  "Load more" button, clicking it appended the remaining 5 (15 total), and the button then
  disappeared — matching the direct API check.
- The browser check surfaced two console 401s on `/api/auth/refresh`; traced to
  `frontend/src/api/client.ts`, a file this change never touches, so a pre-existing behavior, not a
  regression introduced here.
- The throwaway browser-created user and its test data were left in the local dev database (not the
  shared one); the one-off Playwright verification script used for the manual browser check was not
  committed.

---
## 2026-08-18 — Dashboard redesign: paginating "Recent entries" too, own panels, and collapsible lists

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a follow-up design request, prompted
directly by a screenshot of the real running app: the unified "Recent entries" summary box was
still an unbounded-feeling fixed top-10 (see the pagination entry above, which only paginated the
four *per-type* lists), and a question about whether the four sections below it should look and
behave more like distinct panels, collapsible for a long page.

### Background / concepts

#### Why the unified "Recent entries" list can't reuse `fetchPage` as-is

The per-type pagination entry above's `fetchPage()` helper works because it's pointed at *one*
Prisma table: ask for `limit + 1` rows, `skip: offset`, done. `GET /api/dashboard`'s
`recentEntries` is fundamentally different — it's a merge of the four separately-sorted log
tables into one time-ordered list, and the row at merged position `offset` could come from *any*
of them. Naively doing `take: offset + limit, skip: offset` on each table independently doesn't
work: if, say, every entry between position 0 and `offset` happens to be a mood log, skipping
`offset` rows *per table* skips far more than the merge actually needs from that table, and
under-fetches from the others. The fix pulls the same "ask for one more than needed" idea from
`fetchPage`, just applied *before* the merge instead of after: each of the four tables is asked
for its own most recent `offset + limit + 1` rows (covering the worst case where a single type
accounts for every entry up to one past the page), the results are merged and sorted once, and
*then* sliced to `[offset, offset + limit)` — with `hasMore` computed from whether anything landed
past that slice.

#### Why "Load more" on this specific list can't just append a second page

Every other paginated list in this app (`HistoryPage`, the four per-type Dashboard sections)
fetches once on mount and never refetches on its own after that — "Load more" simply appends a
second page to what's already there. `DashboardSummary` is different: it already polls
`GET /api/dashboard` every `POLL_INTERVAL_MS` (10s) to keep its counts fresh (see the original
Phase 4/8 entry's own reasoning for why). If "Load more" here also just appended a second page,
the *next* poll tick would refetch page one at the default limit and overwrite it, silently
snapping the list back down to 10 entries a few seconds after a user expanded it — a real,
easy-to-miss interaction bug that only shows up on the one component in this app that already
refetches state it doesn't own the pagination progression for. The fix: instead of tracking a
separate "how many pages have I appended" counter, `DashboardSummary` tracks a single
`recentEntriesLimit` that starts at 10 and grows by 10 each time "Load more" is clicked — every
fetch, whether the initial load, a poll tick, or the focus-regain refetch, asks for exactly that
many entries. A poll tick after "Load more" then keeps showing everything the user expanded to,
because it's asking with the same larger limit, not resetting to a smaller default.

#### The first use of `localStorage` in this app, and why that's fine here

Every earlier entry in this log that touches persistence (see the 2.2/2.3 auth entries) is about
*deliberately not* persisting something — the access token lives in memory only, specifically
because anything a page's own JavaScript can read isn't safe from XSS, so the blast radius of a
leak is capped at 15 minutes rather than indefinite. A collapsed/expanded UI preference for a
Dashboard panel carries none of that risk profile — there's nothing sensitive in "the user
collapsed the Symptom section" — so persisting it in `localStorage` (`useCollapsedState.ts`) is a
plain usability win, not an exception carved into that earlier, deliberately strict rule.

### What was done

1. **`GET /api/dashboard` now accepts `?limit=&offset=`** (reusing `paginationQuerySchema` from
   `lib/pagination.ts`) and returns `recentEntries` as a `{ entries, limit, offset, hasMore }` page
   instead of a bare array, using the merge-then-slice approach described above.
2. **`DashboardSummary.tsx`** grows a `recentEntriesLimit` state (10 → 20 → 30…) on "Load more"
   instead of appending pages, for the polling-safety reason above, and shows a "Load more" button
   whenever `hasMore` is true.
3. **New `frontend/src/lib/entryDateLabel.ts`**: `formatEntryDateLabel`/`formatEntryTime`/
   `formatEntryDateTime`, extracted from `DashboardSummary.tsx` (previously the only place this
   existed — see the "Recent entries" date-label fix entry above) so the four per-type sections
   could reuse the exact same "Today"/"Yesterday"/actual-date logic instead of their previous bare
   `new Date(log.loggedAt).toLocaleString()`, which showed a full date+time and never
   distinguished same-day from not.
4. **New `frontend/src/components/dashboard/SectionPanel.tsx`**: wraps a section's "+ Add"
   area and its "Recent X entries" list in one bordered card, with a chevron-toggle heading that
   collapses only the list — the add area is a structurally separate region, outside the
   collapsible part, so it's never hidden regardless of collapse state.
5. **New `frontend/src/hooks/useCollapsedState.ts`**: a `localStorage`-backed
   `[collapsed, toggle]` pair, one per section (keyed by a per-section string), degrading
   gracefully (falls back to in-memory-only) if `localStorage` throws — covers real private-
   browsing/storage-disabled cases, and, incidentally, this exact test environment (see
   *Verification* below).
6. **`MoodSection`/`SymptomSection`/`MedicationSection`/`HabitSection`** all rewired onto
   `SectionPanel`, and switched from `toLocaleString()` to `formatEntryDateTime`.

### Why it's needed

The screenshot that started this conversation showed exactly the problem the earlier pagination
entry already solved for the four per-type lists, but not for the summary box above them — a
"Recent entries" list that still felt unboundedly long on a page that already had four more full
lists stacked underneath it. Separating each type into its own collapsible panel is the direct
fix for "the page is very tall with a lot of data" once pagination alone isn't enough — a user who
only cares about, say, medications can collapse the other three sections rather than scroll past
them.

### Decisions

- **Growing a shared `limit` instead of offset-based appending, only for `DashboardSummary`.**
  Covered above — this is deliberately inconsistent with every other paginated list in this app,
  and that inconsistency is itself deliberate: `DashboardSummary` is the only one of these
  components that refetches on a timer it doesn't otherwise control, and offset-append pagination
  and "silently refetch everything periodically" don't compose safely without it.
- **The add area and the list are two separate regions, not one collapsible whole.** This was the
  explicit ask behind the redesign — the "+ Add" button has to stay reachable regardless of
  whether someone has collapsed a section they're not currently looking at. `SectionPanel`'s API
  (`topContent` vs. `children`) makes that the only way to use the component, not a convention
  that could be forgotten per-section.
- **Collapsed state defaults to expanded and persists per-section, not globally.** Matches every
  other list in this app on first load (nothing changes for a user who's never touched a chevron),
  and a per-section `localStorage` key means collapsing Medications has no effect on whether Mood
  is still expanded.

### Verification

- `npm test` (backend): 170/170 passing (1 new: pagination across all four merged types, proving
  the merge-then-slice logic works even when a single type accounts for every entry on a page).
- `npm test` (frontend): 132/132 passing (new `SectionPanel.test.tsx`: expanded-by-default,
  collapsing hides the list but never the add area, collapse state persists across a remount
  under the same key, and different sections' keys don't leak into each other; plus a new
  `DashboardSummary` test for the growing-limit "Load more" behavior).
- `npm run build`, `tsc -b`/`tsc --noEmit`, `npm run lint`, `npx prettier --check` (both
  projects) — all clean.
- **A real, if minor, environment quirk found and worked around while writing the `SectionPanel`
  tests**: this project's test environment (Node 25.6.1 under Vitest/jsdom) has a broken built-in
  `window.localStorage` — present as an object, but with no working `setItem`/`getItem`/`clear` at
  all (`TypeError: ... is not a function`), apparently Node's own experimental global storage
  shadowing jsdom's real implementation, inert without a `--localstorage-file` flag neither Vitest
  nor this project's config supplies. `useCollapsedState`'s existing try/catch fallback (written
  for real private-browsing scenarios) degrades through this cleanly on its own, but *testing*
  actual persistence needed a real, working `Storage` stubbed in via `vi.stubGlobal` rather than
  relying on the environment's own broken one.
- Real end-to-end check against a live, Postgres-backed dev server: registered a throwaway user,
  seeded 12 mood logs (to force the per-type Mood section's own "Load more") plus one symptom,
  medication, and habit entry via the real API, then drove the actual running frontend through a
  headless browser — confirmed the unified "Recent entries" box's own "Load more" works, clicking
  Mood's "Load more" grew it from 10 to 12 items, collapsing the Symptom section hid its list while
  its own "+ Symptom" button stayed visible and clickable, and — critically — a full page **reload**
  still showed the Symptom section collapsed (real `localStorage` persistence, not just the
  in-memory state a script restart wouldn't have caught) while Mood's expanded-to-12 state correctly
  reset back to the first page of 10 (pagination depth was never meant to persist, only the
  collapsed/expanded preference). Screenshotted all three states. The two console `401`s seen
  during the check are the same already-documented, harmless first-page-load rehydration behavior
  from the session-rehydration fix — not a regression here.

---
