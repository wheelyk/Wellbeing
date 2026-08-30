# Quiet Hours, and Who Gets To Ignore Them

## 2026-08-30 — "No reminder in the middle of the night unless the user explicitly selects it"

**Task:** [40-reminder-starts-at.md](40-reminder-starts-at.md) made a cooldown able to notify when
its gap is up — and flagged the consequence: six hours after a 21:46 dose is 03:46, and it would
ring. Asked whether that was wanted, the answer was no, unless explicitly chosen.

### Background / concepts

#### The distinction that makes this work

The obvious implementation — "never notify between 22:00 and 08:00" — is wrong, and it's worth
being precise about why.

If you deliberately set a reminder for 03:00, **you have explicitly selected 03:00**. Quiet hours
silencing it would be the app overruling a choice you stated in as many words. But a cooldown
landing at 03:46 is different: you chose _"six hours"_, and the app worked out the time. Nobody
selected 03:46.

So the rule isn't about the hour, it's about **who chose it**. That becomes a stored field,
`Reminder.allowDuringQuietHours`, whose default differs by creation path:

| Created via                     | Default | Because                                    |
| ------------------------------- | ------- | ------------------------------------------ |
| `POST /api/reminders`           | `true`  | You picked the times                       |
| `POST /api/reminders/follow-up` | `false` | The app computed the time from an interval |

Set explicitly on both paths rather than inferred later from `startsAt` or `expiresAt`. Reading
intent out of an unrelated column is the coupling this schema has now avoided three times — see
`stopsWhenLogged`'s own note for the first.

#### Held, not dropped — and that came for free

A suppressed notification is a lost one, which is a poor trade for a cooldown telling you a
medication gap has passed. So quiet hours **defer** rather than drop.

That needed no deferral queue and no second mechanism. The scheduler already **fires late on
purpose** (better a late reminder than none after a restart), and a slot only stops being due once
a `ReminderSend` row records it. So the entire implementation is one early return in
`shouldSendReminder`, keyed on the _current_ time rather than the slot's:

```ts
if (input.inQuietHours) return false;
```

Nothing is recorded, so the slot is still due when the window ends, and the next tick delivers it.
The 03:46 cooldown arrives at 08:00 instead — which is what someone asking not to be woken
actually wants.

#### The window wraps midnight, which is the whole difficulty

22:00–08:00 is not a range in the arithmetic sense; it's everything _outside_ 08:00–22:00. A naive
`start <= t && t < end` is wrong for exactly the window everybody wants, so `isWithinQuietHours`
branches on `start < end` and is tested against both shapes.

### What was done

- **`User.quietHoursStart` / `quietHoursEnd`** — `"HH:mm"`, defaulting to 22:00–08:00, both null to
  switch off.
- **`Reminder.allowDuringQuietHours`** — the per-reminder override.
- **`lib/quietHours.ts`** — a pure `isWithinQuietHours`, plus shared validation.
- **`shouldSendReminder` takes `inQuietHours`** and returns false without recording anything.
- **`PATCH /api/users/me`** accepts the window; `POST`/`PATCH /api/reminders` accept the override.
- **A typecheck that actually covers test files** — see below.

### Decisions

- **Both ends or neither, always.** A half-configured window has no statable meaning, and reading
  `{ start: "22:00", end: null }` as "quiet from 22:00 until forever" would silently lose every
  notification an account has. Rejected at the API, and treated as _no_ quiet hours by
  `isWithinQuietHours` if one ever got through — belt and braces, in opposite directions.

- **An empty window means no quiet hours, not all day.** "Quiet from 08:00 until 08:00" describes no
  time at all; reading it as 24 hours would silence an account permanently. That is the worst
  available way to be wrong here, so it has its own test.

- **Half-open: the start minute is quiet, the end minute isn't.** Someone setting "quiet until 8"
  means a reminder at exactly 08:00 should arrive.

- **The migration backfills the opposite of the column default, on purpose.**
  `allow_during_quiet_hours` defaults to `false` — computed times must not wake anyone — but every
  reminder that _already existed_ was scheduled by hand, at times its owner chose. Backfilling
  those to `true` is what stops quiet hours retroactively silencing a 06:00 wake-up someone set
  deliberately. Without that line the migration would have quietly changed what existing reminders
  do.

- **A second migration adds the column defaults**, rather than editing the first. Prisma checksums
  applied migrations, so editing one after it has run breaks every environment that ran it.
  Appending is always the safe move.

### Verification

- **Backend 337 tests across 24 files, green. Frontend 273 across 37, green.** Lint and format
  clean.
- **`npm run typecheck` — new, and it found a bug immediately.** See the section below.
- **Every new behaviour mutation-checked**, each reverted straight after:

  | Mutation                                     | Caught by                                                                                              |
  | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
  | Remove the `inQuietHours` early return       | `does not fire inside the window`, `holds the slot rather than losing it`, `uses the owner's timezone` |
  | Ignore `allowDuringQuietHours`               | `fires anyway when the reminder is allowed to ignore the window`                                       |
  | `POST /reminders` defaults the flag to false | `lets a reminder you scheduled yourself ignore quiet hours`                                            |
  | Follow-up defaults the flag to true          | `does not let a follow-up ignore them`                                                                 |
  | Drop the both-or-neither key check           | `refuses half a window` — **only after a test was added**, see below                                   |

- **The deferral is proven, not described.** `holds the slot rather than losing it` asserts no
  `ReminderSend` row is written during the window, then moves the clock past 08:00, ticks again,
  and asserts the notification arrives.

- **Driven against the really running server:**

  ```
  new account default window: 22:00 - 08:00
  self-scheduled 03:00 reminder  -> allowDuringQuietHours=true   (you asked for 3am)
  cooldown follow-up at 13:36    -> allowDuringQuietHours=false  (the app chose the time)
  narrowed window: 23:30 - 07:00
  switched off entirely: null / null
  half a window: 400 {"quietHoursStart":["Set both a start and an end time, or neither"]}
  "10pm": 400 ["Use a 24-hour time like 22:00"]
  ```

- **The migration was checked against real before/after counts**, not just "it ran": 38 reminders
  existed and all 38 came out `true`; all 317 users received `22:00`/`08:00`; and `\d users` shows
  the column defaults so a new account gets the same.

#### Two bugs found, and how

**A mangled regex, caught by having a positive test.** The time validator was written as
`/^([01]\d|2[0-3]):[0-5]\d$/` and reached the file as `/^([01]d|2[0-3]):[0-5]d$/` — the escapes
eaten in transit. It rejected every real time. Every _negative_ test still passed, because a
validator that rejects everything rejects invalid input too. Only `sets a different window` failed.
A rule worth keeping: a validation test that only checks rejections cannot tell "correct" from
"broken shut".

**An unexercised branch, caught by a mutation that didn't fail.** Removing the
`("quietHoursStart" in data) === ("quietHoursEnd" in data)` check left every test passing. That
clause is not redundant — it catches `{ quietHoursStart: null }` _alone_, which would clear one end
and leave the other set — the tests simply never sent that. Adding the case made the mutation fail
as it should. The mutation pass earned its keep by finding a hole in the tests rather than in the
code.

#### A hole in the typecheck itself

`tsconfig.json` excludes `src/**/*.test.ts` — correctly, since tests must never be emitted into
`dist`. The side effect is that `tsc --noEmit` never looked at a single test file, and vitest
transpiles without checking. **A type error in a test was invisible.**

This was not hypothetical. Adding a required `inQuietHours` field to `ReminderEligibilityInput`
should have broken `reminderEligibility.test.ts` immediately; instead everything passed, because
`undefined` is falsy and nothing typechecked it.

Turning it on across the whole suite produced **six** errors in total — small enough to just fix:
three uses of `Array.prototype.at` needing `lib: ES2022`, an untyped `http_ece` import (now a small
`.d.ts` declaring only the one function used), one implicit `any`, and the real one above. A
committed `tsconfig.test.json` and `npm run typecheck` keep it closed.

**What this does not prove.** No notification has been watched being held and then delivered on a
_real_ clock — the deferral test moves time with `vi.setSystemTime`. Nothing has been observed
across a real midnight or a DST change. And the frontend has no UI for any of this yet: quiet hours
can only be changed through the API.

#### One flaky failure, reported rather than smoothed over

During the full run, `categoryGroups.test.ts`'s `lists the 6 seeded built-in groups...` failed once
(5.1s), then passed both in isolation and on a full re-run. I looked for a cause rather than
assuming timing: exactly 6 system groups exist, no test creates one, and rate limiting is disabled
under `NODE_ENV=test`. No mechanism found, in a file this branch does not touch. Recording it
because "it passed the second time" is not a diagnosis.

### Known limitations and follow-ups

- **No UI yet.** Quiet hours need a Settings control, and `allowDuringQuietHours` needs a checkbox
  in the reminder form ("Allow this one overnight"). Part of the frontend task.
- **One window, no per-day variation.** A different weekend window is a plausible want and is not
  expressible.
- **A deferred notification loses its ordering.** If three separate reminders are all held
  overnight, all three arrive together at 08:00. The scheduler's existing "only the most recent due
  slot notifies" rule keeps each individual reminder to one, so this is a small burst rather than a
  flood — but it is a burst.
- **The frontend flakiness question is still open** — see the note above.

---
