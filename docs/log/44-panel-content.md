# Filling In What a Collapsed Panel Says

## 2026-08-30 — A count, a last value, and a countdown that needs no server

**Task:** The second half of the panel work. [43](43-disclosure-panel.md) put the slots in the
shared header without using any of them, deliberately, so the existing suite could act as a safety
net for a no-behaviour-change refactor. This one puts content in them.

### Background / concepts

#### The cooldown countdown costs nothing to build

The most useful thing on the Dashboard now is a line that required no new server state, no job, and
no fetch: **"Next available in 6h"**.

A cooldown ([39](39-category-timing.md)) is a minimum gap before the next dose. The gap is on the
category, the last log is already loaded by the card that displays it, and the arithmetic is
subtraction. Nothing ticks on the server; nothing is stored; there is no job to get wrong.

What it does need is a clock in the component tree, and that is the only genuinely new machinery
here: `useNow(intervalMs | null)`, which re-renders on an interval and — importantly — accepts
`null` to not tick at all. Only a category with a cooldown has anything to count down, so a
dashboard of a dozen cards runs one timer, not twelve.

The maths itself is a pure function taking `now` as an argument (`lib/cooldown.ts`), the same shape
`reminderEligibility.ts` uses on the backend and for the same reason: it can be tested at specific
instants without touching a clock.

#### "Recent" was doing no work

Every per-category card was titled `Recent 💧 Water intake`. The first word carried no information,
and it pushed the actual name — the thing you scan for — into second place on every card. The icon
now sits in its own slot and the title is just the name.

### What was done

- **Dashboard cards** carry the icon, the name, and a subtitle that is either the last value and
  when (`Last 2 · Today, 11:57`) or, for a cooldown, the countdown plus a `Cooldown` pill.
- **History dates** carry a count, so a closed day says whether it is worth opening.
- **`lib/cooldown.ts`** — pure, and null whenever there is nothing to show.
- **`hooks/useNow.ts`** — an opt-in clock.
- **`Category.timing`** added to the frontend type. The API has returned it since
  [39](39-category-timing.md); nothing on the client had ever read it.

### Decisions

- **Null is the answer for "you're fine" as well as "not applicable".** `cooldownRemaining` returns
  null when there is no gap set, no log yet, _and_ when the gap has passed. All three want the same
  thing on screen — nothing. A card should never carry a row that says "0m remaining", which reads
  as "go ahead" while being technically about a cooldown.

- **Rounding up, and "under a minute" in words.** A running cooldown must never display `0m`. That
  is the one wrong reading that actually matters, because zero means the opposite of what is true.

- **The clock is opt-in.** `useNow(null)` for every category without a cooldown. The alternative —
  one interval per card — costs a dozen timers to change nothing on eleven of them.

- **History gets a count but not the category icons.** The design asked for both. The count was
  free; the icons were not, because a history entry carries only a pre-formatted `"Name: value"`
  label. Recovering the name means splitting on `": "`, which breaks the first time someone names a
  category with a colon in it. That wants a real field on the response — a backend change, and the
  backend was owned by a parallel task at the time. Deferred rather than bodged; noted in the code
  at the point where it would go.

### Verification

- **283 tests across 38 files, green** (276 before, plus 7 for the cooldown maths). `tsc -b`,
  oxlint, prettier and `npm run build` clean.
- **A real bug the tests found: dead code.** `formatRemaining` began with
  `if (totalMinutes < 1) return "under a minute"`, where `totalMinutes` was `Math.ceil(ms / 60_000)`
  — which for any positive duration is at least 1. The branch was unreachable, and 30 seconds
  remaining rendered as `1m`. The test asserting "under a minute" is what surfaced it; the check now
  runs on milliseconds.
- **Six stale tests updated, not deleted.** `CategorySection.test.tsx` queried `Recent <name>` in
  six places. That title changed deliberately, so each was re-pointed at the new one rather than
  removed — the assertions themselves were still worth keeping.
- **Driven in a real browser at 412px** against real servers and a real database, which is what
  actually proves `timing` arrives from the API and renders, rather than only that the arithmetic is
  right:

  ```
  dashboard cards: ["Log a category",
                    "💧 | Water | Last 2 · Today, 11:57",
                    "💊 | Diazepam | Cooldown | Next available in 6h"]
  history dates:   ["Sunday, 30 August 2026 | 2",
                    "Saturday, 29 August 2026 | 3",
                    "Friday, 28 August 2026 | 1"]
  ```

  The Diazepam card had a six-hour cooldown and had been logged moments earlier.

**What this does not prove.** The countdown has not been watched actually _counting_ — the browser
check is a single frame, and the tick interval is only exercised by reading the code. Nothing was
checked at desktop width, or in dark mode. And no test covers the wiring between the card and
`cooldownRemaining`; the pure function is tested and the browser run shows the result, but there is
no unit test that would fail if the card stopped passing `timing` through.

### Known limitations and follow-ups

- **The category icons on History dates**, once the response carries the category rather than a
  formatted label.
- **Trends is untouched.** It already carries a summary in its header (`Fatigue — Avg: 4.0`), so it
  needs the tighter rhythm rather than new content — cosmetic, and better done alongside the
  `DisclosureRow` extraction than on its own.
- **`DisclosureRow` still does not exist.** The nested row pattern (title, second line, inline
  actions) is written out by hand in `CategoryRow`, and both History and the Dashboard's own log
  rows want it.
- **The cooldown pill says "Cooldown" and nothing about the notification.** A cooldown can now also
  ping when the gap is up ([40](40-reminder-starts-at.md), [41](41-quiet-hours.md)); the card does
  not say whether this one will.

---
