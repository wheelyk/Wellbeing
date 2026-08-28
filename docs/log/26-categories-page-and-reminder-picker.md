# Categories Page and Reminder Picker

## 2026-08-28 — Giving categories their own page, and a schedule picker over cron

**Task:** Direct product request, in three parts: move categories and groups off Settings onto
their own page ("it's too big on settings"), put a reminder control on each category row alongside
Edit and Delete, and make reminder schedules genuinely configurable — daily, weekly, specific days,
hourly. The backend half (cron storage) landed first in
[25-cron-reminder-schedules.md](25-cron-reminder-schedules.md); this is the UI on top of it.

A [mockup](https://claude.ai/code/artifact/5d352270-199d-42c8-86ee-23229cddd21b) was built and
reviewed before any code was written — the same approach that worked for category groups.

### Background / concepts

#### The problem with putting cron in front of people

Cron is precise and completely opaque to most users. `30 18 * * 1,3,5` is unreadable unless you
already know the format, and asking someone to type it to set a reminder would be a worse product
than the fixed times it replaced.

The resolution is that **the picker and the cron string are two views of one value**, not two
settings. Chips and toggles _generate_ cron; stored cron is _parsed back_ into chips and toggles.
Most people never see an expression at all; the ones who want it get the real thing.

#### Why the escape hatch matters more than it looks

Some valid cron can't be drawn as day chips and a time list — `0 7 1,15 * *` (the 1st and 15th),
anything with a step, anything narrowing the month. The controls could "helpfully" round these to
the nearest thing they understand, and that would be a bug: an edit that appears to save while
silently changing what was stored, exactly the class of failure already recorded in
[Lessons Learned](../LESSONS-LEARNED.md). So an unrepresentable expression is kept **verbatim**,
shown as raw text, and labelled as such.

### What was done

1. **`frontend/src/lib/cronSchedule.ts`** (new) — the translation layer: `buildSchedules` (controls
   → cron), `parseSchedules` (cron → controls, falling back to an `expression` mode when it can't
   round-trip), and `describeSchedules` (cron → plain English, e.g. `"08:00, 20:00 daily"`,
   `"Every hour, weekdays"`). 21 tests, including a property-style check that everything the picker
   can generate parses back to exactly what generated it.
2. **`ReminderScheduleForm.tsx`** (new) — repeat chips (Every day / Weekdays / Weekends / Every
   hour / Custom), a seven-day toggle row, a time list, and the raw cron behind an "Advanced"
   disclosure. Deliberately network-agnostic: it owns the draft and hands finished expressions to
   whoever rendered it, which is what lets the same component serve a category reminder and the
   general one, and keeps its logic testable without mocking `fetch`.
3. **`CategoriesPage.tsx`** (new) at `/categories`, a fifth nav tab. The grouped list moved here
   wholesale from Settings; each category row gained a bell that opens the picker inline and shows
   its schedule in words underneath the value type.
4. **Settings slimmed.** The categories section is gone entirely, and Reminders now handles only
   the general reminder plus the device push permission, with a pointer to the Categories page.
   `ReminderCreateForm.tsx` was **retired** rather than updated — its category picker and fixed-time
   list are both superseded, and keeping two reminder forms alive would have meant two places to
   get schedules wrong.
5. **Tests** moved with the code: the category tests became `CategoriesPage.test.tsx`, and the
   reminders tests in `SettingsPage.test.tsx` were rewritten for the general-only section.

### Why it's needed

Settings had become a page where the category list dwarfed everything else it sat beside. Splitting
it gives categories room and puts each reminder next to the thing it reminds you about, instead of
in a separate list where you pick the category from a dropdown.

### Decisions

- **Icon-only bell, with a real accessible name.** Three text buttons don't fit beside a long
  category name at 412px. The bell carries `aria-label="Remind me about Headache"` (and switches to
  "Edit reminder for…" once one exists), and Edit gained a per-category label too, since a grouped
  list renders many at once. That last change is why the tests now query `"Edit Water intake"`
  rather than `"Edit"` — a more correct accessible name, not a workaround.
- **"Every hour" is a preset, not just something you can type.** It was the specific capability
  asked for, so it earns a chip rather than being reachable only through the cron box. It composes
  with the day toggles: hourly on weekdays is `0 * * * 1-5`.
- **Schedules are deduped but the picker never reorders them**, matching the backend's own decision
  not to sort cron lexicographically.
- **Neither the day selection nor the time list can be emptied.** A schedule with no days, or no
  times, is one that can never fire — so removing the last of either is a no-op rather than a saved
  state that silently does nothing.
- **The nav crowding concern turned out to be unfounded, and was checked rather than pre-empted.**
  Five links plus the Dashboard's docked Quick Add is six slots at 412px, and "Categories" is the
  longest label in the app — the honest expectation was that it would need shortening. Rendered and
  screenshotted at that exact viewport, it fits without wrapping, so it was left alone. Worth
  recording because the alternative was shortening a label the project owner had specifically
  chosen, to fix a problem that didn't exist.

### Verification

- `npx vitest run` (frontend): 221 tests across 32 files, green — 21 new in `cronSchedule.test.ts`,
  13 moved into `CategoriesPage.test.tsx`, 7 rewritten in `SettingsPage.test.tsx`.
- `npx tsc -b`, `npm run lint` (oxlint), `npm run format:check`, `npm run build`: all clean.
- **Real browser, real servers, real database**, at a 412×915 mobile viewport, zero console errors:
  registered a fresh account, navigated to Categories from the new tab, opened the picker on a
  built-in category, and confirmed the generated expressions directly —
  - the **Weekdays** chip produced `0 9 * * 1-5`
  - the **Every hour** chip produced `0 * * * 1-5`, keeping the day selection
  - saving showed `Scale (1-7) · 09:00 daily` on the row
  - **after a full page reload it still read `09:00 daily`** — which is the round-trip that
    actually matters: controls → cron → API → Postgres → API → cron → controls, all agreeing.
- Screenshots were reviewed rather than just captured; that is how the missing page heading was
  caught (the page opened straight into body text with no title) and added.
- Not proven by any of the above: that a push notification actually arrives on a device at a
  cron-derived time. The scheduler's decision logic is covered by the backend's integration tests
  with `web-push` mocked, which remains the boundary this project draws.

### Known follow-ups

- **A "next run" preview** under the picker — still the highest-value addition, and the cheapest
  possible check that the parser and the scheduler agree about what an expression means.
- **Dashboard still has its own category cards.** Whether any category management should remain
  there now that a real page exists is an open question, deliberately not answered here.
- **Groups are still not reorderable.** Drag-and-drop was deferred when groups shipped; a dedicated
  page is a far more natural home for it than a Settings section was.
- **One reminder per category.** The stored array could express "08:00 weekdays and 10:00
  weekends" on a single category, but the picker assumes a single schedule; supporting several
  would need a list rather than one inline form.

---
