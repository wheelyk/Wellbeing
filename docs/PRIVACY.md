# Privacy Documentation

Covers requirements §14 ("Privacy Requirements"). Written ahead of any real-user launch, as
that section requires — WellTrack currently has no real users or real health data in it; every
account that has ever existed in the deployed database has been a throwaway test/diagnostic
account, created and deleted in the course of building and verifying the app (see
[IMPLEMENTATION_LOG.md](../IMPLEMENTATION_LOG.md) and [docs/log/](log/) for the specifics).

This document describes what the app actually does today, not aspirational policy — every claim
below is backed by a specific file in this repository, referenced inline.

## What data WellTrack collects

**Account data**, provided directly by the user at registration/in Settings:
- Email address (used only to identify the account and for auth — see `backend/prisma/schema.prisma`'s `User` model).
- Password — never stored directly; only a bcrypt hash (`backend/src/routes/auth.ts`).
- Display name and timezone.

**Health data**, logged directly by the user, one row per entry:
- Mood entries: a 1–5 mood rating, optional energy/stress ratings (1–7), optional free-text notes, and the date/time logged.
- Symptom entries: which symptom, a 1–10 severity rating, optional notes, date/time.
- Medication entries: which medication, whether it was taken, optional notes, date/time.
- Habit entries: which habit, a value appropriate to that habit's type, optional notes, date/time.

**Nothing else is collected.** There is no location data, no device fingerprinting, no analytics
SDK of any kind, and no tracking cookie. The only cookie WellTrack sets is a single `HttpOnly`
refresh-token cookie, scoped to `/api/auth`, used purely to keep a login session going — never
read by JavaScript, never used to track behavior (`backend/src/lib/cookies.ts`).

## Where it's stored, and who can see it

- All data lives in a single PostgreSQL database (currently hosted on Railway), reached only by
  WellTrack's own backend — the database itself is never exposed directly to the internet (see
  [docs/log/07-deployment.md](log/07-deployment.md)'s "why the database should never be made
  publicly reachable" entry).
- Every log/read/update/delete endpoint scopes its query to the authenticated user's own `userId`
  — a user's data is never visible to, or editable by, any other account. This is covered by
  this project's own authorization/user-isolation test suite (Phase 11), not just an
  unenforced assumption.
- Passwords are never stored, logged, or returned by any API response in plain text — confirmed
  directly by audit, not just by design (see the Phase 2 checklist in
  [Tasks.md](../Tasks.md)).

## Third parties

- **No analytics of any kind** — no Google Analytics, no product-analytics SDK (Mixpanel,
  PostHog, Amplitude, etc.), nothing from Vercel or Railway's own optional analytics add-ons.
  Verified directly: there is no analytics script, tag, or package anywhere in
  `frontend/` or `backend/`.
- **No advertising** — WellTrack has no ad integration, and health data is never used for ad
  targeting of any kind, on this app or elsewhere.
- **No data is sold or shared** with any third party for any purpose.
- The only outside services involved are the hosting platforms themselves (Railway for the
  backend + database, Vercel for the frontend) — infrastructure providers that run the app,
  not services WellTrack sends user data *to* for their own separate purposes.

## Deleting your account

Settings → "Delete account" permanently and immediately deletes the account row and *every*
associated record — every mood, symptom, medication, and habit entry, and any custom symptoms,
medications, or habits the account created. This is enforced at the database level (every
related table has `onDelete: Cascade` in `backend/prisma/schema.prisma`), not just an
application-level loop that could miss a table — confirmed directly by querying every table
after a real test deletion, not just trusting the API's 200 response (see the Phase 2 checklist
in [Tasks.md](../Tasks.md)).

There is no "soft delete," recovery window, or backup copy retained after this — deletion is
final.

## How long data is kept

For as long as the account exists. There is no automatic expiry, and no data is retained after
an account is deleted (see above).

## Exporting your data

Settings → "Download my data" produces a single JSON file containing every mood, symptom,
medication, and habit entry logged, along with the account's own symptom/medication/habit
definitions (`backend/src/routes/export.ts`) — available at any time, not just before deletion.

## Security measures already in place

- Passwords hashed with bcrypt before storage, never logged.
- Short-lived signed access tokens (15 minutes) plus a longer-lived, rotated refresh token
  stored in an `HttpOnly`, `Secure`, cookie — not readable by JavaScript, so it can't be
  exfiltrated by a script-injection bug the way a token stored in `localStorage` could be.
- Rate limiting on registration, login, and password-change endpoints, to blunt
  credential-guessing attempts (`backend/src/middleware/rateLimiter.ts`).
- All production traffic is served over HTTPS; the refresh-token cookie's `Secure` flag means
  browsers refuse to send it over a plain, unencrypted connection at all.

## What isn't in place yet, honestly

- No dedicated Data Processing Agreement or formal breach-notification process — appropriate for
  a pre-launch MVP with no real users yet, but worth revisiting the moment that changes (see
  the UK GDPR/ICO discussion in
  [docs/log/07-deployment.md](log/07-deployment.md)).
- No named data controller/contact address is published yet — needed before any real user's
  data is genuinely collected, not needed for a personal MVP with only throwaway test accounts.
