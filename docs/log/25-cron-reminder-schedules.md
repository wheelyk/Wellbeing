# Cron Reminder Schedules

## 2026-08-28 — Replacing fixed "HH:mm" reminder times with cron expressions

**Task:** Direct product request. Reminders could only fire at fixed times, every single day —
there was no way to say "weekdays only", "Mondays and Thursdays", or "every hour". The ask was for
real recurrence, with a UI that stays approachable, and the storage format was chosen explicitly:
**cron expressions**. This entry covers the backend half; the Categories page and the schedule
picker UI that sits on top of it are a separate task.

### Background / concepts

#### What cron is, and what a "five-field expression" means

**Cron** is a scheduling format that predates this project by decades — it's how Unix systems have
described recurring jobs since the 1970s. A schedule is five space-separated fields:

```
 ┌───────────── minute       (0-59)
 │ ┌─────────── hour         (0-23)
 │ │ ┌───────── day of month (1-31)
 │ │ │ ┌─────── month        (1-12)
 │ │ │ │ ┌───── day of week  (0-6, Sunday = 0)
 │ │ │ │ │
 0 9 * * 1-5      →  09:00, Monday to Friday
```

`*` means "every value". A list (`1,3,5`), a range (`1-5`), and a step (`*/15`) narrow it further.
So `0 * * * *` is "every hour on the hour" and `30 18 * * 1,3,5` is "18:30 on Mon/Wed/Fri".

#### Why this was a real design decision, not just a storage format

A recommendation was made _against_ raw cron and overruled — worth recording honestly, because the
reasoning on both sides is sound. The argument against: cron's full expressiveness (day-of-month,
months, steps, ranges) is far beyond "daily / weekly / these days", it needs a parser and validator,
and "does this fire today?" stops being a SQL predicate. A simple `daysOfWeek Int[]` would have
covered every case the UI offers.

The argument for, which won: cron is a real, well-understood standard, and storing it means the
product isn't boxed in by whatever the picker happens to support today. Hourly schedules — the
specific thing asked for — fall out for free rather than needing a new column.

Given that decision, the job was to implement cron _properly_ rather than half-heartedly: a real
parser, real validation, and an escape hatch so hand-written expressions aren't silently rewritten.

### What was done

1. **`backend/src/lib/cron.ts`** (new) — a hand-written parser, deliberately not a dependency. The
   deciding factor is the _shape_ this app needs, which cron libraries don't offer directly: not
   "when does this next fire" but **"which `HH:mm` slots does this expression produce on this
   specific local calendar date."** That shape is what kept the rest of the change small (see
   point 3). Supports `*`, lists, ranges, and steps; deliberately rejects names (`MON`) and the
   non-standard `?`/`L`/`W`/`#` extensions rather than guessing at them, since a misread schedule
   fires on the wrong day instead of failing visibly.
2. **`Reminder.times String[]` → `Reminder.schedules String[]`**, plus a hand-written migration.
   The conversion is exact: `"09:00"` becomes `"00 09 * * *"`, which fires at precisely the same
   moments it always did, so no existing reminder changed behaviour. It stayed an _array_ because
   one expression can only hold several times a day when they share a minute — `0 8,20 * * *` is
   fine, but 08:00 plus 20:30 genuinely needs two entries.
3. **`reminderScheduler.ts`** now expands each reminder's schedules into today's `HH:mm` slots and
   feeds those into the machinery that already existed. Because the expansion produces the same
   strings `times[]` used to hold literally, the `ReminderSend` idempotency key and
   `shouldSendReminder`'s at-or-after comparison both kept working untouched.
4. **`routes/reminders.ts`** validates with the _same parser the scheduler uses_, so anything
   accepted is guaranteed to be something the scheduler can expand — there is deliberately no
   second, looser notion of "valid". The parser's own message is surfaced ("The hour field must be
   between 0 and 23") rather than a generic "invalid schedule".
5. **Tests**: a new `cron.test.ts` (23 tests) covering parsing, matching and validation, plus new
   scheduler tests for hourly expansion and for a day the expression excludes, and route tests for
   the expressive schedules and the rejections.

### Why it's needed

Closes the actual gap: reminders now support weekdays, weekends, specific days, days of the month,
and hourly recurrence, instead of "these fixed times, every day forever."

### Decisions

- **Cron stored verbatim, never normalised.** An expression comes back exactly as written. Quietly
  rewriting `0 7 1,15 * *` into whatever the picker finds easier to render would be the schedule
  version of a bug this project has already hit once — an edit that looks saved but silently
  changed what was stored (see [Lessons Learned](../LESSONS-LEARNED.md)).
- **Deduped but no longer sorted.** The old `times[]` was sorted because sorting `"HH:mm"` strings
  happens to give chronological order. That rationale doesn't transfer — sorting cron expressions
  lexicographically puts `"0 15 * * *"` before `"0 9 * * *"`, reordering the user's list for no
  benefit. Input order is preserved instead.
- **A cap of 48 slots per expression.** `* * * * *` is valid cron but would mean 1440 notifications
  a day. 48 allows every 30 minutes — already finer than the 5-minute tick can distinguish — and
  leaves hourly (24) comfortable room. Rejected at the API boundary with a clear message rather
  than silently truncated.
- **Only the most recent missed slot notifies — a deliberate behaviour change.** Previously every
  due-but-unsent slot fired. With at most six hand-typed times that was merely odd; with
  `0 * * * *` and a process that was down until the afternoon it would be fifteen identical pushes
  in one burst. Now the latest due slot sends and the superseded ones are recorded as handled, so
  they can't fire later. Firing _late_ is still deliberate (better a late reminder than none after
  a restart) — firing _repeatedly_ is not.
- **An unparseable stored expression is skipped, not thrown.** Validation happens at the API
  boundary so this shouldn't occur, but if one ever did, one user's bad row must not stop the tick
  that serves everyone else.
- **A `next run` preview is not built yet.** Noted as the highest-value follow-up: it is the
  cheapest possible proof to a user that their schedule means what they think, and the cheapest
  possible check that the parser and the scheduler agree.

### Verification

- `npm test` (backend): 255 tests across 22 files, green — run three times to confirm stability,
  ~34s each.
- `npx tsc --noEmit`, `npm run lint` (eslint), `npm run format:check`: all clean.
- **The migration was verified against the real database, not just "it ran"**: 13 reminders before,
  13 after, each with exactly one schedule, and the four distinct times present (`09:00`, `10:00`,
  `18:00`, `20:00`) mapping to exactly `00 09 * * *`, `00 10 * * *`, `00 18 * * *`, `00 20 * * *`.
  Confirmed by `SELECT DISTINCT schedules` before and after.
- **The day-of-week logic is anchored to real dates in tests, not "today"**: the scheduler suite's
  clock is pinned to `2026-08-22`, which was confirmed to be a Saturday before asserting that a
  weekdays-only expression produces no slots on it. Day-of-week is computed from the user's _local_
  calendar date via the existing `dayOfWeek` helper, so the UTC-vs-local trap that would fire a
  reminder on the wrong day is avoided by construction.
- **A misdiagnosis worth recording.** Partway through, the suite started failing 3–5 tests per run,
  always timeouts inside `registerAndLogin`, never assertion failures, with a different set each
  time. This was diagnosed as parallel contention on the shared Postgres and "fixed" with a
  `vitest.config.ts` limiting concurrency. That diagnosis was **wrong**: the real cause was Docker
  Desktop degrading and then stopping entirely, which surfaced as `ECONNREFUSED` once it was fully
  down. After restarting Docker, the suite passed at full parallelism twice in a row in 34s, so the
  config was deleted rather than shipped — it would have imposed a 4x slowdown to solve a problem
  that never existed. The lesson: _intermittent, assertion-free timeouts are an infrastructure
  symptom before they're a code symptom_, and a fix that "works" is not evidence the diagnosis was
  right.
- Not proven by any of the above: real push notifications actually arriving on a device on a
  cron-derived schedule. The scheduler's decision logic is covered by integration tests against a
  real database with `web-push` mocked, which is the same boundary the previous reminder tests drew.

---
