# Mood Logging

## 2026-08-15 — Phase 1: `MoodLog` model + migration

**Task:** [Tasks.md](../../Tasks.md) → Phase 1 → "Define `MoodLog` model: `id`, `user_id`, `mood
(1–5)`, `energy (nullable 1–5)`, `stress (nullable 1–5)`, `notes (optional)`, `logged_at`."

**Delivered via branch:** `feature/1.4-mood-log-model` (stacked on
`feature/2.7-auth-middleware`, since the next task in this vertical slice — the mood-logs
endpoint — needs both the middleware and this model, and there's no reason to block local
progress waiting for either to be reviewed and merged first).

### Background / concepts

#### Why this is a new table, not just a column on `User`

- A user can log their mood many times (every day, several times a day) — this is a
  classic **one-to-many relationship**: one `User` has many `MoodLog` rows. That can't be
  represented as columns on `User` itself (there's no fixed number of mood logs to reserve
  columns for); it needs its own table, with each row pointing back at the user it belongs to
  via `user_id`.
- **What `mood_id_fkey` (the "foreign key") actually enforces.** `userId String @map("user_id")`
  alone would just be a plain text column — nothing would stop it from containing a value that
  doesn't correspond to any real user. Adding `user User @relation(fields: [userId],
  references: [id], onDelete: Cascade)` tells Postgres itself to enforce that `user_id` must
  match a real row in `users`, at the database level — not just something the application layer
  promises to check. This is a stronger guarantee than an application-only check: even a bug
  elsewhere in the code can't insert an orphaned mood log.
- **`onDelete: Cascade`, concretely.** Requirements call for "removing a `User` removes all
  associated logs" (Phase 1's cross-cutting item). Without `Cascade`, deleting a user whose
  `id` is still referenced by existing `mood_logs` rows would simply be *rejected* by Postgres
  (a foreign key violation) — `Cascade` instead tells Postgres "when the referenced user is
  deleted, automatically delete every row that points to it too," so account deletion (a later
  Phase 2 task) will be able to remove a user cleanly in one step rather than needing to
  manually delete every related table's rows first, in the right order, by hand.

#### `@db.Timestamptz(3)` — why the database column type was overridden

- Prisma's `DateTime` type, on Postgres, defaults to a column type that stores a timestamp
  *without* any timezone information attached — just a raw date and time, with no indication
  of which timezone it's relative to. That's a real problem for this app specifically: a
  wellness log's exact moment matters (grouping entries into "today" correctly depends on it),
  and a user's chosen `timezone` (already stored per-user since the very first `User` model)
  is meaningless without an unambiguous, timezone-aware value to interpret it against.
- `@db.Timestamptz(3)` overrides Prisma's default to Postgres's actual timezone-aware type
  (confirmed directly against the running database above: `timestamp(3) with time zone`) — the
  `(3)` is just precision (milliseconds). This matches what `requirements.md` §11 calls for
  and is the same reasoning Phase 1's cross-cutting "store `logged_at` as `timestamptz`" item
  describes; applied here to the one model this task actually adds, rather than waiting to
  apply it to every model at once at the very end of Phase 1.
- **What this doesn't do yet:** actually computing "which calendar day does this log belong to,
  in the user's timezone" is separate logic, needed by the dashboard/streak features in Phase
  4 — storing the value correctly is a prerequisite for that, not the same thing as having
  built it.

#### The composite index, and why `[userId, loggedAt]` specifically (not two separate indexes)

- Every future read of this data — "this user's mood logs for the last 30 days," "this user's
  most recent mood entry" — filters by `userId` *and* orders/ranges by `loggedAt` together, not
  either one alone. A single composite index on `[userId, loggedAt]` lets Postgres satisfy that
  combined pattern efficiently in one lookup; two separate single-column indexes wouldn't
  combine as effectively for this specific "filter by X, then range over Y" access pattern,
  which is exactly what every planned mood-log query looks like.

### What was done

1. **`backend/prisma/schema.prisma`.** Added the `MoodLog` model as described above, plus the
   reciprocal `moodLogs MoodLog[]` field on `User` (Prisma requires both sides of a relation to
   be declared, not just the "many" side).
2. **Migration.** `npx prisma migrate dev --name add_mood_log` — generated and applied
   `20260815174231_add_mood_log` against the local Postgres container.
3. **`npm run build`** — compiled cleanly (also regenerates the Prisma Client, which is how
   `prisma.moodLog.create(...)` etc. become available with full TypeScript types in the next
   task).
4. **`npm test`** — 24/24 passing, unchanged from the previous entry (this task adds no new
   application code, only schema).
5. **Manual verification directly against Postgres** (not just trusting the migration command's
   own "success" output): `psql \d mood_logs`, confirming the exact column types, the
   `timestamp(3) with time zone` type, the composite index, and the cascading foreign key all
   exist for real in the running database.

### Why it's needed

The mood-logs endpoint (next task) needs somewhere to actually store data — this is that
storage, with the correct relationships and constraints in place before any API code is
written against it, rather than discovering a missing constraint later after real data exists.

### Decisions

- **No `createdAt` field**, unlike `User`. Kept to exactly the fields `requirements.md` and
  `Tasks.md` specify for this model — `logged_at` already captures the moment that matters for
  a log entry (when the mood happened, which can be backfilled to a past date/time); a separate
  "when was this database row inserted" timestamp isn't something any planned feature reads.
- **Stacked this branch on `feature/2.7-auth-middleware` rather than `main`.** This model has
  no code dependency on the auth middleware, but the *next* task (the mood-logs endpoint) needs
  both, and there's no reason to sit idle waiting for either PR to be reviewed first. Both
  branches will need merging in order once reviewed, same as the earlier auth vertical slice.

### State at end of this step

`mood_logs` exists in the local database with the correct shape, constraints, and index. No
API endpoint reads or writes it yet — that's the next task.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 24/24 passing (unchanged).
- `psql \d mood_logs` against the real local database — confirmed column types (including
  `timestamp(3) with time zone`), the composite index, and the cascading foreign key directly,
  not inferred from the migration file alone.

---

## 2026-08-15 — Phase 3: `GET/POST/PATCH/DELETE /api/mood-logs`

**Task:** [Tasks.md](../../Tasks.md) → Phase 3 → Mood → "`GET/POST/PATCH/DELETE /api/mood-logs` —
full CRUD, scoped to the authenticated user; validate `mood` 1–5, `energy`/`stress` 1–5 when
present."

**Delivered via branch:** `feature/3.5-mood-logs-endpoint` (stacked on
`feature/1.4-mood-log-model`, which is itself stacked on `feature/2.7-auth-middleware` — this
task is where both of the previous two tasks actually get used together for the first time).

### Background / concepts

#### "Scoped to the authenticated user" — what that phrase actually means in code

- Every route in this file reads `req.userId`, which only exists because `requireAuth` (the
  previous task) ran first and put it there — this is `app.ts`'s
  `app.use("/api/mood-logs", requireAuth, moodLogsRouter)`: the middleware runs on *every*
  request to any `/api/mood-logs/*` route before any of this file's own code does.
- **"Scoped" isn't just about who's logged in — it's about which rows a query is even allowed
  to touch.** `GET` filters with `where: { userId: req.userId }`; `PATCH`/`DELETE` look the row
  up with `findFirst({ where: { id, userId: req.userId } })` rather than a plain `findUnique({
  where: { id } })`. The difference matters: `findUnique` by `id` alone would find *any* user's
  mood log if you guessed or otherwise obtained its ID — the query itself would happily return
  someone else's data. Including `userId` in the `where` clause means a mismatched log simply
  doesn't match the query at all, as if it didn't exist. This is the concrete mechanism behind
  Phase 11's later audit item ("confirm queries are filtered by the authenticated `user_id`")
  — and it's tested directly here already (see below), not deferred to that later phase.
- **Why 404, not 403, for "this log belongs to someone else."** A `403 Forbidden` response
  confirms to the caller "yes, this resource exists, you're just not allowed to see it" — which
  is itself a small information leak (an attacker could probe IDs to learn which ones are
  real). Responding `404 Not Found` for both "genuinely doesn't exist" and "exists but isn't
  yours" gives an outside caller no way to tell the two apart — the same reasoning already
  applied to login's undifferentiated `INVALID_CREDENTIALS` response back in Phase 2.

#### Backfilling: accepting a caller-supplied `loggedAt`, safely

- Requirements call for letting a user log an entry for *yesterday*, not just "right now" — a
  real need for a wellness tracker (e.g. remembering this morning's mood in the evening). The
  `loggedAt` field in the request body is entirely optional; when present, it's validated as a
  proper ISO 8601 datetime string by Zod's `z.string().datetime()` before ever reaching the
  database, and when absent, the database's own `@default(now())` (from the previous entry's
  schema) fills it in — "now" is deliberately resolved by the database at insert time, not
  computed earlier in the request-handling code, so it reflects the actual moment of insertion.
- Nothing stops a caller from supplying a `loggedAt` in the *future* here — Tasks.md's spec
  for this task only calls for validating the numeric rating fields, not constraining the date
  range, so this is left permissive rather than adding an unrequested rule.

#### Reading `req.userId` inside a route that ran after `requireAuth`

- This is the payoff of the previous task's TypeScript declaration-merging work: every handler
  in this file can write `req.userId` and have it type-check as `string | undefined`, with real
  autocomplete, purely because `requireAuth.ts` extended Express's own `Request` type once,
  centrally. Nothing in this file needs to re-declare or re-verify what that middleware already
  guarantees.

### What was done

1. **`backend/src/routes/moodLogs.ts` (new).** Four routes:
   - `GET /` — lists the authenticated user's mood logs, most recent first.
   - `POST /` — validates the body with Zod (`mood` required 1–5; `energy`/`stress` optional
     1–5; `notes` optional non-empty string; `loggedAt` optional ISO datetime), creates the row,
     returns `201` with the created log.
   - `PATCH /:id` — validates a *partial* body (any subset of the same fields), looks the log
     up scoped to the caller (`404` if missing or not owned), applies the update, returns `200`.
   - `DELETE /:id` — same ownership lookup, deletes, returns `200`.
2. **`backend/src/app.ts`.** Mounted the router at `/api/mood-logs` with `requireAuth` applied
   at the mount point (`app.use("/api/mood-logs", requireAuth, moodLogsRouter)`) — the first
   route group in the app that isn't wide open, and the first real use of the previous task's
   middleware.
3. **Tests (`moodLogs.test.ts`).** Covers: every route rejecting a request with no access
   token; creating and reading back a log; `loggedAt` defaulting to "now" vs. accepting an
   explicit past date for backfilling; rejecting an out-of-range `mood`/`energy`; listing only
   the calling user's own logs (registers a second user and confirms their log never appears);
   updating an owned log; `404` for an update/delete against a nonexistent ID; **and,
   specifically, a cross-user test** — user A creates a log, user B (a different authenticated
   account) attempts to edit and delete it, both get `404`, and the log is confirmed unchanged
   directly via `prisma.moodLog.findUnique` afterward, proving the intruder's requests had
   zero effect rather than just returning the "right" status code by coincidence.
4. **`npm test`** — 33/33 passing (24 pre-existing, 9 new).
5. **`npm run build`** — compiled cleanly.
6. **Manual end-to-end verification against the compiled, running server** (`npm start`), via
   `curl`: registered and logged in a real user, confirmed `/api/mood-logs` returns `401` with
   no token, then walked the full lifecycle with a real access token — create (`201`), list
   (the created log present), update (`200`, new `mood` value reflected), delete (`200`), and a
   final list confirming the log is genuinely gone (`[]`). Cleaned up the manually-created test
   user afterward via `psql` and stopped the manually-started server.

### Why it's needed

This is the first piece of real wellness-tracking functionality in the app — everything before
this task was infrastructure (auth, deployment) in service of *eventually* letting a user
record something about their day. It also proves out the full pattern (auth middleware → model
→ scoped CRUD route) that every other log type (symptoms, medications, habits) in the rest of
Phase 3 will repeat.

### Decisions

- **Not building the centralized error-handling middleware from Phase 3's cross-cutting
  checklist item in this task.** This route's error responses (`{ error: { message, code } }`)
  are written by hand, matching the exact shape already used throughout `routes/auth.ts` — kept
  consistent with the existing convention rather than introducing a mismatched shape, but the
  *centralized* version (a single Express error-handling middleware other routes could rely on
  instead of each repeating this by hand) is left as that checklist item's own separate task,
  not bundled in here.
- **`200 { message: "Deleted" }` rather than `204 No Content` for `DELETE`.** `204` (with an
  empty body) is the more common REST convention, but this codebase's one existing precedent
  for "an action completed, nothing to return" — `POST /api/auth/logout` — already returns `200`
  with a small JSON body. Matched that existing convention for consistency rather than
  introducing a second, different "successful action" shape.
- **No query parameters on `GET /` yet** (date range, pagination). Tasks.md scopes that to
  Phase 9 (History filtering) — added here it would be speculative, unused by anything yet.

### State at end of this step

A real, working, tested, auth-protected CRUD API for mood logs exists locally. Nothing on the
frontend calls it yet — that's the next task. Deployed production (Railway) does not yet have
this code; it will pick it up whenever this branch is merged to `main` (the same auto-deploy
pipeline documented in the earlier Railway entries).

### Verification

- `npm test` (`vitest run`) — 33/33 passing (24 pre-existing, 9 new).
- `npm run build` — compiled cleanly.
- Manual `curl` round-trip against the compiled, running server: unauthenticated request → 401;
  full create → list → update → delete → list-again lifecycle with a real access token, each
  response matching expectations exactly.

---

## 2026-08-15 — Phase 7: Mood entry form, wired into the Dashboard

**Task:** [Tasks.md](../../Tasks.md) → Phase 7 → "Mood entry form: 5 large emoji/visual mood
buttons, optional energy (1–5) and stress (1–5) controls, optional notes, date/time picker,
`Save Entry` button — matching the wireframe."

**Delivered via branch:** `feature/7.3-mood-entry-form` (stacked on
`feature/3.5-mood-logs-endpoint`). This is the last piece of the mood-logging vertical slice —
where everything built so far (auth middleware, the `MoodLog` model, the CRUD endpoint)
finally becomes something a real person can see and use, the same way the very first vertical
slice ended with an actual login form rather than just a working `/api/auth/login` endpoint.

### Background / concepts

#### Why this task also touched `DashboardPage.tsx`, not just added a new form component

- Tasks.md's own wording for this item is scoped to the form itself. But a form nobody can
  reach isn't a finished feature yet — the earlier auth vertical slice's whole justification
  (documented back in its own entry) was building thin *end-to-end* slices specifically so
  something is genuinely usable at the end of each one, not just individually correct in
  isolation. `DashboardPage.tsx` (previously just a placeholder welcome message) is where this
  form needed to actually live for that to be true here too.
- **What was deliberately left out**, to keep this task's scope honest rather than quietly
  absorbing later Tasks.md items: the shared "Quick Add" modal used by *all four* log types
  (its own Phase 7 item), and reusing this same form pre-filled for editing (a separate,
  later Phase 7 item covering all log types at once). This entry's dashboard only has mood
  logging, shown inline rather than in a modal, with delete but not edit — intentionally
  smaller than what those later, broader tasks will eventually build.

#### `role="radiogroup"` / `role="radio"` — accessible custom controls, not real `<input>`s

- The five mood buttons (and the energy/stress rating rows) are visually just styled
  `<button>` elements, not native HTML radio inputs — a native radio button can't easily be
  styled as a large emoji tile the way the wireframe calls for. But semantically, they behave
  exactly like a radio group: exactly one selectable at a time (for mood), with a clear
  "currently selected" state. Native radio inputs get this behavior (and screen-reader
  announcements, keyboard behavior) for free; a plain `<button>` doesn't automatically
  communicate any of that to assistive technology.
  - `role="radiogroup"` on the container and `role="radio"` + `aria-checked` on each button is
    how that meaning gets communicated explicitly instead — a screen reader announces these the
    same way it would a native radio group, even though under the hood they're just buttons with
    an `onClick`. This is the same "custom rating control needs explicit ARIA roles" concern
    Phase 12 (Accessibility QA) calls out generally; applied here at the point the first rating
    control actually gets built, rather than retrofitted later.
- The energy/stress rows reuse the same pattern but allow *deselecting* (clicking an already-
  selected value clears it back to "not set") — appropriate since those two fields are
  genuinely optional, unlike mood, which is required.

#### `<input type="datetime-local">` and why the value has to be built by hand

- HTML has a built-in date/time picker input (`type="datetime-local"`) — using it directly
  avoids writing a custom calendar widget for this task, which the requirements don't call for
  ("date/time picker" is satisfied by the native control). The one wrinkle: this input's value
  format is a specific plain string (`"YYYY-MM-DDTHH:mm"`) with **no timezone information at
  all** — it represents whatever the browser's local wall-clock time is, nothing more. The
  `toDateTimeLocalValue` helper in `MoodEntryForm.tsx` builds that exact string from `new
  Date()` to default the field to "right now" in the browser's own local time, since neither
  `Date`'s own `toISOString()` (which is UTC, not local) nor any other built-in method produces
  this specific format directly.
- On submit, that local-time string is converted back with `new Date(loggedAt).toISOString()`
  before being sent to the API — which is what the backend's `loggedAt` field actually expects
  (an unambiguous ISO 8601 instant, validated by the previous task's Zod schema). The
  round-trip matters: a plain local-time string sent as-is would be ambiguous about which
  timezone it was meant in; converting through a real `Date` object resolves that ambiguity
  using the browser's own timezone before the value ever leaves the client.

#### Why the dashboard list doesn't reuse the `Card` component

- `Card` (used by `LoginPage`/`RegisterPage`) is hard-coded to `max-w-sm` — a deliberate choice
  for a centered auth form, but wrong for a dashboard list meant to fill the page's wider
  content column. Overriding a Tailwind utility class by appending another one after it in the
  same `className` string (e.g. trying to cancel `max-w-sm` with a later `max-w-none`) isn't
  reliably safe — which of two conflicting utility classes "wins" depends on the order Tailwind
  itself emits them in the generated stylesheet, not the order they appear in the `className`
  attribute, so this can silently do nothing depending on build details. Rather than relying on
  that, the dashboard's mood-log list and form container use plain `<div>`s with the same
  visual styling (`rounded-2xl border border-border bg-surface p-6 shadow-sm`) copied
  directly, without the width constraint — correct and unambiguous, at the small cost of a
  little duplicated styling until `Card` is generalized (a natural candidate for Phase 5's
  still-unbuilt shared-primitives cleanup, not something to force through here).

### What was done

1. **`frontend/src/components/MoodEntryForm.tsx` (new).** Five emoji mood buttons (1 Bad ↔ 5
   Great, per requirements §6.2's exact wording), optional 1–5 energy/stress rating rows,
   optional notes textarea, a `datetime-local` field defaulting to "now," and Save/Cancel
   buttons. Submits directly via `apiFetch("/api/mood-logs", { method: "POST", ... })` and
   calls `onSaved(log)` with the created row on success — no separate state-management layer,
   consistent with how `LoginPage`/`RegisterPage` already call the API client directly rather
   than through an intermediate store.
2. **`frontend/src/pages/DashboardPage.tsx` (rewritten).** Fetches the user's mood logs on
   mount (`GET /api/mood-logs`), shows a `+ Mood` button that reveals the form inline, prepends
   newly-saved logs to the list, and lets each entry be deleted (optimistic removal from the
   list, rolled back if the `DELETE` request fails).
3. **Tests (`MoodEntryForm.test.tsx`).** Requiring a mood selection before submit is possible;
   a full submission (mood + energy + notes) producing the exact expected request body and
   calling `onSaved` with the server's response; a failed save showing a friendly error; Cancel
   calling `onCancel`.
4. **`npm test`** (frontend) — 18/18 passing (14 pre-existing, 4 new).
5. **`npm run build`** (frontend) — compiled cleanly.
6. **Real browser verification**, per the project's UI-change testing rule — not just tests and
   a type-check. Started the actual compiled backend (`npm start`, working around the
   pre-existing, previously-documented `ts-node-dev` crash) and the frontend dev server, then
   drove a real headless Chromium browser through the full flow with a throwaway Playwright
   script: register → land on Dashboard → open the mood form → select "Good," energy 4, add a
   note → Save → confirm the entry actually appears in the list with the right emoji, values,
   note, and timestamp → delete it → confirm the list returns to its empty state. No browser
   console errors at any point. Screenshots taken at each step and visually reviewed, not just
   asserted programmatically. Cleaned up the browser-created test user afterward and stopped
   both manually-started servers.

### Why it's needed

This is the moment the mood-logging vertical slice becomes a real, usable feature rather than
a set of individually-correct but disconnected pieces — the same significance the original
login form had for the auth slice.

### Decisions

- **Inline on the Dashboard, not a modal.** The shared Quick Add modal (meant to serve all four
  log types at once, per its own Phase 7 checklist item) doesn't exist yet, and building it just
  for mood alone would mean redoing it once the other three log types arrive. An inline toggle
  is simpler and doesn't foreclose that later, shared design.
- **Delete only, no edit, in this slice.** Editing "reusing the same form pre-filled with
  existing values" is its own explicit Tasks.md item, written to cover all four log types at
  once — building a one-off version just for mood here would likely need reworking once that
  broader task starts. Delete alone is enough to make the feature genuinely usable end to end
  (create something, see it, remove it) without pre-building a piece of a not-yet-started task.
- **Plain `<div>`s instead of forcing `Card` to fit.** Covered above — chosen over a
  Tailwind class-override that isn't guaranteed to behave predictably.

### State at end of this step

A real user can register or log in, land on the Dashboard, log their mood with optional energy/
stress/notes/backdated time, see it appear immediately, and delete it — verified directly in a
real browser, not just via tests. This closes out the mood-logging vertical slice: Phase 2.7
(auth middleware) → Phase 1.4 (model) → Phase 3.5 (endpoint) → Phase 7.3 (this task) are each
their own PR, stacked in that order, and need merging in that same order once reviewed.

### Verification

- `npm test` (frontend, `vitest run`) — 18/18 passing (14 pre-existing, 4 new).
- `npm run build` (frontend) — compiled cleanly.
- Real headless-browser walkthrough (Playwright) against the actual running backend and
  frontend dev servers: full register → log mood → view → delete cycle, screenshots reviewed
  at each step, zero browser console errors.

---

## 2026-08-16 — Clarifying what 1 and 5 mean on the energy/stress scales

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — direct feedback from a real user of the
mood entry form: the energy and stress number scales (1–5) had no indication of which end was
"low" and which was "high," so it wasn't obvious whether `1` meant "no energy" or "very
energetic."

### Background / concepts

#### Why a plain 1–5 number scale is ambiguous without labels

- The mood scale right above it doesn't have this problem — each button already carries an
  emoji *and* a word (`😞` "Bad" up to `😄` "Great"), so the direction is obvious without
  thinking about it. The energy/stress rows only ever showed bare digits, which carry no
  inherent direction on their own — nothing about the numeral `1` says whether it's the low end
  or the high end of the scale it's part of. This is exactly the kind of gap that's invisible
  to whoever built the form (the direction was obvious *to me*, because I knew what I intended)
  but genuinely unclear to a first-time user with no other context — precisely why real user
  feedback caught it and automated testing/code review didn't.
- **Energy and stress can't share one fixed label pair, either.** For energy, `5` (maximum) is
  the "good" end; for stress, `5` (maximum) is the "bad" end. A single generic caption like
  "1 = Low, 5 = High" would technically be accurate for both but wouldn't actually resolve the
  ambiguity the feedback was about — the fix needed to spell out what "low" and "high" concretely
  *mean* for each specific scale.

#### The fix, and how it's wired for accessibility too

- `RatingRow` (the shared component behind both the energy and stress rows in
  `MoodEntryForm.tsx`) now takes two new props, `lowLabel` and `highLabel`, and renders a small
  line of muted text underneath the buttons: `1 = No energy · 5 = Maximum energy` for the
  energy row, `1 = No stress · 5 = Maximum stress` for the stress row.
- That text isn't just visual. It's given an `id` (via React's `useId()`, which generates a
  unique, stable ID per component instance without hand-writing one) and wired to the
  radiogroup above it with `aria-describedby` — this is how a screen reader knows that
  paragraph is *describing* the control above it, not just unrelated nearby text, so a
  screen-reader user hears the same clarification a sighted user now sees.

### What was done

1. **`frontend/src/components/MoodEntryForm.tsx`.** Added `lowLabel`/`highLabel` props to
   `RatingRow`; energy passes `"No energy"`/`"Maximum energy"`, stress passes `"No
   stress"`/`"Maximum stress"`. Rendered as a `text-xs text-text-muted` line beneath each
   button row, connected to the radiogroup via `aria-describedby`.
2. **Test.** Added a case asserting both caption strings render.
3. **`npm test`** — 19/19 passing (18 pre-existing, 1 new).
4. **`npm run build`**, **`npm run lint`** (`oxlint` — clean, same one pre-existing unrelated
   `AuthContext.tsx` warning as before), **`npx prettier --check .`** — all clean.
5. **Real browser check**, per this project's UI-change testing habit: started the actual
   backend and frontend dev servers, registered a fresh user with Playwright, opened the mood
   form, and took a screenshot — confirmed both caption lines render exactly as intended,
   directly under their respective scales. Cleaned up the test user and stopped both servers
   afterward.

### Why it's needed

The scale was already functionally correct — nothing was broken — but a control a real user
can't confidently interpret is a genuine usability defect for a wellness-tracking app
specifically, where the whole point is recording an accurate, meaningful number. This is also
a good example of feedback that no amount of automated testing would ever have caught, since
the tests (reasonably) already know what `1` and `5` are supposed to mean.

### Decisions

- **Per-scale labels, not a shared generic caption.** Covered above — "low/high" alone
  wouldn't have actually resolved the reported confusion.
- **Text under the buttons, not inside/on them.** Keeps the buttons themselves clean and large
  (already sized for easy tapping), while still placing the clarification immediately adjacent
  and impossible to miss, rather than, e.g., a tooltip that requires an extra interaction to
  discover.

### State at end of this step

Both the energy and stress scales now clearly state what each end of the range means, for
sighted and screen-reader users alike. No API or data shape changes — this is purely a
frontend clarity fix.

### Verification

- `npm test` — 19/19 passing.
- `npm run build`, `npm run lint`, `npx prettier --check .` — all clean.
- Real headless-browser screenshot confirming both caption lines render correctly under their
  respective scales.

---

## 2026-08-16 — Widening energy/stress from 1–5 to 1–7, after more user feedback

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — follow-up feedback on the previous
entry's fix: could the energy/stress scales offer more resolution than 1–5? This turned into a
short design discussion (captured here for the reasoning, not just the result) before landing
on 1–7 specifically, rather than the originally-suggested 1–10.

### Background / concepts

#### Why not just jump straight to 1–10, and why not a slider

- **A slider was considered and rejected.** For a self-report health scale used on a phone,
  a slider (`<input type="range">`) is generally a *worse* accessibility choice than discrete
  buttons, not a better one: it's hard to land on an exact value with a fingertip (there's no
  natural "snap" to a specific number the way a button has a fixed, unambiguous hit target),
  and it's less immediately clear to a screen-reader user what's currently selected compared to
  a labeled button with `aria-checked`. The large, discrete-button pattern already in place
  (matching `requirements.md`'s own call for "large, easy-to-select visual controls") stayed.
- **1–10 was considered and also rejected, in favor of 1–7.** Two independent reasons pointed
  the same direction:
  - **Layout:** doubling the current 5 buttons to 10 would either force them below a
    comfortable tap-target size or wrap onto a second row on a narrow phone screen — working
    directly against the "large, easy-to-select" goal the extra resolution was meant to serve.
    7 buttons, by contrast, fit the same single-row layout at the same comfortable size
    (confirmed directly — see *Verification*).
  - **A genuine midpoint.** This was the deciding factor, discussed directly before making the
    change: an *odd*-sized scale has a true center value representing "neither low nor high" —
    1–5's center is 3, 1–7's is 4. An *even*-sized scale (1–6, or 1–10 for that matter, doesn't
    center cleanly either — its "middle" falls between two values, 5 and 6, with neither one
    truly representing "neutral") doesn't offer that, which would arguably make the scale
    *harder* to use meaningfully, not easier, despite offering more raw options. 1–7 was chosen
    specifically because it keeps a clean midpoint while still resolving the original "not
    enough resolution" feedback — a well-established scale size for exactly this kind of
    subjective self-rating (7-point Likert-style scales are a standard, validated choice in
    survey design for this reason).
- **Mood itself stays at 1–5, unchanged.** The feedback and this whole discussion was
  specifically about energy/stress, which only ever had bare numbers. Mood already pairs each
  option with an emoji and a word (`😞` "Bad" through `😄` "Great"), so it doesn't have the
  ambiguity problem the previous entry's fix and this widening are both addressing.

### What was done

1. **Backend (`moodLogs.ts`).** Split the single shared `ratingField` Zod schema into
   `moodField` (unchanged, 1–5) and a new `energyStressField` (1–7), applied to `energy` and
   `stress` only.
2. **Tests.** Updated the existing out-of-range test to also cover the new upper bound (`energy:
   8` now correctly rejected, `energy: 0` still correctly rejected); added a case confirming
   `energy: 7`/`stress: 6` are accepted — values that would have been rejected under the old
   1–5 range.
3. **Frontend (`MoodEntryForm.tsx`).** Renamed and widened the shared rating-values array
   (`RATING_VALUES` → `ENERGY_STRESS_VALUES`, now `[1..7]`); the caption text ("`1 = No energy ·
   7 = Maximum energy`") now reads its upper bound directly from that array instead of a
   hard-coded `5`, so the two can never silently drift apart again.
4. **Tests.** Updated the caption-text assertions to expect `7` instead of `5`; added a test
   confirming all seven options render in order and that the new midpoint (4) is genuinely
   selectable (asserting `aria-checked` toggles on click).
5. **Docs.** Updated both `requirements.md` (§6.2: "Energy level from 1–7," "Stress level from
   1–7") and the two relevant `Tasks.md` checklist items' wording, so both stay accurate to the
   app's real, current behavior rather than describing the original 1–5 design after it changed.
6. **Full verification, both projects:** backend — `npm run build`, `npm test` (34/34, 1 new),
   `npx eslint .`, `npx prettier --check .`, all clean. Frontend — `npm test` (20/20, 2 new),
   `npm run build`, `npm run lint` (`oxlint`, same one pre-existing unrelated warning as
   before), `npx prettier --check .`, all clean.
7. **Real browser check at a deliberately narrow mobile width (375px, iPhone SE-class — the
   narrowest common target)**, specifically to confirm the layout concern from the earlier
   design discussion: all 7 energy buttons render in a single row, comfortably sized, with no
   wrapping or crowding — confirming the prediction rather than just assuming it.

### Why it's needed

Directly addresses real, follow-up user feedback — the previous entry's fix (labeling what 1
and 5 meant) made the existing scale *clearer*, but the actual complaint underneath it was that
5 points didn't feel expressive enough. This closes that loop with a scale that's both more
expressive and, thanks to the genuine midpoint, arguably easier to reason about than the
naively-larger 1–10 alternative would have been.

### Decisions

- **1–7, not 1–10 or 1–6.** Covered in detail above — the midpoint argument and the mobile
  layout constraint both independently pointed at the same answer.
- **Buttons, not a slider.** Covered above — sliders are a real accessibility downgrade for
  this kind of precise, discrete self-rating, not an upgrade.
- **Mood left untouched at 1–5.** The reported problem was specific to the unlabeled,
  ambiguous number rows; mood's emoji+word buttons were never part of the complaint.

### State at end of this step

Energy and stress now accept 1–7 end to end — validated server-side, offered client-side, with
matching tests on both sides and documentation updated to match. Mood is unchanged at 1–5.

### Verification

- Backend: `npm run build`, `npm test` (34/34), `npx eslint .`, `npx prettier --check .` — all
  clean.
- Frontend: `npm test` (20/20), `npm run build`, `npm run lint`, `npx prettier --check .` — all
  clean.
- Real headless-browser screenshot at a 375px mobile viewport width, confirming all 7 buttons
  fit in a single row without wrapping or crowding.

---

## 2026-08-16 — Migrating historical energy/stress values onto the new 1–7 scale

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a direct follow-up question on the
previous entry: existing users had already recorded energy/stress values under the old 1–5
scale — should those be updated to fit the new 1–7 scale, or left as originally entered?

### Background / concepts

#### The decision: rescale, not leave as-is

- Both options were laid out plainly before doing either: leave old values untouched (honest,
  but an old "5" — which meant *maximum* at the time — now silently reads as "5 of 7," no
  longer the maximum, with nothing to indicate it was recorded under a different scale); or
  proportionally rescale old values into the new range, preserving *relative* position even
  though the exact numbers change. The choice made was to rescale — prioritizing that a
  historical "maximum energy" entry should still *read* as maximum energy today, over
  preserving the literal original digit.

#### A real bug in this migration's own safety claim — caught by actually testing it twice

- The rescale mapping is: `1→1, 2→3, 3→4, 4→6, 5→7` (endpoints and the midpoint land exactly;
  2 and 4 need rounding, since 1–5 and 1–7 don't divide evenly, and both round up per standard
  round-half-away-from-zero).
- **The first version of this migration's own comment claimed it was safe to run more than
  once.** That claim was checked directly, not just assumed — the already-applied migration's
  `UPDATE` was run a *second* time by hand against the freshly-migrated test data, and it
  produced *wrong* results: a row already correctly migrated to `3` shifted to `4`; a row
  already at `4` shifted to `6`. The reason: `3` and `4` are simultaneously valid *outputs* of
  this mapping *and* valid *inputs* to it (they're still `<=5`), so a second pass reinterprets
  an already-migrated value as if it were still on the old scale and shifts it again.
- **This is exactly why "add a migration" tasks in this project are always followed by
  actually running them against real inserted data and checking the result directly** (the
  same discipline used for every schema migration so far in this log) rather than trusting a
  migration file's SQL to be correct by inspection alone. The comment was corrected to state
  plainly that this migration is *not* idempotent, and that what actually prevents it from
  running twice in practice is Prisma's own migration-tracking table
  (`_prisma_migrations`), which records a migration as applied and never re-runs it under
  normal `prisma migrate deploy`/`migrate dev` use — not any property of the SQL itself.

#### Why this is a genuinely separate migration file, not a change to the earlier `MoodLog` one

- Prisma migrations are meant to be an append-only, chronological history of exactly what
  happened to the database and in what order — editing an already-applied migration file
  (the original `add_mood_log` one) after the fact would rewrite history that's already been
  applied in some environments (this local database, at least) and not in others, which is
  precisely the kind of drift Prisma's migration system exists to prevent. A new, dedicated
  migration — created with `npx prisma migrate dev --create-only` (which sets up the migration
  folder and timestamp without trying to auto-generate SQL from a schema diff, since this
  change touches data, not the schema) — is the correct, standard way to make a data change
  like this.

### What was done

1. **`backend/prisma/migrations/20260816095258_rescale_energy_stress_to_1_7/migration.sql`
   (new).** Two `UPDATE` statements (one for `energy`, one for `stress`), each a `CASE`
   expression implementing the `1→1, 2→3, 3→4, 4→6, 5→7` mapping, `WHERE energy/stress IS NOT
   NULL` (so rows that never recorded a value stay untouched rather than getting a fabricated
   one).
2. **`frontend/src/pages/DashboardPage.tsx`.** Fixed a real, separate bug this whole change
   surfaced: the recent-entries list hard-coded `/5` after both the energy and stress values —
   correct under the old scale, silently wrong now (a freshly-logged `7` would have displayed
   as "Energy 7/5"). Changed to `/7` for both.
3. **Manual verification against real inserted data, not just reading the SQL.** Inserted six
   test rows directly into the local database covering every old-scale value (`1` through `5`)
   plus a `NULL` case, applied the migration (`prisma migrate dev`), and queried the result —
   confirmed the exact expected mapping (`1,3,4,6,7,NULL`). Then re-ran the same `UPDATE` a
   second time by hand specifically to check for the non-idempotency problem described above —
   which is how it was actually caught, not guessed at. Cleaned up all test rows and the test
   user afterward.
4. **`npm run build`, `npm test` (34/34, unchanged), `npx eslint .`, `npx prettier --check .`**
   — all clean (this migration doesn't change any application code, only historical data).

### Why it's needed

Without this, every energy/stress value a real user had already recorded before this change
would have a meaning that quietly shifted underneath them — the exact "5 no longer means
maximum" problem described above — for a health-tracking app where an honest, comparable
history over time is the entire point.

### Decisions

- **Rescale rather than leave as-is** — covered above; chosen so a historical "maximum" entry
  still reads as maximum today, which matters more here than preserving the literal old digit.
- **A new migration file, not editing the old one** — standard Prisma practice, and the only
  way to make a data-only change without rewriting already-applied history.
- **Documented the non-idempotency explicitly in the migration's own comment**, once the
  double-run test revealed the first draft's claim was wrong, rather than leaving a
  confidently-stated but incorrect safety claim for a future reader to trust.

### State at end of this step

Once this migration reaches production (via the same automatic `prisma migrate deploy` step
already covered in an earlier deployment entry), every pre-existing `mood_logs` row's
`energy`/`stress` values will be rescaled exactly once, automatically, at deploy time — with no
window where old and new data coexist under different scales, since the dashboard fix and this
migration are both part of the same not-yet-merged PR.

### Verification

- Inserted real test data covering every old-scale value directly into the local database,
  applied the migration, and confirmed the exact expected output by querying it back.
- Explicitly tested running the migration's logic a second time to check for (and find, and
  document) a non-idempotency issue — not just assumed safe.
- `npm run build`, `npm test` (34/34), `npx eslint .`, `npx prettier --check .` — all clean.
- All test data and the test user cleaned up afterward.

---

## 2026-08-17 — Phase 7: Edit action for mood entries, reusing the same form

**Task:** [Tasks.md](../../Tasks.md) → Phase 7 → "Edit and delete actions available from
Dashboard/History for every log type, reusing the same forms pre-filled with existing values."
This entry covers Mood specifically, and also explains the pattern shared by the equivalent
entries in [Symptom Logging](04-symptom-logging.md), [Medication Logging](05-medication-logging.md),
and [Habit Logging](06-habit-logging.md) — each of those references this section instead of
repeating it.

**Delivered via branch:** `feature/7-edit-log-entries` (frontend-only — the backend's `PATCH`
endpoints for all four log types already existed and needed no changes at all; this task was
purely about wiring the frontend up to use them).

### Background / concepts

#### Why this was flagged "delete already exists everywhere, edit does not" — and why that gap matters

- The very first mood-logging entry above ("Delete only, no edit, in this slice") explicitly
  deferred edit to this later, broader task, precisely so it could be built once for all four
  log types together instead of four separate one-off versions that might not agree with each
  other. Until this task, a mis-logged entry (wrong mood, forgot to note something, picked the
  wrong medication) could only be *deleted and re-created from scratch* — losing the original
  timestamp unless the user remembered and re-typed it, and generally more friction than fixing
  a typo warrants. For a wellness-tracking app where the whole point is an accurate history,
  that's a real usability gap, not just a missing convenience.

#### "Reusing the same forms," concretely — one component, two modes

- The core idea: `MoodEntryForm` (and its three siblings) gained one new optional prop,
  `editingLog?: MoodLog | null`. When it's `null`/absent, the form behaves *exactly* as before —
  every field starts empty/default, the submit button reads "Save Entry," and submitting sends a
  `POST` to create a brand-new log. When `editingLog` is a real log object, every field's
  `useState` initializer reads its starting value from that log instead (`useState(editingLog?.mood
  ?? null)` instead of `useState(null)`, and so on for every field), the button reads "Save
  Changes," and submitting sends a `PATCH` to `/api/mood-logs/{editingLog.id}` instead of a `POST`
  to `/api/mood-logs`.
- This is a **strict backward-compatibility requirement**, not just a nice-to-have: every
  existing test for these forms had to keep passing completely unchanged, proving the "absent
  prop = old behavior, byte for byte" claim is actually true rather than just intended.

#### Why the Section components needed a `key` on the form, not just a prop

- `MoodSection` already had a `showForm` boolean controlling whether the create form or the `+
  Mood` button is visible — reused as-is for edit, by adding one more piece of state,
  `editingLog: MoodLog | null`, alongside it. Clicking "Edit" on a list entry sets `editingLog`
  to that log and `showForm` to `true`; clicking `+ Mood` sets `editingLog` back to `null` before
  opening; saving or cancelling resets `editingLog` to `null` again.
- The subtle bug this avoided: React only re-runs a component's `useState` *initializers* the
  first time it mounts — not every time its props change. If a user opened the create form,
  then (without closing it) clicked "Edit" on a list entry, `MoodEntryForm` would still be
  mounted at the same position in the tree, so React would just pass it the new `editingLog`
  prop without re-running `useState(editingLog?.mood ?? null)` — the form would keep showing
  stale, blank fields instead of the entry actually being edited. The fix: `<MoodEntryForm
  key={editingLog?.id ?? "create"} .../>`. React treats a changed `key` as "this is now a
  different component instance," unmounting the old one and mounting a fresh one — which is
  exactly what's needed here, since switching from "create" to "edit log X" (or from editing log
  X to editing log Y) really is conceptually a different form each time, not the same one with
  updated props.

#### The "replace in place, not prepend" logic — and why it needed no extra state to track "was this an edit"

- Every Section already prepended newly-created logs to the top of its list
  (`setMoodLogs((prev) => [log, ...prev])`). For an edit, the requirement is different: replace
  the existing entry where it already sits, not add a second copy. Rather than threading through
  an extra "was this a create or an edit" flag, the save handler asks a simpler, self-contained
  question of the data itself: *does a log with this exact id already exist in the list?*
  ```ts
  function handleSaved(log: MoodLog) {
    setMoodLogs((prev) => {
      const isEdit = prev.some((l) => l.id === log.id);
      return isEdit ? prev.map((l) => (l.id === log.id ? log : l)) : [log, ...prev];
    });
    ...
  }
  ```
  This works because a `PATCH` response always carries the same `id` it was called with, while a
  `POST` response always carries a freshly-generated one that can't already be in the list — so
  the check is correct by construction, not by coincidence, and there's no separate piece of
  state that could drift out of sync with what actually happened.

### What was done

1. **`frontend/src/components/MoodEntryForm.tsx`.** Added the `editingLog` prop; every field's
   initial state now reads from it when present; submit branches between `POST /api/mood-logs`
   and `PATCH /api/mood-logs/{id}`; submit button reads "Save Changes" when editing.
2. **`frontend/src/components/dashboard/MoodSection.tsx`.** Added `editingLog` state; an "Edit"
   button next to each entry's existing "Delete" button (same `aria-label` pattern, e.g. `Edit
   mood entry from 8/17/2026, 9:00:00 AM`); the form's heading switches between "Log your mood"
   and "Edit mood entry"; `key={editingLog?.id ?? "create"}` on the rendered form, for the
   remount-on-switch reason above; `handleSaved` does the replace-in-place-or-prepend check
   described above.
3. **Tests.** Added a new `describe("editing an existing entry")` block in
   `MoodEntryForm.test.tsx` (pre-fill of every field from a sample log; the "Save Changes" label;
   a full submit asserting the request goes to the log's own URL with `method: "PATCH"`) and one
   new case in `MoodSection.test.tsx` (clicking Edit opens the form pre-filled, saving replaces
   the entry in place rather than adding a second one). All pre-existing tests in both files
   pass completely unchanged.
4. **`npm test`** (frontend, full suite) — 82/82 passing (68 pre-existing, 14 new across all
   four log types' forms and sections).
5. **`npm run build`, `npm run lint` (`oxlint`), `npx prettier --check .`** — all clean.
6. **Real browser verification**, per the project's UI-change testing habit: started the actual
   backend and frontend dev servers, registered a fresh user with Playwright, logged a mood
   entry, clicked Edit, changed the mood and confirmed the pre-filled form showed the original
   value first, saved, and confirmed the entry updated in place on the dashboard (not
   duplicated) with zero browser console errors throughout.

### Why it's needed

Closes the "delete and re-create" gap called out above — a corrected mood entry now keeps its
original identity (and, unless deliberately changed, its original timestamp) instead of being
destroyed and rebuilt from scratch, which matters for an app whose entire value is an accurate,
trustworthy history over time.

### Decisions

- **One form, an optional prop — not a second, parallel "EditMoodForm" component.** Explicitly
  what Tasks.md's own wording calls for ("reusing the same forms"), and the whole reason this
  task was deferred until now rather than built ad hoc earlier: a single form can't drift out of
  sync with itself the way two independently-maintained forms eventually would.
- **`key`-based remount over a `useEffect` that resets fields when `editingLog` changes.** Both
  would work, but the `useEffect` approach means duplicating, for every single field, the same
  "which value should this field hold right now" logic that the initializer already expresses
  once — the `key` approach gets a genuinely fresh component instance for free, using a feature
  React already provides for exactly this situation, rather than hand-rolling a reset effect.
- **Habit's habit-picker is locked during edit** — covered in full in
  [Habit Logging](06-habit-logging.md)'s own entry, since it's specific to that one log type.

### State at end of this step

A user can now correct a mistake in any already-logged mood entry directly from the Dashboard,
without deleting and re-creating it. The same underlying pattern (optional `editingLog` prop,
`key`-forced remount, replace-in-place save handler) is used identically by Symptom, Medication,
and Habit — see their own log entries for what's specific to each.

### Verification

- `npm test` (frontend, full suite) — 82/82 passing (68 pre-existing, 14 new).
- `npm run build`, `npm run lint`, `npx prettier --check .` — all clean.
- Real headless-browser walkthrough (Playwright) against genuinely running dev servers: logged
  and then edited a mood entry, confirmed the pre-filled value, the in-place update, and zero
  console errors.

---
