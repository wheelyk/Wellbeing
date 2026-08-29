# A Reminder That Knows Not To Fire Yet

## 2026-08-29 — Cron can't express a beginning either

**Task:** Make a cooldown able to notify when the gap is up. Which turned out not to be possible,
for a reason worth writing down.

### Background / concepts

#### The bug this started as

[39-category-timing.md](39-category-timing.md) added a `cooldown` mode: a minimum gap before the
next one is due. Asked whether it should notify or just be a countdown you look at, the answer was
notify. That looked like a small job — a cooldown's "you can have another now" is exactly a
one-shot reminder, and `POST /api/reminders/follow-up` already creates those.

It doesn't work, and the case it fails on is the one from the original screenshot: **Diazepam
logged at 21:46 with a six-hour gap.** That lands at 03:46 _tomorrow_, and the follow-up endpoint
refused anything crossing midnight — deliberately, with its own error code and its own test.

Two further mismatches sat underneath: a cooldown may be up to 24 hours, while a follow-up capped
at 12; and a cooldown starting any time after midday necessarily crosses midnight. So the longest
and most useful gaps were exactly the ones that could never notify.

#### Why crossing midnight was refused in the first place

Not arbitrarily. A one-shot for 03:46 is stored as `46 3 * * *`, and the scheduler **fires late on
purpose** (see `reminderEligibility.ts`: better a late reminder than none after a restart). So at
21:46 today, that slot reads as a time that has already gone by, and the reminder arrives
immediately — the exact opposite of what was asked for. Refusing was the honest response to a
thing the model couldn't express.

#### The actual gap in the model

Cron expresses a _recurrence_. [37](37-temporary-reminders-backend.md) established that it has no
vocabulary for an **ending**, and added `expiresAt` outside the expression.

It has no vocabulary for a **beginning** either, and that is the same shape of problem — it just
took a second feature to surface it. `startsAt` is the mirror: a moment before which this reminder
must not fire.

With it, a one-shot at an arbitrary future instant becomes expressible: the cron says _when in the
day_, `startsAt` says _not before this_, and `expiresAt` says _and then never again_. Between them
the three describe a single moment, using the scheduling path that already exists rather than a
second one beside it.

### What was done

- **`Reminder.startsAt`** — nullable, no backfill. Null means "fire from now on", which is what
  every existing reminder means.
- **The scheduler skips it two ways**: a reminder whose start is still in the future isn't a
  candidate at all, and on the day it _does_ start, slots earlier than the start time are filtered
  out.
- **`POST /api/reminders/follow-up` can now land tomorrow.** `FOLLOW_UP_PAST_MIDNIGHT` is gone; the
  response carries `firesTomorrow` so the client can say which day.
- **Its ceiling moved from 12 hours to 24**, matching the longest gap a cooldown may be set to.
- **`timeInTimezone(date, tz)`** — `currentTimeInTimezone` generalised to an arbitrary instant,
  which the slot filter needs.
- **The follow-up prompt says "tomorrow"** when it is tomorrow.

### Decisions

- **Two filters, not one.** The database query drops reminders that haven't started (exact, cheap —
  both sides are instants). The per-slot filter only applies _on the start day_, because on any
  later day every slot is legitimately after the start. Doing it only in the query would fire the
  earlier slots on day one; doing it only per-slot would do needless work on every tick forever.

- **`expiresAt` follows the day it fires on, not today.** A one-shot landing tomorrow that expired
  tonight would be swept before it ever fired — and the sweep is silent, so it would have looked
  like the notification simply never arrived.

- **The instant is derived from `getDayRangeUtc`, not assembled by hand.** Start of the target
  local day plus minutes into it. A local day is not always 24 hours long, and a DST boundary is
  precisely the sort of thing hand-rolled arithmetic gets wrong once a year, in a way nobody
  reproduces.

- **The frontend stopped filtering intervals by how much of the day was left.** That filter existed
  only because the API refused to cross midnight. Every interval is now offered at any hour — which
  matters most late at night, exactly when a six-hour gap needs to reach into tomorrow.

- **"at 03:46" is not enough, so the day is said out loud.** On its own that reads as this morning,
  which is already past. `firesTomorrow` travels with the response rather than being re-derived by
  the client, for the same reason `firesAtLocal` does: the server owns the timezone.

### How a request actually travels

`POST /api/reminders/follow-up` with `{ inMinutes: 360 }`, at 22:31 in `Europe/London`:

1. The user's timezone is read; `currentTimeInTimezone` gives `22:31`.
2. `22*60 + 31 + 360 = 1711` minutes. That is `daysAhead = 1`, `minutesIntoDay = 271` → **04:31**.
3. The target local date is today + 1 = `2026-08-30`.
4. `startsAt` = start of that local day in UTC, plus 271 minutes → `2026-08-30T03:31:00Z`.
5. `expiresAt` = end of _that_ day → `2026-08-30T23:00:00Z` (BST, so 23:00 UTC).
6. The row is stored with `schedules: ["31 4 * * *"]`.
7. On every tick until then, the query's `startsAt <= now` test excludes it entirely. From 04:31
   tomorrow it becomes a candidate, its single slot is due, and it fires once.

### Verification

- **Backend 313 tests across 23 files, green. Frontend 273 across 37, green.** `tsc`, eslint,
  prettier clean.
- **Every new behaviour mutation-checked** — each reverted straight after:

  | Mutation                                         | Caught by                                                                       |
  | ------------------------------------------------ | ------------------------------------------------------------------------------- |
  | Drop the `startsAt <= now` filter from the query | `is not a candidate at all while its start is still in the future`              |
  | Make the per-slot filter a no-op                 | `does not fire a slot earlier than the start time on the day it starts`         |
  | Stop storing `startsAt` on a follow-up           | `schedules a follow-up that lands tomorrow, and marks it as not due until then` |

- **Two existing tests were replaced rather than deleted.** They asserted the midnight refusal and
  the 12-hour cap — both real behaviours, both deliberately removed here, so each was rewritten to
  assert what now happens instead. The bounds test additionally pins 20 hours as _accepted_ and 25
  as rejected, so the new ceiling is stated rather than merely implied.

- **Driven against the really running server**, on the case that started this — an account pinned
  to a timezone where it was genuinely late evening:

  ```
  account timezone Europe/London, local time there is 22:31
  6h follow-up: 201 firesAtLocal=04:31 firesTomorrow=true
    schedules : ["31 4 * * *"]
    startsAt  : 2026-08-30T03:31:00.000Z -> 30/08/2026, 04:31
    expiresAt : 2026-08-30T23:00:00.000Z
  20h follow-up (was over the old 12h cap): 201 firesAtLocal=18:31 firesTomorrow=true
  ```

  Before this change the first of those was a 400.

**What this does not prove.** No reminder has been observed actually _firing_ after a real
midnight — the scheduler tests establish the filtering with a controlled clock
(`vi.setSystemTime`), and the live run stopped at "stored correctly". A DST boundary has not been
crossed in a real run either; the arithmetic is delegated to `getDayRangeUtc` specifically so that
it doesn't have to be, but that is reasoning, not evidence.

### Known limitations and follow-ups

- **A cooldown notification can arrive in the middle of the night.** Six hours after a 21:46 dose
  is 03:46, and this will ring at 03:46. That is what "notify me when the gap is up" literally
  means, and it may well not be what anyone wants. A quiet-hours rule, or deferring an overnight
  notification to the morning, is a real product decision and deliberately not guessed at here.
- **Nothing creates the cooldown notification yet.** `startsAt` makes it _possible_; wiring the
  cooldown mode to create one on logging is part of the frontend task.
- **`startsAt` is only ever set by the follow-up endpoint.** `POST`/`PATCH /api/reminders` don't
  accept it. There is no use for it on a standing reminder yet, and an unused input is a thing to
  keep correct for no benefit — worth adding the moment something needs it.

---
