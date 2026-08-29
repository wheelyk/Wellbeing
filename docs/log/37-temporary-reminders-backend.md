# Temporary Reminders (Backend)

## 2026-08-29 — A reminder that knows when to stop

**Task:** Support a reminder that runs for a while and then stops — "nudge me every two hours for
the rest of today" — rather than only the standing, runs-forever kind the app has had until now.
This entry covers the backend half: the column, the API, and the scheduler. The UI that creates one
in two taps follows in its own task.

### Background / concepts

#### Why cron alone can't do this

Every reminder in the app is stored as a list of cron expressions (see
[25-cron-reminder-schedules.md](25-cron-reminder-schedules.md)). Cron is a _recurrence_ — a pattern
of times that repeats indefinitely — and it has no vocabulary for an ending. `0 */2 * * *` means
"every two hours", not "every two hours today". There is no expression, in any cron dialect, that
means "and then stop".

So the ending has to live outside the expression. That's the whole change: one nullable column,
`Reminder.expiresAt`.

Two designs were considered. The other one was a separate "temporary reminder" object with its own
table, routes and lifecycle. It would have modelled the intent more literally, but it would also
have meant a second scheduling path to keep correct alongside the first — and the whole reason the
next-run preview exists ([33-next-run-preview.md](33-next-run-preview.md)) is that two
implementations of the same idea drift apart without anyone noticing. One column, reusing the
existing path entirely, was the cheaper and safer answer, and `expiresAt` is useful beyond this one
case anyway (a two-week course of medication, say).

#### An instant, not a date

`expires_at` is `TIMESTAMP(3)` — an absolute moment — not a date string like `2026-08-29`.

That matters because "the end of today" is not a fact about the world; it's a fact about a person.
Midnight for a user in Tokyo is a different instant from midnight for a user in London, and the
scheduler already resolves every reminder against the owner's _stored_ timezone rather than the
server's. Storing a date would mean re-interpreting it against that timezone on every single tick,
forever. Storing the instant means the interpretation happens exactly once, at the API boundary,
where the timezone is already in hand.

#### Why the client doesn't compute it

The API accepts the literal string `"end-of-day"` as an expiry, alongside an ordinary ISO
timestamp. It would have been simpler to make the browser work out midnight and send an instant —
but the browser knows _its own_ timezone, and the scheduler uses the user's _stored_ one. Those are
usually identical and occasionally aren't: someone travelling, or a phone left on the wrong region.

The failure that produces is quiet. The reminder fires for an extra hour, or stops an hour early,
once in a while, for one user. Nobody reports that, and nobody finds it. Resolving `"end-of-day"`
server-side means there is exactly one answer to "when does this user's day end", and it's the same
helper (`getDayRangeUtc`) the scheduler itself already uses.

### What was done

- **`Reminder.expiresAt`** — nullable, no default, no backfill. Null means standing, which is what
  every existing reminder is.
- **`POST`/`PATCH /api/reminders`** accept `expiresAt`, as either `"end-of-day"` or an ISO
  timestamp. Bounds: it must be in the future, and at most 31 days out.
- **The "one reminder per target" rule split in two** — one standing, plus one live temporary,
  per `(user, target, categoryId)`.
- **The scheduler skips expired reminders** and sweeps them away a day after they lapse.

### Decisions

- **A temporary reminder sits _alongside_ the standing one, not instead of it.** The old rule was
  one reminder per `(user, target, categoryId)`; that rule would have made this feature useless,
  because "nudge me every two hours today" is an addition to your normal daily reminder for that
  category, not a replacement. The rule is now one _standing_ plus one _live temporary_ — within
  each kind, "only one" is unchanged.

  An already-expired temporary reminder deliberately doesn't block a new one. It can never fire
  again; it's only still in the table because the sweep runs a day later.

- **Expired reminders are swept, but not immediately.** Deleting them at all follows what the
  existing `DELETE /:id` route already asserts: a Reminder has no historical value once it's gone
  (unlike a log, there's nothing anyone would look back on). Deleting them a _day_ later, rather
  than the instant they lapse, is so that a "for the rest of today" reminder is still visible — and
  visibly finished — on the day it ran. Vanishing at the stroke of midnight would leave someone
  wondering whether it had ever been created.

- **Nothing else about a temporary reminder is special, and that includes the part you might want
  changed.** While it's live it goes through exactly the same slot expansion, the same
  already-sent guard, and — the one worth flagging — the same _has this been logged today_ check as
  any other reminder. So a temporary reminder on a category **stops nudging once you log that
  category**, even if hours remain before it expires.

  That was a deliberate choice, and it's arguable. The case for it: every reminder in this app
  means "nudge me if I haven't logged X", and making one class silently mean something different —
  keyed off a field named `expiresAt` — is exactly the kind of hidden coupling that surprises
  someone later. The case against: "remind me every 30 minutes to drink water" plainly wants to
  keep going after the first glass.

  If the second reading is the one wanted, the honest fix is an explicit field ("keep nudging even
  after I log it"), not more meaning loaded onto the expiry. Left as a follow-up rather than
  guessed at.

- **An expiry already in the past is rejected, not accepted-and-swept.** It would create a reminder
  that has never fired and never can. Better a 400 than a row that silently disappears an hour
  later.

- **No index on the new column.** The tick already reads every enabled reminder in one query and
  filters in memory, so nothing would read it — and the only shape worth having (partial, on
  `enabled = true`) can't be expressed in `schema.prisma`, which would leave the database
  permanently drifted from the schema for no gain.

- **`expiresAt: null` on `PATCH` means "clear it"; omitting it means "leave it alone".** This is the
  distinction [LESSONS-LEARNED.md](../LESSONS-LEARNED.md) was written about, and it only ever bites
  on edit. Both cases have their own test. Clearing an expiry also re-checks the standing-reminder
  rule, since that rule was legitimately allowed to be broken while the reminder was temporary.

### How a request actually travels

`POST /api/reminders` with `{ target: "category", categoryId, schedules: ["0 */2 * * *"],
expiresAt: "end-of-day" }`:

1. **Express** → `remindersRouter`, behind the auth middleware that puts `req.userId` in place.
2. **Zod** validates the body. Each schedule is checked with `cronValidationError` — the same
   parser the scheduler itself uses, so nothing can be stored that the scheduler can't later expand.
3. **The expiry is resolved**: the user's row is read for its `timezone`, and
   `getDayRangeUtc(todayInTimezone(tz), tz).end` gives midnight tonight _there_, as an instant.
4. **Ownership** is checked on the category (scoped lookup, so a tampered id 404s rather than
   confirming the row exists).
5. **The coexistence rule** is checked — is there already a _live temporary_ reminder for this
   target?
6. **Prisma** writes the row. The response carries `expiresAt` as an ISO string.

Then, every five minutes, `runReminderTick`:

1. Sweeps reminders that expired more than 24 hours ago.
2. Loads every enabled reminder where `expiresAt IS NULL OR expiresAt > now`.
3. From there on, the temporary reminder is indistinguishable from any other: expand today's slots,
   skip the ones already sent, check whether the target has been logged, send the most recent due
   slot, record the sends.

### Verification

- **Full backend suite: 284 tests across 23 files, green.** `npx tsc --noEmit`, eslint and prettier
  all clean.
- **Ten new tests** — six on the route, four on the scheduler.
- **Every new test was mutation-checked**, because a test that passes against broken code proves
  nothing. Each mutation was reverted immediately after:

  | Mutation                                                          | Test that caught it                                                                      |
  | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
  | Resolve `"end-of-day"` against UTC instead of the user's timezone | `resolves end-of-day to midnight tonight in the user's own stored timezone`              |
  | `if (rawExpiry !== undefined)` → `if (rawExpiry)` in `PATCH`      | `tells an omitted expiry apart from one explicitly cleared`, and the clear-conflict test |
  | Drop the expiry filter from the scheduler's query                 | `does not send one whose expiry has passed`                                              |
  | Remove the sweep call                                             | `sweeps away one that expired more than a day ago`                                       |

- **Driven against the really running server** (`npm run dev`, port 4000, real Postgres), not only
  through supertest. The timezone point is visible in the output — the user was set to `Asia/Tokyo`
  while the server's own clock is on UK time:

  ```
  temporary reminder: 201 expiresAt = 2026-08-29T15:00:00.000Z
     that instant in Asia/Tokyo: 2026-08-30, 12:00 a.m.
     that instant in UTC       : 2026-08-29, 3:00 p.m.
     server local now          : 2026-08-29, 2:34 p.m.
  second temporary: 409 TEMPORARY_REMINDER_ALREADY_EXISTS
  list: [
    'Water schedules=["0 9 * * *"] expiresAt=null',
    'Water schedules=["0 */2 * * *"] expiresAt=2026-08-29T15:00:00.000Z'
  ]
  patch without expiresAt -> expiresAt still: 2026-08-29T15:00:00.000Z
  patch expiresAt:null while standing exists: 409 REMINDER_ALREADY_EXISTS
  expiry in the past: 400 {"expiresAt":["Expiry must be in the future"]}
  ```

  Midnight in Tokyo was **25 minutes away** from the server's own clock at that moment. Had the
  expiry been computed server-locally it would have landed some nine hours later — the difference
  is plainly visible rather than something a reader has to take on trust.

- **The migration was checked against the real database**, not just "it ran":
  `\d reminders` shows `expires_at | timestamp(3) without time zone | nullable`, with every
  existing row left at NULL — which is what "keeps firing forever" means here. There was nothing to
  backfill, only something new to allow.

**What this does not prove.** No temporary reminder has yet been observed _actually expiring in
real time_ on a running server — the tests establish it with a controlled clock
(`vi.setSystemTime`), and the real-run check exercised the API rather than a 24-hour wait. The
sweep's retention window in particular has been verified only against a fake clock. And nothing
here has a UI yet: creating one still means a hand-written API call.

### Known follow-ups

- **The frontend half** — the "Remind me every [30 min ▾] until end of day" control on a category,
  and showing a temporary reminder in the list as visibly temporary ("Every 2 hours, until 23:59
  today") rather than blending in with the standing ones. A finished one needs to read as finished,
  too, for the day it lingers.
- **The "keep nudging me even after I log it" question** above — a real product call, not a
  mechanical one.
- **Interval choices are bounded by `MAX_SLOTS_PER_EXPRESSION` (48).** Every 30 minutes is exactly
  48 slots and fits; every 15 minutes does not. If a 15-minute repeater is ever wanted, that cap is
  what has to move, and it exists for a reason — worth a deliberate decision rather than a bump.

---
