# Collapsing a Cadence Into One Row

## 2026-08-30 — Twenty-four rows that say one thing

**Task:** The Coming up panel ([45](45-coming-up-panel.md)) shipped with a twelve-row cap, added
because a real account with an hourly reminder turned "today" into a wall of near-identical lines.
The cap was the cheap fix. This is the right one: collapse a cadence into a single row, on the
server.

### Background / concepts

#### Why the server and not the client

Grouping adjacent rows in the browser would have been a much smaller change, and it only fixes what
you can see. The server's own cap is 200 runs, and it _stops the work_ at that point rather than
trimming the output — so one hourly reminder spends the entire budget on itself, and a 30-day view
becomes 200 rows of one reminder with everything else pushed off the end.

Collapsing server-side makes the cap count _entries_. The same 200 now covers thirty days of several
reminders, and the 30-day range becomes genuinely useful rather than a scroll through one.

#### What may be merged, and what may not

Two rules, and the second is the one that matters.

**Same day, same reminder, same state.** An hourly reminder that runs into quiet hours is genuinely
two different things — some slots fire when due, some are held until morning. Merging them would
produce one row asserting a single state for slots that do not share one, which is worse than
twenty-four honest rows. The grouping key is `(reminder, state, deliveredAt)` within a day, so those
stay apart.

**More than six slots in that day.** Below that, the times are a list somebody chose, and listing
them is the point.

### Decisions

- **Six, and how I got the number wrong first.** The initial threshold was `MAX_SCHEDULES` (12), on
  the theory that the picker writes one expression per time, so more than twelve in a day cannot
  have been enumerated by hand. Tidy theory, useless number: an hourly reminder viewed at midday has
  only eleven slots left today, so it never crossed the line and the panel still rendered eleven
  rows — exactly the problem the collapsing exists to fix. The test that caught it was the one
  asserting an hourly reminder collapses.

  Six costs something: a hand-written set of seven or more times now reads as "9 times, until 22:00"
  rather than nine rows. That is a mild loss on a rare case against fixing the common one.

- **`repeatCount` and `lastTime` are absent on a single run**, rather than `repeatCount: 1`. A
  client can then treat "has a repeatCount" as the whole question, and an older client that ignores
  both fields still renders something correct.

- **A separate ceiling on raw expansion (`MAX_SLOT_EXPANSION = 5000`).** Once the cap counts
  entries, "200 entries" no longer bounds the work — thirty days of several every-fifteen-minutes
  reminders is tens of thousands of expansions. Cheap individually, pointless collectively.

- **The day is re-sorted after grouping.** Collapsing rebuilds each day out of per-reminder buckets,
  which loses the time ordering the original loop had. The sort is stable, so two entries sharing a
  minute keep the created-order the query returned.

### Verification

- **Backend: 382 tests across 26 files, green** (379 before, plus three). `npm run typecheck`,
  eslint and prettier clean.
- **Three tests updated rather than deleted**, all for deliberate behaviour changes:
  - `merges several reminders into one chronological list` and two others were failing because the
    first implementation collapsed _every_ group regardless of size — which merged a hand-written
    14:00/22:00 pair into one row. **Those tests were right and the code was wrong**; the threshold
    exists because they failed.
  - `caps the list at 200 runs` used a single hourly reminder, which is now exactly the case that
    collapses. Rewritten to use two reminders with six times each — still 360 entries over thirty
    days, still proving the cap, without depending on a cadence.
- **Both new rules mutation-checked**:

  | Mutation                                | Caught by                                                                 |
  | --------------------------------------- | ------------------------------------------------------------------------- |
  | Group by reminder alone, ignoring state | `does not merge slots whose state differs`                                |
  | Collapse every group regardless of size | 5 tests, including `merges several reminders into one chronological list` |

**What this does not prove.** No browser has rendered a collapsed row yet — the frontend half sits
with the panel, on its own branch. The `MAX_SLOT_EXPANSION` ceiling has no test: reaching it needs
several every-fifteen-minutes reminders across thirty days, and the setup cost outweighs what it
would demonstrate about a guard whose only job is to stop counting.

### Known limitations and follow-ups

- **Six is a judgement, not a measurement.** It reads well against the accounts I have; nobody has
  tried it against a real week of somebody's actual reminders.
- **The cadence itself is not described.** A collapsed row says "11 times, until 23:00", not
  "hourly". The interval is knowable from the slots, and saying it would read better still.
- **Collapsing is per day.** A reminder that is hourly for a fortnight produces fourteen collapsed
  rows, one per day, which is right for a 7-day view and repetitive at 30.

---
