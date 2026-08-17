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
