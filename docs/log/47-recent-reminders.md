# Recent Reminders: What Happened, and What Didn't

## 2026-08-30 — The backward-looking half of the Timeline

**Task:** The Home timeline design asked for a single list mixing what was logged, what was
_missed_, and what's coming up. Everything except "missed" already ships. This is that missing
half: `GET /api/reminders/recent`, the backward-looking sibling of
[`/upcoming`](42-upcoming-reminders.md).

### Background / concepts

#### Missed didn't exist because nothing had asked backward yet

`reminderRuns.ts` already holds every rule needed to answer "did this reminder fire": slot
expansion bounded by `[startsAt, expiresAt)`, and quiet-hours deferral. `/upcoming` only ever calls
it looking forward. Extending it backward needed no new rules at all — the same "was the target
logged that day" question the scheduler already asks for _today_, asked instead of a day that has
already ended.

That reframing is the whole design: **a missed reminder is just "today, unlogged" computed for a
day that's over.** No new concept in `reminderRuns.ts`, no new column, no new job.

#### Day-level, not slot-level

A reminder with three times a day that went unlogged is **one missed day**, not three missed
doses — matching how `/upcoming`'s own `logged` state already collapses a whole day to a single
verdict before this route existed. One row per `(reminder, day)`, at its first due slot.

#### A rhythm reminder has nothing to miss

`stopsWhenLogged: false` means "keep going regardless of whether you've logged it" — a reminder
that isn't waiting on a single action, so there's no single action to have failed to take. It gets
**no missed row at all**, ever. It can still show as `logged`, if the day happened to have a log
against it; there's simply no "you didn't" state for something that was never asking.

### What was done

- **`GET /api/reminders/recent?days=1|3|7`** — a merged, chronological list across every reminder
  for the days just gone, oldest first.
- Three states: `logged`, `missed`, `paused` — the first and third are `/upcoming`'s own states,
  reused rather than duplicated, because they mean the same thing looking either direction.
- Today's own portion is bounded to **already-elapsed slots only** — a 21:00 reminder at 14:00
  hasn't been missed, it just hasn't come up yet, and belongs on `/upcoming` instead.

### Decisions

- **`paused` is not versioned.** There's no record of when a reminder was switched off, so a
  currently-disabled reminder reports `paused` for every day in the window, even a day before it
  was actually toggled off. Stated plainly rather than glossed over: this is a real gap, and fixing
  it would mean logging state changes, which is a materially bigger feature than this one.

- **1 / 3 / 7, mirroring `/upcoming`'s own three choices** rather than reusing its exact set
  (1/7/30). 30 days of "what did I miss" is a different, heavier feature (closer to an adherence
  report) than a home-page glance backward, and the timeline design deliberately scoped this to a
  short window.

- **Today only counts an elapsed slot as missed if it's actually elapsed.** This was the one bug
  the tests found before it shipped — see below.

### How a request actually travels

`GET /api/reminders/recent?days=3` at 14:05 UTC on a Sunday, for a Diazepam reminder at 09:00,
unlogged both days:

1. Resolves the caller's timezone, same as `/upcoming`.
2. Walks `today - 2` through `today`, oldest first.
3. For each day, expands every reminder's slots via `reminderSlotsForDate` (shared, not
   re-derived).
4. Today's slots are filtered to `time <= now` — everything else in the window has fully elapsed
   already, so nothing is filtered for those days.
5. Per `(reminder, day)`: disabled → `paused`; target logged that day → `logged`; a rhythm reminder
   with nothing logged → skipped entirely; otherwise → `missed`.
6. Sorted chronologically and returned.

### Verification

- **Backend: 398 tests across 27 files, green** (382 before, plus 16). `npm run typecheck`,
  eslint, prettier clean.
- **Every decision branch mutation-checked**, each reverted straight after:

  | Mutation                                         | Caught by                                                             |
  | ------------------------------------------------ | --------------------------------------------------------------------- |
  | Rhythm reminders no longer skipped               | `gives a rhythm reminder no missed row at all`                        |
  | `enabled` check disabled                         | `reports a currently-disabled reminder as paused, not missed`         |
  | Today's slots no longer filtered to elapsed-only | `does not call today's own not-yet-arrived slot missed`               |
  | `wasLoggedOn` check disabled                     | 3 tests, including `still reports a logged day for a rhythm reminder` |

#### Two real bugs, both found by the tests rather than by reading the code

**The actual logic bug.** The first version's decision chain read: disabled → paused; logged →
logged; rhythm → skip; **`else if (!isToday) missed; else continue`**. That last branch was meant
to say "today, but too soon to call it missed" — except the eligibility filter one step earlier
had _already_ restricted today's slots to ones that had elapsed. So the `else` branch was
unreachable in the only way that mattered: every slot that got this far today was, by
construction, already due. The bug made every one of today's genuinely-missed slots vanish
silently rather than report `missed`. Caught immediately — five different tests expecting a
result for today all came back empty, which is a loud enough signal that it wasn't a single edge
case.

**A test-helper bug that would have hidden a real failure.** `logCategory` hardcoded
`valueBoolean: true` for every call. Two tests use a `numeric` category, and the API correctly
rejects a boolean value against a numeric category — so the "log" those tests thought they'd
created never existed, and both failed with an empty result that looked identical to the real bug
above. Fixed by having the helper send the right field for the value given, and — more
importantly — by making it **throw on anything but 201** rather than silently continuing. A
silently-failed setup step produces a wrong answer several assertions downstream that looks like a
production bug; throwing at the failure point points straight at the setup instead.

- **Driven against the really running server** (`npm run dev`, port 4000, real Postgres): a dose
  reminder already logged today, one due but unlogged, one disabled, and a rhythm reminder that
  was never logged at all:

  ```
  days=1  2026-08-30 06:00   general           [paused]
          2026-08-30 08:00  🧠 Anxiety          [logged]
          2026-08-30 09:00  💊 Diazepam         [missed]
  days=7  … the same three, once per day, back to 2026-08-24 …
  days=30 (rejected) 400 {"days":["days must be one of 1, 3, 7"]}
  ```

  The rhythm reminder (Water, every 2 hours, `stopsWhenLogged: false`) never appears in any
  range's output — not paused, not missed, not logged — which is the correct outcome for a
  reminder that was never logged, and the concrete proof the "nothing to miss" rule actually holds
  end to end, not just in a test with a controlled clock.

**What this does not prove.** No browser has rendered a `missed` row yet — this is API-only; the
Home timeline itself is a separate task. And `paused` not being versioned means no test (and
nothing in production) can currently distinguish "disabled the whole time" from "disabled five
minutes ago" — that limitation is real, not merely untested.

### Known limitations and follow-ups

- **The Home timeline itself** — merging this with `/upcoming` into one scrolling list around a
  "now" divider, per the design.
- **`paused` isn't versioned**, as above — a real product question if it ever matters which days a
  disabled reminder would have fired on.
- **No adherence summary.** Once `missed` exists as a concept, "3 of 7 doses logged this week"
  becomes answerable — explicitly out of scope for this task, flagged in the design as its own
  potential feature.

---
