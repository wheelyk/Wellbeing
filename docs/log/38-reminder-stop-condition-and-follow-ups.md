# What Stops a Reminder, and Asking For One After Logging

## 2026-08-29 — Two readings of "remind me again", made into two different things

**Task:** Two connected pieces of feedback about repeating reminders. First, "every hour isn't
useful with day selection — maybe a repeater just for today". Then, on thinking it through: should
a repeater keep going after you've logged the thing, or stop? And separately — maybe the natural
moment to ask for a reminder is _right after logging_, rather than in a schedule form.

### Background / concepts

#### The real question was never "should it repeat"

Both halves of the feedback turn on the same thing: **what stops a reminder**. Until now that was
implicit and hard-coded — logging its target silenced it for the rest of the day. That is right for
"take the tablet" and wrong for "drink water", and there was no way to say which you meant.

So the rule becomes a field: `Reminder.stopsWhenLogged`, defaulting to true — which is not a new
behaviour for any existing reminder, but a _name_ for the one they already had.

It is deliberately its own column rather than inferred from `expiresAt` (added the day before, in
[37-temporary-reminders-backend.md](37-temporary-reminders-backend.md)). Both kinds of reminder can
be temporary or standing; reading a stop condition out of an expiry would be the sort of hidden
coupling that reads fine when written and mystifies whoever finds it next.

#### Why a follow-up can't be a schedule

"Remind me again in four hours" sounds like a scheduling question, and it isn't. Cron expresses
_patterns on the clock_ — "every day at nine". A follow-up is an _interval from the thing you just
did_, and cron has no idea when you logged. There is no expression for it.

What there is, though, is a way to express the _result_: four hours from 14:26 is 18:26 today, which
is `26 18 * * *` — an ordinary expression, expiring tonight. So `POST /api/reminders/follow-up`
takes `inMinutes` and produces a perfectly normal one-shot reminder. Nothing new is scheduled; only
a new way of asking for it.

**The dependency between the two halves is not incidental.** A follow-up is created _immediately
after logging_, so today's has-been-logged check would silence it before it ever fired. A follow-up
is only possible at all once the stop condition is a field the endpoint can set. That is why these
shipped together rather than one after the other.

#### Why the server computes the time

`inMinutes` is sent, not a time. Four hours from now has to be resolved in the _account's_ timezone
— the one the scheduler will use — and the browser knows only its own. The same reasoning as
`"end-of-day"` the day before, and it matters more here: a follow-up is a single shot, so being an
hour out means it fires at the wrong time rather than merely stopping early.

The endpoint **refuses** a follow-up that would cross midnight. This is not fussiness. A `02:00`
slot created at 22:00 reads to the scheduler as a time that _already passed today_, and the
scheduler deliberately fires late (see `reminderEligibility.ts` — better a late reminder than none
after a restart). So it would arrive immediately: the exact opposite of what was asked for. The UI
never offers an interval that can't fit, so the error is nearly unreachable in practice.

### What was done

- **`Reminder.stopsWhenLogged`** (default true), settable on create and edit, honoured by the
  scheduler — which now skips the has-this-been-logged query entirely when it's false.
- **`POST /api/reminders/follow-up`** — `{ target, categoryId?, inMinutes }` → a one-shot reminder
  for later today, `stopsWhenLogged: false`, expiring tonight. Replaces any temporary reminder
  already running for that target rather than colliding with it.
- **Two options in the reminder form** — "Only for today" and "Keep reminding me after I've logged
  it" — neither of which is expressible in cron, which is why they're separate controls rather than
  more chips.
- **A follow-up offer on the dashboard**, appearing after a new entry as a strip inside the
  category's own card.
- **The Categories row tells the two reminders apart** — the standing schedule, plus a
  "Just for today" one with its own Stop.
- **Intervals now read as words.** `describeSchedules` gained `describeInterval`, so
  `0 */2 * * *` reads as "Every 2 hours, daily" instead of "Custom schedule".

### Decisions

- **The offer is a strip, not a step — and that was a real mistake, caught by the tests.** The
  first version made the follow-up a step in the save flow: save an entry, then answer "remind me
  again?" before the form closed. Ten existing tests failed, and the reason they failed was the
  point. Every single log now cost an extra tap to dismiss an offer almost nobody wants, on the
  most-used action in the app.

  So the offer moved into the card, in the same slot the "Entry saved." confirmation already used.
  It costs nothing to ignore. Notably, **no test needed changing afterwards** — the save flow is
  byte-for-byte the same number of taps it always was, which is exactly the evidence that the
  second design doesn't intrude.

- **A follow-up replaces a running temporary reminder rather than 409ing.** Someone who has just
  logged the thing does not want to be told they already have a reminder; they want the one they
  just asked for. It's deleted and recreated rather than updated, which also clears its
  `ReminderSend` rows by cascade — those are keyed by `(reminder, date, time)`, and a reused row
  could carry an "already sent at 18:34 today" record from a schedule that no longer exists.

- **The offer only appears on a category's own card, not in the first-log discovery flow.** The
  discovery flow logs a category that has no card yet, so it's by definition the first time you've
  ever logged it — a poor moment to ask about being reminded again this afternoon. It also
  remounts the card on save, which would throw the state away anyway.

- **Never offered when editing.** Correcting last Tuesday's entry is not a reason to be reminded
  about anything this afternoon.

- **Intervals that can't fit before midnight are never shown.** The browser's own clock decides
  what to _offer_ — it can only be wrong by the gap between the device's timezone and the account's
  — while the server still decides what actually gets created. An option that always errors is
  worse than no option.

- **`describeInterval` reads but does not parse.** `parseSchedules` still refuses a step
  expression, so editing one still shows the raw cron. Describing it is safe; _drawing_ it as day
  toggles would misrepresent it.

- **Interval chips are chips, not `Button variant="secondary"`.** That variant's background is the
  same token as the strip's, so on a real phone the buttons vanished into it entirely - something
  only a real screenshot showed, since every test passed either way. They also read better as
  chips: these are options to pick from, not actions to perform.

### How a request actually travels

Tapping "2 hours" after logging Water:

1. **`FollowUpPrompt`** posts `{ target: "category", categoryId, inMinutes: 120 }`. It sends the
   interval, never a computed time.
2. **Express → `remindersRouter`**, behind auth; Zod bounds `inMinutes` to 15–720 (the floor is
   above the scheduler's own five-minute tick, so it can't promise something it can't keep).
3. **The user's timezone is read**, and `currentTimeInTimezone` gives their local wall clock.
   `inMinutes` is added to it. If that crosses midnight, it's a 400 — not a silent rollover.
4. **Any live temporary reminder for that target is deleted**, then a new one is created:
   `["26 20 * * *"]`, `expiresAt` = midnight tonight, `stopsWhenLogged: false`.
5. **`firesAtLocal`** travels back with the response, so the strip can say "at 20:26" without
   parsing cron or re-deriving the timezone.
6. **Every five minutes**, `runReminderTick` picks it up like any other reminder — with one
   difference: `stopsWhenLogged` being false means it never runs the has-this-been-logged query at
   all. Which is what makes it fire, given the user logged the category minutes earlier.

### Verification

- **Backend: 295 tests across 23 files, green. Frontend: 273 across 37, green.** `tsc`, eslint,
  oxlint, prettier and `npm run build` all clean.
- **Every new behaviour was mutation-checked** — each mutation reverted straight after:

  | Mutation                                                       | Caught by                                                                        |
  | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
  | `if (reminder.stopsWhenLogged)` → `if (true)` in the scheduler | `keeps firing after the target has been logged when it does not stop on logging` |
  | Follow-up hardcoded to `stopsWhenLogged: true`                 | `creates a one-shot reminder at the right local time`                            |
  | Follow-up resolved against UTC, not the user's timezone        | same test (asserts the local time to the minute)                                 |
  | Midnight guard removed                                         | `refuses a follow-up that would land tomorrow`                                   |
  | The replace-existing `deleteMany` removed                      | `replaces a temporary reminder already running for the same target`              |
  | Standing/temporary split collapsed into one map                | all three `CategoriesPage` two-reminder tests                                    |

- **Driven in a real browser at 412×915** against real servers and a real database, through the
  whole path: log an entry → take the offer → see it land on the Categories row.

  ```
  offer:        Remind you again in…
  confirmation: We'll remind you about Water at 20:26.
  row:          💧 Water | Number · 09:00 daily | Just for today | Every 2 hours, daily | Stop
  reminders now: [
    '0 9 * * *   expiresAt=null                      stopsWhenLogged=true',
    '26 20 * * * expiresAt=2026-08-30T00:00:00.000Z  stopsWhenLogged=false'
  ]
  ```

  The second line is the whole feature in one row: a one-shot at 20:26, expiring tonight, that
  won't be silenced by the log that created it — sitting alongside an untouched 09:00 standing
  reminder.

- **Two real problems were found this way and only this way.** Neither showed up in any test:
  1. The temporary reminder rendered as **"Custom schedule"** — `describeSchedules` couldn't
     express `0 */2 * * *`, which is the shape most temporary reminders take. Fixed with
     `describeInterval`, now covered by its own tests.
  2. The **interval chips were invisible** — `bg-surface-muted` buttons on a `bg-surface-muted`
     strip. They read as plain text with nothing to tap.

- **Console errors:** two, both `POST /api/auth/refresh` → 401 before login. Checked rather than
  assumed (by listening for non-2xx responses, not just console text): that's AuthProvider's
  session-rehydration attempt with no refresh cookie yet, and it predates this work.

**What this does not prove.** No follow-up has been observed actually _firing_ — the tests
establish eligibility with a controlled clock, and the real-browser run stopped at "it is scheduled
for 20:26". The push-delivery half of that chain is covered separately by
[34-real-push-delivery-test.md](34-real-push-delivery-test.md), but the two have not been driven
end to end together. Nor has a follow-up been watched surviving a real midnight.

### Known limitations and follow-ups

- **`describeInterval` and PR #152 overlap.** That PR adds a `describeHourly` for `0 * * * *`;
  `describeInterval` handles the same case and produces the same sentence ("Every hour, daily"),
  which is why the phrasing was matched deliberately. Whichever merges second should drop
  `describeHourly` in favour of the more general helper.
- **A follow-up can't be edited, only stopped.** That seems right — an interval you asked for
  five minutes ago is easier to re-ask than to adjust — but it is an assumption, not a finding.
- **Interval choices are bounded by `MAX_SLOTS_PER_EXPRESSION` (48)** for the _repeater_, not the
  follow-up (which is a single slot). Every 30 minutes fits exactly; every 15 does not.
- **The follow-up offer is dashboard-only.** Logging from History or the quick-add FAB doesn't
  offer one. Deliberate for now — those are correction and bulk-entry paths — but worth revisiting
  if the FAB turns out to be where people actually log.

---
