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
`User` model, defaulted to `"UTC"`, but never actually *used* for anything until this task) is
what resolves that ambiguity — "today" has to mean "today, in this specific user's timezone," not
the server's own timezone (which, on a real hosting platform, is usually UTC and has nothing to
do with where any given user actually lives).

This project has no timezone library installed (no `date-fns-tz`, `luxon`, etc.) — rather than add
one for a single small task, `backend/src/lib/timezone.ts` is a small, hand-written wrapper
around JavaScript's own built-in `Intl.DateTimeFormat`, which already knows how to convert
between UTC instants and any IANA timezone's wall-clock time without any extra dependency. Two
tricks worth understanding, since they're not obvious the first time you see them:

- **`formatDateInTimezone`** turns a UTC instant into a `"YYYY-MM-DD"` string *as seen from a
  given timezone*, using `new Intl.DateTimeFormat("en-CA", { timeZone, ... })`. The `"en-CA"`
  locale is a deliberate trick, not a typo — Canadian English happens to format dates as
  `YYYY-MM-DD` by default, which is exactly the shape needed, with no manual string-splicing.
- **`getDayRangeUtc`** solves the harder, opposite problem: given a calendar day like
  `"2026-08-16"` and a timezone, what UTC instant does that day's *midnight* actually correspond
  to? There's no single built-in for this, so it's solved by a "guess, measure, correct" approach
  (see the long comment in `zonedWallClockToUtc` in `timezone.ts` for the full walkthrough): guess
  the answer is "midnight, read as if it were already UTC," ask `Intl` what that guessed instant's
  wall-clock time looks like *in the target timezone*, and the gap between the guess and that
  reading is exactly the timezone's UTC offset at that moment — which is then used to correct the
  guess. This is what turns `?date=2026-08-16` into a precise `WHERE loggedAt >= start AND
  loggedAt < end` database query.

#### What a "pure function" is, and why the streak calculation was written as one

Tasks.md specifically calls for the streak calculation to be "a pure, standalone,
unit-testable function." A **pure function** is one whose output depends *only* on its inputs —
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
timezone helpers above, and only *then* hands the resulting `Set<string>` to the pure function.
That split — impure I/O at the edges, pure logic in the middle — is a common, deliberately useful
pattern: it's what makes the interesting logic (the actual streak math) testable in isolation from
everything that's slow or hard to control about talking to a real database.

#### Why the resolved `?date=` doubles as the streak's own "today"

The endpoint accepts an optional `?date=YYYY-MM-DD`, defaulting to "today" (in the user's
timezone) when omitted — this is what Tasks.md's own wording flags as making the endpoint
"trivially testable for a fixed date." That resolved date isn't just used for the day's mood/
symptom/medication/habit summary; it's *also* used as the streak calculation's reference point for
"today" (see `calculateStreak(loggedDates, date)` in the route). This was a deliberate design
choice: it means the entire response is a pure function of one input (the resolved date, plus
whatever's actually in the database), so `dashboard.test.ts`'s integration tests can assert exact
values for a fixed date without any dependency on when the test suite happens to run.

#### The habit/medication "summary" design (not fully spelled out by requirements.md)

Requirements §7 gives one worked example — `Medications: 1/2 taken` — but doesn't define exactly
what the two numbers mean, and gives no habit example at all. Two decisions, made explicit here
since nothing forced a single obvious answer:

- **`medicationSummary`** counts `MedicationLog` *entries* for the day, not the user's medication
  *list*: `total` is how many medication logs exist for the day (taken or not), `taken` is how
  many of those were marked taken. A user who takes the same medication twice a day and logs both
  will see `2/2`, not `1/1` capped at their medication count — this matches a log-entry-centric
  reading of "medications: 1/2 taken," the same way `symptomCount` counts symptom *log* entries,
  not distinct symptoms.
- **`habitSummary`** is the one place this task's own instructions explicitly left the shape
  open ("design this reasonably … e.g. count of habits logged today vs. total habits defined").
  It returns `{ loggedCount, totalHabits }` — how many *distinct* habits (not raw log rows) have
  at least one entry today, versus how many habits the user has defined in total. Distinct habits,
  not raw log count, so logging the same habit twice in a day doesn't inflate "how many of my
  habits did I touch today" past the number of habits that actually exist.

#### Why the streak's lookback is bounded to 90 days, not the user's whole history

Computing a streak correctly requires knowing about every calendar day with at least one entry,
going back as far as the streak could possibly extend — in principle, a user's entire history.
Querying a user's *entire* logging history on every single dashboard load gets slower the longer
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
calculations, not the same number reused: the overall average is the mean of *every individual
logged value* in the period, while each day's plotted point is the mean of *just that day's*
values. Concretely, a day with three same-symptom logs (severities 4, 8, and — say — a third one)
contributes all three raw values to the overall average, weighted equally with every other log,
but only one plotted point (its own day's mean) to the line chart. The alternative — averaging the
*daily averages* together for the headline number — would let a single lightly-logged day count
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
ancestor hides *every* descendant from the accessibility tree, including ones that are themselves
interactive and focusable. That silently made every one of those hit-target buttons unreachable by
assistive technology, while looking completely correct by eye (the chart still rendered and looked
right) and even still receiving actual keyboard focus in a real browser (tabIndex isn't blocked by
aria-hidden, only *announcement* is) — the kind of bug that's easy to miss without a test that
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
`x = CHART_WIDTH`), which puts a 4px-radius circle marker's *center* on the boundary — half the
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
