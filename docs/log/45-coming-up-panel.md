# The Coming Up Panel

## 2026-08-30 — Answering "what's next" without opening anything

**Task:** The last piece of the panel design: _"the landing page might be better if it showed
upcoming reminders in chronological order… and maybe we allow reminders for a day too and another
with reminders for next 7 days or 30 days like history."_

Until now nothing in the app answered "what will remind me, and when?" — you could open one
category's bell and read one schedule, and that was it.

### Background / concepts

#### The client does not expand a single cron expression

That is the whole design, and it is worth being blunt about why. The browser already _has_ a cron
implementation — it draws the reminder picker. Using it here would have been the obvious move and
completely wrong, for the same reason the next-run preview is computed server-side
([33](33-next-run-preview.md)): the picker's cron knows about expressions, and nothing else.

A reminder now also carries `enabled`, `startsAt`, `expiresAt`, `stopsWhenLogged` and the owner's
quiet hours. A list built from expressions alone would confidently show runs that never happen —
expired temporary reminders, follow-ups that have not started, and a 03:46 dose alert that quiet
hours will actually deliver at 08:00.

So `GET /api/reminders/upcoming` ([42](42-upcoming-reminders.md)) applies the scheduler's own rules,
and this panel renders exactly what it is told. The client's only real logic is grouping an
already-chronological list into days and phrasing the states.

#### The states are what make it an explanation rather than a timetable

A bare list of times would be less useful than it looks, because the interesting rows are the ones
that _will not_ simply fire:

| State       | What the row says                              |
| ----------- | ---------------------------------------------- |
| `held`      | "Quiet hours — arrives at 08:00"               |
| `logged`    | "Already logged, so this one won't fire"       |
| `paused`    | "This reminder is switched off"                |
| `scheduled` | nothing — the common case needs no explanation |

`held` matters most. It has to name the delivery time, because "Held" on its own reads as _lost_
when the truth is the opposite: the scheduler defers rather than drops ([41](41-quiet-hours.md)).

### What was done

- **`UpcomingRemindersPanel`** at the top of the Dashboard, above the day summary.
- **Range chips — Today / 7 days / 30 days**, re-fetched from the server rather than filtered on the
  client, because the client has no way to know what happens beyond the window it asked for.
- **`lib/upcoming.ts`** — the response types, day grouping, and state phrasing, all pure.
- **A `--color-warning` token** in all three palettes, for the `Held` pill. Semantic colour,
  separate from the brand accent; `danger` would have been wrong, since nothing is broken.

### Decisions

- **Above the day summary, not below it.** "What is about to happen" is what people open the app to
  check; the streak card is a look back. The summary moved down a notch rather than being replaced.

- **90 days was dropped.** The design offered it, matching Trends. A daily reminder over 90 days is
  90 identical rows — a scroll, not information. Today / 7 / 30 is the honest set.

- **A count in the header, absent while loading.** `Coming up · 5` is worth a glance; `Coming up ⌄`
  is not. It is deliberately _absent_ rather than `0` until the response lands, because `0` reads as
  "nothing due" for as long as the request takes.

- **An empty list and a failed request must not look alike.** "Nothing scheduled today" is a
  reassuring thing to read and would be a lie if the request had simply failed. They have separate
  branches and a test that asserts the error path shows no "nothing scheduled" text.

- **The panel draws twelve runs and says how many are left.** See below — this was not in the plan.

### Verification

- **298 tests across 40 files, green** (297 before, plus this panel's). `tsc -b`, oxlint, prettier
  and `npm run build` clean.
- **Both new pure functions mutation-checked**: dropping the delivery time from a `held` run, and
  grouping every run into one day. Each failed the tests that exist for it, then was reverted.
- **Driven against the real endpoint**, by merging the backend branch into a throwaway branch — this
  panel had been built against a written contract, and a contract is not a running server:

  ```
  endpoint status: 200
  states returned: ["scheduled","logged","paused","held"]
  panel (Today):  Coming up | 37 | Today | 7 days | 30 days | TODAY |
                  11:30 | 🤸 Stretch |
                  12:00 | 💊 Sertraline | Already logged, so this one won't fire | Logged |
                  12:00 | 💧 Water | This reminder is switched off | Paused | …
  panel (7 days): Coming up | 200 | …
  ```

  All four states arrived and rendered. The 7-day figure of exactly 200 is the server's own cap,
  so the truncation path was exercised too.

#### The real-run found something no test would have

The Today view was **thirty-seven rows long**. The test data had an hourly reminder, and a panel
sitting at the top of the Dashboard turned into a wall of near-identical lines.

Every test passed, because each was about a handful of runs. The design assumed a few daily
reminders and never asked what happens with an hourly one.

So the panel now draws at most twelve and adds `…and 25 more`. The count in the header stays the
real total, so nothing is hidden — the panel is a glance, and the full schedule is what the range
chips are for. The cap has its own test.

**What this does not prove.** The panel has only been seen at 412px, in light mode, against one
account. The 30-day range was never rendered in a browser — only 1 and 7. And `truncated` was
exercised through the server's cap, not through a response deliberately built to test the
"(at least)" wording.

### Known limitations and follow-ups

- **A run cannot be acted on.** Every row is read-only. Tapping one might reasonably jump to that
  category, or offer to snooze it.
- **Twelve is a guess.** It is enough to fill a phone screen without dominating it, but it was
  chosen by looking at one screen, not by measuring anything.
- **The twelve-row cap is the cheap fix; collapsing is the real one.** Done in
  [46](46-collapsing-repeated-runs.md), server-side - a collapsed row now reads "11 times, until
  23:00". The cap stays as the backstop for the case where many _different_ reminders are due.
- **The panel refetches only when the range changes.** Logging something that satisfies a
  `stopsWhenLogged` reminder will not update the list until the next page load.

---
