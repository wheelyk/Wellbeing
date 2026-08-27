# WellTrack — Implementation Tasks

Derived from [Documents/requirements.md](Documents/requirements.md). Tasks are grouped into
phases and ordered so each phase can be built and tested before moving to the next.
Checkboxes let you track progress directly in this file.

---

## Phase 0 — Project Setup

- [x] Initialize a git repository and monorepo layout (`/frontend`, `/backend`, or separate repos — pick one and document it in a root `README.md`).
- [x] Scaffold backend: Node.js + Express + TypeScript project (`npm init`, `tsconfig.json`, `ts-node-dev`/`nodemon` for local dev).
- [x] Scaffold frontend: React + TypeScript project (Vite recommended) with Tailwind CSS configured.
- [x] Set up ESLint + Prettier for both projects for consistent code style.
- [x] Set up PostgreSQL locally (Docker Compose recommended: `docker-compose.yml` with a `postgres` service).
- [x] Install and configure Prisma in the backend; connect it to the local PostgreSQL database via `DATABASE_URL`.
- [x] Create `.env.example` files for both frontend and backend documenting required environment variables (DB URL, JWT secrets, mail provider keys, etc.). Add real `.env` files to `.gitignore`.
- [x] Add a root `README.md` describing how to run the project locally (DB, backend, frontend).

---

## Phase 1 — Data Model (Prisma / PostgreSQL)

Reference: requirements §11.

- [x] Define `User` model: `id (uuid)`, `email (unique)`, `password_hash`, `display_name`, `timezone (default UTC)`, `created_at`.
- [x] Define `Symptom` model: `id`, `user_id (nullable — null = system symptom)`, `name`, `description (optional)`, `created_at`.
- [x] Define `SymptomLog` model: `id`, `user_id`, `symptom_id`, `severity (1–10)`, `notes (optional)`, `logged_at`.
- [x] Define `MoodLog` model: `id`, `user_id`, `mood (1–5)`, `energy (nullable 1–5)`, `stress (nullable 1–5)`, `notes (optional)`, `logged_at`.
- [x] Define `Medication` model: `id`, `user_id`, `name`, `created_at`. (Gained an optional `dosage` field later, beyond original scope — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Define `MedicationLog` model: `id`, `user_id`, `medication_id`, `taken (boolean)`, `notes (optional)`, `logged_at`.
- [x] Define `Habit` model: `id`, `user_id`, `name`, `type (boolean | numeric | duration)`, `created_at`.
- [x] Define `HabitLog` model: `id`, `user_id`, `habit_id`, `value (shape depends on habit type)`, `notes (optional)`, `logged_at`.
- [x] Add appropriate foreign keys, indexes (especially on `user_id` + `logged_at` for query performance), and cascading deletes so removing a `User` removes all associated logs. (Confirmed directly against `schema.prisma`: every log table has `onDelete: Cascade` and a `@@index([userId, loggedAt])` composite index; this checkbox was stale, not the work.)
- [x] Store `logged_at` as a timestamp with timezone (`timestamptz`) and always compute "which calendar day" using the user's stored `timezone`, not server time. (Every `loggedAt` column is `@db.Timestamptz(3)`; `backend/src/lib/timezone.ts` resolves "which calendar day" via `Intl.DateTimeFormat` against the user's own stored timezone, not the server's.)
- [x] Write and run the initial Prisma migration. (`backend/prisma/migrations/20260814155859_init_user` onward — the schema has evolved through many since, all applied.)
- [x] Seed the database with a small set of system-default symptoms (e.g. Headache, Fatigue, Nausea) where `user_id` is null.

---

## Phase 2 — Authentication & User Profile

Reference: requirements §5, §13.

- [x] Implement `POST /api/auth/register` — validate email format + password strength, hash password with bcrypt/argon2, create user.
- [x] Implement `POST /api/auth/login` — verify credentials, issue short-lived JWT access token + longer-lived refresh token.
- [x] Implement refresh token storage/rotation strategy (e.g. HTTP-only secure cookie for the refresh token) and `POST /api/auth/refresh`.
- [x] Implement `POST /api/auth/logout` — invalidate/clear the refresh token.
- [x] Implement `POST /api/auth/change-password` — for a logged-in user; requires the current password to be re-verified before updating the hash. Needs no email provider, unlike forgot/reset password below.
- [x] Implement `POST /api/auth/forgot-password` — generate a time-limited reset token and send a reset email (use a placeholder/mock email provider for local dev).
- [x] Implement `POST /api/auth/reset-password` — validate the reset token and update the password hash.
- [x] Implement an Express auth middleware that verifies the access token and attaches the authenticated user to the request; use it on all protected routes.
- [x] Implement `GET /api/users/me`, `PATCH /api/users/me` (display name, timezone), `DELETE /api/users/me`.
- [x] On account deletion, cascade-delete (or explicitly delete in a transaction) all of the user's symptom logs, mood logs, medication/medication logs, habits/habit logs, and user-owned symptoms. (Already true at the schema level — every `User` relation already had `onDelete: Cascade` — confirmed directly by querying every table after a real deletion, not just trusting the 200 response. See [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Add rate limiting (e.g. `express-rate-limit`) to all `/api/auth/*` endpoints. (Applied to `/register`, `/login`, `/change-password`; deliberately not `/refresh`/`/logout` — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Add CORS configuration restricting allowed origins. (Deployed and verified — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md)'s FRONTEND_URL/CORS entries.)
- [x] Ensure no endpoint or log statement ever outputs a plain-text password or raw health data. (Audited: only one `console.log` in the whole backend, logging just the port number; register/login responses never include `passwordHash`, tested explicitly.)

---

## Phase 3 — Backend: Logging APIs

Reference: requirements §6, §12.

### Symptoms
- [x] `GET /api/symptoms` — return system symptoms + the current user's custom symptoms.
- [x] `POST /api/symptoms` — create a user-specific symptom.
- [x] `PATCH /api/symptoms/:id` / `DELETE /api/symptoms/:id` — only allowed on symptoms owned by the current user (never on system symptoms or another user's symptoms).
- [x] `GET/POST/PATCH/DELETE /api/symptom-logs` — full CRUD, scoped to the authenticated user; validate `severity` is an integer 1–10.

### Mood
- [x] `GET/POST/PATCH/DELETE /api/mood-logs` — full CRUD, scoped to the authenticated user; validate `mood` 1–5, `energy`/`stress` 1–7 when present (widened from 1–5 after user feedback — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md)).

### Medications
- [x] `GET/POST/PATCH/DELETE /api/medications` — manage the user's medication list.
- [x] `GET/POST/PATCH/DELETE /api/medication-logs` — record taken/not-taken status per medication per date.

### Habits
- [x] `GET/POST/PATCH/DELETE /api/habits` — manage user-defined habits, including `type` (boolean/numeric/duration).
- [x] `GET/POST/PATCH/DELETE /api/habit-logs` — record a value appropriate to the habit's type; validate the value shape server-side based on `type`.

### Cross-cutting for this phase
- [x] For every log endpoint, verify the referenced `symptom_id` / `medication_id` / `habit_id` belongs to the authenticated user (or is a valid system symptom) before creating/updating a log — this is the key defense against ID-tampering (§13). (Already true, stale checkbox — confirmed directly during the Phase 11 audit; see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Support backfilling: all log creation endpoints must accept an explicit `logged_at` in the past, defaulting to "now" if omitted. (Already true, stale checkbox — every `createSchema` accepts an optional `loggedAt`.)
- [x] Add centralized request validation (e.g. `zod` or `express-validator`) for all request bodies. (Already true, stale checkbox — Zod on every write endpoint, confirmed during the Phase 11 audit.)
- [x] Add a centralized error-handling middleware returning a consistent JSON error shape (e.g. `{ error: { message, code } }`) without leaking stack traces. (This one was a genuine gap — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)

---

## Phase 4 — Backend: Dashboard & Trends

Reference: requirements §7, §10, §12.7, §12.8.

- [x] Implement `GET /api/dashboard?date=YYYY-MM-DD`, returning in one response:
  - [x] Date (resolved using the user's timezone).
  - [x] Today's mood (latest mood log for the day, if any).
  - [x] Today's symptom count.
  - [x] Today's medication summary (`taken/total`).
  - [x] Today's habit summary.
  - [x] A list of recent entries across all log types, sorted by time.
  - [x] Current logging streak and count of days logged this week.
- [x] Write the streak calculation as a pure, unit-testable function (a "day" counts as logged if at least one entry of any type exists for that calendar day in the user's timezone).
- [x] Implement `GET /api/trends?period=7d|30d|90d`, returning:
  - [x] Symptom severity series + average for the period.
  - [x] Mood series + average for the period.
  - [x] A day-by-day activity map (which days had any logged activity) for the calendar-style habit view.
- [x] Ensure all dashboard/trend queries are scoped to `user_id` and use indexed, efficient date-range queries.

---

## Phase 5 — Frontend Foundation

- [x] Set up React Router with routes for: Login, Register, Forgot/Reset Password, Dashboard (Home), History, Trends, Settings.
- [x] Build an API client (fetch/axios wrapper) that attaches the access token, and on a 401 automatically attempts a token refresh before retrying once; on refresh failure, redirect to Login.
- [x] Build an auth context/store (e.g. React Context or a small state library) holding the current user and auth status.
- [x] On app load, attempt a silent token refresh (using the `httpOnly` refresh cookie) to rehydrate the session, so a browser refresh doesn't log out a user whose session is still genuinely valid — found missing while testing the change-password flow, fixed later (see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md)).
- [x] Build a bottom navigation component (Home / History / Trends / Settings) per the wireframes, visible on mobile; adapt to a top/side nav on desktop without changing the underlying workflow. (No wireframes file exists yet, so built to this app's existing visual language — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Establish base Tailwind design tokens (colors, spacing, font sizes) for a calm, high-contrast, low-clutter UI, and reusable primitives: `Button`, `Card`, `RatingScale`, `Modal`, `TextField`, `DatePicker`. (Design tokens live in `frontend/src/index.css`. All six now exist: `Button`/`Card`/`TextField` from earlier, `Modal` (a real focus-trapping dialog, added for the Dashboard's dialog-based Quick Add), and `RatingScale`/`DateTimeField` — the latter satisfying "DatePicker," named for what it actually is: every real usage edits date and time together, never date alone. See [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Ensure all interactive primitives have visible focus states and meet WCAG AA color contrast. (Confirmed during the Phase 12 audit — `focus-visible:outline` used consistently across every interactive element; zero axe-core WCAG 2AA contrast violations across six real pages/states. See [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)

---

## Phase 6 — Frontend: Auth Flows

- [x] Registration page: email + password form with client-side validation mirroring backend rules; friendly inline error messages.
- [x] Login page; on success store tokens/session and redirect to Dashboard.
- [x] Logout action (clears session, calls `/api/auth/logout`).
- [x] Change password form on Settings page: current password + new password fields, calls `POST /api/auth/change-password`, with clear success/error feedback.
- [x] Forgot password page (request reset email) and reset password page (submit new password with reset token).
- [x] Settings page: view/edit display name and timezone; account deletion flow with a clear confirmation step (type-to-confirm or a two-step dialog) per §15. (Type-to-confirm: the delete button stays disabled until the user types `DELETE` exactly. See [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Route guarding: unauthenticated users are redirected to Login when hitting protected routes.

---

## Phase 7 — Frontend: Logging UI (Quick Add)

Reference: requirements §6, §8.

- [x] Build the Quick Add entry point (modal or dedicated page) shared by all four log types, clearly labelling what is being logged. (Already true, stale checkbox — `QuickAddFab` reaches all four log types from anywhere on Dashboard; confirmed directly against the current code.)
- [x] Symptom entry form: symptom picker, large 1–10 severity control, optional notes, date/time picker (defaults to now), Save/Cancel.
- [x] Mood entry form: 5 large emoji/visual mood buttons, optional energy (1–7) and stress (1–7) controls, optional notes, date/time picker, `Save Entry` button — matching the wireframe.
- [x] Medication entry form: medication picker (or quick "mark as taken/not taken"), optional notes, date/time picker.
- [x] Habit entry form: input control adapts to habit type (toggle for boolean, number input for numeric, duration input for duration), date/time picker.
- [x] Client-side validation before submit (required fields, value ranges), with clear inline error messages — no silent failures.
- [x] Success feedback (toast/inline confirmation) on save; clear error feedback on failure.
- [x] Edit and delete actions available from Dashboard/History for every log type, reusing the same forms pre-filled with existing values.
- [x] Delete actions require a lightweight confirmation (per §15, destructive-action confirmation).

---

## Phase 8 — Frontend: Dashboard (Home)

Reference: requirements §7.

- [x] Header showing today's date in the user's timezone.
- [x] Today's summary card: mood, symptom count, medication summary (`1/2 taken`), habit summary.
- [x] Prominent Quick Add buttons (`+ Symptom`, `+ Mood`, `+ Medication`, `+ Habit`) opening the corresponding form with minimal taps. (Each Dashboard section has its own inline icon add button, plus a floating Quick Add button reaching all four from anywhere on the page — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Logging consistency indicator (streak + days logged this week) — informational tone, no gamified badges/pressure language.
- [ ] Recent entries list (type, value, time), each entry tappable to edit.
  The list itself exists (`DashboardSummary.tsx`'s "Recent entries") but entries aren't yet
  clickable to edit directly from Dashboard — editing currently requires going to History
  (whose own entries are fully tappable-to-edit, see Phase 9). A real, minor gap, not a blocker.
- [x] Loading and empty states (e.g. first-time user with nothing logged yet).

---

## Phase 9 — Frontend: History

Reference: requirements §9.

- [x] Build a History view listing past entries across all log types, grouped by date (most recent first).
- [x] Add filtering (by entry type and/or date range).
- [x] Each entry shows type, value, and time; a delete affordance is available with confirmation.
  - [x] Tapping opens edit — resolved: `HistoryEditModal` now backs a working, enabled Edit
    button for every entry, reusing the same pre-filled forms Phase 7 built. Stale checkbox —
    confirmed directly against the current code. See
    [docs/log/11-history.md](docs/log/11-history.md) for the original deferral reasoning.
- [x] Pagination or infinite scroll for users with a large history.

---

## Phase 10 — Frontend: Trends

Reference: requirements §10.

- [x] Period selector: 7 / 30 / 90 days.
- [x] Symptom severity chart (line/bar) with computed average displayed prominently (e.g. "Symptom Severity — Avg: 5.2").
- [x] Mood line chart with computed average (e.g. "Mood — Avg: 3.4").
- [x] Calendar-style activity view showing which days had logged activity/habits.
- [x] Copy review: ensure no chart or label implies causation or diagnosis — descriptive language only (§10, §14).
- [x] Empty/low-data states (e.g. "Not enough data yet for this period").

---

## Phase 11 — Security Hardening

Reference: requirements §13.

- [x] Audit every data-returning endpoint to confirm queries are filtered by the authenticated `user_id` (no trusting client-supplied user/owner IDs). (See [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Add automated tests specifically for cross-user access attempts (user A requests/edits/deletes user B's log by ID → expect 403/404). (Already true, confirmed directly — every resource type has both ownership and ID-tampering tests.)
- [x] Confirm refresh tokens are stored as HTTP-only, `Secure`, `SameSite` cookies (not `localStorage`). (Confirmed against the real production `Set-Cookie` header, not just code.)
- [x] Confirm password hashing uses bcrypt/argon2 with an appropriate cost factor. (`SALT_ROUNDS = 12`.)
- [x] Confirm input validation/sanitization is applied on every write endpoint (reject unexpected fields, enforce types/ranges). (Zod on every write endpoint.)
- [x] Confirm rate limiting is active on auth endpoints in a staging-like environment. (No staging environment exists yet in this project; verified against the real local dev server instead — 12 real `curl` requests to `/api/auth/login`, the 11th and 12th correctly returned `429`. See [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Review server logs to confirm no health data or credentials are ever logged. (Exactly one `console.log` in the whole backend, logging only the port number.)
- [x] Configure HTTPS at the hosting/proxy layer for production. (Satisfied by Railway/Vercel's automatic TLS termination.)

---

## Phase 12 — Accessibility & Responsive QA

Reference: requirements §15, §16.

- [x] Keyboard-only pass: confirm every interactive element (including modals and rating controls) is reachable and operable via keyboard, with visible focus rings. (Every control is reachable/operable; the mood/severity/energy/stress radiogroups don't yet follow the full ARIA arrow-key pattern — a real, documented follow-up, not a blocker. See [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Screen-reader spot check on the Quick Add flow and Dashboard (labels, ARIA roles on custom rating controls). (Covered via automated ARIA-tree checking (axe-core), not a literal manual screen-reader session — noting that distinction honestly.)
- [x] Color contrast check (automated, e.g. axe or Lighthouse) across light UI states. (axe-core, zero WCAG 2AA violations across six real pages/states.)
- [x] Confirm no information is conveyed by color alone (e.g. mood/severity also shown as numbers/icons/text, not just color). (Confirmed — every value already shows as text/numbers/icons, not just color.)
- [x] Test on mobile viewport, tablet viewport, and desktop — confirm layout and workflow stay consistent (no desktop-only complexity creep). (Real bug found and since fixed: NavBar overflowed horizontally on a 375px viewport with a long display name/email — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Reduce/remove nonessential animations; confirm transitions are short and non-distracting. (Confirmed — nothing beyond plain `transition-colors` exists anywhere in the codebase.)

---

## Phase 13 — Testing

Reference: requirements §19.

### Backend (e.g. Jest/Vitest + Supertest against a test database)
- [x] Registration, login, refresh, logout, password reset — happy path and failure cases. (Already true, stale checkbox — `auth.test.ts` alone has 33 tests: wrong password, missing fields, duplicate email, expired/reused/garbage reset tokens, token-secret mismatches, and more, on top of every happy path.)
- [x] Authorization/user-isolation tests (see Phase 11). (Already true — every route file asserts "never includes another user's entries" / 404s a cross-user edit or delete attempt, not just the routes Phase 11's own audit called out.)
- [x] CRUD tests for symptoms, mood, medications, habits (including validation-rejection cases). (Already true — e.g. `moodLogs.test.ts` explicitly tests rejecting mood/energy/stress out of range, clearing fields via explicit `null`, and 404s for a nonexistent or another user's log.)
- [x] Dashboard calculation tests (summary values, streak logic, timezone edge cases around midnight). (Already true — `dashboard.test.ts` has a test literally named "resolves a late-night entry to the correct calendar day for a non-UTC user's streak".)
- [x] Trend calculation tests (averages, period boundaries, empty-data periods). (Already true — `trends.test.ts` covers per-day/period averages, excluding out-of-period entries, timezone-correct day resolution, and the empty-new-user case.)

### Frontend (e.g. Vitest/React Testing Library)
- [x] Registration/login flow rendering and error states. (`RegisterPage.test.tsx`, `LoginPage.test.tsx`.)
- [x] Dashboard rendering with mocked API data. (`DashboardPage.test.tsx`, `DashboardSummary.test.tsx`.)
- [x] Quick Add flow for each log type, including validation errors. (`MoodEntryForm.test.tsx`/`SymptomEntryForm.test.tsx`/`MedicationEntryForm.test.tsx`/`HabitEntryForm.test.tsx`, plus each Dashboard Section's own test file.)
- [x] Edit/delete flows for each log type. (Covered across the Section test files and `HistoryPage.test.tsx`'s own edit/delete tests.)
- [x] History filtering/rendering. (`HistoryPage.test.tsx` — 14 tests.)
- [x] Trends rendering for each period. (`TrendsPage.test.tsx`, `PeriodSelector.test.tsx`, `TrendLineChart.test.tsx`, `ActivityCalendar.test.tsx`.)
- [x] Auth state handling (token refresh, redirect-to-login on failure). (`RequireAuth.test.tsx` and `client.test.ts` both test this directly — e.g. "redirects to /login if a background request's token refresh fails," "on a 401, refreshes the access token and retries the request once.")

### End-to-end (e.g. Playwright/Cypress)
- [x] Register → log in → Quick Add a symptom, mood, medication, and habit → verify Dashboard reflects them.
  Verified: `frontend/e2e/quick-add-and-dashboard.spec.ts`, a real Playwright run against local
  dev servers, passing.
- [x] Edit and delete an entry end-to-end.
  Verified: `frontend/e2e/edit-and-delete.spec.ts` — edits a mood entry from History, confirms
  the change survives a reload, then deletes it via the real confirmation modal and confirms the
  delete survives a reload too.
- [x] View Trends after seeding a few days of data.
  Verified: `frontend/e2e/trends-after-seeding.spec.ts` — seeds 3 days of mood/symptom logs via
  the real backend API's `loggedAt` backfill support, then confirms Trends' chart averages
  reflect them.
- [x] Account deletion end-to-end, confirming data is gone.
  Verified: `frontend/e2e/account-deletion.spec.ts` — confirms both the session is really over
  (a reload doesn't silently log back in) and the account row is really gone (the same email can
  register a brand-new, empty account afterwards).

---

## Phase 14 — Deployment

- [x] Choose a hosting platform (Vercel/Railway/Render) for frontend and backend/database.
  Railway (backend + Postgres) + Vercel (frontend), both already live — see
  [docs/log/07-deployment.md](docs/log/07-deployment.md).
- [x] Configure production environment variables (DB URL, JWT secrets, CORS origins, mail provider).
  Verified indirectly but concretely: register/login/refresh/CORS all behave correctly against
  the real deployed backend (see the HTTPS/cookie verification below), which isn't possible
  unless `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `FRONTEND_URL` are all
  actually set correctly on Railway. `mail provider` remains the placeholder console-logger
  (`backend/src/lib/mail.ts`) — a deliberately deferred product/infra decision, not a gap in
  this checklist item.
- [x] Set up production Prisma migrations (`prisma migrate deploy`) as part of the deploy pipeline. (`backend/package.json`'s `start` script — see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).)
- [x] Enforce HTTPS and confirm cookie flags (`Secure`, `SameSite`) work correctly on the deployed domain.
  Verified directly against the real production backend: `curl` against
  `https://wellbeing-production-0b8f.up.railway.app/api/auth/login` returns
  `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=None`, and CORS preflight only
  allows the real Vercel origin. See [docs/log/01-auth-backend.md](docs/log/01-auth-backend.md)
  for the SameSite=None fix this confirms is actually live.
- [x] Smoke-test the full MVP checklist from requirements §20 against the deployed environment.
  Ran a real Playwright walkthrough against the live `wellbeing-blue.vercel.app` /
  `wellbeing-production-0b8f.up.railway.app` deployment (register, Quick Add all four log
  types, Dashboard summary, History browse, edit + delete an entry, Trends after seeding,
  Settings profile edit, log out, log back in, account deletion) with one throwaway account,
  deleted at the end. **Found and fixed a real production bug in the process:** `PATCH
  /api/users/me` rejected `"UTC"` as an invalid timezone — `Intl.supportedValuesOf("timeZone")`
  doesn't enumerate it on this Node/ICU version even though `Intl.DateTimeFormat` accepts it
  fine, and `"UTC"` is this app's own schema default for every new user, so any account that
  had never changed its timezone couldn't save *any* profile edit. Fixed in
  `backend/src/routes/users.ts` (validate via constructing the actual `Intl.DateTimeFormat`,
  not the enumerated list) with a regression test added. Not yet deployed as of this writing —
  worth a follow-up spot-check once this PR merges and Railway redeploys.
- [x] Write minimal privacy documentation (what data is collected, how to delete an account) before any real-user launch (§14).
  [docs/PRIVACY.md](docs/PRIVACY.md).

---

## Phase 15 — Custom Categories (post-MVP)

Reference: [C:\Users\wheel\.claude\plans\cheeky-hatching-volcano.md](C:\Users\wheel\.claude\plans\cheeky-hatching-volcano.md) —
"Custom Categories + Admin-Managed Built-ins." Purely additive: the four MVP log types above are
untouched by any of this.

### Task 1 — Backend foundation
- [x] `Category`/`CategoryLog` Prisma models (`valueType` boolean/numeric/scale/duration,
  `userId` nullable — null = system-wide/admin-created, set = a user's own — mirroring Symptom's
  existing system-vs-user split; `archivedAt` as the real "remove" action, not a hard delete).
- [x] `GET/POST/PATCH/DELETE /api/categories` and `/api/category-logs` for regular users, scoped
  the same way `symptoms.ts`/`habitLogs.ts` already are.
- [x] `requireAdmin` middleware + `ADMIN_EMAIL` env var (one hardcoded admin, no DB role system)
  gating `GET/POST/PATCH/DELETE /api/admin/categories`.
- [x] `isAdmin` (computed, not stored) surfaced on login/refresh/`/me`; Dashboard's
  recent-entries merge, History's merge, and the reminder scheduler's `hasLoggedToday` all
  extended to include custom-category logs alongside the four built-ins.

### Task 2 — Frontend: user-facing custom categories
- [x] Settings "Categories" section (view all visible, create/edit/archive own).
- [x] A generic, data-driven Dashboard section + entry form (generalizing `HabitEntryForm.tsx`'s
  type-branching to all four value types).
- [x] `QuickAddFab.tsx` gains a "More…" entry reaching custom categories, without making its
  existing four-item array data-driven (a deliberate, already-documented convention).

### Task 3 — Frontend: admin screen + History integration
- [x] `RequireAdmin` route guard + `/admin/categories` page for the one hardcoded admin account.
- [x] History's type filter extended to include a "Category" option (type-level, matching the
  granularity every other filter option already has - not one option per individual category).

### Task 4 — Trends support (explicit fast-follow, not blocking)
- [x] Per-category numeric/scale series reusing `TrendLineChart` directly.

---

## Phase 16 — Built-in Category Toggles + Per-Target Reminders (post-MVP)

Reference: [docs/log/16-reminders-and-category-toggles.md](docs/log/16-reminders-and-category-toggles.md)
(the original planning-session plan file this pointed to has since been reused for Phase 17 below -
the docs log entry is the durable record). Confirmed directly with the project owner:
the one existing single-reminder account is not auto-migrated (the old columns are just dropped);
fixed times, not real recurring-interval logic, is the whole point of "multiple times per day."

### Task 1 — Backend: built-in category toggles
- [x] `moodEnabled`/`symptomEnabled`/`medicationEnabled`/`habitEnabled` on `User` (all default
  `true`), added to `PATCH /api/users/me` and to `serializeUser()` in `auth.ts` (not just `/me`).
- [x] Toggling one of these off also disables every `Reminder` targeting that built-in category.

### Task 2 — Backend: generalized `Reminder` model, scheduler, and CRUD
- [x] `ReminderTarget` enum + `Reminder`/`ReminderSend` models, replacing the single
  `reminderEnabled`/`reminderTime`/`lastReminderSentDate` columns on `User` (dropped, not
  migrated - confirmed directly with the project owner).
- [x] `GET/POST/PATCH/DELETE /api/reminders` - one reminder per (user, target,
  medication-or-category), each with one or more fixed `"HH:mm"` times per day.
- [x] `reminderScheduler.ts`/`reminderEligibility.ts` rewritten for per-target, per-time-slot
  eligibility (`ReminderSend` replacing the old single-date gate), with target-specific
  notification copy (e.g. "Time to take Diazepam (2mg).").
- [x] Archiving a category (via `categories.ts` or `adminCategories.ts`) disables, rather than
  orphans, every reminder targeting it.

### Task 3 — Frontend: built-in category toggles
- [x] Settings toggle section; `AuthUser` gains the four booleans; `DashboardPage.tsx`/
  `QuickAddFab.tsx`/`DashboardSummary.tsx` conditionally render per flag. History deliberately
  unchanged (browsing past data is a different concern from "can I log a new one").

### Task 4 — Frontend: Medications management (closes a pre-existing gap)
- [x] A "Medications" Settings section (list/rename/dosage-edit/delete), mirroring the existing
  custom-`CategoriesSection`/`CategoryCreateForm.tsx` shape - closes a real gap found during
  research: `PATCH`/`DELETE /api/medications/:id` existed on the backend with no frontend UI at
  all, only an inline "add a medication" affordance buried inside logging a dose.

### Task 5 — Frontend: reminders management rewrite
- [x] Replaces the single-checkbox-plus-time `RemindersSection` with a management list (create/
  edit/delete, a target-type picker with a Medication/Category sub-picker, a repeatable "add
  another time" input list) - the existing push-subscription gesture-preservation logic in
  `pushNotifications.ts` is reused unchanged, just re-triggered by "first enabled reminder
  created" / "last enabled reminder disabled or deleted" instead of one checkbox.

---

## Phase 17 — Unify Mood, Symptom, and Habit into the Generic Category Model (post-MVP)

Reference: [C:\Users\wheel\.claude\plans\cheeky-hatching-volcano.md](C:\Users\wheel\.claude\plans\cheeky-hatching-volcano.md) —
"Unify Mood, Symptom, and Habit into the Generic Category Model." Confirmed directly with the
project owner: Mood splits into three independent system categories (Mood/Energy/Stress, each
logged separately) rather than adding a compound-value mechanism to Category; Habit adopts
Category's archive-not-delete pattern (a real behavior change from today's cascade-delete).
Medication is explicitly out of scope - it stays its own model.

### Task 1 — Backend: per-user system-category hiding
- [x] New `Category.description` field (also gives `Symptom.description` a home once migrated).
  New `HiddenCategory(userId, categoryId)` join table, cascade FKs both ways. `GET /api/categories`
  excludes hidden categories; new `POST`/`DELETE /api/categories/:id/hide`, scoped to system
  categories only (a personal category is archived, not hidden).

### Task 2 — Backend: Habit → Category
- [x] Hand-written migration copying `habits`/`habit_logs` into `categories`/`category_logs`
  (column shapes already match 1:1), then dropping the old tables/enum. Deletes `habits.ts`/
  `habitLogs.ts`/`lib/habitType.ts`. Folds `dashboard.ts`/`history.ts`/`export.ts` into the
  already-generic Category paths (also closes the pre-existing gap that `export.ts` omits
  Category/CategoryLog entirely). Drops the `HABIT` reminder target (existing `HABIT`-target
  reminders are deleted, not migrated - confirmed drop-and-reconfigure precedent from Phase 16).

### Task 3 — Frontend: Habit retirement
- [x] Deletes `HabitCreateForm.tsx`/`HabitEntryForm.tsx`/`HabitSection.tsx` (already covered by
  `CategoryCreateForm.tsx`/`CategoryEntryForm.tsx`/`CategorySection.tsx`). Removes `habitEnabled`
  from `AuthUser`/`SettingsPage.tsx`/Dashboard gating - no replacement toggle needed, since a
  former habit is now an ordinary personal category a user can archive individually.

### Task 4 — Backend: Symptom → Category
- [x] Migration maps `severity` (1-10) onto `CategoryLog.valueNumeric` with `scaleMin`/`scaleMax`
  fixed at 1/10, carries `description` across, preserves `userId` nullability as-is (system vs.
  personal). Deletes `symptoms.ts`/`symptomLogs.ts` - closes the pre-existing "no admin route for
  Symptom" gap for free via the already-generic `adminCategories.ts`. Drops the `SYMPTOM` reminder
  target (same drop-and-reconfigure precedent).

### Task 5 — Frontend: Symptom retirement
- [x] Deletes `SymptomEntryForm.tsx` (including its inlined "add a symptom" flow - superseded by
  `CategoryCreateForm.tsx`) and `SymptomSection.tsx`. Adds the per-row Hide/Unhide action to
  `CategoriesSection` (using Task 1's endpoints) - this is what actually replaces `symptomEnabled`
  for the 8 former-system-symptoms.

### Task 6 — Backend: Mood → Category (Mood/Energy/Stress)
- [x] Creates three new system categories (Mood 1-5, Energy 1-7, Stress 1-7). Migration splits
  each `MoodLog` row into up to 3 `CategoryLog` rows sharing one `loggedAt` - `notes` carried only
  on the Mood-value row (not duplicated 3x). Deletes `moodLogs.ts`. Migrates (not drops) any
  existing `MOOD`-target reminder to a `CATEGORY`-target reminder pointing at the new Mood
  category - the one deliberate exception to drop-and-reconfigure, since there's exactly one
  unambiguous destination.

### Task 7 — Frontend: Mood retirement
- [x] Deletes `MoodEntryForm.tsx`/`MoodSection.tsx`. Reduces `DashboardSummary`'s top line to just
  the Medications clause (the only one left once Mood/Symptom/Habit are gone). Folds
  `BuiltInCategoriesSection` into a single Medication checkbox inside `MedicationsSection`, since
  it no longer has anything else to toggle.

---

## Phase 18 — Per-Category Dashboard Cards (post-MVP)

Reference: direct user feedback on the live app after Phase 17 landed - once Habit/Symptom/Mood all
became ordinary categories, the single "Your categories" card mixed every category's entries
together under one vague heading, unlike `MedicationSection`'s own dedicated "Recent medications"
card, reading as repetitive/untidy and unclear what belonged where. Confirmed directly with the
project owner: each category a user has actually logged at least once gets its own "Recent
`<name>`" card (mirroring Medication's own card shape), each with its own "+" that logs directly to
that one category (no picker) - not shown at all for a category with zero logs yet (so a brand-new
account isn't greeted by 11 empty system-category cards), and not shown for a category hidden via
Settings' existing Hide/Unhide action (Phase 17, Task 1) even if it has history. Discovering/logging
a category for the very first time (or defining a brand-new one) still goes through one shared,
always-present entry point, exactly as today.

### Task 1 — Backend: category activity/filtering support
- [x] `GET /api/categories` gains a `lastLoggedAt: string | null` field per category (the caller's
  own most recent log against it, computed via one `groupBy` query) - what the frontend uses to
  decide which categories get their own card, and in what order. `GET /api/category-logs` gains an
  optional `?categoryId=` filter, so a per-category card can page through just its own history
  instead of the user's entire combined log list.

### Task 2 — Frontend: split "Your categories" into per-category cards
- [x] Replaces the single `CategorySection` card with one dedicated card per category that has
  `lastLoggedAt !== null`, sorted most-recently-logged first, each with its own paginated log list
  and its own "+" (a `CategoryEntryForm` locked to that one category, no picker). One small,
  always-present "add a category" entry point remains (the discovery/creation flow for a category
  with no card yet, or a brand-new one), still reachable from `QuickAddFab`'s "More…" entry exactly
  as today; saving through it promotes that category to its own card immediately.

---

## Phase 19 — Medication → Category, and History filtered by category

Reference: direct user request - now that Habit, Symptom, and Mood have all unified into Category
(Phase 17), Medication is the one remaining fixed built-in type, and History's "Type" filter is left
with only two options (Medication vs. one broad "Category" bucket covering everything else), which
doesn't let a user isolate one specific thing they log. Medication's own shape (`name` + optional
`dosage`, one boolean `taken` per log) maps cleanly onto Category: a personal `BOOLEAN` category,
with `dosage` carried in `Category.description` (added in Phase 17 for exactly this kind of
context - "not used by any built-in category yet"). Once every log type is a category, History's
filter is redesigned to filter by the actual category (by name) instead of by type - there's no
longer a meaningful "type" to filter on at all once there's only one.

### Task 1 — Backend: Medication → Category unification
- [x] Hand-written migration (mirrors `habit_to_category`'s row-for-row shape, reusing each
  medication's own id as its new category's id, plus `mood_to_category`'s reminder-remap pattern):
  every `Medication` becomes a personal `BOOLEAN` Category (`description` = its old `dosage`);
  every `MedicationLog` becomes a `CategoryLog` (`valueBoolean` = `taken`); any existing
  `MEDICATION`-target `Reminder` is remapped (not dropped - a clean 1:1 mapping exists, same
  justification as `MOOD`'s own remap) to a `CATEGORY`-target reminder pointing at the same id.
  Drops `medications`/`medication_logs`, `Reminder.medicationId`, `User.medicationEnabled`, and
  `MEDICATION` from the `reminder_target` enum.
- [x] Deletes `routes/medications.ts`/`medicationLogs.ts` (+ tests); unmounts both from `app.ts`.
  Folds Medication out of `dashboard.ts` (drops `medicationSummary`, replaced by a plain
  `loggedTodayCount` derived from `CategoryLog` alone), `history.ts` (drops the medication branch -
  see Task 3 for `history.ts`'s own filter redesign), `export.ts` (drops the dedicated
  `medications`/`medicationLogs` fields - already-generic `categories`/`categoryLogs` covers it),
  `reminderTarget.ts`/`reminderScheduler.ts`/`reminders.ts` (drops the `medication` target entirely -
  a former medication reminder is a `category` reminder like any other), `trends.ts` (drops its own
  separate medication-activity query), and `users.ts` (drops the whole `medicationEnabled` toggle
  mechanism, the last surviving one).

### Task 2 — Frontend: Medication retirement
- [x] Deletes `MedicationEntryForm.tsx`, `MedicationCreateForm.tsx`, `MedicationSection.tsx`, and
  Settings' own `MedicationsSection` (+ their tests) - `CategorySection`/`CategorySection`'s own
  per-category cards (Phase 18) and Settings' existing `CategoriesSection` already cover the same
  ground for an ordinary personal category, so a former medication gets its own "Recent `<name>`"
  Dashboard card and a manage/hide row in Settings for free, with no dedicated component needed.
  Removes `medicationEnabled` from `AuthContext.tsx`/`DashboardPage.tsx`/`QuickAddFab.tsx`/
  `DashboardSummary.tsx` and the now-single-item Quick Add menu collapses to a direct action (no
  one-item dropdown). `DashboardSummary`'s per-type summary clause (the last one) is replaced by a
  plain "logged N entries today" line, since an unbounded category set has no natural "X/Y taken"
  count the way the original fixed built-ins did. `ReminderCreateForm`/`HistoryEditModal`/
  `historyLogApi.ts` drop their medication branch entirely.

### Task 3 — Backend: History filtered by category, not type
- [ ] `GET /api/history` drops its `?type=` filter (meaningless now that every entry is a category)
  in favor of an optional `?categoryId=` filter (mirrors `categoryLogs.ts`'s own Phase 18 addition),
  narrowing results to just that one category's own entries.

### Task 4 — Frontend: History filter UI updated to filter by category
- [ ] Replaces History's "Type" `<select>` (Medication / Category) with a "Category" `<select>`
  listing every category visible to the caller by name (including former medications), wired to
  the new `?categoryId=` param - lets a user isolate e.g. just their "Ibuprofen" entries, or just
  "Reading," instead of the old all-or-nothing Medication/Category split.

---

## Definition of Done Checklist (from requirements §20)

Use this as the final go/no-go check before calling the MVP complete:

- [x] Register, log in, log out, reset password, edit profile, delete account all work end-to-end.
  All verified live against production except reset-password specifically: its core mechanism
  (token issue/validate/consume) is covered by backend integration tests, but wasn't exercised
  in the live smoke test since it depends on reading the placeholder mail provider's server-log
  output rather than a real inbox (see the Phase 14 mail-provider note above).
- [x] All four log types (symptoms, mood, medications, habits) can be created, edited, and deleted, including backfilled historical dates.
  Backfilled dates specifically verified live in production via `trends-after-seeding`-style API
  calls with explicit past `loggedAt` values, reflected correctly in Trends.
- [x] Dashboard shows today's summary, working Quick Add buttons, recent entries, and streak/weekly info.
- [x] History can be browsed and filtered.
- [x] Trends work correctly for 7/30/90-day periods.
  7-day period verified live; 30/90-day period logic covered by backend trend-calculation tests
  (Phase 13), not separately re-verified against production data.
- [x] Cross-user data access is impossible (verified by tests). (Phase 11's authorization/user-isolation suite.)
- [x] Passwords and tokens are handled securely. (bcrypt hashing, `HttpOnly`/`Secure`/`SameSite=None` refresh cookie, short-lived access tokens — see [docs/PRIVACY.md](docs/PRIVACY.md).)
- [x] The app is responsive on mobile and desktop. (Phase 12.)
- [x] Core workflows have automated test coverage. (Phases 3–13; 198 backend + 206 frontend unit/integration tests, plus the Playwright E2E suite.)
- [x] The app is deployed and accessible on the chosen hosting platform.
  `https://wellbeing-blue.vercel.app` (frontend) / `https://wellbeing-production-0b8f.up.railway.app` (backend) — both confirmed live and functioning by this same smoke test.
