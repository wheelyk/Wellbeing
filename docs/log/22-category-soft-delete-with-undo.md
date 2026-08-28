# Category Soft-Delete With Undo

## 2026-08-27 — Replacing Archive with a 30-day soft-delete, restore, and a real confirmation dialog

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item - direct product feedback while looking
at the live Settings > Categories screen: a personal category's own "Archive" action had no
confirmation dialog worth the name (a native `window.confirm()`), no way back once clicked, and no
visible trace afterward. Three things were asked for together: a real, clear confirmation prompt;
a safer "soft delete" with a time-limited undo window rather than an instant, permanent-feeling
action; and a place to actually restore from. Two follow-up design questions were put directly to
the project owner before building anything, since this touches what "delete" means for real logged
health data - see _Decisions_ below for both answers.

### Background / concepts

#### What "Archive" already did, and what was actually missing

Personal categories already had a soft-remove mechanism - `DELETE /api/categories/:id` never
hard-deletes, it just sets `archivedAt` (see `schema.prisma`'s own comment, and
[docs/log/15-categories.md](15-categories.md)). What was missing wasn't the safety of _not_
hard-deleting - it was everything _around_ that: no dialog clear enough to call a real
confirmation, no expiry (an archived category sat there forever with no path back to genuinely
gone), and critically, no UI to see or undo it at all - `GET /api/categories` always filtered
`archivedAt: null`, so once archived, a category simply vanished with no trace anywhere in the
product.

#### Why this needed the same care as a real data-loss decision, not just a UI polish pass

This app tracks real health history. "Delete my category" sounds, to a user, like it should
eventually mean the data is actually gone - but a category with real logged symptom/mood/medication
entries against it is exactly the kind of thing that shouldn't ever quietly disappear because a
30-day timer ran out while someone was busy, sick, or simply didn't reopen the app. That tension -
"delete should mean something" vs. "never silently erase real health history" - is why this was
treated as a real design decision requiring explicit sign-off, not something to just build the
"obvious" way.

### What was done

1. **Backend - the purge-eligible window, computed, not stored.** `backend/src/lib/categoryPurge.ts`:
   a shared `SOFT_DELETE_GRACE_PERIOD_MS` constant (30 days) and a `purgeEligibleAt(archivedAt)`
   helper - `archivedAt + 30 days`, nothing new persisted. `DELETE /api/categories/:id` itself is
   otherwise **unchanged** - it already set `archivedAt`, and that single timestamp is now also
   what starts the 30-day clock.
2. **Backend - two new routes** (`backend/src/routes/categories.ts`):
   - `GET /api/categories/deleted` - the caller's own soft-deleted personal categories (never a
     system one, which only an admin can archive and which this has no opinion about), each
     serialized with `purgeEligibleAt` and `hasLogs` (computed via one `groupBy`, not a per-category
     query), so the frontend can distinguish "will be permanently removed on this date" from "kept
     indefinitely, since it still has history" without a second round trip.
   - `POST /api/categories/:id/restore` - clears `archivedAt` for an owned, currently-deleted
     category. Deliberately does **not** re-enable any `Reminder` that `DELETE /:id` disabled
     alongside it - restoring a category shouldn't silently start sending notifications again
     without the user's own say-so; they can re-enable a specific reminder themselves.
3. **Backend - the actual removal**: `backend/src/lib/categoryPurgeScheduler.ts`, a new background
   job mirroring `reminderScheduler.ts`'s own `setInterval` + `NODE_ENV === "test"` skip pattern,
   ticking every 6 hours (far coarser than reminders' own 5-minute tick - missing the exact 30-day
   boundary by a few hours is harmless here). Each tick finds personal categories archived at least
   30 days ago; a category that still has zero `CategoryLog` rows against it is actually removed
   (in a transaction that also deletes any `Reminder` still pointing at it first, since
   `Reminder.category` is `Restrict`, not `Cascade` - a real delete would otherwise fail with a
   foreign-key error). A category that still has logged history is left alone entirely and stays
   soft-deleted indefinitely - functionally identical to how "Archive" already behaved before this
   feature existed, just reachable and restorable now via the two routes above.
4. **Backend - wired into startup**: `backend/src/index.ts` now also calls
   `startCategoryPurgeScheduler()` alongside the existing reminder scheduler.
5. **Frontend - a real confirmation dialog, not `window.confirm()`.**
   `frontend/src/components/ConfirmDeleteModal.tsx`: **promoted** out of `pages/history/` (where it
   already existed for History's own entry-delete flow) into shared `components/`, once Settings'
   own category delete needed the exact same shape - the same "pull out once proven useful a second
   time" pattern this project already uses elsewhere (e.g. `RatingScale.tsx`). `HistoryPage.tsx`'s
   own import updated to the new path; its behavior is otherwise untouched.
6. **Frontend - `SettingsPage.tsx`'s `CategoriesSection`**: the "Archive" button relabeled
   "Delete" (`aria-label="Delete <name>"`, so it stays unambiguous from the confirmation dialog's
   own same-labeled "Delete" button once open); clicking it now opens `ConfirmDeleteModal` with
   copy that states the real stakes plainly (kept for now, permanently removed in 30 days _only if_
   still empty by then, restorable any time before that) rather than a single line of native-dialog
   text. A new nested `DeletedCategoriesSection`, collapsed by default (see the new
   `CollapsibleSection.defaultCollapsed` prop below), lists the caller's own deleted categories with
   a "Restore" action per row and honest per-row messaging ("Permanently removed in N days unless
   restored" vs. "Has entries, so it's kept until you delete those too").
7. **Frontend - `CollapsibleSection.tsx` gains an optional `defaultCollapsed` prop** (defaults to
   `false`, so every existing caller's behavior is unchanged) - "Deleted categories" opts into
   starting collapsed specifically so its own fetch only happens once a caller actually opens it,
   not on every Settings page load, unlike "Categories" itself (which stays expanded by default,
   since it's the primary thing this screen is for).
8. **Tests**: `categories.test.ts` gained coverage for `GET /deleted` (correct `purgeEligibleAt`/
   `hasLogs`, scoped per-caller), `POST /:id/restore` (happy path, 404 on not-deleted/not-owned/
   missing, and confirms a disabled reminder stays disabled after restore). New
   `categoryPurgeScheduler.test.ts` - real integration tests against the database (backdating
   `archivedAt` directly, since nothing can wait 30 real days): purges an expired, empty category;
   leaves an expired-but-still-logged one alone (and its logs untouched); leaves one under 30 days
   alone; never touches a system category however long ago an admin archived it; and confirms a
   disabled `Reminder` still pointing at a purged category is cleaned up rather than orphaned or
   blocking the delete. `SettingsPage.test.tsx` gained coverage for the new confirmation dialog
   (open/confirm/cancel, with cancel sending no `DELETE` request), and the Deleted-categories
   section's lazy fetch, messaging, and restore flow.

### Why it's needed

Closes the actual complaint directly: a delete action that's easy to trigger by accident, gives no
real confirmation, and has no way back once clicked, replaced with one that clearly explains the
consequence up front, can be undone for 30 days, and only ever removes real logged history if the
user takes no action for that whole window _and_ the category has already lost all its history some
other way (e.g. every individual entry against it was separately deleted).

### Decisions

- **"Delete" replaces "Archive" entirely for personal categories, rather than existing alongside
  it.** Confirmed directly with the project owner: keeping both would mean two different "remove
  this" actions with subtly different guarantees on the same row, which is more confusing than
  useful. `Archive` is unaffected for _system_ categories (an admin's own separate, permanent
  "retire this built-in" action) - only the personal-category flow changes.
- **Real removal is only permitted for a category with zero logs by the time its 30 days are up.**
  Confirmed directly, and the one decision with real stakes: a category that still has genuine
  logged history is never silently erased just because a timer elapsed - it stays soft-deleted
  (restorable, off the active list) indefinitely instead. The _only_ way a category with history
  ever gets fully removed is if every individual log against it is separately deleted too, which
  already goes through History's own existing (also-confirmed) delete flow.
- **A background job enforces the 30-day expiry, not a check on next login.** Confirmed directly:
  a login-triggered sweep would never fire for an account that doesn't come back, leaving expired
  soft-deletes in limbo indefinitely with nothing to actually act on them. Mirrors this project's
  own existing `reminderScheduler.ts` pattern rather than inventing a new mechanism.
- **Restoring a category does not re-enable any reminder that was disabled alongside its delete.**
  A deliberate asymmetry: disabling on delete is a safety default (don't keep notifying about
  something no longer logged), but silently resuming notifications on restore isn't something a
  "delete" action should do unasked - the user re-enables a reminder themselves if they still want
  it.
- **`ConfirmDeleteModal` promoted to `components/`, not duplicated.** A second, independent
  consumer needing the exact same confirmation shape is the same trigger point this project already
  uses elsewhere to decide something has earned shared-component status, rather than guessing at
  reusability up front.
- **`CollapsibleSection` gets an opt-in `defaultCollapsed` prop, not a new component.** Every
  existing section wants "expanded by default," which stays the unchanged default - this is a
  minimal, backward-compatible extension for the one section (so far) that specifically benefits
  from starting closed.

### Verification

- `npm test` (backend): full suite green - 213 tests across 20 files (11 new: 6 in
  `categories.test.ts`, plus 5 in the new `categoryPurgeScheduler.test.ts`).
- `npx vitest run` (frontend): full suite green - 203 tests across 30 files (3 new tests in
  `SettingsPage.test.tsx` - cancel, the Deleted section's lazy fetch, and restore - plus 3 existing
  ones updated for the renamed Delete action and its new confirmation dialog).
- `npx tsc --noEmit`/`npx tsc -b`, `npm run build` (both projects), `npx eslint .`/`npm run lint`
  (oxlint), `npx prettier --check .` (both projects): all clean, no new warnings introduced.
- **A real cross-test-pollution bug found and fixed while writing the new frontend tests, not just
  a hypothetical one**: this project's own test environment provides a real, working
  `window.localStorage` that isn't reset between tests (unlike a plain jsdom default) - a test that
  clicked "Deleted categories" open left that "expanded" choice persisted for the _next_ test in
  the same file, intermittently breaking it depending on run order. Fixed by reusing this test
  file's own pre-existing `stubWorkingLocalStorage()` helper (already used for the page's
  "appearance" tests, for the identical reason) in a `beforeEach` scoped to the new tests, giving
  each one a fresh, isolated in-memory `Storage`.
- Manual, real-browser verification via a temporary Playwright script (not committed) against the
  actual running dev servers (backend on :4000, frontend on :5173, real Postgres) at a 412×915
  mobile viewport: created a personal category, clicked Delete, confirmed a real Modal dialog opens
  (not a native popup) with the full explanatory copy, confirmed the delete, confirmed the category
  left the main list and the exact expected success message appeared, opened "Deleted categories"
  and confirmed it showed with correct "Permanently removed in 30 days unless restored" messaging,
  clicked Restore, and confirmed it reappeared in the main list and disappeared from Deleted -
  screenshots taken at each step.
- The background purge job's own real-removal behavior (including the Reminder-cleanup
  transaction) is covered by `categoryPurgeScheduler.test.ts`'s real database integration tests
  (see above) - real-time verification (actually waiting 30 days, or 6 hours for a real tick) isn't
  practical, so this is the same "call the tick function directly against backdated fixtures"
  approach `reminderScheduler.test.ts` already established for its own scheduler.
- Not proven by any of the above: behavior if the purge scheduler's own tick is mid-flight when the
  process restarts (each category is purged in its own transaction, so a restart can only ever
  leave the _next_ candidate unpurged until the following tick, never a half-deleted row) - not
  specifically tested, but follows directly from each candidate being handled independently rather
  than as one large batch.

---
