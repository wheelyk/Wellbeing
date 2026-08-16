# Housekeeping & Audits

## 2026-08-16 — Reconciling Tasks.md/requirements.md with reality, and adding "change password"

**Task:** Not a single [Tasks.md](../../Tasks.md) checklist item — a two-part request: (1) audit
`Tasks.md` against what's actually been built and check off anything genuinely done but not
yet marked, and (2) add a "change password" capability (distinct from the existing, unbuilt
"forgot password" email-reset flow) as new tracked tasks, since the app now has two real users.

### Background / concepts

#### "Change password" vs. "forgot password" — two genuinely different features

- **Forgot password** (already in `Tasks.md`, still unbuilt): for someone who's *logged out*
  and doesn't remember their password — requests a reset link by email, clicks it, sets a new
  password without ever proving they knew the old one. This is why it fundamentally needs a
  real transactional email service in production; there's no other way to prove "this really is
  the account owner" for someone who isn't authenticated.
- **Change password** (new): for someone who's *already logged in* and simply wants to update
  their password — provides their *current* password (proving they're genuinely the account
  owner via something they already know, not an email link) plus a new one. This needs zero
  email infrastructure, which is exactly why it was chosen as the practical next step over
  building out forgot-password first.
- Both are real, distinct requirements — `requirements.md` §5.1 previously only listed the
  forgot/reset flow; added "Change their password while logged in, by providing their current
  password and a new one" as its own bullet, and `Tasks.md` gained matching backend
  (`POST /api/auth/change-password`) and frontend (Settings page form) checklist items.

#### The audit: three items were genuinely done but still showed as unchecked

- **`.env.example` files + `.env` in `.gitignore`** (Phase 0) — both example files exist
  (confirmed directly, not assumed) and the root `.gitignore` already covers `.env`. Checked
  off.
- **CORS configuration restricting allowed origins** (Phase 2) — this was built and verified
  live in production during the deployment work (`cors({ origin: FRONTEND_URL, credentials:
  true })`, extensively covered in the earlier FRONTEND_URL/CORS entries) but the checklist
  item was never marked, since that work happened organically during deployment rather than as
  its own dedicated Tasks.md-tracked task. Checked off, with a pointer back to those entries.
- **No plain-text password/health data in logs** (Phase 2) — audited directly rather than
  assumed: `grep -rn "console\." backend/src` turns up exactly one line, in `index.ts`, logging
  only the port number. Register/login responses already have dedicated tests confirming
  `passwordHash` is never present in a response body. Checked off.
- **Root `README.md`** (Phase 0) — a README did exist, but its "Running locally" section still
  had Phase-0-era placeholder wording ("Scaffolding... is added in later setup tasks... Once in
  place, local setup will be:") — technically present, but describing a *future* state rather
  than the app as it actually exists now. Rewritten with the real, current steps (`docker
  compose up -d`, the actual `.env.example` contents, `npx prisma migrate dev`, live URLs) and
  checked off only once accurate — not before.
- **Left alone, deliberately:** Phase 11 (Security Hardening) and Phase 13 (Testing) items,
  even where individual pieces are already true today (e.g., refresh tokens already are
  `HttpOnly`/`Secure`/`SameSite`). Both phases are written as a holistic, one-time audit sweep
  across everything at once, not a checklist to tick opportunistically as individual pieces
  happen to already be true — checking one off in isolation now would misrepresent that the
  full, deliberate review those phases describe has actually happened.

#### A real, self-inflicted Prisma migration checksum mismatch, found while double-checking the README

- While verifying the rewritten README's setup instructions actually work (rather than just
  reading them and assuming), running `npx prisma migrate dev` locally produced: *"The
  migration `20260816095258_rescale_energy_stress_to_1_7` was modified after it was applied. We
  need to reset the 'public' schema... All data will be lost."*
- **What actually happened:** earlier today, that migration was applied locally, *then* its
  comment text was edited afterward (to correct the non-idempotency claim, per that entry).
  Prisma records a checksum — a short fingerprint computed from a migration file's exact
  contents — for every migration it applies, specifically so it can detect precisely this: a
  file that's been edited *after* being run, which could otherwise mean the database and the
  migration history have silently diverged from what the files claim happened.
- **Why this is local-only noise, not a real problem for anyone else.** Only *this* development
  machine ever ran the migration before the comment was corrected. A fresh clone (or Railway's
  production database) only ever sees the already-corrected file and applies it once — its
  recorded checksum matches its content from the very first run, no drift possible. This is a
  problem entirely of editing an already-applied file’s comment on one specific machine, not a
  reflection of anything wrong with the migration itself or the data it already correctly
  produced.
- **Why a full reset (Prisma's own suggested fix) was the wrong call here.** `prisma migrate
  reset` drops and rebuilds the entire local database from scratch — the sledgehammer response
  to "the checksum doesn't match," appropriate when there's genuine doubt about what state the
  database is actually in. Here, there was no such doubt: the migration's SQL logic hadn't
  changed at all, only a comment describing it had — so resetting would have been real,
  unnecessary work (and data loss) to fix a problem that was purely bookkeeping.
- **The actual fix: directly correct the stored checksum to match the file's real, current
  content**, rather than pretending nothing changed or nuking the database. Computed the file's
  true SHA-256 checksum (the same algorithm Prisma itself uses) with Node's built-in `crypto`
  module, then updated that one row in Prisma's own `_prisma_migrations` bookkeeping table
  directly via `psql` — `prisma migrate resolve --applied` (the first thing tried) turned out to
  be the wrong tool for this specific situation, since it's meant for migrations *not yet*
  recorded as applied, not for re-syncing the checksum of one that already is. Confirmed fixed
  immediately afterward: `prisma migrate dev` reported "Already in sync," and `prisma migrate
  status` reported "Database schema is up to date."
- **The general lesson:** editing an already-applied migration file's *comment* feels harmless
  — the actual SQL is untouched — but Prisma's checksum tracking doesn't distinguish "the SQL
  changed" from "a comment changed"; it hashes the whole file. Once a migration has been applied
  anywhere, treat the file as frozen, even down to the comments — exactly the same principle
  the earlier "why deleting a merged branch is safe" entry describes for git commits, just
  applied to a different kind of already-committed history.

### What was done

1. **`Documents/requirements.md`.** Added "Change their password while logged in, by providing
   their current password and a new one" to §5.1's capability list.
2. **`Tasks.md`.** Added `POST /api/auth/change-password` (Phase 2) and a matching Settings-page
   form item (Phase 6). Checked off four items confirmed genuinely complete: both Phase 0
   environment/README items, and two Phase 2 items (CORS, no-sensitive-logging) — each verified
   directly rather than assumed, as detailed above.
3. **`README.md`.** Rewrote the stale "Running locally" section to match the app's real, current
   setup (`docker compose up -d`, actual `.env.example` contents, the `npx prisma migrate dev`
   step `npm run dev` doesn't do automatically, live deployment URLs) — verified by actually
   running the documented steps, not just reading them.
4. **Fixed a real local Prisma migration-checksum mismatch**, discovered specifically because
   the README's instructions were being tested for real rather than trusted on sight — detailed
   above.
5. **`npm run build`, `npm test` (34/34)** — confirmed clean after the checksum fix, same as
   before it (no application code changed in this task, only docs and one bookkeeping row).

### Why it's needed

Two different problems, both about a project staying trustworthy as it grows: stale checklists
and a stale README quietly erode confidence in whether *any* of the tracking documents reflect
reality, and an un-diagnosed migration checksum error would have blocked all future local
development on this machine the next time a migration was touched.

### Decisions

- **Change password before forgot password**, and both added as separate, honestly-scoped
  tasks rather than one combined "password reset" item — covered in detail above.
- **Only checked off Tasks.md items with direct, individual confirmation** — not the two
  holistic audit phases (11, 13), even where some of their content happens to already be true.
- **Fixed the checksum via a direct, targeted correction, not a full database reset** — the
  problem was bookkeeping, not data integrity, so the fix matched that scope exactly.

### State at end of this step

`Tasks.md` and `requirements.md` now accurately reflect both what's built and what's newly
planned. The README's setup instructions were verified to actually work, not just assumed
correct. The local Prisma migration history is back in sync with the actual migration files.

### Verification

- Directly audited (not assumed) every item checked off: `.env.example` file existence,
  `.gitignore` contents, the live CORS configuration, a full `console.*` grep of the backend.
- Actually ran the rewritten README's setup steps against this real local environment —
  `docker compose version`, `npx prisma migrate dev`, `npm run dev` — rather than only reading
  them for plausibility.
- `npx prisma migrate dev` → "Already in sync"; `npx prisma migrate status` → "Database schema
  is up to date" — confirmed the checksum fix directly, not assumed from the `UPDATE` succeeding.
- `npm run build`, `npm test` (34/34) — unchanged, confirming no application behavior shifted.

---
