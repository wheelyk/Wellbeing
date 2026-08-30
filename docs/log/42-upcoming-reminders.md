# What's Actually Coming Up

## 2026-08-30 — A list of when reminders will really fire, built by refusing to write the rules twice

**Task:** Add `GET /api/reminders/upcoming?days=1|7|30` — a merged, chronological list of when the
caller's reminders will actually fire, to power a "Coming up" panel on the dashboard. The panel
itself is a separate, later piece of work; this is the backend half.

### Background / concepts

#### The trap, which is the whole point

`nextRunsForSchedules()` in `backend/src/lib/cron.ts` already exists, is already shared with the
scheduler, and looks like exactly the right function to build this on.

It is not. It understands cron expressions and nothing else.

Everything the reminder model has learned since it was written is invisible to it:

| Added since             | Where it came from                                    | What it means            |
| ----------------------- | ----------------------------------------------------- | ------------------------ |
| `enabled`               | [16](16-reminders-and-category-toggles.md)            | switched off             |
| `expiresAt`             | [37](37-temporary-reminders-backend.md)               | and then never again     |
| `stopsWhenLogged`       | [38](38-reminder-stop-condition-and-follow-ups.md)    | logging it silences it   |
| `startsAt`              | [40](40-reminder-starts-at.md)                        | not before this moment   |
| quiet hours             | [41](41-quiet-hours.md)                               | not while you're asleep  |

Built on `nextRunsForSchedules` as-is, this endpoint would confidently list runs that never happen:
temporary reminders that expired last week, follow-ups that have not started, and a 03:46 slot that
quiet hours will really deliver at 08:00. It would be wrong in the most expensive way available —
plausibly, quietly, and only for the people whose reminders are most complicated.

And writing the rules a second time inside the route would be the failure
[33-next-run-preview.md](33-next-run-preview.md) exists to prevent, one level up. That entry made
the case about cron _expansion_: two implementations of "which slots does this expression produce"
drift apart silently, and the bug surfaces weeks later as a notification on the wrong day. Every
word of it applies to the layer above expansion, where the rules are newer, fiddlier and more
numerous.

So the actual work of this task was not the endpoint. It was **getting the scheduler's own firing
rules out of the scheduler**, into something a second caller can ask.

#### What "extract" has to mean here, to be worth anything

An extraction that merely _copies_ the logic somewhere shared and leaves the scheduler running its
own version is worse than no extraction at all: it looks shared and isn't.

So the standard applied was: **the scheduler must end up calling the extracted code, and its
existing tests must pass unchanged.** Unchanged is the load-bearing word. Those tests were written
against the old, inlined logic, by someone who was not thinking about this endpoint. If they all
still pass after the rules were lifted out and called from a new module, the move preserved
behaviour. If any of them had needed editing to go green, the "refactor" would have been a rewrite
wearing a refactor's name, and the edit would have been the thing hiding the difference.

They passed unchanged. That is the only real evidence in this task that the extraction is faithful.

#### The one rule that genuinely differs between the two callers

Quiet hours, and it is worth being precise about why.

The scheduler asks "is it inside quiet hours **right now**?" — deliberately, keyed on the current
time rather than the slot's, because that is what turns "don't send" into "send later" for free
(see [41](41-quiet-hours.md): nothing is recorded as sent, so the slot is still due when the window
ends).

This endpoint asks the same question about a slot that has **not arrived yet**, so it has to pass
the slot's own time instead.

Same rule, different instant. That is a shared function taking the time as a parameter — not two
implementations, and not one implementation with a flag deciding which clock to read.

### What was done

- **`backend/src/lib/reminderRuns.ts`** — new. Three things lifted out of `reminderScheduler.ts`:
  - `reminderSlotsForDate(...)` — the cron expansion for a local date, deduplicated and ascending,
    **minus anything outside the `[startsAt, expiresAt)` window**.
  - `quietHoursHoldUntil(time, allowDuringQuietHours, window)` — null when the reminder is not
    held; otherwise the local `"HH:mm"` the window ends at, which is when it will really arrive.
  - `hasLoggedTarget(...)` — moved verbatim, `GENERAL` being "anything at all logged today" and
    `CATEGORY` being scoped to that one category.
- **`reminderScheduler.ts` now calls all three** and owns none of them. Its own two local helpers
  (`slotsForToday`, `hasLoggedTarget`) are gone.
- **`GET /api/reminders/upcoming?days=1|7|30`** — merged, chronological, resolved in the caller's
  stored timezone, capped at 200 runs.

The response:

```json
{
  "timezone": "Europe/London",
  "today": "2026-08-30",
  "truncated": false,
  "runs": [
    {
      "date": "2026-08-30",
      "time": "20:00",
      "reminderId": "…",
      "target": "category",
      "category": { "name": "Sertraline", "icon": "💊" },
      "state": "logged"
    },
    {
      "date": "2026-08-31",
      "time": "03:46",
      "reminderId": "…",
      "target": "category",
      "category": { "name": "Diazepam", "icon": "💊" },
      "state": "held",
      "deliveredAt": "08:00"
    }
  ]
}
```

Three of the four states describe a run that will _not_ happen, which is the point:

| State       | Meaning                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| `scheduled` | it will fire, at the date and time given                                                |
| `paused`    | the reminder is switched off — listed, not hidden                                       |
| `logged`    | `stopsWhenLogged`, and the target is already logged today, so this slot is silenced     |
| `held`      | inside quiet hours; `deliveredAt` says when it really arrives                            |

### Decisions

- **A new module rather than adding to `reminderEligibility.ts`.** That file's own header
  celebrates being pure — no clock, no database, no mocking — and `hasLoggedTarget` needs Prisma.
  Putting a query in there would have quietly cost the thing the file exists for.

- **`expiresAt` is now filtered per slot as well, which the scheduler never needed.** Its database
  query already drops any reminder whose expiry has passed, and it only ever looks at today — so
  for the scheduler this new filter can only ever agree with the query it already ran. It is
  load-bearing only for a caller that looks _ahead_, where "expires on Thursday" has to stop
  Friday's slots appearing. Adding it made the rule symmetrical with `startsAt` and put both in one
  place; leaving it out would have meant the shared module knew about beginnings but not endings,
  which is exactly the asymmetry that invites someone to reimplement the missing half.

- **Both bounds compare local dates and `"HH:mm"`, not whole instants.** Two reasons. It is the
  frame the rest of the codebase reasons in (see `timezone.ts`), and it truncates to the minute on
  both sides — so a `startsAt` of 03:46:30 does not exclude the 03:46 slot it was computed to
  describe. Comparing instants would have been subtly stricter than the scheduler, and the
  scheduler's tests would have caught it, which is roughly how the choice got made.

- **The two bounds are deliberately asymmetric at the boundary.** A slot at exactly `startsAt` is
  included; a slot at exactly `expiresAt` is not. That is not a coin flip — it matches the
  scheduler's own database filters (`startsAt <= now`, `expiresAt > now`), and it is what makes
  `"end-of-day"` (stored as midnight _tomorrow_) mean every slot of today and none of tomorrow.

- **Strictly future, so `days=1` means "the rest of today".** A slot at or before the current
  minute has either just fired or is about to. This is the same convention `POST /api/reminders/preview`
  already uses, and reusing it keeps one answer in the codebase to "does now count?".
  The honest cost of this choice is recorded under _what this does not prove_ below.

- **`paused` beats `logged` beats `held` beats `scheduled`.** A reminder can be several at once —
  switched off, already logged, _and_ inside quiet hours — and only one word fits. The order runs
  from "you will not hear from this at all" to "you will, just later".

- **`logged` is today-only, and refuses to guess.** Whether tomorrow's slot will have been logged
  by tomorrow is unknowable. A list whose entire purpose is not to promise runs that will not
  happen must not also invent ones that will not be silenced.

- **A switched-off reminder is listed, not hidden.** "Why am I not being reminded about this?" is
  precisely the question a "Coming up" panel should answer, and an empty panel answers it wrongly.

- **200 runs, then `truncated: true` — not pagination.** Pagination would imply the later pages are
  worth reading. Past the two-hundredth entry this has stopped being a preview and become a data
  dump; a dashboard panel will show perhaps a dozen. The cap also _bounds the work_ rather than
  just trimming the output: runs are generated day by day in order, and generation stops at the
  cap.

- **`days` is 1, 7 or 30 and nothing else.** 90 was dropped on purpose: a daily reminder over 90
  days is 90 rows that all say the same thing.

- **`today` travels in the response**, for the same reason `POST /preview` sends it — the client
  then only ever compares date strings and never has to decide what day it is in someone else's
  timezone, which is exactly where this class of bug lives.

### How a request travels

`GET /api/reminders/upcoming?days=7`, end to end:

1. **Node process → Express.** `src/index.ts` is the only file that calls `.listen()`;
   `src/app.ts` builds the app. Helmet, CORS, `express.json()` and `cookie-parser` run first.
2. **`requireAuth`** (mounted on the whole `/api/reminders` router) verifies the bearer access
   token and sets `req.userId`. Without it: 401, before any of the below happens.
3. **The route validates `days`** against a three-value enum — absent means 1, anything else is a
   400 with `details.days`, never a silent fallback.
4. **One query for the user**, reading `timezone`, `quietHoursStart`, `quietHoursEnd`. Everything
   after this point is in that timezone. If the row is gone: 404 `USER_NOT_FOUND`.
5. **One query for the reminders**, scoped to `userId`, ordered by `createdAt` (the tiebreak for
   two reminders due at the same minute), including each one's category name and icon.
6. **A loop over the days, ascending.** For each day, each reminder goes through
   `reminderSlotsForDate` — the same call `runReminderTick` makes — which parses the cron
   expressions and applies the `startsAt`/`expiresAt` window. Today's already-past slots are
   dropped.
7. **The day's slots are sorted by time** (a stable sort, so same-minute ties keep created-order),
   then each becomes a run with a state. `quietHoursHoldUntil` decides `held`; `hasLoggedTarget`
   decides `logged` — that last one is a database read, memoised per _target_, so twenty slots
   about Sertraline cost one query, not twenty.
8. **The cap** stops generation at 200 and sets `truncated`.
9. **`res.json`.** No writes at all: this endpoint reads.

Nothing about steps 6 and 7 is specific to this route — that is the extraction doing its job. The
scheduler reaches the same two functions from `runReminderTick`, having got there through a
`setInterval` rather than an HTTP request.

### Verification

- **Backend `npx vitest run`: 379 tests across 26 files, green** (was 337 across 24). Two new
  files - 19 unit tests for the extracted rules and 22 integration tests for the endpoint over real
  HTTP against the real database - plus one added to `reminderScheduler.test.ts` for a rule the
  mutation pass found untested (see below).
- **`npm run typecheck` (both `tsconfig.json` and `tsconfig.test.json`), `npx eslint .`,
  `npx prettier --check src`: clean.**
- **`reminderScheduler.test.ts` was not touched for the refactor.** All 28 of its existing tests
  passed unchanged against the refactored scheduler, in their own commit, before a line of the
  endpoint was written. That is the evidence the extraction preserved behaviour rather than
  replacing it. A 29th test was added **afterwards, in a separate commit**, for a hole the mutation
  pass found - deliberately kept apart so it cannot be mistaken for a test edited to make the
  refactor go green.

#### Mutation pass

Every new behaviour was deliberately broken one at a time, the suite re-run, and the mutation
reverted. A test that passes against broken code proves nothing.

Seventeen mutations, every one caught, each reverted straight after. The tests named are the ones
that actually failed, not the ones that were supposed to.

| Mutation                                                       | Caught by                                                                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startsAt` window ignored entirely                             | 4 unit tests, scheduler `records only the slots at or after the start`, route `leaves out a slot earlier than the start` — **the last two only after they were added**, see below |
| `startsAt` boundary made exclusive (`>=` → `>`)                | `keeps the one at it`, `truncates the start to its minute`, `applies both bounds together`, plus the same scheduler and route tests                                    |
| `expiresAt` window ignored entirely                            | 5 unit tests, route `leaves out a temporary reminder whose expiry has already passed`, `stops a temporary reminder's runs at its expiry`, `leaves out a follow-up`     |
| expiry boundary made inclusive (`<` → `<=`)                    | `drops the slots at or after the expiry time on the expiry day`                                                                                                        |
| `allowDuringQuietHours` ignored                                | unit `returns null when the reminder is allowed through the window`, scheduler `fires anyway when the reminder is allowed to ignore the window`, route `leaves a reminder allowed through quiet hours scheduled` |
| scheduler stops reading the shared quiet-hours rule            | **16 of the scheduler's 29 tests** — the extraction is genuinely load-bearing, not decorative                                                                          |
| disabled reminder not reported as `paused`                     | route `lists a switched-off reminder as paused rather than hiding it`                                                                                                 |
| `logged` applied to future days too                            | route `marks today's slot logged when the target is done, but never a future day's`                                                                                   |
| `stopsWhenLogged` ignored                                      | route `does not mark a rhythm reminder as logged`                                                                                                                     |
| `deliveredAt` dropped from a held run                          | route `marks a slot inside quiet hours as held, at its real time, with when it will arrive`                                                                           |
| slots already past today no longer skipped                     | route `leaves out a slot that has already gone by today`, `resolves the whole answer in the caller's own timezone`, `caps the list at 200 runs`                        |
| chronological sort removed                                     | route `merges several reminders into one chronological list`                                                                                                          |
| 200-run cap raised out of reach                                | route `caps the list at 200 runs and says it was cut`                                                                                                                 |
| `days` validation accepts anything                             | route `rejects any days value that isn't 1, 7 or 30`                                                                                                                  |
| `days` defaults to 7 instead of 1                              | route `defaults to one day and answers in the caller's stored timezone`                                                                                               |
| server timezone used instead of the caller's                   | route `resolves the whole answer in the caller's own timezone, not the server's`                                                                                      |
| reminder query no longer scoped to the caller                  | **16 of the route's 22 tests**, including `never shows another user's reminders`                                                                                      |

#### The hole the mutation pass found — in the tests, not the code

Removing the per-slot `startsAt` filter outright **broke nothing in `reminderScheduler.test.ts`**,
which has a whole `describe` block named "reminders that have not started yet" containing three
tests. That block's own comment describes exactly the rule the mutation deleted.

All three are satisfied by the _database_ filter (`startsAt <= now`) instead:

- `does not fire a slot earlier than the start time on the day it starts` sets a start that is
  still in the future, so the reminder is never a candidate at all — the per-slot filter is never
  reached.
- `fires normally on a later day` and `fires a slot at or after the start time` have no slot
  _earlier_ than the start for the filter to drop.

So the per-slot half of a rule that exists to stop a 03:46 one-shot firing at 21:46 the night
before had no test at all, and had not had one since it was written. It survived this task's
refactor by luck, not by proof.

What makes it invisible is that the scheduler notifies **once for the most recent due slot** and
records the earlier ones as handled — so the notification count is identical whether or not the
pre-start slot is dropped. The difference only shows in the `ReminderSend` rows. The new test
asserts on those, and pins the boundary too, so both mutations now fail it. A matching route test
covers the same rule from the other side: 14:00 is not excluded for having gone by (it is still
ahead of the clock), only for never having been that reminder's slot.

This is the mutation pass earning its keep by finding a gap in the tests rather than in the code —
the same way it did in [41](41-quiet-hours.md).

#### Driven against the really running server

Port 4000 was in use by a parallel task on another branch, so this ran on `PORT=4100` against this
worktree's own code — the same dev server, a different port, and deliberately not whatever was
already listening on 4000.

One real account (`Europe/London`, quiet hours 22:00–08:00), six real reminders covering every
shape the endpoint has an opinion about, one real category log, at a real 12:01 BST:

```
health: {"status":"ok"}
account: {"timezone":"Europe/London","quietHoursStart":"22:00","quietHoursEnd":"08:00"}
follow-up: {"firesAtLocal":"18:01","firesTomorrow":false,"schedules":["1 18 * * *"],"startsAt":"2026-08-30T17:01:00.000Z","expiresAt":"2026-08-30T23:00:00.000Z","allowDuringQuietHours":false}

=== GET /api/reminders/upcoming (no days param) -> 200
{"timezone":"Europe/London","today":"2026-08-30","truncated":false,"runs":9}
  2026-08-30 14:00  scheduled category 💧 Water intake
  2026-08-30 16:00  scheduled category 💧 Water intake
  2026-08-30 18:00  scheduled category 💧 Water intake
  2026-08-30 18:01  scheduled category 💊 Diazepam
  2026-08-30 18:30  paused    category 🧘 Stretches
  2026-08-30 20:00  logged    category 💊 Sertraline
  2026-08-30 20:00  scheduled category 💧 Water intake
  2026-08-30 21:00  logged    general  -
  2026-08-30 22:00  scheduled category 💧 Water intake

=== GET /api/reminders/upcoming?days=1 -> 200
{"timezone":"Europe/London","today":"2026-08-30","truncated":false,"runs":9}
  2026-08-30 14:00  scheduled category 💧 Water intake
  2026-08-30 16:00  scheduled category 💧 Water intake
  2026-08-30 18:00  scheduled category 💧 Water intake
  2026-08-30 18:01  scheduled category 💊 Diazepam
  2026-08-30 18:30  paused    category 🧘 Stretches
  2026-08-30 20:00  logged    category 💊 Sertraline
  2026-08-30 20:00  scheduled category 💧 Water intake
  2026-08-30 21:00  logged    general  -
  2026-08-30 22:00  scheduled category 💧 Water intake

=== GET /api/reminders/upcoming?days=7 -> 200
{"timezone":"Europe/London","today":"2026-08-30","truncated":false,"runs":45}
  2026-08-30 14:00  scheduled category 💧 Water intake
  2026-08-30 16:00  scheduled category 💧 Water intake
  2026-08-30 18:00  scheduled category 💧 Water intake
  2026-08-30 18:01  scheduled category 💊 Diazepam
  2026-08-30 18:30  paused    category 🧘 Stretches
  2026-08-30 20:00  logged    category 💊 Sertraline
  2026-08-30 20:00  scheduled category 💧 Water intake
  2026-08-30 21:00  logged    general  -
  2026-08-30 22:00  scheduled category 💧 Water intake
  2026-08-31 03:30  held      category 🌙 Night dose   (arrives 08:00)
  2026-08-31 08:00  scheduled category 💊 Sertraline
  2026-08-31 09:00  scheduled general  -
  2026-08-31 18:30  paused    category 🧘 Stretches
  2026-08-31 20:00  scheduled category 💊 Sertraline
  ... 31 more

=== GET /api/reminders/upcoming?days=30 -> 200
{"timezone":"Europe/London","today":"2026-08-30","truncated":false,"runs":183}
  2026-08-30 14:00  scheduled category 💧 Water intake
  2026-08-30 16:00  scheduled category 💧 Water intake
  2026-08-30 18:00  scheduled category 💧 Water intake
  2026-08-30 18:01  scheduled category 💊 Diazepam
  2026-08-30 18:30  paused    category 🧘 Stretches
  2026-08-30 20:00  logged    category 💊 Sertraline
  2026-08-30 20:00  scheduled category 💧 Water intake
  2026-08-30 21:00  logged    general  -
  2026-08-30 22:00  scheduled category 💧 Water intake
  2026-08-31 03:30  held      category 🌙 Night dose   (arrives 08:00)
  2026-08-31 08:00  scheduled category 💊 Sertraline
  2026-08-31 09:00  scheduled general  -
  2026-08-31 18:30  paused    category 🧘 Stretches
  2026-08-31 20:00  scheduled category 💊 Sertraline
  ... 169 more

days=2 -> 400 {"days":["days must be one of 1, 7, 30"]}

days=90 -> 400 {"days":["days must be one of 1, 7, 30"]}

days=0 -> 400 {"days":["days must be one of 1, 7, 30"]}

days=abc -> 400 {"days":["days must be one of 1, 7, 30"]}

after adding an hourly reminder, days=30 -> {"status":200,"runs":200,"truncated":true,"first":{"date":"2026-08-30","time":"13:00","reminderId":"ef29c541-06fb-4cf8-afed-0c359e15e717","target":"category","category":{"name":"Hydration","icon":"🥤"},"state":"scheduled"},"last":{"date":"2026-09-05","time":"23:00","reminderId":"ef29c541-06fb-4cf8-afed-0c359e15e717","target":"category","category":{"name":"Hydration","icon":"🥤"},"state":"scheduled"}}

no access token -> 401
```

Reading that against the six shapes asked for:

| Shape                                       | In the output                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| standing                                    | 💊 Sertraline 08:00/20:00 and the general 09:00/21:00, every day                     |
| temporary / expiring                        | 💧 Water intake every two hours — present all of 30 Aug, **absent from 31 Aug on**   |
| follow-up with `startsAt`                   | 💊 Diazepam at 18:01, created through the real `POST /api/reminders/follow-up`        |
| disabled                                    | 🧘 Stretches 18:30 → `paused`, listed rather than hidden                             |
| already logged today                        | 💊 Sertraline 20:00 → `logged`; **and the general 21:00 too**, since `GENERAL` means "anything at all logged today" |
| slot inside quiet hours                     | 🌙 Night dose 03:30 → `held`, `arrives 08:00` — and note it appears on **31 Aug**, not today, because 03:30 today has gone by |

Two details in there that are the endpoint working rather than incidental:

- **The temporary reminder simply stops.** It has nine slots today and none tomorrow. Nothing
  filtered it out by name — `reminderSlotsForDate` applied its `expiresAt` and the days after it
  produced no slots at all.
- **The follow-up's own row proves the `startsAt` path is live**: the endpoint created it with
  `startsAt: 2026-08-30T17:01:00.000Z` and `allowDuringQuietHours: false`, and the list shows it
  once, today, at the minute it starts.

The cap, with something frequent enough to reach it:

```
after adding an hourly reminder, days=30 -> {"status":200,"runs":200,"truncated":true,
  "first":{"date":"2026-08-30","time":"13:00",…,"state":"scheduled"},
  "last": {"date":"2026-09-05","time":"23:00",…,"state":"scheduled"}}
```

Exactly 200, `truncated: true`, and cut from the far end — the last entry is 6 September, not
29 September, so generation stopped rather than the output being sampled.

#### A scripted edit that mangled itself, caught by running the thing

Worth recording because [41](41-quiet-hours.md) recorded the same class of bug, and it happened
again here. The verification script above was extended by a small Node one-liner run through the
shell, and a `\n` inside a string literal arrived in the file as a **real line break**, splitting
the string across two lines:

```js
console.log(
  "
after adding an hourly reminder, days=30 ->",
```

That is a syntax error, so it announced itself on the very next run — which is the lucky version.
The unlucky version is the mangled regex in [41](41-quiet-hours.md), where the escapes were eaten
and the result still ran, just wrongly, with every negative test still passing. The habit that
catches both is the same: after writing code through a script, read back what actually landed in
the file rather than trusting that what was typed is what was stored.

#### What this does **not** prove

- **No notification was watched arriving at a time this endpoint predicted.** `web-push` is mocked
  in the suite, and the live run above only reads. This narrows the gap the same way
  [33](33-next-run-preview.md) did — the endpoint and the scheduler now demonstrably share an
  implementation — without closing it. Only a real push at a predicted minute would.
- **Nothing has been observed across a real midnight or a DST change.** The timezone assertions use
  a pinned clock and two zones; a local day that is 23 or 25 hours long is untested here, and
  `zonedWallClockToUtc`'s own documented DST caveat still applies underneath.
- **The strictly-future rule hides a run that genuinely is still coming.** The scheduler fires
  _late_ on purpose (better a late reminder than none after a restart), so a slot from earlier
  today that has not been delivered — because the process was down — will still fire, and this list
  does not show it. Closing that would mean reading `ReminderSend` rows here too. Recorded rather
  than fixed, because "coming up" showing this morning is its own kind of wrong.
- **`deliveredAt` is a time, not a moment.** A slot held at 23:30 arrives at 08:00 *the next
  morning*; the response says `"08:00"` either way. For an overnight window that is unambiguous to
  a reader; for an exotic window it is less so.
- **The 200-run cap has not been exercised with many reminders**, only with one very frequent one.
  The ordering guarantee across a cut that falls mid-day is asserted only by construction.

### Known limitations and follow-ups

- **No UI.** The "Coming up" panel is a separate task; this endpoint has no consumer yet.
- **`held` does not say which day it will be delivered on**, per above.
- **A reminder whose stored cron no longer parses is skipped silently here**, where the scheduler
  logs it. That is deliberate (a thirty-day scan would otherwise log the same line thirty times per
  request) but it does mean this endpoint will never be the thing that surfaces a bad row.
- **`ReminderSend` is not consulted**, so "already delivered this slot" is not a state. It would
  matter for a panel that showed the past as well as the future.

---
