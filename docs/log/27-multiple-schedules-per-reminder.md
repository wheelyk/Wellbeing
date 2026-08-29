# Multiple Schedules Per Reminder

## 2026-08-29 — Letting one reminder do different things on different days

**Task:** The last open follow-up from
[26-categories-page-and-reminder-picker.md](26-categories-page-and-reminder-picker.md) — "weekdays
at 08:00 and weekends at 10:00" was expressible in the stored data but not in the picker, which
collapsed to raw cron text whenever two expressions disagreed about which days they ran on.

### Background / concepts

#### Why this needed no new database column

The obvious reading of "multiple reminders per category" is **more `Reminder` rows** — drop the
unique constraint on `(userId, target, categoryId)` and allow several per category. That was
considered and rejected, because the constraint is doing useful work: it makes "does this category
have a reminder?" a single lookup, gives the bell an unambiguous on/off state, and makes turning a
reminder off one delete rather than a question of _which_ one.

`Reminder.schedules` is already `String[]` — an array of cron expressions. Everything needed was
therefore in the data model already; the limitation was entirely in the picker. So this change is
**frontend-only**, apart from raising a defensive cap.

#### The idea: a "rule" is what one set of day toggles can say

A single row of day toggles can describe one set of days. It cannot say "weekdays at 08:00 _and_
weekends at 10:00", because that needs two different day selections at once.

So the picker's model became a **list of rules**, where each rule is `{ days, times }` (or
`{ days, hourly }`). Each rule flattens to one expression per time, and the stored `schedules`
array is the concatenation. Reading back, expressions are **grouped by their day field** — which is
exactly the grouping one set of toggles can represent.

### What was done

1. **`lib/cronSchedule.ts`** — `ScheduleDraft` gained a `rules: ScheduleRule[]` list in place of a
   single set of days/times. `buildSchedules` flattens every rule (deduping, since two rules can
   legitimately overlap); `parseSchedules` groups incoming expressions by day field, in
   first-appearance order, and still falls back to verbatim `expression` mode if _any_ entry is
   unrepresentable. `describeSchedules` joins rules with a middot, so a row reads
   `08:00 weekdays · 10:00 weekends`.
2. **`ReminderScheduleForm.tsx`** — the repeat chips, day toggles and time list moved into a
   `RuleFields` sub-component, rendered once per rule, with "+ Add another schedule" beneath and a
   remove control on each card once there's more than one. The second and subsequent cards are
   headed "Also repeat", which is what makes the list read as one schedule rather than several
   competing ones.
3. **Backend `MAX_SCHEDULES` raised from 6 to 12.** Rules multiply expressions, and the UI's own
   cap of four rules with a few times each needed more headroom than a single rule ever did. The
   corresponding test now sends thirteen expressions rather than seven.
4. **Tests**: `cronSchedule.test.ts` grew to 30 (grouping, splitting, ordering, overlap dedupe,
   hourly-alongside-times, and an extended round-trip check over multi-rule drafts). A new
   `ReminderScheduleForm.test.tsx` (8 tests) covers the component itself — every assertion is on
   the cron it produces, since that's the actual contract.

### Why it's needed

It closes the one case the picker demonstrably couldn't handle. "Medication on weekdays, a
different time at weekends" is an ordinary thing for this app's users to want, and before this it
either had to be typed as raw cron or split across categories.

### Decisions

- **A list of rules inside one reminder, not several reminders per category.** See the Background
  section: the one-reminder-per-category invariant is load-bearing for the bell's state and for
  turning a reminder off, and nothing about multiple schedules requires giving it up.
- **Grouped by day field, in first-appearance order.** Grouping is what makes the round-trip
  faithful; preserving order means the rules read back the way they were created rather than in
  some canonical sort the user never chose — consistent with the backend's own decision not to sort
  cron expressions.
- **An hourly rule can't share its day set with specific times.** `["0 * * * *", "0 9 * * *"]` is
  valid cron, but one rule's controls would have to show "every hour" _and_ "at 09:00" for the same
  days simultaneously. That combination falls back to raw text rather than being drawn
  misleadingly.
- **Expressions are deduped when built.** Two overlapping rules ("every day at 09:00" plus "Mondays
  at 09:00") would otherwise store the same expression twice.
- **Four rules maximum in the UI.** A guard against a runaway list rather than a product opinion,
  set below the API's own cap so the UI stops you before the server has to.
- **`index` is used as the React key for rule cards.** Normally a smell, and worth stating why it's
  correct here: rules have no id, and the list is only ever appended to or spliced — never
  reordered — so index is stable for the lifetime of each card.

### Verification

- `npx vitest run` (frontend): 238 tests across 33 files, green — 30 in `cronSchedule.test.ts`
  (up from 21), 8 new in `ReminderScheduleForm.test.tsx`.
- `npm test` (backend): 255 tests across 22 files, green.
- `npx tsc -b`/`--noEmit`, lint, `format:check`, `npm run build`: all clean on both projects.
- **Real browser, real servers, real database** at 412×915, zero console errors — building exactly
  the case that used to fail:
  - rule 1 set to **Weekdays / 08:00**, rule 2 added and set to **Weekends / 10:00**
  - the Advanced box showed `0 8 * * 1-5` and `0 10 * * 0,6`
  - the row read `Scale (1-7) · 08:00 weekdays · 10:00 weekends`
  - **after a full reload it still read the same, and reopening the picker showed two rule cards
    with Weekdays and Weekends pressed respectively** — previously this exact schedule came back as
    "2 custom schedules" and raw text.
- Not proven here: that a push notification actually arrives at each of those times. `web-push`
  stays mocked, the same boundary the backend tests draw.

### Known follow-ups

Unchanged from the previous entry: a **"next run" preview** (now more valuable, since a two-rule
schedule is harder to hold in your head than a single one), whether **Dashboard keeps its own
category cards**, and **group reordering**.

---
