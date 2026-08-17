# Symptom Logging

## 2026-08-16 — Phase 1: `Symptom` and `SymptomLog` models + migration + seed

**Task:** [Tasks.md](../../Tasks.md) → Phase 1 → "Define `Symptom` model: `id`, `user_id (nullable —
null = system symptom)`, `name`, `description (optional)`, `created_at`." and "Define
`SymptomLog` model: `id`, `user_id`, `symptom_id`, `severity (1–10)`, `notes (optional)`,
`logged_at`." Also closes the Phase 1 item "Seed the database with a small set of
system-default symptoms... where `user_id` is null."

**Delivered via branch:** `feature/1.2-symptom-models` (off `main`; this begins the
symptom-logging vertical slice, the same shape the mood-logging slice already took: model →
CRUD endpoint → frontend form, each its own stacked PR).

### Background / concepts

#### A nullable `user_id` modeling two different kinds of row in one table

- Every other owned resource in this app so far (`MoodLog`, and later `Medication`/`Habit`)
  has a `user_id` that's always set — the row always belongs to exactly one user. `Symptom` is
  the first model where that's deliberately *not* always true: a row can either be a **system
  symptom** (seeded once, `userId` is `null`, visible to every user — e.g. "Headache") or a
  **user's own custom symptom** (`userId` set to whoever created it, e.g. "Joint pain" someone
  adds for themselves). Modeling this as one table with a nullable foreign key, rather than two
  separate tables, matches how the feature actually behaves end to end: both kinds of row are
  fetched together (`GET /api/symptoms` returns system symptoms *plus* the caller's own), used
  identically as the target of a `SymptomLog`, and only distinguished at the point where it
  actually matters (edit/delete must reject anything with `userId !== req.userId`, including the
  `null` case — covered in the next task, not this one).
- `user User? @relation(...)` — the `?` on both the field type and the relation field itself is
  what makes this optional; Prisma requires marking both the scalar column (`userId String?`)
  and the relation field (`user User?`) as nullable together, not just one or the other, for a
  genuinely optional relation.

#### Why `SymptomLog → Symptom` has no `onDelete: Cascade` (unlike every other relation so far)

- Every relation added in this app up to now cascades: delete the parent, its children go too
  (`User → MoodLog`, `User → Symptom`, `User → SymptomLog` here). But `SymptomLog → Symptom` is
  different on purpose. If a user deletes a custom symptom they created, their *historical*
  severity logs against it shouldn't silently vanish too — that's real health-tracking history,
  and losing it as a side effect of an unrelated cleanup action would be surprising and bad.
  Leaving this relation at Prisma's default (`Restrict`, since no `onDelete` was specified at
  all) means Postgres will *reject* deleting a symptom that still has logs pointing at it, rather
  than either cascading (losing history) or leaving orphaned rows (a dangling foreign key).
  Concretely this means: before Phase 3's `DELETE /api/symptoms/:id` can let a symptom with
  existing logs actually be deleted, it'll need its own explicit decision (e.g. reject with a
  clear error, or require deleting/reassigning the logs first) — deliberately left as that later
  task's problem, not solved speculatively here.
- System symptoms (`userId: null`) have no user row to delete in the first place, so they're
  never affected by any user's account deletion — only the `User → Symptom` cascade (for a
  user's *own* custom symptoms) and the `User → SymptomLog` cascade (a user's own logs) fire
  when an account is deleted.

#### The seed script: why `prisma.config.ts`'s `migrations.seed`, not `package.json`'s
`"prisma": { "seed": ... }`

- The classic Prisma seeding convention (still what most tutorials show) is a `"prisma": {
  "seed": "ts-node prisma/seed.ts" }` block in `package.json`. This project already moved off
  `package.json`-based Prisma configuration entirely when it adopted `prisma.config.ts` (visible
  in that file's own `migrations.path` — the migrations folder location is configured there, not
  in `package.json`, either). Prisma 7's own config package (`@prisma/config`) defines the
  equivalent modern option as `migrations.seed` inside that same file — using it keeps every
  piece of Prisma configuration in the one place this project already centralized it, rather
  than reintroducing a second, legacy configuration surface just for this one feature.
- `prisma/seed.ts` reuses the app's existing `prisma` singleton from `src/lib/prisma.ts` (the
  one already wired up with the Postgres driver adapter, `PrismaPg`) instead of constructing a
  second `PrismaClient`. This project's generated client (Prisma 7, using `@prisma/adapter-pg`)
  requires an adapter to be passed to its constructor — calling `new PrismaClient()` with no
  arguments, which is what most seed-script examples online show, doesn't compile against this
  project's generated types at all. Discovered this directly: the first version of this seed
  script did exactly that and `ts-node` refused to compile it.
- **Idempotency.** The seed script checks `findFirst({ where: { userId: null, name } })` before
  creating each system symptom, and skips ones that already exist, rather than assuming a clean
  database. `name` has no uniqueness constraint at the schema level (a user is free to name their
  own custom symptom "Headache" too, and that's a different, legitimate row) — so this check is
  deliberately scoped to `userId: null` specifically, meaning "does this *system* symptom already
  exist," not "does any symptom with this name exist." Verified by running the script twice in a
  row: the second run creates nothing and prints nothing, confirmed against `psql` directly.

### What was done

1. **`backend/prisma/schema.prisma`.** Added `Symptom` (`id`, nullable `userId`, `name`,
   optional `description`, `createdAt`) and `SymptomLog` (`id`, `userId`, `symptomId`,
   `severity` as a plain `Int` — the 1–10 range is enforced by Zod in the next task, not the
   database — optional `notes`, `loggedAt` as `@db.Timestamptz(3)`, same reasoning as `MoodLog`'s
   timestamp). Added the reciprocal `symptoms Symptom[]` / `symptomLogs SymptomLog[]` fields on
   `User`. Composite index `[userId, loggedAt]` on `SymptomLog` (same "filter by user, range by
   date" pattern as `MoodLog`); single index on `Symptom.userId` (every `GET /api/symptoms`
   query filters on it, including the `NULL` case for system symptoms).
2. **Migration.** `npx prisma migrate dev --name add_symptom_and_symptom_log` — generated and
   applied `20260816123743_add_symptom_and_symptom_log` against the local (isolated,
   worktree-specific) Postgres database.
3. **`backend/prisma/seed.ts` (new)** and **`backend/prisma.config.ts`** (added
   `migrations.seed: "ts-node prisma/seed.ts"`). Seeds six system-default symptoms (Headache,
   Fatigue, Nausea, Joint pain, Brain fog, Insomnia — a couple more than the three
   `Tasks.md`/`requirements.md` name as examples, since a symptom picker with only three options
   felt thin for a real demo). Also added `"db:seed": "prisma db seed"` to
   `backend/package.json`'s scripts for a discoverable, explicit way to run it outside of
   `migrate dev`/`reset`.
4. **`npm run build`** — compiled cleanly (also regenerates the Prisma Client, adding the
   `prisma.symptom` / `prisma.symptomLog` delegates the next task's routes will use).
5. **`npm test`** — 38/38 passing, unchanged from the previous entry (this task adds no
   application code, only schema + a seed script neither of which any existing test exercises).
6. **`npx eslint .`** and **`npx prettier --check .`** — both clean.
7. **Manual verification directly against Postgres** (not just trusting the migration/seed
   commands' own "success" output): `psql \d symptoms` and `\d symptom_logs`, confirming exact
   column types (`timestamp(3) with time zone` on `logged_at`, `user_id` genuinely nullable on
   `symptoms`), both indexes, the cascading foreign keys from `users`, and the `RESTRICT` (not
   cascade) foreign key from `symptom_logs.symptom_id` to `symptoms.id`; then `SELECT * FROM
   symptoms` confirming all six seeded rows exist with `user_id` genuinely `NULL`.

### Why it's needed

Same reasoning as the `MoodLog` model entry: the symptom-logging endpoint (next task) needs
somewhere to actually store data, with the right constraints already in place, before any API
code is written against it. The seed step specifically is what makes `GET /api/symptoms`
(next task) return something useful the very first time any user calls it, rather than an empty
picker until someone manually creates symptoms.

### Decisions

- **Six system symptoms, not exactly the three `Tasks.md` names as examples.** "Headache,
  Fatigue, Nausea" was explicitly worded as an example (Tasks.md: "e.g. Headache, Fatigue,
  Nausea"), not an exhaustive list — a few more (Joint pain, Brain fog, Insomnia) makes the
  symptom picker in the next frontend task feel like a real feature rather than a three-item
  placeholder, without inventing an exhaustive medical taxonomy this MVP doesn't need.
- **`Restrict`, not `Cascade`, from `SymptomLog` to `Symptom`.** Covered above — the one relation
  in this schema so far that deliberately breaks from the "everything cascades" pattern, because
  losing historical severity logs as a side effect of deleting a symptom definition would be a
  real data-loss bug, not a convenience.
- **`prisma.config.ts`'s `migrations.seed`, not `package.json`'s `"prisma"` block.** Covered
  above — keeps Prisma configuration in the one place this project already centralized it.
- **Reused the existing `prisma` singleton in the seed script**, rather than a second
  `PrismaClient` instance — both because the generated client requires the adapter constructor
  argument to even compile, and because a second client would mean two separate connection pools
  for what's a one-shot script anyway.
- **Stacked this branch on `main` directly, not on another in-progress branch.** Unlike the
  `MoodLog` model (which stacked on the not-yet-merged auth-middleware branch because it needed
  it), this task has no dependency on any other currently in-flight work — `requireAuth` is
  already on `main`.

### State at end of this step

`symptoms` and `symptom_logs` exist in the local (isolated) database with the correct shape,
constraints, and index, and `symptoms` has six real system-default rows in it. No API endpoint
reads or writes either table yet — that's the next task.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 38/38 passing (unchanged).
- `npx eslint .` — clean. `npx prettier --check .` — clean.
- `psql \d symptoms` / `\d symptom_logs` against the real local database — confirmed column
  types (including nullable `user_id` on `symptoms` and `timestamp(3) with time zone` on
  `symptom_logs.logged_at`), both indexes, and both cascading and `RESTRICT` foreign keys
  directly, not inferred from the migration file alone.
- `psql SELECT * FROM symptoms` — confirmed all six seeded system symptoms present with
  `user_id IS NULL`; re-ran the seed script a second time and confirmed (both by its silent
  output and a repeat `SELECT`) it created no duplicates.

---

## 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/symptoms` and `/api/symptom-logs`

**Task:** [Tasks.md](../../Tasks.md) → Phase 3 → Symptoms → all four bullet points: symptom
CRUD (scoped, with the system-symptom carve-out) and symptom-log CRUD (with the
ID-tampering defense the cross-cutting section calls for).

**Delivered via branch:** `feature/3.1-symptom-endpoints` (stacked on
`feature/1.2-symptom-models`) — the second step of the symptom-logging vertical slice, the
same shape `feature/3.5-mood-logs-endpoint` took for mood.

### Background / concepts

#### Two resources, two route files, because they have genuinely different ownership rules

- `moodLogs.ts` only ever needed one ownership check: "does this row's `userId` match
  `req.userId`?" Symptoms need a second, different check layered on top of that one: a
  `Symptom` can *legitimately* have `userId: null` (a system symptom, readable and usable by
  everyone) but must *never* be editable or deletable by anyone — not even by treating `null`
  as "unowned, anyone may claim it." `routes/symptoms.ts` handles that (`GET` reads with an
  `OR: [{ userId: null }, { userId: req.userId }]` filter; `PATCH`/`DELETE` look the row up
  with a *plain* `userId: req.userId` filter — no `OR`, no `null` branch — so a system symptom
  can never match and always 404s, exactly like another user's private one does).
  `routes/symptomLogs.ts` is a separate concern: logs are always owned outright (never
  system-wide), so its ownership check is the same single-condition shape `moodLogs.ts` already
  uses. Splitting into two files keeps each router's `where` clauses simple and single-purpose
  rather than one file juggling two different ownership shapes.

#### The ID-tampering defense, concretely

- This is Phase 3's cross-cutting requirement, and the reason `symptomLogs.ts` has a
  `symptomIsAccessible(symptomId, userId)` helper that every write path calls before touching
  the database: `POST /` calls it on the `symptomId` in the request body; `PATCH /:id` calls it
  *only* if the update actually includes a new `symptomId` (leaving `symptomId` unchanged
  requires no re-check, since the original create already validated it). The helper itself is
  one query — `findFirst({ where: { id: symptomId, OR: [{ userId: null }, { userId }] } })` —
  the same "is this null (system) or mine" shape `symptoms.ts`'s own `GET` uses, applied here to
  guard writes instead of reads.
- **Why this matters concretely:** without this check, a malicious or buggy client could `POST
  /api/symptom-logs` with `{ symptomId: "<someone else's private symptom UUID>", severity: 8 }`
  and successfully create a log under their own account pointing at data they were never shown
  and don't own — a real information/consistency leak, since anything downstream (the dashboard,
  trends, an eventual "which of my symptoms is worst" view) would then treat that foreign
  symptom's name/description as if it belonged to the caller. The `symptom_logs.symptom_id`
  foreign key (added in the previous task) stops the *database* from accepting a `symptomId`
  that doesn't exist at all, but says nothing about *whose* symptom it is — that's exactly the
  gap `symptomIsAccessible` closes, and it's a genuinely different failure mode from a garden-
  variety Zod validation error, which is why it 404s (`SYMPTOM_NOT_FOUND`) rather than 400s
  (`VALIDATION_ERROR`): the same "don't leak which case it is" reasoning already used for
  mood-log ownership, applied here to "does this ID even refer to something you're allowed to
  use," not just "is this JSON shaped correctly."
- Directly tested (`symptomLogs.test.ts`): one test has user "attacker" `POST` a symptom log
  with user "owner"'s real, private symptom ID and asserts both the `404`/`SYMPTOM_NOT_FOUND`
  response *and* that zero rows were actually created (`prisma.symptomLog.findMany` afterward);
  a second test does the same thing via `PATCH` (attacker tries to retarget their *own* existing
  log onto the owner's private symptom) and confirms the log's `symptomId` is unchanged
  afterward, not just that the response looked right.

#### Why deleting a symptom with existing logs returns `409`, not `500` or a silent success

- The previous task's schema deliberately left `SymptomLog → Symptom` as `Restrict` (no
  cascade), specifically so a symptom's logging history can't vanish as a side effect of
  deleting the symptom definition. That decision has a consequence this task has to actually
  handle: `DELETE /api/symptoms/:id` on a symptom that still has logs pointing at it will make
  Postgres reject the delete with a foreign-key-violation error. Left unhandled, Prisma throws
  that as an uncaught exception and Express's default error handling would turn it into an
  opaque `500` — technically "the delete didn't happen," but with no indication *why*, and no
  clear thing the caller could do about it. Catching
  `Prisma.PrismaClientKnownRequestError` with `code === "P2003"` (Prisma's code for "foreign key
  constraint failed") and translating it into `409 Conflict` with `code: "SYMPTOM_HAS_LOGS"`
  turns a raw database error into an actionable API response — `409` specifically because the
  request is well-formed and the caller is allowed to make it, but it conflicts with the
  resource's current state (logs still exist), which is exactly what `409` means.

### What was done

1. **`backend/src/routes/symptoms.ts` (new).** `GET /` (system + own), `POST /` (create own,
   `name` required, `description` optional), `PATCH /:id` / `DELETE /:id` (ownership-scoped,
   system symptoms and other users' symptoms both 404 identically; `DELETE` catches `P2003` and
   returns `409 SYMPTOM_HAS_LOGS`).
2. **`backend/src/routes/symptomLogs.ts` (new).** `GET /` (own logs, most recent first),
   `POST /` (validates `symptomId`, `severity` 1–10 integer, optional `notes`, optional
   `loggedAt` defaulting to now — same backfill pattern as mood-logs — and runs the
   `symptomIsAccessible` check before creating), `PATCH /:id` / `DELETE /:id` (ownership-scoped
   like mood-logs, plus the same accessibility re-check on `PATCH` if `symptomId` is part of the
   update).
3. **`backend/src/app.ts`.** Mounted both routers behind `requireAuth`:
   `app.use("/api/symptoms", requireAuth, symptomsRouter)` and
   `app.use("/api/symptom-logs", requireAuth, symptomLogsRouter)`.
4. **Tests.** `symptoms.test.ts` (13 tests): no-token rejection; listing system + own but not
   another user's; create with/without description; validation rejection; update; 404 on a
   missing ID; 404 editing/deleting another user's symptom *and*, separately, 404 editing/
   deleting a system symptom (both asserted as the identical response shape); delete; and the
   `409 SYMPTOM_HAS_LOGS` case. `symptomLogs.test.ts` (16 tests): no-token rejection; create
   against an owned symptom and, separately, against a system symptom; **the two ID-tampering
   tests described above**; a nonexistent `symptomId` producing the same `404` as an
   inaccessible one; backfill defaulting/explicit-past-date; severity range/integer validation
   (0, 11, and `5.5` all rejected; 1 and 10 both accepted); list scoping; update; 404s on a
   missing ID and on another user's log; delete.
5. **`npm run build`** — compiled cleanly.
6. **`npm test`** — 62/62 passing (38 pre-existing, 24 new).
7. **`npx eslint .`** — clean. **`npx prettier --check .`** — clean (after running
   `--write` once on the two new test files to match this project's formatting).
8. **Manual end-to-end verification against the compiled, running server** (`npm start`, port
   4101 — this worktree's isolated port), via a throwaway Node script driving `fetch` the same
   way `curl` would: registered two real users (A, B), confirmed `GET /api/symptoms` is `401`
   with no token and returns exactly the 6 seeded system symptoms plus zero custom ones for a
   fresh user; A created a private custom symptom, updated it, then B attempting to `PATCH` it
   got `404`, and A attempting to `PATCH` the system "Headache" symptom *also* got `404` (same
   shape, proving the system-symptom carve-out actually works against a real running server, not
   just in an in-memory test); A logged against both the system symptom and their own private
   one; **B attempting to `POST /api/symptom-logs` against A's private symptom ID got `404`
   `SYMPTOM_NOT_FOUND`** — the ID-tampering defense, confirmed live; A updated and listed their
   logs; deleting A's symptom while a log still referenced it returned `409 SYMPTOM_HAS_LOGS`;
   deleting the log first and then the (now log-free) symptom both succeeded. Cleaned up both
   manually-created test users afterward via `psql` and stopped the manually-started server.

### Why it's needed

This is where the previous task's schema becomes an actual feature a client can call — and,
notably, the first endpoint in this codebase whose central purpose *is* an authorization check
(`symptomIsAccessible`) rather than authorization being a secondary concern layered onto CRUD
that would otherwise be simple. Every other Phase 3 log type (medications, habits) that
references its own "which entity does this log belong to" ID will need the exact same shape of
check.

### Decisions

- **404, not 400, for an inaccessible `symptomId`.** Covered above — kept in the same "don't
  leak which case it is" family as ownership 404s elsewhere, rather than folding it into Zod's
  `VALIDATION_ERROR` shape, since "the JSON is malformed" and "you're not allowed to use this
  ID" are different failure modes worth distinguishing by status/code even though both are
  4xx.
- **`409 SYMPTOM_HAS_LOGS` on deleting a symptom with existing logs**, rather than silently
  cascading (which the previous task's schema decision already ruled out) or leaving it as an
  unhandled `500`. No Tasks.md item calls for this explicitly, but it's a direct, foreseeable
  consequence of the previous task's `Restrict` decision that needed *some* deliberate handling
  rather than an accidental crash the first time a real user hits it.
- **`PATCH` only re-validates `symptomId` accessibility when `symptomId` is actually part of the
  update.** An update that only changes `severity` or `notes` doesn't re-run the check — the log
  was already validated as pointing at an accessible symptom when it was created, and that fact
  can't change without an explicit `symptomId` change in the same request.
- **No route-level rate limiting or pagination added here.** Both are separate, already-tracked
  Tasks.md items (rate limiting is auth-specific in Phase 2; pagination is Phase 9's History
  feature) — out of scope for "build the CRUD endpoint."

### State at end of this step

A real, working, tested, auth-protected CRUD API for symptoms and symptom logs exists locally,
including the ID-tampering defense and the system-symptom carve-out, both verified against a
real running server as well as the automated test suite. Nothing on the frontend calls it yet —
that's the next task.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 62/62 passing (38 pre-existing, 24 new).
- `npx eslint .` — clean. `npx prettier --check .` — clean.
- Manual end-to-end walkthrough against the compiled, running server (script-driven `fetch`
  calls standing in for `curl`): full symptom + symptom-log lifecycle across two real user
  accounts, including the two ID-tampering attempts (both correctly rejected with `404`) and the
  `409` restrict-delete case, each response matching expectations exactly.

---

## 2026-08-16 — Phase 7: Symptom entry form, wired into the Dashboard

**Task:** [Tasks.md](../../Tasks.md) → Phase 7 → "Symptom entry form: symptom picker, large 1–10
severity control, optional notes, date/time picker (defaults to now), Save/Cancel."

**Delivered via branch:** `feature/7.2-symptom-entry-form` (stacked on
`feature/3.1-symptom-endpoints`). This is the last piece of the symptom-logging vertical
slice — the same closing role `feature/7.3-mood-entry-form` played for mood: everything built
so far (the `Symptom`/`SymptomLog` models, the CRUD endpoints, the ID-tampering defense)
finally becomes something a real person can actually use.

### Background / concepts

#### Why the symptom picker is a `<select>`, not a row of buttons like mood's rating controls

- Mood, energy, and stress each have a small, fixed number of options (5 or 7) — a row of
  large tappable buttons works well and is what the wireframe calls for. Symptoms are
  different: the picker's option list is open-ended (six seeded system symptoms today, plus
  however many a given user has created for themselves) and could grow unbounded over time.
  A native `<select>` handles an arbitrarily long list gracefully (it scrolls, it's
  searchable-by-typing in most browsers, it doesn't need custom overflow handling) in a way a
  row or grid of large buttons doesn't. Severity, in contrast, genuinely is a small fixed set
  (1–10) - exactly the shape mood/energy/stress buttons already suit, so it reuses that same
  `role="radiogroup"`/`role="radio"`/`aria-checked` pattern (in a `grid-cols-5` layout so 10
  options read as two clean rows of 5 rather than one cramped row or an ambiguous wrap).
- **`<optgroup>` for "Your symptoms" vs. "Common symptoms."** The backend's `GET /api/symptoms`
  returns one flat, alphabetically-sorted list mixing system and custom symptoms together
  (right choice for the API — a picker isn't the only thing that will ever read this endpoint).
  The form groups them into two native `<optgroup>`s client-side specifically because the
  distinction actually matters to a user choosing from the list — knowing "this one's mine, I
  can edit/delete it later" vs. "this is a shared default" is useful context a flat list would
  hide. `<optgroup>` also carries its own accessibility semantics for free (exposed to screen
  readers as a labeled group), confirmed directly in this task's own test
  (`screen.getByRole("group", { name: "Your symptoms" })` passes against real jsdom-rendered
  markup, not just visually).

#### Why `symptoms` is a prop, not fetched inside `SymptomEntryForm` itself

- `MoodEntryForm` needs no data to render its options (mood/energy/stress are fixed, hardcoded
  scales) — it only ever *sends* data. `SymptomEntryForm` is the first entry form in this app
  that also needs to *receive* data first (the symptom list) before it can render anything
  useful. Two ways to get it: have the form fetch `GET /api/symptoms` itself on mount, or have
  `DashboardPage` fetch it once and pass it down as a prop. This task chose the latter,
  because `DashboardPage` already needs that exact same list for a second, unrelated reason:
  turning a saved log's `symptomId` back into a readable name in the recent-entries list below
  the form. Fetching it once in the page and threading it down avoids two independent copies of
  the same data that could disagree (e.g. if a symptom were created mid-session in one fetch but
  not reflected in the other), and it also makes the form trivially easier to unit test — tests
  pass a plain in-memory `Symptom[]` array as a prop instead of having to mock a second `fetch`
  call just to get the picker to render any options at all.

#### The two dashboard data-fetching `useEffect`s aren't accidentally duplicated

- `DashboardPage` now has two separate `useEffect(() => { ... }, [])` blocks: one for mood logs
  (pre-existing, unchanged), one new one loading symptoms *and* symptom logs together via
  `Promise.all`. These intentionally stay independent rather than being merged into one giant
  effect — mood and symptoms are unrelated data with no ordering dependency between them, so
  keeping them separate means a slow or failing mood-logs fetch can't block symptoms from
  loading (and vice versa); each section gets its own `loading`/`loadError` state and fails
  independently, which is also why the page now visibly shows two separate "Loading…" states
  that can resolve at different times.

### What was done

1. **`frontend/src/components/SymptomEntryForm.tsx` (new).** A `<select>` symptom picker (two
   `<optgroup>`s: "Your symptoms," "Common symptoms"), a `role="radiogroup"` of ten severity
   buttons (1–10, `grid-cols-5`, required — no deselect, unlike mood's optional energy/stress
   rows), an optional notes textarea, a `datetime-local` field defaulting to "now" (same
   `toDateTimeLocalValue` helper pattern as `MoodEntryForm`), and Save/Cancel. Submits via
   `apiFetch("/api/symptom-logs", { method: "POST", ... })` and calls `onSaved(log)` on success.
   Client-side validation requires both a chosen symptom and a chosen severity before submit,
   with inline errors (`role="alert"`) — mirroring `MoodEntryForm`'s required-field pattern.
2. **`frontend/src/pages/DashboardPage.tsx` (extended).** Added a second data-fetching effect
   (symptoms + symptom logs via `Promise.all`), a `+ Symptom` button revealing the form inline
   (same toggle pattern as `+ Mood`), a `symptomName(symptomId)` lookup helper for rendering
   readable names in the list, and a "Recent symptom entries" section with delete (optimistic
   removal, rolled back on failure) — structurally identical to the existing mood section, not
   a new pattern.
3. **Tests (`SymptomEntryForm.test.tsx`, 6 new).** Requiring both a symptom and a severity
   before submit is possible; the `<optgroup>` split rendering correctly; a full submission
   producing the exact expected request body and calling `onSaved` with the server's response;
   a failed save showing a friendly error; all ten severity options 1–10 present; Cancel calling
   `onCancel`.
4. **`npm run build`** (frontend) — compiled cleanly.
5. **`npm test`** (frontend) — 30/30 passing (24 pre-existing, 6 new).
6. **`npm run lint`** (`oxlint`) — clean (one pre-existing, unrelated warning on
   `AuthContext.tsx`, not touched by this task). **`npx prettier --check .`** — clean.
7. **Real browser verification**, per the project's UI-change testing rule. Started the actual
   compiled backend (`npm start`, port 4101 — this worktree's isolated port) and the frontend
   dev server (port 5173, matching this worktree's `FRONTEND_URL`/`VITE_API_URL`), then drove a
   real headless Chromium browser through the full flow with a throwaway Playwright script:
   register → land on Dashboard → open the symptom form → select "Headache," severity 8, add a
   note → Save → confirm the entry appears in the list with the right symptom name, severity,
   note, and timestamp → delete it → confirm the list returns to its empty state. Zero browser
   console errors at any point. Screenshots taken at each step and visually reviewed (the form
   with its two-row severity grid and grouped picker, the filled form, the saved entry, and the
   post-delete empty state), not just asserted programmatically. Cleaned up the browser-created
   test user afterward via `psql` and stopped both manually-started servers.

### Why it's needed

This closes out the symptom-logging vertical slice the same way `feature/7.3-mood-entry-form`
closed out mood's: the point at which a set of individually-correct backend pieces becomes a
feature an actual person can use, end to end, in a real browser.

### Decisions

- **`symptoms` passed as a prop, not fetched inside the form.** Covered above — avoids two
  independent copies of the same list and simplifies testing.
- **Native `<select>`/`<optgroup>` for the symptom picker, not a custom `role="radiogroup"` like
  mood's.** Covered above — the option list is open-ended in a way mood/energy/stress/severity
  aren't, and a native select handles that without extra work.
- **Severity has no deselect-to-clear behavior, unlike energy/stress.** Severity is a required
  field (every symptom log needs one), the same way mood is required on `MoodEntryForm` — only
  genuinely optional rating fields (energy, stress) get the "click again to unselect" behavior.
- **Inline on the Dashboard, not a modal; delete only, no edit.** Same reasoning as the mood
  entry form's own decisions section — the shared Quick Add modal and pre-filled-edit-form work
  are their own separate, not-yet-started Tasks.md items covering all four log types at once.

### State at end of this step

A real user can register or log in, land on the Dashboard, log a symptom (system or their own
custom one) with a required severity and optional notes/backdated time, see it appear
immediately with its name and severity, and delete it — verified directly in a real browser, not
just via tests. This closes out the symptom-logging vertical slice: `feature/1.2-symptom-models`
→ `feature/3.1-symptom-endpoints` → `feature/7.2-symptom-entry-form` (this task) are each their
own PR, stacked in that order, and need merging in that same order once reviewed.

### Verification

- `npm test` (frontend, `vitest run`) — 30/30 passing (24 pre-existing, 6 new).
- `npm run build` (frontend) — compiled cleanly.
- `npm run lint` (oxlint) — clean (one pre-existing, unrelated warning). `npx prettier --check .`
  — clean.
- Real headless-browser walkthrough (Playwright) against the actual running backend and
  frontend dev servers: full register → log symptom → view → delete cycle, screenshots reviewed
  at each step, zero browser console errors.

---

## 2026-08-17 — Letting users add their own symptoms inline (and two new defaults: Anxiety, Depression)

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the user asked whether the symptom
picker should be editable so people could add options like Anxiety or Depression themselves,
rather than being limited to whatever's seeded. Turned out the backend and data model already
fully supported this (`ownSymptoms`/`systemSymptoms` was designed for exactly this split from the
start); only the form's UI never grew the affordance to actually create one.

### Background / concepts

#### The data model already drew this line — nothing there needed to change

- `Symptom.userId` has been nullable since the very first Symptom Logging entry, specifically so
  a `null` row (a "system" symptom) reads as available to everyone, while a real `userId` reads as
  one person's own. `SymptomEntryForm` already split its `symptoms` prop into `ownSymptoms` and
  `systemSymptoms` and rendered them as two separate `<optgroup>`s (`"Your symptoms"` /
  `"Common symptoms"`) — and the backend's `POST /api/symptoms` (from the original endpoints
  entry) already creates exactly that kind of user-owned row. The gap was narrow: a working
  create endpoint and a form that already knew how to display the result, but no button anywhere
  that actually called the endpoint.

#### Confirmed Habit and Medication already had this, in two different shapes

- The user asked to confirm this directly. Both already let a user add their own option, but not
  identically, and the difference is a direct consequence of how much each thing needs to know at
  creation time:
  - **Medication** (`MedicationEntryForm.tsx`) adds inline, in place, inside the same form used to
    log an entry — a "+ Add another medication" toggle reveals a name field and an "Add" button,
    right there. A medication only ever needs a `name`, so there's nothing more to ask.
  - **Habit** (`HabitCreateForm.tsx`, reached via `HabitEntryForm`'s "+ Add a new habit") is a
    separate, dedicated screen instead. A habit additionally needs a **type** chosen at creation
    (Yes/No, Number, or Duration — this determines which value field every future log against it
    shows), which is enough extra decision-making to justify its own focused form rather than
    cramming a type-picker into the log-entry form too.
  - **Symptom** needed neither complexity nor a follow-up screen — like Medication, a symptom only
    ever needs a `name` (the `description` field exists in the schema but was already
    optional/system-only in practice, never asked for at log time) — so it follows Medication's
    fully-inline shape, not Habit's separate-screen one.

#### Why the new symptom has to be reported back to the *parent*, not just kept in this form

- Unlike `MedicationEntryForm`, which fetches and owns its own `medications` list internally,
  `SymptomEntryForm` deliberately receives `symptoms` as a prop from `SymptomSection` (see the
  original entry's *Decisions* — one fetch shared between the picker and the recent-entries list,
  so they can't disagree). That means this form can't just add the new symptom to its own local
  state the way Medication's form does — `symptoms` isn't this form's to mutate. A new
  `onSymptomCreated` callback prop reports the created symptom up to `SymptomSection`, which folds
  it into the state *it* owns, the same "fold into local state instead of re-fetching" pattern
  `MedicationSection.handleMedicationSaved` already uses.

### What was done

1. **`SymptomEntryForm.tsx`.** Added `showAddSymptom`/`newSymptomName`/`addingSymptom`/
   `addSymptomError` state, a `handleAddSymptom` function (`POST /api/symptoms`, then
   `onSymptomCreated(symptom)`, auto-select it via `setSymptomId`, reset and hide the inline
   field), and the matching JSX: a "+ Add another symptom" toggle link plus a `TextField` + `Add`
   button when open — copied directly from `MedicationEntryForm`'s equivalent block, including its
   dynamic label (`"Symptom name"` the first time a user has none of their own yet, `"New symptom
   name"` afterward).
2. **`SymptomSection.tsx`.** Added `handleSymptomCreated`, folding the new symptom into local
   `symptoms` state (guarded against duplicates, matching `MedicationSection`'s pattern exactly),
   and passed it down as the new `onSymptomCreated` prop.
3. **`backend/prisma/seed.ts`.** Added `Anxiety` and `Depression` to `SYSTEM_SYMPTOMS`, directly
   answering the user's suggestion for what the shared default set should include — these show up
   for every user under "Common symptoms" without anyone having to add them individually. Since
   the seed script is idempotent and (per the previous deployment-log entry) now runs
   automatically on every production deploy, this reaches production the next time this change
   ships, with no separate manual step.
4. **Tests.** Updated every existing `SymptomEntryForm.test.tsx` render call with the new required
   `onSymptomCreated` prop, and added two new tests: adding a custom symptom successfully (auto-
   selected, reported to the parent, correct POST body) and a failed add showing a friendly error
   without clearing the typed name. The success test uses Testing Library's `rerender` to simulate
   what `SymptomSection` does in the real app — feed the newly-created symptom back in via an
   updated `symptoms` prop — since, unlike Medication's self-contained form, this form only tracks
   the *id* of its own selection, not the option list itself; without that simulated rerender, the
   test can't see the new `<option>` (a real gap in isolated component testing, not a bug in the
   component — confirmed directly by first writing the assertion the naive way, watching it fail
   with the select showing the *previous* first option instead, and reasoning through why: a
   browser's `<select>` falls back to its first real option whenever its controlled `value` points
   at an id with no matching `<option>` — exactly what happens here without the rerender).
5. **`npm run build`, `npm run lint`, `npx prettier --check .`** (frontend) — all clean after one
   formatting pass on the new test file.
6. **`npm test`** — 65/65 frontend tests passing, 110/110 backend tests passing (the seed change
   touches no backend logic, but the full suite was still run per this project's standing rule).
7. **Real browser verification.** Re-ran the seed script against the local database (idempotent —
   printed only `Seeded system symptom: Anxiety` / `Depression`, confirming the existing six were
   left untouched) and drove the actual flow with Playwright against real running dev servers:
   opened the symptom form, confirmed all eight "Common symptoms" now render (the original six
   plus the two new ones), used "+ Add another symptom" to create "Anxiety flare" as a genuinely
   custom, user-owned symptom, confirmed it appeared auto-selected under "Your symptoms," logged
   it with a severity, and confirmed it appeared in the recent-entries list — zero console errors
   throughout.

### Why it's needed

Without this, the only way to add a symptom like Anxiety was to edit `seed.ts` and ship a deploy —
fine for the two the user specifically wanted added now, but not a real answer for anyone whose
condition isn't on that list, which is exactly the situation a wellness-tracking app for chronic
conditions should expect to hit often. Letting users add their own keeps the seeded list as
helpful defaults rather than a hard ceiling on what's trackable.

### Decisions

- **Followed Medication's inline shape, not Habit's separate-screen one.** Justified directly by
  data shape, not by a general "always match Medication" rule — a symptom needs exactly one thing
  (a name) at creation time, same as a medication, and nothing like a habit's type choice that
  would justify its own screen.
- **New symptoms are always private to the user who creates them, never promoted to the shared
  "Common symptoms" set.** The data model already draws this line (`userId: null` vs. a real
  user id) and nothing here changes it — a user's custom "Anxiety flare" stays visible only to
  them, so one person's specific wording never clutters everyone else's picker. Promoting a
  frequently-added custom symptom into the shared defaults later is possible (it's just changing
  which row has `userId: null`) but was out of scope here — nothing asked for it, and doing so
  automatically would need some notion of "how often does a name recur across users," which
  doesn't exist yet.
- **Didn't collect a `description` in the inline-add flow**, even though the `Symptom` model
  supports one. The seeded system symptoms use it for a couple of entries (Brain fog, Insomnia)
  as a small clarifying hint, but asking a user for an optional description while they're mid-flow
  trying to log an entry adds friction for a field that's never actually shown back to them
  anywhere yet — matches Medication's inline-add, which also only ever asks for a name.

### State at end of this step

A user can add their own symptom (e.g. "Anxiety flare," or anything else not already covered)
directly from the log-a-symptom form, with no separate settings screen and no deploy required. The
shared default set grew from six to eight system symptoms (added Anxiety, Depression), and will
keep including new defaults added the same way as they come up.

### Verification

- `npm test` (frontend) — 65/65 passing, including the two new tests and the updated existing
  ones.
- `npm test` (backend) — 110/110 passing, unaffected by the seed-data change.
- `npm run build`, `npm run lint`, `npx prettier --check .` (frontend) — all clean.
- `npx prisma db seed` (backend, local database) — printed exactly two new lines (`Seeded system
  symptom: Anxiety` / `Depression`), confirming the idempotency guard correctly skipped the six
  already-seeded symptoms rather than duplicating them.
- Real headless-browser walkthrough (Playwright) against genuinely running dev servers: confirmed
  all eight common symptoms render, created a real custom symptom via the new inline flow,
  confirmed it was auto-selected and then successfully logged — zero console errors throughout.

---
