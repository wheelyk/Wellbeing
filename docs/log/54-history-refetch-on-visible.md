# History Refetches on Tab Focus, Closing the Same Gap Timeline Already Closed

## 2026-08-31 — A second occurrence of the same deploy-timing class of bug

**Task:** A real bug report, minutes after [task 53](53-history-redesign.md)'s PR merged: History
rendered every row with a blank name and an empty pill - the redesigned layout (dividers, icon
buttons, pill shapes) was all there, just with nothing inside the text and pill slots. This is
the same underlying class of bug [task 52](52-timeline-sync.md) found and fixed for Timeline,
now showing up a second time on a different page, for the same reason: nothing here had learned
that lesson yet, because History's own load effect never needed it before task 53 changed what
shape its own response was in.

### Background / concepts

#### Confirming it, not just assuming it

The screenshot's clock (15:56, BST) landed about a minute after task 53's PR actually merged
(14:55:25 UTC). Verified directly rather than assumed: a fresh, throwaway diagnostic account
(created and deleted the same way task 52's investigation did) hit the live production
`GET /api/history` a few minutes later and got back the fully correct, new shape -
`categoryName`/`categoryIcon`/`value` all present. The backend was fine *by the time it was
checked* - the only way to get the symptom in the screenshot is a request that landed on Railway
*before* its own deploy of task 53's backend change had actually finished, still running the old
code that returned a single `label` string. That old-shaped response is still a genuine `200` -
nothing about it looks like an error - so the page's own row layout rendered exactly as designed,
just reading `entry.categoryName` and `entry.value` off a response that had neither field.

#### Why this is the second time, not a new kind of bug

Task 52 already diagnosed and fixed the general version of this: Vercel (frontend) deploys fast;
Railway (backend) takes longer, so there's a real window where a request can land on old backend
code after new frontend code has already gone live. Task 52's fix - refetching whenever the tab
becomes visible again - was added to `TimelinePanel.tsx` specifically, because that was the page
the original report happened to be about. History has its own, entirely separate fetch effect
that never got the same treatment, so the *exact same window* bit it too, the very next time a
response shape actually changed between deploys. The fix is the identical pattern, not a new one
- this is squarely a case of finishing a fix that should have gone in for every page's own fetch,
not only the one that happened to be reported first.

### What was done

- **`HistoryPage.tsx`**: the main `/api/history` fetch effect's inline fetch call refactored into
  a named `load()` function (same restructuring `TimelinePanel.tsx` already went through), plus a
  `visibilitychange` listener that calls it again whenever `document.visibilityState` becomes
  `"visible"` - and only then, not on every transition.

### Decisions

- **Scoped to the main entries fetch, not the categories filter fetch.** The Category filter's
  own `GET /api/categories` list is far less likely to go stale in a way that matters within a
  single session, and doesn't have a response-shape-changed failure mode the way `/api/history`
  just did - not worth the extra request on every tab refocus for a fetch this low-stakes.
- **No broader "audit every fetch effect in the app for this" pass, done as part of this task.**
  Real, but deliberately narrow: fixed the two places (Timeline, History) that have actually
  demonstrated the failure mode in production, rather than speculatively wrapping every `useEffect`
  fetch in the app the same way without a concrete case motivating each one.

### Verification

- **Frontend: 354 tests across 40 files, green.** `tsc -b`, `oxlint`, `prettier --check` clean.
  Two new tests in `HistoryPage.test.tsx`, mirroring `TimelinePanel.test.tsx`'s identical pair
  exactly: refetches on a real transition to `"visible"`; does not refetch on a transition to
  `"hidden"`. Mutation-tested: disabled the `visibilitychange` handler's body, confirmed the new
  "refetches on visible" test failed, restored.
- **Verified against the real running app**, not just jsdom - a live Vite dev server against a
  live backend on fresh, unused ports (also fixing a real CORS mismatch hit along the way: the
  backend's `FRONTEND_URL` has to match whatever port the frontend actually ends up on, not just
  the project's usual default, when the usual default port is already occupied by another
  session's own dev server). Registered a fresh account, logged a real entry, loaded History,
  confirmed no extra request on a transition to hidden, and exactly one real refetch (with the
  row still rendering correctly afterward) on a transition back to visible.
- **Not independently reproduced against a live mid-deploy backend** - the original bug depends on
  timing that's already passed by the time a fix for it can be verified. The verification above
  proves the mechanism (refetch fires on visibility, at the right moments, and renders correctly)
  rather than reproducing the exact race, the same limitation task 52's own verification section
  already noted for the identical fix on Timeline.

### Known limitations and follow-ups

- **Still no defensive check that a fetched entry's fields are actually present** before
  rendering them - this fix closes the *window* (refetch soon corrects a stale response) but
  doesn't make a single bad response fail loudly instead of rendering blank. If this class of bug
  recurs a third time somewhere a visibility-refetch doesn't reach, a shape guard at the fetch
  boundary would be the next thing to reach for.
