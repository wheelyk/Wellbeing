# Timeline Sync: Announcing a Reminder Change, and Catching Up When a Tab Was Never Told

## 2026-08-31 — Two gaps in "Timeline always shows what's actually true"

**Task:** A real bug report, filed directly against production right after [task 51](51-one-off-tasks.md)
shipped: a user added a task and turned off a reminder, and neither change showed up on the Home
Timeline. Investigating it in production (with the user's explicit authorization to make live,
authenticated requests against a throwaway diagnostic account, deleted afterward) ruled out the
first suspicion - a backend or migration problem - and pointed at two separate, real gaps in how
Timeline learns that something changed.

### Background / concepts

#### First, ruling out the wrong hypothesis

The screenshot that reported this also showed a `"Couldn't load your timeline"` error from
moments earlier, right around when [task 51](51-one-off-tasks.md)'s PR had just merged. Since
`TimelinePanel.tsx`'s `Promise.all` across `/api/reminders/recent`, `/api/reminders/upcoming`,
and `/api/tasks` fails the whole panel if any one request fails, and Railway takes some tens of
seconds to rebuild and restart the backend after a merge, that first error was very likely a
request landing mid-restart - not a real bug. Verified directly: `/api/health` returned `200`
immediately after, and all three endpoints returned clean `200`s against a fresh diagnostic
account, then again after building up realistic data (a category, a logged entry, a
category-targeted reminder, a general reminder, and a task together) in a real, non-UTC
timezone. Nothing there reproduced.

The *second* report - a task and a reminder change neither showing up - was the real bug, and
tracing it led to two independent, unrelated gaps.

#### Gap 1: reminder CRUD never told Timeline anything changed

`dashboardEntryChangedEvent.ts` is this app's existing "something changed, refetch" signal - a
plain `window` `CustomEvent`, dispatched after a category log or task save succeeds, and listened
for by `TimelinePanel`, `DashboardSummary`, and the range-chip probe (see
[task 50](50-timeline-v2.md)/[task 51](51-one-off-tasks.md)). Reminder management, though, lives
on two *different* pages - `CategoriesPage.tsx` (per-category reminders) and `SettingsPage.tsx`
(the one general reminder) - and neither page's create/edit/delete handlers had ever dispatched
this event. Every other kind of change Timeline shows already announced itself; a reminder
changing was the one silent exception, simply because it happened to live somewhere else.

#### Gap 2: a same-window event can't reach a different tab, and a backgrounded tab doesn't know it's stale

Even with Gap 1 fixed, `dashboardEntryChangedEvent` only ever reaches listeners in the *same*
browser tab that dispatched it. Deleting a reminder from a Categories page open in one tab does
nothing for a Dashboard tab open elsewhere - a plausible explanation for what was actually
observed, given the reported account had several tabs open. A backgrounded tab has the same
problem for a different reason: its JavaScript keeps running (or gets frozen and later resumed by
the OS) with whatever data it last had, and nothing it can listen for locally tells it that data
is now wrong.

The general fix for both is the [Page Visibility
API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) - a standard,
decades-supported browser primitive every mobile OS already surfaces through
`document.visibilityState`/`visibilitychange`, regardless of *why* a tab was hidden (a real
`window.open` elsewhere, another mobile app taking over, or nothing more than backgrounding the
browser itself). Refetching whenever a tab transitions into `"visible"` means "Timeline is
current" stops depending on enumerating every place a reminder or task can change - it catches
up on *anything*, including a mutation site nobody has audited for this yet.

### What was done

- **`CategoriesPage.tsx`**: `dispatchDashboardEntryChanged()` added to all three reminder
  mutations - `handleSaveReminder` (create/reschedule), `handleStopTemporaryReminder` (calling
  off a "just for today" reminder early), `handleDeleteReminder` (turning off a standing one).
- **`SettingsPage.tsx`**: the same, for the one general reminder's `handleSave` and
  `handleTurnOff`.
- **`TimelinePanel.tsx`**: a `visibilitychange` listener alongside the existing
  `listenForDashboardEntryChanged` subscription, refetching whenever `document.visibilityState`
  becomes `"visible"` - and only then, not on every flicker of the event (going *to* hidden is a
  no-op).

### Decisions

- **Both fixes ship together, not one or the other.** The explicit dispatch (Gap 1) is the
  correct, minimal fix for same-tab staleness and matches this app's own established pattern
  exactly - keeping it even though the visibility fix alone would also cover this case, since a
  targeted, immediate refetch on the actual change is strictly better than waiting for a tab
  switch that might not come soon. The visibility fix (Gap 2) is the one genuinely *new* pattern
  in this codebase; it exists because dispatch-on-mutation, by its nature, can never reach a
  change made somewhere it doesn't know to listen - a different tab, a different device, or a
  future mutation site nobody's wired up yet.
- **Refetch on becoming visible, not on a timer.** No polling interval was added - Timeline goes
  stale only in ways a real user action (opening a different tab, backgrounding this one) already
  produces a natural signal for. A timer would spend requests on tabs nobody's looking at.
- **Not extended to `DashboardSummary` or the range-chip probe in this task.** Both already listen
  for `dashboardEntryChangedEvent` (so Gap 1's fix reaches them too), and neither showed the same
  reported symptom - scoped narrowly to the component actually named in the bug report rather than
  speculatively duplicating the visibility listener everywhere at once.

### Verification

- **Frontend: 353 tests across 40 files, green.** `tsc -b`, `oxlint`, `prettier --check` all
  clean. Five new tests: `CategoriesPage.test.tsx` gained three (saving a new reminder, stopping a
  temporary one, and turning off a standing one, each asserting exactly one
  `dashboardEntryChangedEvent` dispatch); `SettingsPage.test.tsx`'s existing create/turn-off
  general-reminder tests gained the same assertion; `TimelinePanel.test.tsx` gained two (refetches
  on a real transition to `"visible"`; does *not* refetch on a transition to `"hidden"`).
  Mutation-tested: reverted the `dispatchDashboardEntryChanged()` call in `handleSaveReminder` and
  confirmed its new test failed with the exact real symptom (`expected +0 to be 1`), restored;
  disabled the `visibilitychange` handler's body and confirmed its test failed the same way,
  restored.
- **The reminder-CRUD dispatch (Gap 1) was not independently re-verified live in a real browser
  beyond its unit tests** - every path that can change a reminder requires navigating away from
  Dashboard first, which already fully remounts `TimelinePanel` and refetches regardless of this
  fix, so a same-tab live pass would only re-prove what the remount already proves. The unit tests
  above, plus their mutation test, are the direct evidence for this half.
- **The visibility fix (Gap 2) was verified against the real, running, bundled app** - not just
  jsdom - with a Playwright script driving a live Vite dev server against a live backend
  (registered a fresh account, watched real `GET /api/tasks` network traffic): forcing
  `document.visibilityState` to `"hidden"` and dispatching a real `visibilitychange` produced no
  extra request; forcing it back to `"visible"` produced exactly one. A genuine two-tab
  reproduction (delete a reminder in one real tab, switch to another, watch it update) was
  attempted but abandoned - this environment's Playwright, in both headless and headed mode, never
  toggles `document.visibilityState` between tabs in the same browser context (confirmed directly:
  it reports `"visible"` for every tab regardless of which has focus), which is a sandbox/no-window-manager
  limitation of this environment, not a statement about real phone browsers - Android Chrome (the
  browser in the original report) reliably fires this event on backgrounding, since the OS itself
  reports foreground/background transitions to it natively.
- **Dev servers used for this verification were started on fresh, unused ports (4200/backend,
  default 5173/frontend) rather than reusing any already-running instance** - several independent
  `ts-node-dev` watcher chains were found already running against this same repo at the time,
  none started in this task, so none were touched or restarted, matching this project's own
  standing caution about not assuming ownership of a process without direct evidence.

### Known limitations and follow-ups

- **Still same-origin, same-browser only.** Nothing here syncs across two different devices (a
  phone and a laptop both open to Dashboard) - only across tabs/windows of the same browser on the
  same device, which the visibility fix incidentally covers by refetching whenever either one
  regains focus.
- **A tab that's visible the whole time a change happens elsewhere still won't see it** until
  something dispatches `dashboardEntryChangedEvent` in that same tab, or it's backgrounded and
  refocused at least once. A cross-tab `BroadcastChannel`, if this turns out to matter more than
  expected, would close that remaining gap directly rather than depending on an incidental
  visibility flip.
