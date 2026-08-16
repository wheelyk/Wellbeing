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
- [ ] Define `Medication` model: `id`, `user_id`, `name`, `created_at`.
- [ ] Define `MedicationLog` model: `id`, `user_id`, `medication_id`, `taken (boolean)`, `notes (optional)`, `logged_at`.
- [ ] Define `Habit` model: `id`, `user_id`, `name`, `type (boolean | numeric | duration)`, `created_at`.
- [ ] Define `HabitLog` model: `id`, `user_id`, `habit_id`, `value (shape depends on habit type)`, `notes (optional)`, `logged_at`.
- [ ] Add appropriate foreign keys, indexes (especially on `user_id` + `logged_at` for query performance), and cascading deletes so removing a `User` removes all associated logs.
- [ ] Store `logged_at` as a timestamp with timezone (`timestamptz`) and always compute "which calendar day" using the user's stored `timezone`, not server time.
- [ ] Write and run the initial Prisma migration.
- [x] Seed the database with a small set of system-default symptoms (e.g. Headache, Fatigue, Nausea) where `user_id` is null.

---

## Phase 2 — Authentication & User Profile

Reference: requirements §5, §13.

- [x] Implement `POST /api/auth/register` — validate email format + password strength, hash password with bcrypt/argon2, create user.
- [x] Implement `POST /api/auth/login` — verify credentials, issue short-lived JWT access token + longer-lived refresh token.
- [x] Implement refresh token storage/rotation strategy (e.g. HTTP-only secure cookie for the refresh token) and `POST /api/auth/refresh`.
- [x] Implement `POST /api/auth/logout` — invalidate/clear the refresh token.
- [x] Implement `POST /api/auth/change-password` — for a logged-in user; requires the current password to be re-verified before updating the hash. Needs no email provider, unlike forgot/reset password below.
- [ ] Implement `POST /api/auth/forgot-password` — generate a time-limited reset token and send a reset email (use a placeholder/mock email provider for local dev).
- [ ] Implement `POST /api/auth/reset-password` — validate the reset token and update the password hash.
- [x] Implement an Express auth middleware that verifies the access token and attaches the authenticated user to the request; use it on all protected routes.
- [ ] Implement `GET /api/users/me`, `PATCH /api/users/me` (display name, timezone), `DELETE /api/users/me`.
- [ ] On account deletion, cascade-delete (or explicitly delete in a transaction) all of the user's symptom logs, mood logs, medication/medication logs, habits/habit logs, and user-owned symptoms.
- [ ] Add rate limiting (e.g. `express-rate-limit`) to all `/api/auth/*` endpoints.
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
- [ ] `GET/POST/PATCH/DELETE /api/medications` — manage the user's medication list.
- [ ] `GET/POST/PATCH/DELETE /api/medication-logs` — record taken/not-taken status per medication per date.

### Habits
- [ ] `GET/POST/PATCH/DELETE /api/habits` — manage user-defined habits, including `type` (boolean/numeric/duration).
- [ ] `GET/POST/PATCH/DELETE /api/habit-logs` — record a value appropriate to the habit's type; validate the value shape server-side based on `type`.

### Cross-cutting for this phase
- [ ] For every log endpoint, verify the referenced `symptom_id` / `medication_id` / `habit_id` belongs to the authenticated user (or is a valid system symptom) before creating/updating a log — this is the key defense against ID-tampering (§13).
- [ ] Support backfilling: all log creation endpoints must accept an explicit `logged_at` in the past, defaulting to "now" if omitted.
- [ ] Add centralized request validation (e.g. `zod` or `express-validator`) for all request bodies.
- [ ] Add a centralized error-handling middleware returning a consistent JSON error shape (e.g. `{ error: { message, code } }`) without leaking stack traces.

---

## Phase 4 — Backend: Dashboard & Trends

Reference: requirements §7, §10, §12.7, §12.8.

- [ ] Implement `GET /api/dashboard?date=YYYY-MM-DD`, returning in one response:
  - [ ] Date (resolved using the user's timezone).
  - [ ] Today's mood (latest mood log for the day, if any).
  - [ ] Today's symptom count.
  - [ ] Today's medication summary (`taken/total`).
  - [ ] Today's habit summary.
  - [ ] A list of recent entries across all log types, sorted by time.
  - [ ] Current logging streak and count of days logged this week.
- [ ] Write the streak calculation as a pure, unit-testable function (a "day" counts as logged if at least one entry of any type exists for that calendar day in the user's timezone).
- [ ] Implement `GET /api/trends?period=7d|30d|90d`, returning:
  - [ ] Symptom severity series + average for the period.
  - [ ] Mood series + average for the period.
  - [ ] A day-by-day activity map (which days had any logged activity) for the calendar-style habit view.
- [ ] Ensure all dashboard/trend queries are scoped to `user_id` and use indexed, efficient date-range queries.

---

## Phase 5 — Frontend Foundation

- [x] Set up React Router with routes for: Login, Register, Forgot/Reset Password, Dashboard (Home), History, Trends, Settings.
- [x] Build an API client (fetch/axios wrapper) that attaches the access token, and on a 401 automatically attempts a token refresh before retrying once; on refresh failure, redirect to Login.
- [x] Build an auth context/store (e.g. React Context or a small state library) holding the current user and auth status.
- [ ] On app load, attempt a silent token refresh (using the `httpOnly` refresh cookie) to rehydrate the session, so a browser refresh doesn't log out a user whose session is still genuinely valid — found missing while testing the change-password flow (see [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md)); currently a full page reload always shows Login even with a valid refresh cookie.
- [ ] Build a bottom navigation component (Home / History / Trends / Settings) per the wireframes, visible on mobile; adapt to a top/side nav on desktop without changing the underlying workflow.
- [ ] Establish base Tailwind design tokens (colors, spacing, font sizes) for a calm, high-contrast, low-clutter UI, and reusable primitives: `Button`, `Card`, `RatingScale`, `Modal`, `TextField`, `DatePicker`.
- [ ] Ensure all interactive primitives have visible focus states and meet WCAG AA color contrast.

---

## Phase 6 — Frontend: Auth Flows

- [x] Registration page: email + password form with client-side validation mirroring backend rules; friendly inline error messages.
- [x] Login page; on success store tokens/session and redirect to Dashboard.
- [x] Logout action (clears session, calls `/api/auth/logout`).
- [x] Change password form on Settings page: current password + new password fields, calls `POST /api/auth/change-password`, with clear success/error feedback.
- [ ] Forgot password page (request reset email) and reset password page (submit new password with reset token).
- [ ] Settings page: view/edit display name and timezone; account deletion flow with a clear confirmation step (type-to-confirm or a two-step dialog) per §15.
- [x] Route guarding: unauthenticated users are redirected to Login when hitting protected routes.

---

## Phase 7 — Frontend: Logging UI (Quick Add)

Reference: requirements §6, §8.

- [ ] Build the Quick Add entry point (modal or dedicated page) shared by all four log types, clearly labelling what is being logged.
- [ ] Symptom entry form: symptom picker, large 1–10 severity control, optional notes, date/time picker (defaults to now), Save/Cancel.
- [x] Mood entry form: 5 large emoji/visual mood buttons, optional energy (1–7) and stress (1–7) controls, optional notes, date/time picker, `Save Entry` button — matching the wireframe.
- [ ] Medication entry form: medication picker (or quick "mark as taken/not taken"), optional notes, date/time picker.
- [ ] Habit entry form: input control adapts to habit type (toggle for boolean, number input for numeric, duration input for duration), date/time picker.
- [ ] Client-side validation before submit (required fields, value ranges), with clear inline error messages — no silent failures.
- [ ] Success feedback (toast/inline confirmation) on save; clear error feedback on failure.
- [ ] Edit and delete actions available from Dashboard/History for every log type, reusing the same forms pre-filled with existing values.
- [ ] Delete actions require a lightweight confirmation (per §15, destructive-action confirmation).

---

## Phase 8 — Frontend: Dashboard (Home)

Reference: requirements §7.

- [ ] Header showing today's date in the user's timezone.
- [ ] Today's summary card: mood, symptom count, medication summary (`1/2 taken`), habit summary.
- [ ] Prominent Quick Add buttons (`+ Symptom`, `+ Mood`, `+ Medication`, `+ Habit`) opening the corresponding form with minimal taps.
- [ ] Logging consistency indicator (streak + days logged this week) — informational tone, no gamified badges/pressure language.
- [ ] Recent entries list (type, value, time), each entry tappable to edit.
- [ ] Loading and empty states (e.g. first-time user with nothing logged yet).

---

## Phase 9 — Frontend: History

Reference: requirements §9.

- [ ] Build a History view listing past entries across all log types, grouped by date (most recent first).
- [ ] Add filtering (by entry type and/or date range).
- [ ] Each entry shows type, value, and time; tapping opens edit; a delete affordance is available with confirmation.
- [ ] Pagination or infinite scroll for users with a large history.

---

## Phase 10 — Frontend: Trends

Reference: requirements §10.

- [ ] Period selector: 7 / 30 / 90 days.
- [ ] Symptom severity chart (line/bar) with computed average displayed prominently (e.g. "Symptom Severity — Avg: 5.2").
- [ ] Mood line chart with computed average (e.g. "Mood — Avg: 3.4").
- [ ] Calendar-style activity view showing which days had logged activity/habits.
- [ ] Copy review: ensure no chart or label implies causation or diagnosis — descriptive language only (§10, §14).
- [ ] Empty/low-data states (e.g. "Not enough data yet for this period").

---

## Phase 11 — Security Hardening

Reference: requirements §13.

- [ ] Audit every data-returning endpoint to confirm queries are filtered by the authenticated `user_id` (no trusting client-supplied user/owner IDs).
- [ ] Add automated tests specifically for cross-user access attempts (user A requests/edits/deletes user B's log by ID → expect 403/404).
- [ ] Confirm refresh tokens are stored as HTTP-only, `Secure`, `SameSite` cookies (not `localStorage`).
- [ ] Confirm password hashing uses bcrypt/argon2 with an appropriate cost factor.
- [ ] Confirm input validation/sanitization is applied on every write endpoint (reject unexpected fields, enforce types/ranges).
- [ ] Confirm rate limiting is active on auth endpoints in a staging-like environment.
- [ ] Review server logs to confirm no health data or credentials are ever logged.
- [ ] Configure HTTPS at the hosting/proxy layer for production.

---

## Phase 12 — Accessibility & Responsive QA

Reference: requirements §15, §16.

- [ ] Keyboard-only pass: confirm every interactive element (including modals and rating controls) is reachable and operable via keyboard, with visible focus rings.
- [ ] Screen-reader spot check on the Quick Add flow and Dashboard (labels, ARIA roles on custom rating controls).
- [ ] Color contrast check (automated, e.g. axe or Lighthouse) across light UI states.
- [ ] Confirm no information is conveyed by color alone (e.g. mood/severity also shown as numbers/icons/text, not just color).
- [ ] Test on mobile viewport, tablet viewport, and desktop — confirm layout and workflow stay consistent (no desktop-only complexity creep).
- [ ] Reduce/remove nonessential animations; confirm transitions are short and non-distracting.

---

## Phase 13 — Testing

Reference: requirements §19.

### Backend (e.g. Jest/Vitest + Supertest against a test database)
- [ ] Registration, login, refresh, logout, password reset — happy path and failure cases.
- [ ] Authorization/user-isolation tests (see Phase 11).
- [ ] CRUD tests for symptoms, mood, medications, habits (including validation-rejection cases).
- [ ] Dashboard calculation tests (summary values, streak logic, timezone edge cases around midnight).
- [ ] Trend calculation tests (averages, period boundaries, empty-data periods).

### Frontend (e.g. Vitest/React Testing Library)
- [ ] Registration/login flow rendering and error states.
- [ ] Dashboard rendering with mocked API data.
- [ ] Quick Add flow for each log type, including validation errors.
- [ ] Edit/delete flows for each log type.
- [ ] History filtering/rendering.
- [ ] Trends rendering for each period.
- [ ] Auth state handling (token refresh, redirect-to-login on failure).

### End-to-end (e.g. Playwright/Cypress)
- [ ] Register → log in → Quick Add a symptom, mood, medication, and habit → verify Dashboard reflects them.
- [ ] Edit and delete an entry end-to-end.
- [ ] View Trends after seeding a few days of data.
- [ ] Account deletion end-to-end, confirming data is gone.

---

## Phase 14 — Deployment

- [ ] Choose a hosting platform (Vercel/Railway/Render) for frontend and backend/database.
- [ ] Configure production environment variables (DB URL, JWT secrets, CORS origins, mail provider).
- [ ] Set up production Prisma migrations (`prisma migrate deploy`) as part of the deploy pipeline.
- [ ] Enforce HTTPS and confirm cookie flags (`Secure`, `SameSite`) work correctly on the deployed domain.
- [ ] Smoke-test the full MVP checklist from requirements §20 against the deployed environment.
- [ ] Write minimal privacy documentation (what data is collected, how to delete an account) before any real-user launch (§14).

---

## Definition of Done Checklist (from requirements §20)

Use this as the final go/no-go check before calling the MVP complete:

- [ ] Register, log in, log out, reset password, edit profile, delete account all work end-to-end.
- [ ] All four log types (symptoms, mood, medications, habits) can be created, edited, and deleted, including backfilled historical dates.
- [ ] Dashboard shows today's summary, working Quick Add buttons, recent entries, and streak/weekly info.
- [ ] History can be browsed and filtered.
- [ ] Trends work correctly for 7/30/90-day periods.
- [ ] Cross-user data access is impossible (verified by tests).
- [ ] Passwords and tokens are handled securely.
- [ ] The app is responsive on mobile and desktop.
- [ ] Core workflows have automated test coverage.
- [ ] The app is deployed and accessible on the chosen hosting platform.
