# One-off Tasks: "Phone the Vet," Not a Category

## 2026-08-31 — A reminder-shaped thing that isn't a Reminder for a Category

**Task:** A new capability, requested directly rather than pulled from an existing mockup: "phone
the vet," "phone the garage" - a one-off, temporary to-do with a due date and time, that is done
once and then gone. The user had already tried to reach this with a Reminder Category and found it
lacking. This task designed the concept from scratch (a short design conversation, then a published
mockup covering four screens: Timeline with mixed rows, the FAB's new two-choice menu, the add
form, and the edit/done sheet) and, on approval, built it fully: a new `Task` domain model, its own
CRUD routes, a one-shot notification scheduler, and a Timeline integration that merges Task rows in
alongside Reminder rows as one chronological list.

### Background / concepts

#### Why a Reminder Category doesn't fit "phone the vet"

A `Category` exists to be logged against repeatedly - it has a `valueType` (boolean/numeric/
duration/scale) because every log against it is expected to record *something measured*, and it
shows up in Trends because a series of values over time is exactly what Trends charts. "Phone the
vet" has none of that shape: there is nothing to measure, no second occurrence expected, and no
chart that would ever mean anything for it. Routing it through Category would mean a permanent
entry in the category picker for a thing that should vanish once done, and a Trends chart with
either one point ever or (worse) an invented value type standing in for "did I do the thing."

A `Task` is deliberately a separate, smaller model: a title, optional notes, one `dueAt` instant,
and a done/not-done lifecycle. No value type. No Trends entry. No permanent picker row - once
deleted or done, it's just gone from Timeline the way a Reminder run that's already been logged
eventually scrolls out of the "recent" window.

#### `TimelineEntry`: two structurally different row kinds, one merged, orderable list

Before this task, `lib/timeline.ts` had one row shape, `TimelineRun`, built by concatenating
`/api/reminders/recent` and `/api/reminders/upcoming` (safe as a plain concatenation, not a sort,
because those two endpoints already guarantee recent-then-upcoming order relative to each other -
see [task 49](49-timeline-panel.md)). A `Task` comes from a third, independent endpoint with no
such guarantee against either reminder list, so merging it in for real needed an actual `.sort()`
by `(date, time)` - `mergeWithTasks`, sitting alongside the older `mergeRuns` rather than replacing
it, since `mergeRuns`'s own concatenation shortcut is still correct and cheaper for the two
endpoints that still have that guarantee.

`TimelineRun` (retrofitted with a `kind: "reminder"` discriminant) and the new `TaskRun`
(`kind: "task"`) union into `TimelineEntry`. Both shapes already carried a `date`, `time`, and
`when: "past" | "future"`, so `groupRunsByDay`/`splitAroundNow`/`orderRuns` - which only ever
needed those three fields - became generic over a minimal shared `Chronological` interface instead
of being duplicated for tasks. Nothing about *how* Timeline groups by day, splits around NOW, or
reorders newest-first/oldest-first needed to change; only *what* it's grouping did.

#### The server resolves `state`, the client never re-derives it

Following the same discipline `RecentRun`/`UpcomingRun` already established (see
[task 42](42-upcoming-reminders.md)'s own reasoning on why a client comparing a stored time against
its own `Date.now()` is a shape of bug waiting to happen, not a shortcut), every `Task` the backend
returns carries a precomputed `state: "upcoming" | "overdue" | "done"` and `when: "past" | "future"`
- resolved once, server-side, against the same instant for the whole response. The client never
compares `dueAt` to a live clock itself.

#### An overdue task stays anchored where it was due, not rolled forward

A design decision worth stating plainly: a missed task at `05:00` today stays shown at `05:00`
today, tagged Overdue, rather than reappearing at "now" or rolling into tomorrow. This matches how
a missed Reminder run already behaves in Timeline, and matters for the same reason - "phone the vet
by 9am" that's now 2pm and unaddressed should read as *late*, not quietly relabel itself as if
nothing had slipped.

### What was done

- **`schema.prisma`**: new `Task` model (`title`, `notes?`, `dueAt`, `doneAt?`, `notifiedAt?`,
  `createdAt`, `userId` with `onDelete: Cascade`), indexed on `[userId, dueAt]` - the exact pair
  both Timeline's own GET and the scheduler's due-task scan filter on. Migration
  (`20260831092126_one_off_tasks`) is a plain Prisma-generated `CREATE TABLE`, since this is a
  brand-new table with nothing to backfill.
- **`routes/tasks.ts`** (new): `GET /` (day-range windowed the same "2N-1 calendar days" way
  Timeline's own `/recent`+`/upcoming` pair is - see task 42's `TIMELINE_RANGES`), `POST /`,
  `PATCH /:id` (title/notes/dueAt/done, any subset; `notes: null` explicitly clears it, matching
  every other edit endpoint's PATCH-semantics convention in this codebase; a `dueAt` change resets
  `notifiedAt` to `null` unconditionally, so a rescheduled task - earlier or later - can notify
  again), `DELETE /:id` (a real hard delete - nothing else in the schema references a Task the way
  `CategoryLog` references `Category`, so there's no orphaned-child concern to protect against with
  a soft delete). One `serializeTask()` function computes `state`/`date`/`time`/`when` and is used
  by every route that returns a task (see the bug below for why that consistency mattered).
- **`lib/pushDelivery.ts`** (new): `sendPushToUser` extracted out of `reminderScheduler.ts`, since
  the new task scheduler needed the exact same "send to every subscription, sweep the gone ones"
  logic and duplicating it wasn't warranted.
- **`lib/taskScheduler.ts`** (new): a 5-minute tick (`runTaskTick`), mirroring
  `reminderScheduler.ts`'s own shape but simpler in one real way - a Task fires exactly once, so
  there's no cron expansion and no per-slot idempotency table; `notifiedAt` on the Task row itself
  is the whole guard. Respects quiet hours via the existing `quietHoursHoldUntil` (always
  `allowDuringQuietHours: false` - a Task has no per-item override the way a Reminder does), and
  holds rather than skips: a task due during quiet hours sends on the next tick after they end,
  the same "late is better than never" behaviour the reminder scheduler already has.
- **`index.ts`**: `startTaskScheduler()` added alongside the existing scheduler starts.
- **`lib/timeline.ts`**: `TaskState`, `ApiTask`, `TaskRun`, `TimelineEntry` types; `mergeWithTasks`;
  `describeTask`/`taskStateLabel` (mirroring the existing `describeRun`/`stateLabel`);
  `groupRunsByDay`/`splitAroundNow`/`TimelineDay` made generic over `Chronological`.
- **`dashboardTaskActionEvent.ts`** (new): the same loose `CustomEvent` bus pattern
  `dashboardQuickAddEvent.ts`/`dashboardTimelineActionEvent.ts` already established -
  `{ type: "add" }`, `{ type: "edit", task }`, `{ type: "toggleDone", task }`. Carries the *full*
  `ApiTask`, not just an id: unlike a Timeline reminder row (which deliberately doesn't carry full
  log data, so editing fetches `GET /api/category-logs/:id`), Timeline already has the whole Task
  record in hand for every row it renders.
- **`TaskManager.tsx`** (new): the always-mounted, nothing-visible-of-its-own manager, sitting
  alongside `CategoryLogger` on `DashboardPage`. One form serves both add and edit (a Task has no
  category to discover or lock to, so there's no two-step discovery-then-log sequence the way
  `CategoryLogger` needs). Owns the add/edit modal, the delete confirmation, and `toggleDone` -
  shared by the modal's own "Mark Done"/"Reopen" button and Timeline's row checkbox, which calls it
  with no modal open at all.
- **`TimelinePanel.tsx`**: fetches `/api/tasks` alongside the two reminder endpoints, merges via
  `mergeWithTasks(mergeRuns(...), tasks)`. New `TaskRowItem`: a leading checkbox `<button>`
  (sibling to the row body, not nested inside it) toggles done instantly; tapping the row body
  opens edit. Renders a "TASK" tag pill and an Overdue/Done state pill. `CollapsibleSection` gained
  a small "+" header button dispatching `{ type: "add" }`, alongside the FAB.
- **`QuickAddFab.tsx`**: rewritten to open a two-choice menu ("Log a category entry" /
  "Add a task") instead of going straight to the category picker.
- **`DashboardPage.tsx`**: mounts `<TaskManager />` alongside `<CategoryLogger />`.

### Decisions

- **Task lives inside Timeline, not a separate panel.** A one-off to-do with a due time is exactly
  the kind of thing Timeline already exists to answer ("what's happened, what's next") - a second,
  parallel "Tasks" panel would just split one question across two places on the same page.

- **Checkbox toggles instantly; tapping the row opens edit.** The single most common action on an
  overdue or due task is "I did it, mark it done" - that shouldn't require opening a form. Editing
  the title, notes, or due time is a real but secondary action, reached by tapping the row body.

- **The FAB's menu comes back.** [Task 50](50-timeline-v2.md) removed a menu from the FAB on the
  reasoning that a menu in front of one real choice is pure friction. That reasoning doesn't
  contradict reintroducing one here: there are now genuinely *two* different things a person might
  want to add (a category entry, a task), each landing in a different form - not one choice dressed
  up as two.

- **An overdue task stays anchored at its original due time.** See Background above - rolling it
  forward to "now" would hide exactly the lateness the Overdue pill exists to surface.

- **`mergeWithTasks` sorts; `mergeRuns` still just concatenates.** A deliberate, documented
  departure from the established "concatenation is enough" pattern - it was only ever safe because
  `/recent` and `/upcoming` have a built-in ordering guarantee relative to each other, which
  `/api/tasks` (a third, independent source) doesn't share with either.

### Verification

- **Backend: 430 tests across 29 files, green.** 19 new in `tasks.test.ts` (auth requirement,
  create/validate, day-range windowing and `state`/`when` computation, ownership scoping,
  mark-done/reopen reflected in `state`, explicit-null clears notes, reschedule clears
  `notifiedAt`, 404 scoping, empty-title rejection, delete-and-confirm-gone), 8 new in
  `taskScheduler.test.ts` (sends a due unnotified task and records `notifiedAt`; doesn't send one
  not yet due; never re-sends an already-notified or already-done task; holds during quiet hours
  then sends once the window passes, in the owner's *own* timezone; sweeps a gone push
  subscription; no-op when nothing is due).
- **Frontend: 348 tests across 40 files, green.** `tsc -b`, `oxlint`, `prettier --check` all clean.
  `timeline.test.ts` grew with `mergeWithTasks` (interleaves by date/time regardless of source
  array, sorts across days, keeps a stable tie-break), `describeTask`, `taskStateLabel`.
  `TaskManager.test.tsx` (new, 11 tests) and `TimelinePanel.test.tsx` (grew by 7) cover the add/
  edit/toggle/delete flows and the merged-row rendering.
- **Driven end-to-end in a real browser**, mobile (412px) and desktop (1280px), against live dev
  servers and a real Postgres database - registered a fresh account and, through the actual UI with
  no shortcuts: opened the FAB's new choice menu; added an overdue task ("Phone the vet," due
  06:00 today, with notes) and a second, upcoming one ("Pick up parcel," due 18:00) via Timeline's
  own "+"; confirmed the Overdue pill on the first and no pill on the second; tapped the checkbox
  and confirmed the "Task marked done." toast, the green Done pill, and the filled checkmark;
  opened the row body's edit form on the done task, confirmed a "Reopen" button was offered, and
  reopened it, confirming the Overdue pill returned; deleted the task through the real confirm-then
  -delete dialog (not immediate on first tap) and confirmed it was gone from Timeline; confirmed
  the FAB's other choice ("Log a category entry") still opens the existing category picker
  unchanged. Screenshots taken at each step on both viewports.

- **A real, shipped-adjacent bug, caught only by this real-browser pass - not by the unit tests
  written alongside the feature.** `TaskManager.tsx`'s `toggleDone` read `updated.state` off the
  `PATCH` response to decide which toast to show ("Task marked done." vs. "Task reopened."), but
  `POST`/`PATCH /api/tasks/:id` returned the *raw* Prisma row - no `state` field at all; only
  `GET`'s list route had ever computed one. The toast said "Task reopened." on every single toggle,
  in either direction, starting with the very first tap on a brand-new task. This file's own
  `TaskManager.test.tsx` never caught it because its hand-written `PATCH` mock had (harmlessly,
  until now) fabricated a `state` field the real backend never sent - exactly the class of bug this
  project's own CLAUDE.md warns a mocked test suite can't catch, since the bug only exists in the
  gap between what a real endpoint returns and what a test's own mock assumes it returns. Found via
  an isolated Playwright script with request/response logging that showed the real `PATCH` body on
  the wire, with no `state` key in it.

  Fixed on both sides, each mutation-tested independently by reverting it, confirming the exact
  symptom reproduced, and restoring it:
  - **Backend (the root cause)**: `serializeTask()` extracted and used by `GET`/`POST`/`PATCH`
    alike, so `state`/`date`/`time`/`when` are computed consistently everywhere a task is returned,
    not just in the one route that happened to need them first.
  - **Frontend (defense in depth)**: `toggleDone` now computes `markingDone = task.state !== "done"`
    *before* sending the request and uses that local value for the toast, never trusting whatever
    the response happens to contain. A new regression test
    (`TaskManager.test.tsx`, "gets the toast direction right even if a PATCH response omits state
    entirely") mocks exactly that - a `PATCH` response missing `state` - and confirms the toast is
    still correct.
  - Re-verified live in the browser afterward: the real `PATCH` response now shows
    `"state":"done"` on the wire, and the toast reads "Task marked done." correctly.

### Known limitations and follow-ups

- **No recurrence.** A Task is one-off by design - "phone the vet every 6 months" is still a
  Reminder's job, not a Task's. If a real need for "remind me about this recurring one-off" shows
  up, it belongs on Reminder, not as a new feature on Task.
- **No push-notification snooze or reschedule-from-the-notification.** A due task's push just
  says the title; acting on it (marking done, rescheduling) still means opening the app.
- **The Overdue state has no escalation.** A task overdue by five minutes and one overdue by five
  days render identically (same pill, same position) - if that turns out to matter, it's a small,
  additive change to `taskStateLabel`/`TaskRowItem`, not a data-model change.
