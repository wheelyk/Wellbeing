# Next-Run Preview

## 2026-08-29 — Showing when a schedule will actually fire, computed by the code that fires it

**Task:** The follow-up flagged three times across the reminder work and repeatedly described as
the highest-value remaining item. On the surface it's a small usability addition — a line under the
picker saying "Next: tomorrow at 09:00". Its real purpose is different, and worth stating plainly.

### Background / concepts

#### Why this is a correctness feature wearing a usability feature's clothes

There are now **two independent cron implementations** in this project:

- `frontend/src/lib/cronSchedule.ts` — builds and parses expressions so the picker can draw chips
  and day toggles.
- `backend/src/lib/cron.ts` — expands expressions into `HH:mm` slots so the scheduler knows what to
  send.

They are written by the same hand to the same spec, and they have never been checked against each
other. Every test on both sides tests that implementation against its _own_ expectations. And
because `web-push` is mocked in every test, **nothing in the suite proves a reminder fires when the
UI says it will.**

A disagreement between them would not fail a test. It would surface as a notification arriving on
the wrong day, weeks later, for one user — the hardest possible class of bug to trace back.

The preview closes that gap by construction: the server answers _"when would this fire?"_ using
`nextRunsForSchedules`, which sits in the same module and uses the same `cronSlotsForDate` the
scheduler itself calls. If the picker draws "weekdays" while the server reads the expression as
something else, the line underneath says so immediately, in front of the person who just set it.

That is why this is computed server-side even though the browser could do it. **A preview derived
from the drawing code would only ever repeat the picker back to itself.**

### What was done

1. **`backend/src/lib/cron.ts`** gains `nextRunsForSchedules(schedules, timeZone, count)` — walks
   forward day by day from "today in the user's timezone", expands each day through the existing
   `cronSlotsForDate`, and collects the first N slots strictly in the future. The lookahead window
   is a full year plus a day, so a month-restricted rule (`0 9 25 12 *` evaluated in August) still
   resolves; the scan stops as soon as enough runs are found, which for ordinary schedules is the
   first or second iteration.
2. **`POST /api/reminders/preview`** — validates with the same `schedulesSchema` the save path
   uses, resolves against the caller's **stored** timezone (the one the scheduler uses, not the
   server's and not the browser's), and returns `{ timezone, today, tomorrow, nextRuns }`.
3. **`frontend/src/lib/nextRunPreview.ts`** — the fetch plus `describeNextRun`, which turns a run
   into "today at 20:00" / "tomorrow at 08:00" / "Monday 31 Aug at 08:00".
4. **`ReminderScheduleForm`** shows the line live, debounced 300ms, re-fetching whenever the
   generated expressions change.

### Why it's needed

Two reasons, in order of importance: it makes a silent frontend/backend disagreement visible at the
moment a schedule is set, and it answers a real user question that got harder once one reminder
could hold several rules — "weekdays 08:00 · weekends 10:00" is genuinely hard to hold in your
head.

### Decisions

- **Computed server-side, deliberately.** See the Background section. This is the entire point;
  doing it in the browser would have been simpler, faster, and worthless as a check.
- **`today` and `tomorrow` travel in the response.** The client then only ever compares date
  strings and never has to decide what day it is in someone else's timezone — which is exactly
  where this class of bug lives. The client does no timezone reasoning at all.
- **Three runs, not one.** A two-rule weekday/weekend pattern isn't recognisable from a single
  entry; three is enough to see the shape without turning a confirmation line into a list.
- **Strictly future.** A slot at the current minute has either just fired or is about to, so
  calling it "next" would be misleading either way.
- **Debounced, and quiet on failure.** Tapping through day toggles changes the schedule several
  times a second, and a rejected expression is an ordinary state while someone is mid-edit in the
  cron box — so a failed preview shows a muted line rather than an alert. The save path still
  reports the real error.
- **A preview never blocks saving.** It's advisory; if the endpoint is unreachable the form still
  works exactly as before.

### Verification

- `npm test` (backend): **269 tests across 22 files, green** — 9 new for `nextRunsForSchedules`
  (today-before-tomorrow ordering, skipping the current minute and anything past, day-of-week
  exclusions, merging several rules chronologically, day-of-month and month-restricted lookahead,
  hourly expansion, unparseable input) plus 5 for the route.
- `npx vitest run` (frontend): **260 tests across 36 files, green** — 4 new covering that the form
  asks the _server_, renders the words, handles an empty result, and stays quiet on failure.
- `tsc` both projects, lint, `format:check`, `build`: clean.
- **The timezone case is pinned to a real clock rather than "now"**: with the system time at
  2026-08-28 10:00 UTC, `0 8 * * *` resolves to **today** in `America/Los_Angeles` (where it is
  03:00, so 08:00 is still ahead) and **tomorrow** in UTC. Getting this backwards is precisely the
  fire-on-the-wrong-day bug this feature exists to expose.
- **Real browser, real servers**, 412×915, zero console errors — the line updated live as the
  picker changed, on a Saturday at ~11:00:

  | Picker state           | Preview                  |
  | ---------------------- | ------------------------ |
  | Every day 09:00        | `tomorrow at 09:00`      |
  | Weekdays               | `Monday 31 Aug at 09:00` |
  | Weekends               | `tomorrow at 09:00`      |
  | Every hour             | `today at 12:00`         |
  | `0 7 1,15 * *` (typed) | `Tuesday 1 Sep at 07:00` |

  Each is correct for that moment, and the last one matters most: it's an expression the **picker
  cannot draw**, so the server answered it independently — which is the agreement check working.

- **Still not proven**: that a push notification physically arrives at the previewed time.
  `web-push` remains mocked, and this preview narrows the gap without closing it — it proves the
  API and the scheduler share an interpretation, not that delivery succeeds. A real end-to-end
  notification test remains the honest next step for that.

---
