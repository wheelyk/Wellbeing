# Authentication — Backend

## 2026-08-14 — Phase 1 + Phase 2: PostgreSQL, Prisma, the `User` model, and `POST /api/auth/register`

**Task:** [Tasks.md](../../Tasks.md) → Phase 2 → "Implement `POST /api/auth/register`" — which, on
inspection, needed two prerequisite Phase 0/1 items pulled forward first, since register
can't create an account without a database to put it in: "Set up PostgreSQL locally" and
"Install and configure Prisma," plus defining the `User` model from Phase 1.

**Delivered via branch:** `feature/2.1-auth-register`.

### Background / concepts

#### How Node.js and Express actually work, end to end

- **Node.js runs one JavaScript program that never "restarts" per request.** Unlike some
  older server technologies (PHP, classic CGI) that re-run a script from scratch for every
  request, a Node.js server is a single long-running program: `node dist/index.js` starts it
  once, it stays in memory, and it just *reacts* to incoming network connections for as long
  as it keeps running. This is why `backend/src/index.ts` calls `app.listen(port, ...)` —
  that call doesn't return; it hands control to Node's event loop, which sits there waiting
  for HTTP requests to arrive.
- **Express is a request router.** At its core, Express keeps an ordered list of "if a
  request matches this method + path, run this function" rules. `app.get("/api/health", handler)`
  registers one such rule. `app.use("/api/auth", authRouter)` (added in this step) registers
  a whole *group* of rules at once — every route defined inside `authRouter` (currently just
  `POST /register`) effectively gets the `/api/auth` prefix glued onto it, so
  `authRouter.post("/register", ...)` becomes reachable at `POST /api/auth/register`. This
  is why the code is organized as one `Router` per feature area (`routes/auth.ts` now;
  `routes/symptoms.ts`, `routes/mood.ts` etc. will follow the same pattern in later phases)
  instead of piling every route directly into `app.ts`.
- **Middleware runs before your route handler, for every matching request.**
  `app.use(express.json())` (added back in the backend-scaffold entry) is *middleware*: a
  function that runs on the way in, before Express even looks for a matching route. Its job
  is to read the raw request body (which arrives as raw bytes) and parse it as JSON,
  attaching the result to `req.body` — which is exactly what makes `req.body.email` and
  `req.body.password` available inside the register route. Without it, `req.body` would be
  empty no matter what the client sent.
- **Route handlers are `async` functions, and Express awaits them implicitly via a Promise
  chain — but only if you don't swallow the error.** The register handler is declared
  `async (req, res) => { ... }` because it does two things that take real time and must be
  waited for: hashing the password (`bcrypt.hash`, deliberately slow — see below) and writing
  to the database (`prisma.user.create`, a network round-trip to Postgres). `await`ing both
  means the function doesn't send a response until each step has actually finished.
- **A `Router` is just an isolated, mountable mini-app.** Keeping `authRouter` in its own
  file (`routes/auth.ts`) and exporting it, rather than defining routes straight on `app` in
  `app.ts`, means `app.ts` stays a short table of contents ("mount health, mount auth, mount
  [future routers]") instead of growing into one enormous file as more endpoints are added
  over the coming phases.

#### PostgreSQL and Docker Compose

- **PostgreSQL** ("Postgres") is the actual database system that will durably store every
  user, symptom log, mood entry, etc. — a program that manages structured, relational data
  and answers structured queries against it, running as its own separate process from the
  Node.js backend.
- **`docker-compose.yml`** describes one or more containers ("services") to run together and
  how to run them — here, a single `postgres` service, using the official `postgres:16-alpine`
  container image (a ready-made package containing Postgres 16, built on the minimal "Alpine"
  Linux base to keep the download small). `docker compose up -d postgres` reads that file and
  starts it as a background container. This means nobody on this project has to manually
  install and configure Postgres on their own machine — everyone runs the exact same
  Postgres version, configured the exact same way, via one shared file in git.
- **A named volume** (`postgres_data:` in the compose file) is a chunk of storage Docker
  manages on your behalf, kept separate from the container itself. Without it, stopping and
  removing the Postgres container would wipe out every row of data along with it, since a
  container's own filesystem is normally throwaway. The volume is what lets the database
  survive the container being recreated (e.g. after `docker compose down` + `up` again).

#### Prisma: schema, migrations, and the generated client

- **Prisma is an ORM** (Object-Relational Mapper): a layer that lets application code work
  with the database using regular TypeScript objects and function calls
  (`prisma.user.create({ data: { ... } })`) instead of hand-writing raw SQL strings
  everywhere. It also gives strong TypeScript types for every model, generated straight from
  the schema, so e.g. misspelling a field name is a compile error, not a runtime surprise.
- **`prisma/schema.prisma` is the single source of truth for the data model.** The `User`
  model added there — `id`, `email`, `passwordHash`, `displayName`, `timezone`, `createdAt`
  — mirrors the fields from requirements §11.1, but written in Prisma's own schema syntax
  rather than raw SQL. Field names use `camelCase` (`passwordHash`) to feel natural in
  TypeScript, while `@map("password_hash")` tells Prisma to actually store that column as
  `password_hash` in Postgres — matching the `snake_case` naming the requirements doc uses —
  so the *database* and the *TypeScript code* can each use the naming convention that's
  idiomatic for them, without a mismatch. `@@map("users")` does the same for the table name.
- **A migration is a recorded, ordered change to the database's structure.** Running
  `npx prisma migrate dev --name init_user` did two things: (1) compared the schema file
  against the (empty) database and generated the exact SQL needed to bring the database in
  line (`CREATE TABLE "users" (...)`, visible in
  `prisma/migrations/20260814155859_init_user/migration.sql`), and (2) actually ran that SQL
  against the running Postgres container. Every future schema change (adding `Symptom`,
  `MoodLog`, etc. in later Phase 1 work) will generate its own migration file, and the whole
  sequence of migration files is what lets *any* copy of this database — a teammate's
  laptop, a CI test database, production — be brought to the exact same structure by
  replaying them in order.
- **The generated client is code, not something you hand-write.** `npx prisma generate`
  reads `schema.prisma` and writes actual TypeScript source into `backend/src/generated/prisma/`
  — this is why that folder is git-ignored (see `backend/.gitignore`, which Prisma's own
  `prisma init` created): it's fully reproducible from `schema.prisma` plus running
  `prisma generate`, the same way `dist/` is reproducible from `src/` plus `tsc`. Nobody
  should hand-edit files in `generated/`; they'd just be overwritten the next time it runs.
- **Prisma 7's driver adapters (a version-specific wrinkle worth knowing about).** The
  installed Prisma version (7.9.1) turned out to be newer than most current tutorials assume:
  older Prisma versions bundled their own compiled database-connector binary internally and
  "just worked" once `DATABASE_URL` was set. Prisma 7's new client generator
  (`provider = "prisma-client"` in the schema, as opposed to the older `"prisma-client-js"`)
  instead expects you to explicitly supply a **driver adapter** — a small package
  (`@prisma/adapter-pg` here) that wraps a *native* Postgres driver for Node
  (`pg`, also installed) and hands it to Prisma. Concretely, this is why
  `backend/src/lib/prisma.ts` constructs `new PrismaPg({ connectionString: ... })` and passes
  it into `new PrismaClient({ adapter })`, rather than just calling `new PrismaClient()` with
  no arguments the way many existing Prisma guides show. Worth remembering if following
  older documentation/tutorials and something doesn't match.

#### Password hashing: why it matters and how it works here

- **Hashing is one-way; encryption is two-way.** Encrypting data means it can be *decrypted*
  back to the original if you have the right key — appropriate for data you need to read
  again later. **Hashing** runs data through a function that's deliberately impossible to
  reverse: there is no key or process that turns a password hash back into the original
  password. This project (like essentially all modern software) stores only a hash of each
  password, never the password itself — confirmed directly by requirements §5.2 ("must
  never store a user's plain-text password") and §13. This is why `backend/src/lib/prisma.ts`'s
  `User` model has a `passwordHash` field and nothing called `password`.
- **Why hashing specifically protects against a database leak.** If the *hashes* leak (e.g.
  a future data breach), an attacker still can't log in as anyone or recover the real
  passwords directly from what leaked — they'd have to separately guess passwords and check
  each guess against the hash, which is exactly what the next two points make slow and
  per-password-expensive on purpose.
- **`bcrypt` — and specifically, salted, deliberately slow hashing.** A generic hash function
  like SHA-256 is built to be *fast*, which is actually bad for passwords: it lets an
  attacker who obtains a batch of hashes try billions of guesses per second against them.
  **bcrypt** (used here via the `bcryptjs` package — a pure-JavaScript implementation, chosen
  specifically to avoid needing native C++ build tools on Windows during `npm install`, which
  the original `bcrypt` package requires) is intentionally slow, and its cost is tunable via
  a **salt rounds** parameter (`SALT_ROUNDS = 12` in `routes/auth.ts`) — each increment
  roughly *doubles* the work required per hash. It also automatically generates a random
  **salt** (extra random data mixed into each password before hashing) per password, so two
  users with the identical password `"Sup3rSecret"` end up with two completely different
  stored hashes — this defeats precomputed "rainbow table" lookup attacks, since an attacker
  can't just look up a hash in a table of known hash→password pairs.
- **Never log or return the hash either.** The register route's Prisma `select` explicitly
  lists which fields to return (`id`, `email`, `displayName`, `timezone`, `createdAt`) rather
  than returning the whole created row — `passwordHash` is deliberately left out, so it can
  never accidentally leak into an API response, even though the hash itself (unlike a raw
  password) isn't directly usable to log in as the user.

#### Connection strings, `.env`, and what actually counts as a "secret" here

- `DATABASE_URL` (`postgresql://welltrack:welltrack@localhost:5432/welltrack?schema=public`)
  is a **connection string** — it bundles the database's location (`localhost:5432`), which
  database (`welltrack`), and login credentials (`welltrack`/`welltrack`) into one value.
  Connection strings are secrets in general, since anyone with one for a production database
  could read/write everything in it.
- **Why this specific value was still put in `backend/.env.example`** (a file that *is*
  committed to git, unlike `.env` itself): the username/password `welltrack`/`welltrack` are
  already sitting in plain text in `docker-compose.yml` — which is *also* committed, by
  design, so that anyone cloning the repo can start an identical local database with one
  command. Since it's already fully visible in a file meant to be public, repeating the same
  non-secret local value in `.env.example` doesn't expose anything new, and it means
  `cp .env.example .env` immediately works with zero manual editing.
- **This reasoning does *not* extend to real secrets that don't exist yet.** Once a JWT
  signing secret (Phase 2, upcoming) or a production `DATABASE_URL` (Phase 14, pointing at a
  real hosted database with a real, non-throwaway password) are introduced, those must never
  appear as real values in any committed file, `.env.example` included — only as a clearly
  fake placeholder there, with the actual value living solely in the git-ignored `.env`
  locally, and in the hosting platform's own environment-variable/secrets configuration in
  production.
- `backend/.env` itself — the file the running app actually reads — is git-ignored (inherited
  from the root `.gitignore` added back in the very first Phase 0 entry, which ignores `.env`
  anywhere in the repo). That's the one safety net that matters regardless of how "secret" any
  particular value in it currently is, because it's what will hold the real secrets later
  without any extra setup needed at that point.

#### Validating input with Zod

- **Zod** is a schema-validation library: you describe the *shape* data should have
  (`z.object({ email: z.string().email(), password: z.string().min(8)... })`), and it checks
  arbitrary incoming data against that shape, returning either "valid, here's the
  type-checked data" or a structured list of what's wrong. This is what enforces requirements
  §17's rules for registration (valid email format; a password strength policy — here, at
  least 8 characters, containing at least one letter and one number) *before* anything touches
  the database, and is the same library flagged back in Phase 3's task list
  ("centralized request validation... `zod` or `express-validator`") — using it here first
  establishes the pattern the rest of the API will follow.

### What was done

1. **Postgres.** Added `docker-compose.yml` at the repo root defining a single `postgres`
   service (image `postgres:16-alpine`, credentials `welltrack`/`welltrack`, database
   `welltrack`, exposed on the standard port `5432`, backed by a named volume so data
   survives container restarts). Started it with `docker compose up -d postgres` and
   confirmed it was accepting connections via `docker compose exec postgres pg_isready`.
2. **Prisma setup.** Installed `prisma` (CLI, dev dependency) and `@prisma/client` in
   `/backend`, then ran `npx prisma init --datasource-provider postgresql`. This generated
   `prisma/schema.prisma`, `prisma.config.ts` (Prisma's newer config file — it's what
   actually loads `backend/.env` and hands `DATABASE_URL` to the Prisma CLI, via
   `import "dotenv/config"` inside it), an initial `backend/.env`, and `backend/.gitignore`.
   It also installed some AI-coding-tool "skill" scaffolding for tools this project doesn't
   use (`.windsurf/`, `.agents/`, `skills-lock.json`, plus a `.claude/skills` folder already
   covered by the repo's existing root `.gitignore`) — removed those to keep the repo focused
   on the project itself.
3. **The `User` model.** Wrote it into `prisma/schema.prisma` per requirements §11.1 (see
   *Background* above for the `@map`/`@@map` naming translation). Filled in real values for
   `backend/.env` and `backend/.env.example`'s `DATABASE_URL`, pointing at the Docker Compose
   Postgres instance.
4. **Migration + client generation.** Ran `npx prisma migrate dev --name init_user`, which
   created and applied `prisma/migrations/20260814155859_init_user/migration.sql` (a
   `CREATE TABLE "users" (...)`). Separately ran `npx prisma generate` to produce the actual
   TypeScript client code in `backend/src/generated/prisma/` (this didn't happen
   automatically as part of `migrate dev` in this version, so it was run as its own step).
5. **Driver adapter.** Installed `@prisma/adapter-pg` and `pg` (plus `@types/pg`) — required
   by Prisma 7's new client generator, per *Background* above. Wrote
   `backend/src/lib/prisma.ts`: a single shared `PrismaClient` instance (constructed with the
   `pg` adapter), so the rest of the app always imports and reuses the same client rather
   than each file creating its own (creating many separate clients would open many separate
   pools of database connections for no benefit).
6. **The register route.** Installed `bcryptjs` and `zod`. Wrote
   `backend/src/routes/auth.ts`: a Zod schema validating `email`/`password`/optional
   `displayName`; on success, hashes the password with bcrypt (12 salt rounds), creates the
   user via Prisma, and returns 201 with the safe, hash-excluded fields. Duplicate emails are
   caught via Prisma's `P2002` "unique constraint violation" error code and turned into a
   409 response; validation failures return 400 with per-field error details. Mounted it in
   `app.ts` via `app.use("/api/auth", authRouter)`.
7. **Manual end-to-end check.** Built (`npm run build`) and ran the compiled server, then
   used `curl` to exercise all four cases directly against the real running Postgres
   container: successful registration (201), duplicate email (409), weak password (400),
   and invalid email (400) — all behaved as intended. Cleaned up the manually-created test
   row afterward via `docker compose exec postgres psql`.
8. **Automated tests — and a real bug they caught.** Installed `vitest` and `supertest`
   (plus `@types/supertest`) as dev dependencies, set the backend's `npm test` script to
   `vitest run` (replacing the placeholder stub script), and wrote
   `backend/src/routes/auth.test.ts` covering: successful registration (and that the
   response never contains a password/hash field), the display-name default, invalid email,
   weak password, duplicate email → 409, and — most importantly — a test that reads the
   user straight back out of the database via Prisma and asserts the stored `passwordHash`
   is neither the plain-text password nor anything resembling it (only that it starts with
   bcrypt's `$2` hash-format prefix, without asserting the exact hash, since bcrypt
   intentionally produces a different hash every time even for the same input — see
   *Background* above).

   Running this suite for the first time immediately failed 4 of 6 tests with a database
   connection error (`SASL: ... client password must be a string`) — a genuine bug, not a
   flaky test: `backend/src/lib/prisma.ts` read `process.env.DATABASE_URL` directly, but
   only `index.ts` ever explicitly loaded `.env` (via its own `import "dotenv/config"`)
   before that code ran. The manual `curl` testing above always went through `index.ts`
   first (`node dist/index.js`), so it never hit this. The automated tests import `app.ts`
   directly (deliberately — see the very first backend-scaffold entry for why `app.ts` and
   `index.ts` are split), which meant `DATABASE_URL` was still `undefined` at the moment
   Prisma tried to connect. Per this project's *Testing Requirements* (`CLAUDE.md`) — fix
   the code, don't fix the test, unless the test itself is wrong — the actual fix was moving
   `import "dotenv/config"` into `lib/prisma.ts` itself, so loading the environment no longer
   silently depends on which file happens to import it first. Re-ran the suite: all 6 tests
   passed.
9. Test data cleanup happens automatically: the test file tracks every email it creates and
   deletes those rows in an `afterAll` hook, then disconnects Prisma — confirmed via a direct
   `SELECT count(*) FROM users` against the container afterward (`0`), so re-running the
   suite repeatedly never collides with leftover data from a previous run.
10. Re-ran `npm run build` after the `prisma.ts` fix (still compiles cleanly) and did one
    final full round-trip against the *compiled* server (`node dist/index.js` → `curl` a real
    registration → 201), then stopped the server and deleted that last manual test row.

### Why it's needed

This is the first real vertical slice of the product: an account a user can actually create,
durably stored, with a properly protected password — everything requirements §5.1/§5.2/§13
require of registration specifically. It also stands up the database/Prisma/testing
infrastructure (Docker Postgres, the `User` model + migration pattern, the shared Prisma
client, Vitest + Supertest) that every subsequent Phase 1–13 task will build directly on top
of, rather than each future task having to figure this out from scratch.

### Decisions

- **Pulled Phase 0/1 database setup forward** rather than strictly finishing every remaining
  Phase 0 item first, since `Tasks.md`'s own phases are ordered by dependency, and register
  is impossible to build meaningfully without a database — implementing it "as a stub" that
  doesn't actually persist anything wouldn't have satisfied the task.
- **Only defined the `User` model now, not the rest of Phase 1's models** (`Symptom`,
  `MoodLog`, etc.) — those aren't needed until their own respective endpoints, and adding them
  speculatively now would be scope creep beyond what this task needed. `Tasks.md`'s Phase 1
  checkboxes reflect this: only the `User` model line is checked.
- **`bcryptjs` over native `bcrypt`.** The native `bcrypt` npm package requires compiling C++
  code during install (via `node-gyp`), which needs build tools that aren't guaranteed to be
  present on a given Windows machine. `bcryptjs` is a pure-JavaScript, dependency-free
  reimplementation with the same hashing behavior and its own TypeScript types — trading a
  little raw hashing speed for zero native-build friction, a reasonable tradeoff for an
  auth-only workload.
- **Display name defaults to the email's local part (text before `@`) when not supplied at
  registration.** Requirements §5.1 lists registration as email + password only, with display
  name editing as a separate, later profile action — but the `User` model's `display_name`
  field (§11.1) isn't marked optional. Defaulting it avoids a nullable field purely for a
  three-step-away edge case, while still letting the caller supply a real one immediately if
  they have it (the frontend's registration form, built later, can choose either way).
- **Duplicate email returns an explicit "Email is already registered" message** (rather than
  a deliberately vague message designed to prevent attackers from probing which emails are
  registered). This is standard, common practice for consumer registration flows and matches
  what requirements describe; formal anti-enumeration hardening isn't called for anywhere in
  the requirements doc and would add friction to a legitimate user trying to log in instead
  by mistake.
- **Tests run against the same local Postgres container as manual dev**, not a separate,
  isolated test database. Acceptable for now specifically because the test suite cleans up
  everything it creates; proper test/dev database isolation is explicitly Phase 13's job, not
  something to solve ahead of time here.

### State at end of this step

PostgreSQL runs locally via `docker compose up -d postgres`. The backend connects to it
through Prisma, using the `User` model. `POST /api/auth/register` is live, validated, and
tested — creating a real, durably-stored user with a securely hashed password, and correctly
rejecting invalid emails, weak passwords, and duplicate emails. No other auth endpoints
(login, refresh, etc.) exist yet.

### Verification

- `npm run build` — compiled cleanly both before and after the `dotenv` fix.
- Manual `curl` round-trip against the compiled server for all four cases (success, duplicate,
  weak password, invalid email) — each returned the expected status code and body.
- `npm test` (`vitest run`) — 6/6 tests passing, including a direct database read-back
  confirming the stored password is actually hashed, not stored in plain text.
- Confirmed via `docker compose exec postgres psql ... SELECT count(*) FROM users` that no
  test or manual smoke-test data was left behind after each check.
- Confirmed the generated Prisma client (`backend/src/generated/prisma/`) never shows up in
  `git status` — it's correctly git-ignored and treated as reproducible build output.

---

## 2026-08-15 — Phase 2: `POST /api/auth/login`

**Task:** [Tasks.md](../../Tasks.md) → Phase 2 → "Implement `POST /api/auth/login` — verify
credentials, issue short-lived JWT access token + longer-lived refresh token."

**Delivered via branch:** `feature/2.2-auth-login`.

### Background / concepts

#### What a JWT actually is, and why two of them

- **A JWT (JSON Web Token) is a signed, self-contained claim, not a lookup key.** A database
  session ID means nothing on its own — the server has to look it up in a table to know who
  it belongs to. A JWT instead directly *contains* the claim (here, just `{ sub: userId }`,
  `sub` being the JWT standard's name for "subject" — whose token this is) plus an expiry
  (`exp`), and is cryptographically **signed** with a secret only the server knows. Anyone can
  *read* a JWT's contents (it's just base64-encoded JSON, not encrypted — this is why nothing
  sensitive like a password ever goes in one), but nobody can *forge* or *alter* one without
  the signing secret, because the server recomputes the signature on every request and
  rejects the token if it doesn't match. This is what lets the backend verify "yes, this
  really is user X, and this token hasn't expired or been tampered with" without a database
  round-trip on every single request — unlike checking a session ID.
- **Two tokens with two different lifetimes, because they trade off differently.** An
  **access token** (signed in `signAccessToken`, 15-minute expiry) is what gets sent with
  every ordinary API request to prove who's asking — kept short-lived so that if one ever
  leaks (e.g. via a browser bug, a compromised dependency), the window an attacker could use
  it in is small. A **refresh token** (`signRefreshToken`, 7-day expiry) isn't sent with
  every request; its only job is to be exchanged for a new access token once the old one
  expires, which is what task 2.3's upcoming `POST /api/auth/refresh` will do — so the user
  doesn't have to re-enter their password every 15 minutes just because the access token
  expired.
- **Separate signing secrets per token type** (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` —
  new entries in `.env`/`.env.example`). If the two used the *same* secret, anyone who
  obtained it (e.g. via a leaked short-lived access token secret, if it were shared) could
  forge the other kind of token too. Separate secrets mean the two blast radii stay
  independent — this also sets up task 2.3's refresh-rotation logic to only ever verify
  refresh tokens against `JWT_REFRESH_SECRET`, never accidentally accepting an access token
  in a refresh token's place.
- **`backend/src/lib/jwt.ts` centralizes signing.** Same reasoning as `lib/prisma.ts`'s shared
  client from the previous entry: one place that knows how to build a valid access/refresh
  token, rather than every route that eventually issues one (login now; register itself
  doesn't, by design — a new user still has to log in) reimplementing the `jwt.sign(...)`
  call and its options.

#### Defending login against timing-based user enumeration

- **The register endpoint's 409 "Email is already registered" is an intentional, explicit
  signal** (see the previous entry's *Decisions*) — but *login* is a different situation: a
  wrong password and a nonexistent account should look identical to an outside observer,
  because leaking "that email doesn't have an account" from the *login* screen specifically
  would let an attacker cheaply enumerate real user emails at scale (unlike registration,
  where they'd have to actually attempt one registration per guess). This is why both cases
  return the exact same `401 { code: "INVALID_CREDENTIALS" }` response in `routes/auth.ts`.
- **Matching response *time*, not just response *body*, is what actually closes the gap.**
  bcrypt's comparison (`bcrypt.compare`) is deliberately slow (see the previous entry on
  `SALT_ROUNDS`). If the login handler only ran `bcrypt.compare` when a matching user was
  found — and returned immediately for a nonexistent email — a nonexistent-email request
  would come back measurably *faster* than a wrong-password request, and that timing
  difference alone would leak which emails are registered even though the JSON bodies match.
  The fix: `DUMMY_PASSWORD_HASH` is a real, precomputed bcrypt hash of an arbitrary value that
  matches no real password. `bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)`
  always runs the same expensive comparison — against the real stored hash if the user
  exists, against the dummy one if not — so both code paths take roughly the same amount of
  work either way.

### What was done

1. **JWT secrets.** Added `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to `backend/.env`
   (real, randomly generated 32-byte hex values, via
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and to
   `backend/.env.example` (clearly fake placeholder strings, plus a comment explaining the
   two-secret split — per the previous entry's rule that real secrets never go in the
   committed example file, unlike the local-only `DATABASE_URL` credentials).
2. **`backend/src/lib/jwt.ts`.** Installed `jsonwebtoken` (+ `@types/jsonwebtoken`). Wrote
   `signAccessToken(userId)` (15m expiry, `JWT_ACCESS_SECRET`) and
   `signRefreshToken(userId)` (7d expiry, `JWT_REFRESH_SECRET`), each just wrapping
   `jwt.sign({ sub: userId }, secret, { expiresIn })`.
3. **The login route.** Added `loginSchema` (email + non-empty password) and
   `authRouter.post("/login", ...)` to `routes/auth.ts`: looks the user up by email,
   `bcrypt.compare`s the password against either the real hash or `DUMMY_PASSWORD_HASH` (see
   *Background*), and on success returns `200` with the same safe user fields the register
   route returns (id/email/displayName/timezone/createdAt — never `passwordHash`) plus
   `accessToken` and `refreshToken`. Any failure — unknown email or wrong password — returns
   a uniform `401 { error: { message: "Invalid email or password", code: "INVALID_CREDENTIALS" } }`.
4. **Tests.** Added a `POST /api/auth/login` block to `routes/auth.test.ts`: successful login
   (asserts both tokens verify with `jwt.verify` against the real secrets, decode to the
   correct `sub`, and that the refresh token's `exp` is later than the access token's — i.e.
   actually longer-lived, not just differently labeled), wrong password → 401, unknown email
   → 401 (same code as wrong password), invalid email format → 400, and missing password →
   400.
5. **Ran into an environment problem unrelated to the new code, and fixed the environment,
   not the code.** Docker Desktop wasn't running when tests were first re-run in this step
   (`docker compose ps` failed to reach the Docker engine at all), so every test touching the
   database — including the *existing*, previously-passing register tests — failed with a
   generic `500`. Started Docker Desktop, waited for its engine to come up, then
   `docker compose up -d postgres` and confirmed `pg_isready`. Also deleted a stale
   `backend/dist/` from an earlier manual build while debugging — it's git-ignored,
   reproducible output, but a leftover `dist/routes/auth.test.js` was confusing Vitest's file
   discovery (Vitest imports the compiled CommonJS version too, which errors, since Vitest
   itself is ESM-only) — a good reminder that stale build output can occasionally interfere
   with the very tests meant to verify the source.
6. **`npm test`** — all 11 tests passed (the original 6 register tests, unchanged, plus 5 new
   login tests).
7. **`npm run build`** — compiled cleanly.
8. **Manual end-to-end check against the compiled server.** Started `node dist/index.js`,
   then via `curl`: registered a fresh user, logged in with the correct password (200, real
   access/refresh tokens back), logged in with a wrong password (401,
   `INVALID_CREDENTIALS`), and logged in with an email that was never registered (401, the
   identical `INVALID_CREDENTIALS` body — confirming the two failure cases are genuinely
   indistinguishable from the response alone). Cleaned up the manually-created user afterward
   via `docker compose exec postgres psql ... DELETE FROM users ...` and confirmed the table
   was back to empty, then stopped the manually-started server.

### Why it's needed

Registration alone only gets a user *into* the database — login is what lets that same user
prove who they are on a later visit and get back the credentials (the access/refresh tokens)
that every other protected endpoint in Phase 2 onward will require. It's also the first place
tokens are minted at all, so the signing infrastructure built here (`lib/jwt.ts`, the two
secrets) is what the upcoming auth middleware (verifying access tokens on protected routes)
and `POST /api/auth/refresh` (task 2.3) will both build on directly.

### Decisions

- **Login and register return uniform-looking failures for different reasons, on purpose.**
  Register's 409 is deliberately specific (see the previous entry); login's 401 is
  deliberately generic, *and* timing-matched via `DUMMY_PASSWORD_HASH` — because the two
  endpoints have different attack surfaces (an attacker "guessing" during registration has to
  create real accounts to test each email; an attacker guessing during login can test emails
  for free and, without the timing fix, would only need a stopwatch — not even a full
  password-guessing attempt — to enumerate them).
- **Access and refresh tokens use separate secrets** rather than one shared `JWT_SECRET`,
  even though nothing *forces* that split yet — it costs nothing today and avoids a shared
  blast radius later once refresh-token rotation (task 2.3) starts trusting refresh tokens
  for a more sensitive operation (minting new access tokens).
- **Refresh tokens are returned in the JSON body for now, not yet as an HTTP-only cookie.**
  Requirements §14 and Tasks.md's own next item (2.3, "refresh token storage/rotation
  strategy... HTTP-only secure cookie") call out cookie-based refresh-token storage as its
  own distinct task with its own design decisions (cookie flags, rotation-on-use, revocation)
  — bundling that into the login endpoint itself would blur two separable pieces of work.
  This login response shape (`{ user, accessToken, refreshToken }`) is expected to change
  once 2.3 lands.
- **15-minute access / 7-day refresh token lifetimes.** Not specified numerically anywhere in
  requirements.md; chosen as conventional, reasonable defaults for a wellness app with no
  unusual sensitivity profile — short enough that a leaked access token is only dangerous
  briefly, long enough on the refresh side that a user isn't forced to fully re-log-in every
  session.

### State at end of this step

`POST /api/auth/login` is live: a registered user can log in with the correct email and
password and receive a signed access token and refresh token; wrong passwords and unknown
emails are both rejected identically (body and, in practice, timing) with `401
INVALID_CREDENTIALS`. Refresh tokens aren't usable for anything yet — `POST /api/auth/refresh`
(task 2.3) hasn't been built — and nothing in the app verifies an access token on a protected
route yet either, since no protected routes exist before Phase 2's later middleware task.

### Verification

- `npm test` (`vitest run`) — 11/11 tests passing (6 pre-existing register tests unchanged, 5
  new login tests), against the real local Postgres container.
- `npm run build` — compiled cleanly.
- Manual `curl` round-trip against the compiled server: register → login success (200, valid
  tokens) → login wrong password (401) → login unknown email (401, identical body to the
  wrong-password case). All four matched expectations.
- Confirmed via `docker compose exec postgres psql ... SELECT count(*) FROM users` that no
  manual test data was left behind afterward.
- Manually decoded the returned tokens (via the same `jwt.verify` logic the tests use) to
  confirm the access and refresh tokens carry the correct `sub` (user id) and that the
  refresh token's expiry is meaningfully later than the access token's.

---

## 2026-08-15 — Phase 2: refresh token cookie storage/rotation + `POST /api/auth/refresh`

**Task:** [Tasks.md](../../Tasks.md) → Phase 2 → "Implement refresh token storage/rotation
strategy (e.g. HTTP-only secure cookie for the refresh token) and `POST /api/auth/refresh`."

**Delivered via branch:** `feature/2.3-auth-refresh` (branched from `feature/2.2-auth-login`,
since this task builds directly on `lib/jwt.ts` and the login endpoint from that branch,
which wasn't merged to `main` yet — see *Decisions*).

### Background / concepts

#### Why a cookie instead of just leaving the refresh token in the JSON body

- **A refresh token is more dangerous to leak than an access token.** The previous entry's
  access token expires in 15 minutes; a leaked refresh token is valid for 7 days *and* can
  mint new access tokens on demand. That makes it a much higher-value target for anything
  that can read the page's JavaScript — a malicious browser extension, an XSS bug, a
  dependency that turns hostile.
- **This is exactly the class of attack an `HttpOnly` cookie is designed to block.** A cookie
  marked `HttpOnly` is attached automatically by the browser on requests to the matching
  path, but is *invisible to JavaScript* (`document.cookie` simply won't show it). So even if
  an attacker manages to run arbitrary JS on the page, they still can't read the refresh
  token out of it — the previous body-based approach had no such protection; any JS on the
  page could read `response.body.refreshToken` directly. This is why the login response body
  now only carries `accessToken`, and the refresh token exists solely as a cookie.
- **The other three cookie flags set alongside `HttpOnly`** (`lib/cookies.ts`):
  - `Secure` — tells the browser to only ever send the cookie over `https`, never plain
    `http`, so it can't be sniffed on the wire. Skipped in non-production (`NODE_ENV !==
    "production"`) because local dev runs over plain `http`, where a `Secure` cookie would
    silently just never be sent at all — not a security relaxation so much as making the
    cookie work at all locally, with production still getting the real protection.
  - `SameSite=Lax` — tells the browser not to attach this cookie on cross-site requests
    (e.g. a `<form>` on some other website submitting to this API), which is what makes
    cookies resistant to CSRF in the first place. `Lax` (rather than `Strict`) still allows
    the cookie on top-level navigation, which doesn't matter yet for an API-only backend but
    is the conventional safe default.
  - `Path=/api/auth` — scopes the cookie so the browser only attaches it on requests to
    `/api/auth/*` (i.e. login, refresh, and future logout/reset endpoints), not on *every*
    request to the backend. Once Phase 3's data endpoints exist, none of them will see this
    cookie at all — smaller blast radius if anything downstream ever mishandled cookies.

#### What "rotation" means and why it's worth doing

- **Rotation = every successful refresh issues a brand-new refresh token, not just a new
  access token.** `POST /api/auth/refresh` calls `signRefreshToken` again and overwrites the
  cookie with the new value on every call, in addition to returning a new access token.
- **Why bother, if the old one hasn't expired yet?** Without rotation, a single refresh token
  is valid, unchanged, for its entire 7-day lifetime — if it ever leaked once (e.g. copied
  from a debugger, logged somewhere by accident), it stays usable for the attacker the whole
  time, with zero indication anything is wrong. With rotation, the *legitimate* browser is
  continuously exchanging its refresh token for a fresh one, so a leaked-and-unused token
  becomes stale relatively quickly in normal usage. This implementation is deliberately the
  simple, stateless version — verify-and-reissue, no server-side record of which refresh
  tokens have been "used up" — not the fuller reuse-detection pattern (where reusing an
  already-rotated token would revoke the whole token family). That fuller version needs a
  database table tracking issued tokens, which is more machinery than this MVP's threat model
  currently calls for; noted here so it isn't confused with having been built.

### What was done

1. **`backend/src/lib/jwt.ts`.** Renamed the TTL constants to be second-based
   (`ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`) instead of the string form
   (`"15m"`/`"7d"`) so the refresh token's lifetime is defined in exactly one place and can be
   reused as a number for the cookie's `maxAge` (which needs milliseconds, not a string) —
   avoids the two ever silently drifting apart. Added `verifyRefreshToken(token)`, wrapping
   `jwt.verify` against `JWT_REFRESH_SECRET` specifically (never `JWT_ACCESS_SECRET` — see
   the previous entry's *separate secrets* reasoning).
2. **`backend/src/lib/cookies.ts` (new).** `setRefreshTokenCookie(res, token)` and
   `clearRefreshTokenCookie(res)`, centralizing the cookie name (`refreshToken`) and all four
   flags described above in one place, so login, refresh, and the future logout endpoint
   (task 2.4) all set/clear the identical cookie rather than each re-specifying the flags and
   risking one getting it wrong.
3. **`cookie-parser`.** Installed `cookie-parser` + `@types/cookie-parser` and wired
   `app.use(cookieParser())` into `app.ts`, ahead of the routes — this is what populates
   `req.cookies` from the raw `Cookie` request header; without it `req.cookies` would be
   `undefined`.
4. **Updated the login route.** Now calls `setRefreshTokenCookie` and no longer returns
   `refreshToken` in the JSON body — the response shape is now `{ user, accessToken }`,
   exactly the change flagged as expected in the previous entry's *Decisions*.
5. **New `POST /api/auth/refresh` route.** Reads `req.cookies.refreshToken`; if missing,
   `401 MISSING_REFRESH_TOKEN`. Otherwise `verifyRefreshToken`s it (catching a bad signature
   or expiry) and looks the user up by the token's `sub`; either failure — bad token or a
   `sub` whose user no longer exists (e.g. account was deleted) — clears the cookie and
   returns a uniform `401 INVALID_REFRESH_TOKEN` (same "don't leak which failure case"
   principle as login's `INVALID_CREDENTIALS`, applied here to "expired" vs. "forged" vs.
   "deleted user" rather than "wrong password" vs. "no such account"). On success, rotates
   the cookie (new `signRefreshToken`) and returns a new `accessToken`.
6. **Tests.** Updated the existing login test to assert the refresh token is absent from the
   body and present as an `HttpOnly`, `Path=/api/auth` cookie instead (parsed out of the raw
   `Set-Cookie` header, since supertest doesn't expose cookies as a friendlier object). Added
   a `POST /api/auth/refresh` block: valid cookie → 200 with a new access token and a rotated
   cookie; no cookie → 401 `MISSING_REFRESH_TOKEN`; a garbage/malformed token → 401
   `INVALID_REFRESH_TOKEN` with the cookie cleared; a token *correctly signed but with the
   wrong secret* (`JWT_ACCESS_SECRET` instead of `JWT_REFRESH_SECRET`) → 401, confirming the
   two token types genuinely can't be swapped; and a well-formed token for a user deleted
   after login → 401.
7. **`npm test`** — 16/16 passing (11 pre-existing register/login tests, 5 new refresh tests)
   against the real local Postgres container.
8. **`npm run build`** — compiled cleanly.
9. **Hit a pre-existing, unrelated tooling break: `npm run dev` (`ts-node-dev`) now crashes on
   startup** (`TypeError: Cannot read properties of undefined (reading 'fileExists')` inside
   `ts-node`'s config loader) — a `ts-node`/TypeScript 7.x incompatibility, not caused by this
   step's changes (`npm run build`, using `tsc` directly rather than `ts-node`, compiles
   without any error). Worked around it for manual verification by running the compiled
   output directly (`npm run build && npm start`) instead of the dev server; the underlying
   `ts-node-dev` breakage is left as a follow-up, not fixed here, since fixing dev-mode
   tooling is unrelated to the refresh-token feature itself.
10. **Manual end-to-end check against the compiled server**, via `curl`: registered a user,
    logged in (`Set-Cookie: refreshToken=...; HttpOnly; SameSite=Lax; Path=/api/auth`
    confirmed in the raw response headers, and `refreshToken` confirmed absent from the JSON
    body), then called `/api/auth/refresh` three ways — with the real cookie (200, new access
    token, cookie rotated to a new value), with no cookie at all (401
    `MISSING_REFRESH_TOKEN`), and with a garbage cookie value (401 `INVALID_REFRESH_TOKEN`,
    and the response's `Set-Cookie` showed the cookie being cleared, i.e. `Max-Age=0`/epoch
    expiry). Cleaned up the manually-created user afterward directly via `psql` (`DELETE FROM
    users WHERE email LIKE 'manual-verify-%'`) and stopped the manually-started server.

### Why it's needed

Without this step, the refresh token minted at login was inert — nothing could ever redeem it
for a new access token, and it sat in the JSON response body where any JS on the page could
read it. This closes both gaps: the token now lives somewhere the page's own JavaScript can't
touch, and there's a working endpoint that lets a returning user keep their session alive past
the access token's 15-minute expiry without re-entering their password, which is what Phase
5/6's frontend API client (task: "attaches the access token, and on a 401 automatically
attempts a token refresh before retrying once") will call.

### Decisions

- **Branched off `feature/2.2-auth-login` instead of `main`.** This task's code depends
  directly on `lib/jwt.ts` and the login endpoint added in 2.2, and PR #7 (2.2) was still open
  for review — not yet merged to `main` — when this task started. Branching off `main` would
  have meant working without the very code being extended. This branch will need a rebase
  onto `main` once #7 is merged, which is expected and normal for stacked work like this.
- **Stateless rotation, not full reuse-detection.** Covered under *Background* above — chosen
  as the right amount of complexity for this MVP's threat model; a database-backed
  "token family" revocation system is a reasonable future hardening step, not a gap being
  silently ignored.
- **`Path=/api/auth` rather than the whole site.** Keeps the refresh cookie out of every
  non-auth request entirely, which is strictly safer than a site-wide cookie and costs
  nothing, since only the auth routes ever need to read it.
- **CORS is still wide open (`cors()` with no options) even though cookies now matter.**
  Tasks.md has "Add CORS configuration restricting allowed origins" as its own later, separate
  checklist item (Phase 2's security-hardening group). Once the frontend actually starts
  calling this cross-origin (Phase 5+), sending credentialed (cookie-bearing) requests
  requires CORS to name an explicit origin and set `credentials: true` — a wildcard origin
  cannot be combined with credentials per the browser spec. Left as-is here deliberately, to
  keep this task scoped to the token/cookie mechanics rather than reaching into a separately
  tracked task; flagged here so it isn't forgotten before the frontend needs it.

### State at end of this step

`POST /api/auth/refresh` is live: a valid refresh cookie exchanges for a new access token and
a rotated refresh cookie; a missing, invalid, or user-deleted-since-issued refresh token is
rejected with a uniform `401 INVALID_REFRESH_TOKEN` (or `MISSING_REFRESH_TOKEN` when there's
no cookie at all) and the cookie is cleared. The login endpoint's response shape has changed
to `{ user, accessToken }` — code or docs elsewhere referencing `res.body.refreshToken` from
the previous entry are now stale. Logout (task 2.4, next) still doesn't exist — right now
nothing clears a refresh cookie except a failed refresh attempt.

### Verification

- `npm test` (`vitest run`) — 16/16 tests passing (11 pre-existing, 5 new), against the real
  local Postgres container.
- `npm run build` — compiled cleanly.
- Manual `curl` round-trip against the compiled server (`npm start`): register → login
  (verified `Set-Cookie` flags and body shape directly in the raw HTTP response) → refresh
  with the real cookie (200, rotated cookie) → refresh with no cookie (401) → refresh with a
  garbage cookie (401, cookie cleared). All five matched expectations.
- Confirmed via `psql` that the manually-created test user was removed afterward.

---

## 2026-08-15 — Phase 2: `POST /api/auth/logout`

**Task:** [Tasks.md](../../Tasks.md) → Phase 2 → "Implement `POST /api/auth/logout` — invalidate/
clear the refresh token."

**Delivered via branch:** `feature/2.4-auth-logout` (branched from `feature/2.3-auth-refresh`,
for the same reason as that branch was stacked on `feature/2.2-auth-login` — it depends on
`clearRefreshTokenCookie` from 2.3's `lib/cookies.ts`, and #7/#8 weren't merged yet).

### Background / concepts

#### Why "invalidate" a stateless JWT just means "stop sending it"

- **There's no server-side session record to delete.** A traditional session-based login
  stores a session ID in a database table, and logging out means deleting that row — after
  that, the session ID is provably useless even if someone still has it. This app's tokens
  are stateless JWTs instead (see the 2.2 entry's *Background*): the server never stores
  "which tokens are currently valid" anywhere, it just verifies signatures on demand. That
  means there is no row to delete, and by extension no way to make a *specific* already-issued
  refresh token stop working before its natural 7-day expiry — the server has no record of it
  existing in the first place.
- **So what does logout actually do here?** It clears the `HttpOnly` refresh cookie via
  `Set-Cookie: refreshToken=; Expires=<epoch>` (`clearRefreshTokenCookie`, already built in
  2.3). The *browser* then stops attaching the cookie to future requests, which in practice is
  what "being logged out" means for the legitimate user on that device — they can no longer
  reach `/api/auth/refresh` without logging in again. This is a real, meaningful action (the
  same-device, same-browser case that "click logout" is actually for), just not the same
  *kind* of guarantee a server-side session deletion gives (which would also stop a copied,
  still-cookied token from working on a *different* device). That gap is a known, accepted
  consequence of the stateless design chosen in 2.2/2.3, not something this task was expected
  to close — closing it would mean building the server-side revocation list explicitly
  deferred in 2.3's *Decisions*.

### What was done

1. **`POST /api/auth/logout` route**, added to `routes/auth.ts`: calls
   `clearRefreshTokenCookie(res)` and returns `200 { message: "Logged out" }`. No request body,
   no auth requirement (per *Background*, above — there's no session to check, so there's
   nothing to reject even from a request with no cookie at all; calling it is always safe).
2. **Tests.** Added a `POST /api/auth/logout` block to `routes/auth.test.ts`:
   - The main case uses `request.agent(app)` (supertest/superagent's cookie-jar-aware client)
     instead of the plain `request(app)` the other tests use, specifically because this is the
     first test where the thing being verified — "the *next* request from the same client
     no longer carries the cookie" — depends on a real cookie jar reacting to a `Set-Cookie`
     header, not just inspecting one response in isolation. The agent registers, logs in,
     calls logout, then calls `/api/auth/refresh` again with no manual cookie handling — and
     that final call getting `401 MISSING_REFRESH_TOKEN` is the actual proof the clear worked,
     the same way a real browser would behave.
   - A second test confirms logout still returns `200` when called with no cookie at all
     (e.g. double-clicking logout, or calling it while already logged out) — since there's no
     session state to be "wrong" about, there's nothing to 401 on.
3. **`npm test`** — 18/18 passing (16 pre-existing, 2 new logout tests).
4. **`npm run build`** — compiled cleanly.
5. **Manual end-to-end check against the compiled server**, via `curl` with a cookie jar
   (`-b`/`-c` against the same file): registered a user, logged in (confirmed the refresh
   cookie present in the jar), called logout (`200 { message: "Logged out" }`, `Set-Cookie`
   header showed the epoch-expiry clear, and the cookie jar file itself no longer contained a
   `refreshToken` line afterward), then called `/api/auth/refresh` using the now-cleared jar
   and got `401 MISSING_REFRESH_TOKEN` — i.e. the same round-trip the agent-based test
   automates, reproduced manually against the real compiled server. Cleaned up the
   manually-created user afterward via `psql` and stopped the manually-started server.

### Why it's needed

Registration, login, and refresh (2.1–2.3) only ever *start or extend* a session — logout is
the first endpoint that lets a user deliberately end one, which requirements §5 and the
Definition of Done checklist ("Register, log in, log out, ... all work end-to-end") both call
out as a baseline expectation. It also directly unblocks Phase 6's frontend "Logout action
(clears session, calls `/api/auth/logout`)" task, which just needs this endpoint to exist and
behave the way it now does.

### Decisions

- **No request body, no auth check.** Nothing about "log this session out" needs the caller to
  prove who they are first — clearing a cookie that may or may not exist is harmless either
  way, and requiring a valid access token here would just add a failure mode (an already-
  expired access token) to an action that should always succeed. This mirrors login/refresh's
  general pattern of only rejecting requests when rejecting is actually meaningful.
- **Did not build server-side token revocation (a denylist/allowlist of issued refresh
  tokens) to make logout "really" invalidate the token everywhere.** Consistent with 2.3's
  same call on rotation — the added complexity (a database table, checking it on every
  refresh) is a deliberate, documented gap against this MVP's threat model, not an oversight.
  If a future task needs "log out this account on all devices," that's the point where this
  would need to be revisited.

### State at end of this step

`POST /api/auth/logout` is live: it always returns `200` and clears the refresh cookie when
one exists. Combined with 2.1–2.3, the full local login lifecycle now works end-to-end at the
API level: register → log in (access token + refresh cookie) → refresh (rotate for a new
access token) → log out (cookie cleared, further refresh attempts rejected). Forgot/reset
password (2.5–2.6) are the remaining pieces before Phase 2's core auth flow is complete.

### Verification

- `npm test` (`vitest run`) — 18/18 tests passing (16 pre-existing, 2 new), against the real
  local Postgres container.
- `npm run build` — compiled cleanly.
- Manual `curl` round-trip against the compiled server, using a real cookie jar file: register
  → login (cookie present in jar) → logout (cookie cleared in jar, confirmed by re-inspecting
  the jar file) → refresh with the now-cookie-less jar (401 `MISSING_REFRESH_TOKEN`).
- Confirmed via `psql` that the manually-created test user was removed afterward.

---

## 2026-08-15 — Phase 2: Express auth middleware (`requireAuth`)

**Task:** [Tasks.md](../../Tasks.md) → Phase 2 → "Implement an Express auth middleware that
verifies the access token and attaches the authenticated user to the request; use it on all
protected routes."

**Delivered via branch:** `feature/2.7-auth-middleware` (branched from `main`). This is the
first piece of a new "vertical slice" — the same full-stack, one-feature-at-a-time approach
used to get login working end to end — this time aimed at the app's first real wellness-
tracking feature (mood logging), rather than auth itself. This task is the necessary first
step: every log-type endpoint (mood, symptoms, medications, habits) needs to know *which
user* is making the request before it can safely read or write that user's data, and nothing
in the codebase does that yet.

### Background / concepts

#### What "middleware" means in Express

- Express handles a request by running it through a *chain* of functions in order — each one
  called "middleware" — before it reaches the actual route handler. `cors()`, `express.json()`,
  and `cookieParser()` in `app.ts` are all middleware already in use: each one looks at the
  request, does something (parses the body, reads cookies), and calls `next()` to pass control
  along to whatever comes after it. A middleware that *doesn't* call `next()` — because it
  decides the request shouldn't proceed — stops the chain right there, which is exactly how
  authentication gets enforced: `requireAuth` either calls `next()` (proceed) or sends a `401`
  response itself (stop), and nothing after it in the chain ever runs for a rejected request.
- **Why this belongs in its own reusable function rather than being copy-pasted into every
  route.** Every protected endpoint needs the exact same check ("is there a valid access token,
  and if so, whose is it?"). Writing that logic once and attaching it wherever it's needed
  (`router.get("/mood-logs", requireAuth, handler)`) means there's exactly one place that logic
  can have a bug, instead of a dozen near-identical copies that can quietly drift apart.

#### Bearer tokens vs. the refresh cookie — two different auth mechanisms, on purpose

- This app already has one place tokens travel automatically: the refresh token, sent as an
  `HttpOnly` cookie the browser attaches by itself (see the Phase 2.3 refresh-token entry). The
  access token works differently, **on purpose**: it's read from an `Authorization: Bearer
  <token>` request header, which the *frontend's own code* has to attach explicitly (already
  built — see `frontend/src/api/client.ts`'s `apiFetch`, from the Phase 5 API client task).
- **Why not just use a cookie for the access token too?** Because the two tokens have
  deliberately different jobs and different lifetimes. The refresh token's whole point is to
  sit quietly and be sent automatically without any frontend code touching it (that's what
  makes it safe from XSS — see the 2.3 entry). The access token, by contrast, is *supposed* to
  be handled by frontend JavaScript — the API client needs to be able to hold it in memory,
  swap it out the moment a refresh returns a new one, and decide per-request whether to attach
  it at all. A `Bearer` header is simply the standard, conventional way to send a token that
  the calling code manages directly, rather than one the browser manages on its behalf.
- `requireAuth` therefore calls the new `verifyAccessToken` (added to `lib/jwt.ts` alongside
  the existing `verifyRefreshToken`) — checking the signature against `JWT_ACCESS_SECRET`
  specifically. Using the wrong secret here would be a real security bug: it would mean a
  refresh token (a much longer-lived credential) could be used to authenticate ordinary API
  requests, defeating the entire reason the two tokens have separate secrets and separate
  short/long lifetimes in the first place.

#### Attaching the user to the request: TypeScript declaration merging

- Once `requireAuth` verifies a token, the route handler that runs next needs to know *whose*
  request this is. The convention is to attach it directly onto the `req` object
  (`req.userId = payload.sub`), since Express passes that same object through the whole chain.
- Plain JavaScript would let any code just read `req.userId` back out with no fuss. TypeScript,
  by default, doesn't know that property exists on Express's `Request` type and would refuse to
  compile `req.userId`. `backend/src/middleware/requireAuth.ts` fixes this with a small
  `declare global { namespace Express { interface Request { userId?: string } } }` block — this
  is TypeScript's "declaration merging" feature, which lets a project extend a type defined in
  a library it doesn't own. After this, every route handler downstream of `requireAuth` sees
  `req.userId: string | undefined` as a genuinely typed property, with real autocomplete and
  compile-time checking — not an untyped grab-bag.

### What was done

1. **`backend/src/lib/jwt.ts`.** Added `verifyAccessToken(token)`, the access-token counterpart
   to the existing `verifyRefreshToken` — verifies against `JWT_ACCESS_SECRET` specifically.
2. **`backend/src/middleware/requireAuth.ts` (new).** Reads the `Authorization` header, requires
   the `Bearer <token>` format (anything else — missing header, wrong scheme — is treated as
   "no token provided"), verifies it, and either attaches `req.userId` and calls `next()`, or
   responds `401` and stops the chain. Two distinct error codes, mirroring the existing
   refresh-token error pattern: `MISSING_ACCESS_TOKEN` (no token sent at all) vs.
   `INVALID_ACCESS_TOKEN` (a token was sent but is expired, forged, or signed with the wrong
   secret) — useful for a frontend to eventually distinguish "never logged in" from "session
   expired," even though the current API client already handles both the same way (attempt a
   refresh, then give up).
3. **Tests (`requireAuth.test.ts`).** Since no real protected route exists in the codebase yet
   to test this against (that arrives with the next task, the mood-logs endpoint), the test
   file builds a tiny throwaway Express app with one route (`GET /protected`) that exists only
   for this test — exactly the shape a real protected route will have. Covers: a valid token
   (200, correct `req.userId` attached), no `Authorization` header (401
   `MISSING_ACCESS_TOKEN`), a non-Bearer `Authorization` header (401, same code), an expired
   token, a token signed with the *refresh* secret instead of the access secret (401
   `INVALID_ACCESS_TOKEN` in both cases — proving the two token types can't be swapped, the
   same property already tested for the refresh endpoint in the 2.3 entry), and a garbage
   token string.
4. **`npm test`** — 24/24 passing (18 pre-existing, 6 new).
5. **`npm run build`** — compiled cleanly, confirming the declaration-merging trick above is
   valid TypeScript and not just something that happens to run under `ts-node`.

### Why it's needed

Every remaining backend task in this vertical slice — the mood-logs endpoint next — needs to
answer "which user does this request belong to?" before it can safely read or write data.
Without this middleware, that check would either not exist at all (meaning any request could
read or write any user's data by guessing an ID — the exact cross-user data leak Phase 11 is
built to catch) or would need to be reimplemented inline in every single route.

### Decisions

- **`req.userId` (a string) rather than `req.user` (a full user object).** The token only ever
  proves *who* the request is from, not any other detail about them — fetching the full `User`
  row is a separate, deliberate database call that individual routes can make if and when they
  actually need more than the ID (e.g. the future `GET /api/users/me`). Attaching a full user
  object here would mean either a database query on *every single request* whether the route
  needs it or not, or attaching stale/incomplete data — neither is worth it for the common case
  of "just tell me whose mood log to create."
- **Tested against a throwaway route rather than waiting for a real one.** Blocking this task on
  the mood-logs endpoint existing first would invert the dependency the wrong way — the
  endpoint needs the middleware to exist and be correct *first*. Testing the middleware in
  isolation, the same way `lib/jwt.ts`'s functions are unit-tested directly rather than only
  through the routes that use them, keeps this task genuinely finished on its own.

### State at end of this step

`requireAuth` exists, is fully tested, and is ready to be attached to routes — but nothing
uses it yet. No behavior of the live app has changed. The next task (mood-logs endpoint) is
where it gets attached to a real route for the first time.

### Verification

- `npm test` (`vitest run`) — 24/24 tests passing (18 pre-existing, 6 new).
- `npm run build` — compiled cleanly.

---

## 2026-08-16 — Phase 2: `POST /api/auth/change-password`

**Task:** [Tasks.md](../../Tasks.md) → Phase 2 → "Implement `POST /api/auth/change-password` — for a
logged-in user; requires the current password to be re-verified before updating the hash."

**Delivered via branch:** `feature/2.5-auth-change-password`. First half of the change-password
vertical slice added to `Tasks.md` in the previous entry — this is the backend piece; the
Settings-page form is next.

### Background / concepts

#### Why this route needs `requireAuth`, and why it re-checks the password anyway

- This is the first route in `auth.ts` itself to use `requireAuth` — every route in this file
  before now (register, login, refresh, logout) is deliberately reachable *without* being
  logged in, since their whole job is establishing or ending a session. Change-password is
  different: it only makes sense for someone who already has a session, so it's mounted behind
  `requireAuth` like the mood-logs routes are.
- **Being logged in isn't the same as proving you should be allowed to change the password,
  though** — an access token only proves "a request came from whoever holds this token," which
  could be a browser someone left signed in, or a stolen (but not yet expired) token. Requiring
  the *current* password as well as a valid session is a second, independent factor — someone
  with just the access token, but not the actual password, still can't take over the account by
  changing its password out from under the real owner.

#### Clearing the refresh cookie on success — the one thing that actually can be revoked here

- The refresh-token entry (Phase 2.3) already covers why this app's JWTs can't be individually
  revoked server-side: they're stateless, verified by signature alone, with no database record
  of which ones are "still good." That means changing a password can't retroactively invalidate
  some other device's already-issued access token, or force that device to know a change even
  happened — a genuine, previously-documented limitation, not new here.
- **What *can* be done: clear the refresh cookie on the browser making the change**, the exact
  same mechanism `logout` already uses. This doesn't revoke anything happening elsewhere, but it
  does mean *this* browser session ends the moment the password changes, forcing a fresh login
  with the new password — a reasonable, standard expectation after a password change, achieved
  with a function this route already had available rather than any new mechanism.

#### Reusing `passwordField` instead of duplicating the strength rules

- `registerSchema`'s password validation (min 8 characters, at least one letter, at least one
  number) got pulled out into a standalone `passwordField` Zod schema, referenced by both
  `registerSchema` and the new `changePasswordSchema`. Without this, a future change to password
  strength rules would need updating in two places by memory, with real risk of only one
  actually getting updated — the same "single source of truth" reasoning already applied
  elsewhere in this codebase (e.g. `ENERGY_STRESS_VALUES` driving both the button count and the
  caption text in `MoodEntryForm.tsx`).

### What was done

1. **`backend/src/routes/auth.ts`.** Extracted `passwordField`; added `changePasswordSchema`
   (`currentPassword`, `newPassword`); added `POST /change-password` behind `requireAuth` —
   verifies `currentPassword` against the stored hash (`401 INVALID_CURRENT_PASSWORD` if it
   doesn't match, reusing the same constant-time-comparison-via-dummy-hash trick already used by
   login for the "no such user" case, here covering the theoretical case of the token's user
   having been deleted mid-session), hashes and stores `newPassword` on success, clears the
   refresh cookie, returns `200 { message: "Password updated" }`.
2. **Tests.** No access token → `401 MISSING_ACCESS_TOKEN`; wrong current password → `401
   INVALID_CURRENT_PASSWORD`; a new password failing the strength rules → `400
   VALIDATION_ERROR`; full success path — asserts the refresh cookie is cleared in the response,
   that a subsequent login with the *old* password now fails, that a login with the *new*
   password succeeds, and that the stored hash is neither the plaintext new password nor
   unchanged (a real bcrypt hash).
3. **`npm test`** — 38/38 passing (34 pre-existing, 4 new).
4. **`npm run build`, `npx eslint .`, `npx prettier --check .`** — all clean.
5. **Manual end-to-end verification against the compiled, running server**, via `curl`:
   registered a real user, confirmed no-token and wrong-current-password rejections, performed a
   real password change (inspecting the raw response headers to confirm the refresh cookie
   clear), then confirmed directly that logging in with the old password now fails and the new
   password succeeds. Cleaned up the manually-created test user afterward and stopped the
   manually-started server.

### Why it's needed

The app now has real users outside of testing, and until this task, there was no way to change
a password without going through the (still unbuilt) email-based forgot-password flow — meaning
a user who simply wanted to update their password for routine security hygiene had no way to do
so at all.

### Decisions

- **Clearing the refresh cookie rather than leaving the session active.** Covered above — the
  one meaningful "revoke" available given this app's stateless-JWT design, and matches the
  reasonable expectation that changing a password should require logging back in.
- **Reused `passwordField` rather than duplicating the strength regex.** Covered above.

### State at end of this step

A real, working, tested, auth-protected `POST /api/auth/change-password` endpoint exists.
Nothing on the frontend calls it yet — the Settings-page form is the next task, which is what
actually makes this reachable by a real user rather than only `curl`.

### Verification

- `npm test` — 38/38 passing (34 pre-existing, 4 new).
- `npm run build`, `npx eslint .`, `npx prettier --check .` — all clean.
- Manual `curl` round-trip against the compiled, running server, covering every case: missing
  token, wrong current password, weak new password, and a full successful change followed by
  confirming the old password no longer works and the new one does.

---

## 2026-08-16 — The full authentication pattern, explained end to end

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — this app's auth system has been built
piece by piece across many earlier entries (register, login, refresh tokens, the backend
`requireAuth` middleware, the frontend `RequireAuth` guard, the API client's automatic
refresh-on-401). Each entry explained its own piece well, but none of them lay out the *whole
shape* in one place. This entry does that deliberately, as a standalone reference — the goal is
that this specific pattern (not just this specific app) is something a beginner could recognize
and re-implement in a completely different project later.

### The core problem this whole pattern solves

HTTP is **stateless** — every request is a brand new, disconnected event as far as the raw
protocol is concerned. The server that handles `POST /api/mood-logs` has no built-in memory of
who's making that request; unless something is done deliberately, there's no way to distinguish
"a real logged-in user" from "a stranger with the URL." Everything in this section exists to
answer one question on every single request: **who is this, and are they allowed to do this?**

### The two tokens, and why there are two instead of one

- **The access token** is a short-lived (15 minutes), signed proof of identity. "Signed" means
  it's cryptographically tamper-evident — the server can verify it hasn't been altered, without
  needing to look anything up in a database. It's deliberately handled by the frontend's own
  JavaScript (attached to requests, held in memory), because it's short-lived enough that even
  if it leaked, the damage window is small.
- **The refresh token** is longer-lived (7 days) and exists for exactly one purpose: trading
  itself in for a new access token, so the user isn't forced to re-enter their password every
  15 minutes. It's deliberately kept *out* of JavaScript's reach entirely — delivered only as an
  `HttpOnly` cookie, which the browser attaches automatically but which `document.cookie` (and
  therefore any malicious script that ends up running on the page) simply cannot read.
- **The general principle this demonstrates:** the token that's riskier to leak (longer-lived,
  more powerful) is the one given the stronger protection (invisible to JavaScript), even though
  that makes it slightly less convenient to work with. The token that's cheaper to leak (short
  lifespan) is the one handed to the more flexible but less protected mechanism. This trade-off
  — matching the *protection* to the *risk*, not applying the same protection uniformly
  everywhere — is a pattern worth recognizing in other security decisions generally, not just
  this one.

### Server-side protection: `requireAuth`, and what "middleware" buys here

- Express (like most server frameworks) lets a request pass through a chain of functions before
  reaching the code that actually handles it. `requireAuth` is one link in that chain: it reads
  the `Authorization: Bearer <token>` header, verifies the token's signature, and either attaches
  `req.userId` and lets the request continue (`next()`), or responds `401` itself and stops the
  chain right there — the actual route handler never even runs for a rejected request.
- **Why a shared middleware instead of checking this inside every route handler:** every
  protected route needs the exact same check. Writing it once and attaching it wherever it's
  needed means there's exactly one place that logic can have a bug, instead of a dozen
  near-identical copies silently drifting apart over time. This is the same reasoning behind
  reusable functions in general, just applied specifically to "a check every protected endpoint
  needs."
- **The generic version of this pattern, for a different project:** any server framework will
  have some equivalent concept (middleware, a decorator, a guard, an interceptor — the name
  varies) for "run this check before the real handler, and let it short-circuit the request."
  Whatever it's called in a given framework, the shape is the same: verify identity once, in one
  place, before any route-specific logic runs.

### Client-side protection: `RequireAuth`, and the trick that makes it work

```tsx
export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

- This is a **route guard**, the frontend's equivalent of the backend's `requireAuth`
  middleware — but it has to work completely differently, because there's no request/response
  chain on the frontend to hook into. Instead, it's just an ordinary React component, placed as
  a *wrapping* route in `App.tsx`:
  ```tsx
  <Route element={<RequireAuth />}>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    {/* ...every other protected page... */}
  </Route>
  ```
- **`<Outlet />` is the key piece to understand.** It's React Router's placeholder for "render
  whichever nested route actually matched" — when a signed-in user visits `/settings`,
  `RequireAuth` renders, sees `isAuthenticated` is `true`, and renders `<Outlet />`, which React
  Router then fills in with `<SettingsPage />`. When `isAuthenticated` is `false`, `RequireAuth`
  never renders `<Outlet />` at all — it renders `<Navigate>` instead, which redirects before
  the protected page's component is ever mounted. The protected page's own code doesn't need to
  know or check anything about auth itself; simply being nested inside this wrapping route *is*
  the protection.
- **`state={{ from: location }}`** carries "where the user was trying to go" along with the
  redirect, so `LoginPage` can send them back to that exact page after a successful login
  instead of always dumping them on the dashboard regardless of what they actually clicked.
- **This is also exactly the mechanism that caused the real race-condition bug in the previous
  entry**, worth restating here as a caution: because `RequireAuth` re-evaluates on *every*
  render, the instant `isAuthenticated` becomes `false` while a guarded route is still current,
  it fires its own redirect — regardless of whether some *other* code is also trying to
  navigate away at that same moment. Any code that logs a user out should navigate to an
  unguarded route *first*, then clear auth state, to avoid competing with `RequireAuth`'s own
  redirect over what `/login` ends up showing.

### A full walkthrough: one user, from cold page load to logging out

Tying every piece together as a single continuous story, in order:

1. **Cold load, not yet logged in.** `AuthProvider` initializes `{ user: null, accessToken:
   null }`. Visiting `/dashboard` — a guarded route — `RequireAuth` sees `isAuthenticated:
   false` and redirects to `/login`, remembering `/dashboard` as `state.from`.
2. **Logging in.** `LoginPage` calls `POST /api/auth/login`. The server verifies the password,
   and responds with a fresh access token in the JSON body *and* sets the refresh token as an
   `HttpOnly` cookie via `Set-Cookie` — the browser stores that cookie automatically; nothing in
   the frontend's own code ever touches it directly. `AuthContext` stores the access token in
   memory and updates `user`. `LoginPage` reads `state.from` and navigates there — back to
   `/dashboard`, exactly where the user originally tried to go.
3. **Using the app.** Every `apiFetch` call now attaches `Authorization: Bearer <accessToken>`
   automatically. The backend's `requireAuth` verifies it on each request; nothing needs to be
   done differently by any individual page or component.
4. **15 minutes pass; the access token expires.** The next API call gets back a `401`.
   `apiFetch` (not the calling code, not the component) notices this itself, and automatically
   calls `POST /api/auth/refresh` — which reads the still-valid refresh cookie the browser has
   been quietly holding onto, verifies it, and returns a *new* access token (while also rotating
   the refresh cookie to a new value — see the Phase 2.3 entry for why). `apiFetch` retries the
   original request once with the new token. **None of this is visible to the user or to
   whatever page triggered the original request** — it just looks like the request quietly
   succeeded, possibly a beat slower than usual.
5. **7 days pass, or the user explicitly logs out; the refresh token is gone too.** The next
   refresh attempt now fails for real (`401 MISSING_REFRESH_TOKEN` or `INVALID_REFRESH_TOKEN`).
   `apiFetch` reports this via `onAuthFailure` — `AuthContext` is listening for exactly that
   signal, and clears its state (`user: null, accessToken: null`) the moment it fires. On the
   *next* render, `RequireAuth` (wrapping whatever protected page the user still happens to be
   looking at) notices `isAuthenticated` is now `false` and redirects to `/login` — even though
   the user never explicitly clicked anything. This is the same mechanism from step 1, just
   triggered by session expiry instead of a fresh page load.

### The pattern, stripped down to what's worth carrying to a different project

- Two tokens, not one: a short-lived one the frontend actively manages, a long-lived one the
  browser handles automatically and JavaScript never touches.
- One shared server-side check (middleware/guard/interceptor — whatever the framework calls it)
  that every protected endpoint uses, rather than each one checking auth itself.
- One shared client-side wrapper component that every protected page is nested inside, rather
  than each page checking auth itself.
- One central place (the API client) that knows how to retry a request after silently
  refreshing an expired token — so *no other code in the entire app* needs to know or care that
  tokens expire at all.
- One shared "the session just ended" signal that the auth store listens for, so expiry
  discovered *anywhere* (a background request, an explicit logout, a failed refresh) all funnel
  through the exact same "log the user out" code path.

### An honest, current limitation, not glossed over

This app's version of the pattern is missing one normal piece, found while testing the previous
entry's change-password flow and now tracked as its own `Tasks.md` item (Phase 5): **there's no
attempt to silently re-establish a session on a fresh page load using the refresh cookie.**
Right now, a browser refresh always starts from `{ user: null, accessToken: null }` and shows
`Login`, even though the refresh cookie sitting in the browser might still be completely valid.
The fix (not yet built) is a straightforward extension of the exact pattern above: on
`AuthProvider`'s first mount, attempt the same `POST /api/auth/refresh` call step 4 already
performs reactively, proactively instead — and only fall back to showing `Login` if that attempt
itself fails.

---

## 2026-08-16 — A real account lockout, a manual database recovery, and why "forgot password" specifically needs email

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a real user of the live app changed their
password via the new Settings page, then couldn't log back in with it. With no self-service
recovery path built yet (forgot-password is still on the checklist, unbuilt), the only way back
in was a direct, manual database edit. Worth documenting both the recovery itself and, properly
this time, exactly why the *real* fix for this situation is a bigger piece of work than it might
first appear.

### Background / concepts

#### The manual recovery: writing a password hash directly, not a password

- The `users` table never stores a password — only `password_hash`, and the two are not
  interchangeable. Simply running `UPDATE users SET password_hash = 'Password123' ...` would
  not have worked: the login route compares whatever a user types against this column using
  `bcrypt.compare()`, which expects the stored value to already be a bcrypt hash in bcrypt's own
  specific format (`$2b$12$...` — the algorithm version, the cost factor, then the actual hash),
  not plain text. Setting the column to literal `Password123` would make login **always fail**,
  since `bcrypt.compare("Password123", "Password123")` treats the second argument as an
  (invalid) hash to check against, not a password to match directly.
- **The fix:** generate the *hash* locally, using the exact same library and cost factor the
  app itself uses (`bcryptjs`, 12 rounds — matching `SALT_ROUNDS` in `routes/auth.ts`), then
  write that hash into the database directly:
  ```js
  const bcrypt = require("bcryptjs");
  console.log(bcrypt.hashSync("Password123", 12));
  // => $2b$12$oGwv7eT7g69M1/HrDn6H4eeMFBeCSZxuOM/ZdsMfmIYUs/vgn5gbW
  ```
  ```sql
  UPDATE users SET password_hash = '$2b$12$oGwv...' WHERE email = 'wheelyk@gmail.com';
  ```
  Run directly against the production database via Railway's Postgres **Data** tab (the same
  tool used for cleanup queries earlier in this project's deployment work) — logging in
  afterward with that known password worked immediately.
- **Why this is a "hack," worth naming plainly rather than treating as a normal feature.** This
  bypassed every layer of the app's own logic entirely — no endpoint was called, no request was
  validated, nothing was logged anywhere in the application. It only worked because whoever ran
  it already had direct administrative access to the production database (via Railway's own
  login) — which is a completely different, much stronger form of proof than "this person knows
  the account's email," the level of proof `forgot-password` will eventually need to work with
  for anyone who isn't a project administrator with database access.

#### What "forgot password" actually requires, and why it can't be built the same way `change-password` was

- `change-password` (built two entries ago) proves identity using something the user already
  has: their *current* password. `forgot-password` starts from the opposite situation — the
  user doesn't have a working password at all, which is the entire reason the feature needs to
  exist. Something else has to stand in as proof of identity instead.
- **The standard answer: prove control of the email address on file**, via a one-time,
  time-limited link. Concretely, the pattern (not yet built) looks like:
  1. `POST /api/auth/forgot-password` — given an email, generate a random, unguessable token,
     store it (or encode it as a short-lived signed JWT, similar to the access/refresh tokens
     already in this app — either is a defensible choice), and email the user a link containing
     it (e.g. `https://wellbeing-blue.vercel.app/reset-password?token=...`).
  2. `POST /api/auth/reset-password` — given that token and a new password, verify the token is
     genuine and not expired, then update `password_hash` exactly the way the manual recovery
     above did by hand, just driven by a real request instead of a person with database access.
  3. **Critically, this endpoint must respond identically whether or not the email actually
     matches an account** — the same "don't leak which case it is" principle already applied to
     login's `INVALID_CREDENTIALS` and the symptom/mood-log ownership checks. Confirming
     "yes, that email has an account here" to an anonymous caller is itself a small privacy leak
     for a health app specifically.
- **Why this genuinely cannot work without a real email-sending service**, restated plainly
  since it's the actual blocker: step 1 has to deliver a real email to an inbox this project's
  backend doesn't control. A personal email account (Gmail, etc.) can't be wired up to send
  these automatically and reliably — mainstream mail providers actively restrict and often
  block automated sending through personal accounts specifically because it's indistinguishable
  from spam at scale, and even where technically possible, a personal account's sending
  reputation isn't built for it. This is exactly what **transactional email providers** exist to
  solve (Resend, Postmark, SendGrid, AWS SES, and others) — services built specifically to send
  automated, one-to-one emails (password resets, receipts, confirmations) reliably and land in
  the inbox rather than spam, each requiring its own account, API key, and — for anything beyond
  a small free tier or a sandbox/testing mode — a verified sending domain.
- **What actually needs deciding before this can be built**, not just coded: which provider, a
  free-tier-suitable choice for an app this size, and where its API key gets stored (a new
  Railway environment variable, following exactly the same pattern `JWT_ACCESS_SECRET` and the
  database credentials already use). None of that is a coding decision — it's a product/infra
  decision this log has deliberately left open rather than picking unilaterally, the same way
  the Railway/Vercel hosting choice was made together earlier in this project rather than
  assumed.

### Why it's needed

This wasn't a hypothetical gap — it was a real user, locked out of the real app, with the only
way back in being a manual intervention only someone with direct production database access
could perform. That is precisely the situation `forgot-password` exists to make self-service.

### Decisions

- **Fixed the immediate lockout with a direct, manual database write** rather than rushing a
  half-built reset flow — the right call for an urgent, one-off situation, but explicitly not a
  substitute for the real feature, and not something that scales past "the one person who
  already has database access."
- **Generated the replacement hash locally with the app's own hashing library and cost
  factor**, rather than approximating it by hand, so the recovered account's password is stored
  exactly as if it had gone through a normal `register`/`change-password` call.
- **Left the email-provider choice as an open decision**, not picked automatically — a step that
  costs real money or account setup beyond a free tier eventually, and ties this app to a
  specific third party, both worth a deliberate choice rather than defaulting to whichever
  provider happened to be mentioned first.

### State at end of this step

The locked-out account is recovered and working again with a known temporary password.
`forgot-password`/`reset-password` remain unbuilt, tracked in `Tasks.md` (Phase 2) as before —
this entry adds the *reasoning* for why they need a real email provider, as context for
whenever that decision gets made.

### Verification

- The generated bcrypt hash was verified locally (`bcrypt.compareSync("Password123", hash) ===
  true`) before being written to production, so the recovery's correctness was confirmed before
  the user ever attempted to log in with it — not discovered by trial and error against the
  live account.
- Confirmed directly by the user successfully logging back in with the temporary password
  after running the `UPDATE` in Railway's Data tab.

---

## 2026-08-19 — Phase 2: `GET/PATCH/DELETE /api/users/me`, and how cascade-delete was already doing the hard part

**Task:** [Tasks.md](../../Tasks.md) Phase 2 — `GET /api/users/me`, `PATCH /api/users/me` (display
name, timezone), `DELETE /api/users/me`; and the following item, cascade-deleting every one of a
deleted user's symptom logs, mood logs, medications/medication logs, habits/habit logs, and
user-owned symptoms.

### Background / concepts

#### What "cascade delete" means, and why it's a database-level concept, not an application one

Every table in this app that belongs to a user (`mood_logs`, `habits`, `medications`, `symptoms`,
and so on) has a `user_id` column that's a **foreign key** — a value that must match a real row in
the `users` table, enforced by Postgres itself, not by application code remembering to check. That
raises an obvious question: what happens to a `mood_logs` row whose `user_id` points at a user that
just got deleted? Left unhandled, the database would refuse the deletion outright (a "foreign key
violation") rather than allow an orphaned row to exist.

`onDelete: Cascade`, declared on the *relation* in `schema.prisma` (e.g. `user User @relation(...,
onDelete: Cascade)` on `MoodLog`), tells Postgres exactly how to resolve that: when the referenced
`User` row is deleted, automatically delete every row that points at it too, as part of the *same*
database operation — not as separate application code issuing a `DELETE FROM mood_logs WHERE
user_id = ...` first. This is why the actual route handler for `DELETE /api/users/me` is one line:

```ts
await prisma.user.delete({ where: { id: req.userId } });
```

#### The one subtlety worth understanding: two different paths to the same table

`SymptomLog` is the interesting case, because there are actually *two* routes by which deleting a
`User` reaches it:

1. `SymptomLog.user` → `User`, declared `onDelete: Cascade` directly.
2. `SymptomLog.symptom` → `Symptom` → `Symptom.user` → `User`. This second hop is declared
   `onDelete: Restrict` (Prisma's default when nothing is specified) — deliberately, so that
   deleting a *symptom* that still has logged history against it fails loudly (see
   [Symptom Logging](04-symptom-logging.md)) rather than silently destroying that history. A
   symptom log with real severity data logged against a symptom the user hasn't deleted shouldn't
   ever quietly disappear just because *that symptom* got removed.

So does deleting a *user* (which cascades to their `Symptom` rows too) trip that `Restrict` and
fail? No — and the reason is worth spelling out rather than taking on faith: Postgres resolves
every cascade path triggered by a single `DELETE` statement together, and only checks a `Restrict`/
`NO ACTION` foreign key constraint against the *final* state after all of them have run. Because
path 1 above already removes every one of this user's `symptom_logs` rows (directly, via their own
`user_id`) in the same statement that path 2 removes their `symptoms` rows, there's never a moment
where a `symptom_logs` row is left pointing at an already-deleted `symptoms` row — the constraint
that blocks *"delete a symptom that still has logs"* has nothing left to object to. This was
confirmed directly, not just reasoned through on paper — see Verification below.

**The practical upshot:** every relation from `User` in `schema.prisma` already had `onDelete:
Cascade` set, for every one of the tables Tasks.md calls out by name — this task's schema
prerequisite was already satisfied by earlier work (Phases 1 and 3), not something that needed a
new migration. Tasks.md's "(or explicitly delete in a transaction)" phrasing exists to cover
exactly the case where cascade *isn't* already configured; here, it already was.

#### Validating a timezone string server-side, and why it can't just accept anything

`PATCH /api/users/me` lets a user change their stored `timezone` — but every dashboard/streak
calculation in this app (`backend/src/lib/timezone.ts`) trusts that value completely, feeding it
straight into `Intl.DateTimeFormat`. An invalid string (a typo, or garbage) wouldn't fail at save
time — it would fail *later*, the next time that user's dashboard tries to resolve "what day is
it," in code far away from where the bad value was ever accepted. The fix is `Intl.supportedValuesOf
("timeZone")` — a built-in Node/browser API that returns every IANA timezone name the JavaScript
engine actually recognizes (currently ~418 of them), checked with a plain `.includes()`:

```ts
function isValidTimeZone(timeZone: string): boolean {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone").includes(timeZone);
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}
```

The `try`/`catch` fallback exists for the (unlikely, on this project's Node version) case where
`supportedValuesOf` itself isn't available — constructing an `Intl.DateTimeFormat` with a bad
timezone throws, so that's still a real (if less precise) validity check.

One small build wrinkle from adding this: TypeScript didn't recognize `Intl.supportedValuesOf` at
first, even though Node itself supports it — its type declarations live in a separate `lib` file
(`ES2022.Intl`) that this project's `tsconfig.json` wasn't including yet (it targets `ES2021`, an
intentionally conservative choice made early on — see [Project Setup](00-project-setup.md)).
Rather than bumping the whole `target`/`lib` forward (which would silently make *other* newer
JS features type-check as available too, a much bigger change than intended), `"ES2022.Intl"` was
added to the existing `"lib"` array on its own — the narrowest fix that unblocks exactly this one
API.

### What was done

1. Added `backend/src/routes/users.ts` with three routes, mounted at `/api/users` (behind
   `requireAuth`, the same as every other resource router in `app.ts`):
   - `GET /me` — returns `id`, `email`, `displayName`, `timezone`, `createdAt` via a Prisma
     `select` clause, the same pattern `register`/`login` already use to make sure `passwordHash`
     is structurally impossible to include in a response, not just remembered-to-be-omitted.
   - `PATCH /me` — a Zod schema with both fields optional (`.partial()`, the same partial-update
     pattern `medications.ts`/`symptoms.ts` already use) but rejecting a genuinely empty body via
     `.refine()`, plus the timezone check above.
   - `DELETE /me` — deletes the user (cascading, as above), then calls the exact same
     `clearRefreshTokenCookie` helper `POST /api/auth/logout` already uses, for the same reason:
     the account (and any session tied to it) is gone, so the browser must stop sending a refresh
     cookie that now points at nothing.
2. Added `backend/src/routes/users.test.ts` covering: the happy path for all three routes; PATCH's
   partial-update behavior (only the provided field changes); PATCH rejecting an invalid timezone
   and an empty body; DELETE's cookie-clearing; and — most importantly — a test that logs one real
   entry of *all four* log types plus a custom symptom, deletes the account, and then queries every
   one of those tables directly by `userId` to confirm zero rows remain, rather than just trusting
   the `200` response. Also covers that neither PATCH nor DELETE can ever touch another user's row.
3. Real, running-server verification beyond the automated tests (see Verification below).

### Why it's needed

Without `GET`/`PATCH /api/users/me`, the Settings page (the frontend half of this task, in
[Authentication — Frontend](02-auth-frontend.md)) would have nowhere to read or save a display
name and timezone. Without a working `DELETE /api/users/me` — and without confidence that it
*genuinely* removes every trace of a user's health data, not just their login — the account
deletion requirement in requirements §15 (a real, working way to leave and take your data with
you) wouldn't actually be true, just something the UI claimed.

### Decisions

- **Trusted the existing cascade configuration rather than re-deleting each table manually** —
  confirmed first (reading `schema.prisma` closely, then testing it for real) rather than assumed,
  since writing redundant manual deletes on top of cascades that already work would be dead code at
  best and a source of double-delete bugs at worst.
- **Rejected an empty `PATCH` body** rather than silently accepting a no-op — an empty object
  reaching this endpoint is almost certainly a frontend bug, and failing loudly with
  `VALIDATION_ERROR` surfaces that immediately instead of masking it as a silent success.
- **Validated `timezone` against the real IANA list** rather than just checking "is this a
  non-empty string" — the cheapest possible validation would have technically satisfied the Zod
  schema while still letting `backend/src/lib/timezone.ts` break later for a completely unrelated
  user's dashboard.

### Verification

- Full backend test suite (`npm test`, 183 tests across 17 files, all passing) run *after* adding
  `users.test.ts` — not just the new tests in isolation.
- Real, running-server verification, not just the test suite: started the real dev server against
  the real local Postgres container, then — via direct HTTP calls, not mocks — registered a
  throwaway user, logged one real entry of each of the four log types plus a custom symptom,
  confirmed `PATCH /api/users/me` (display name + timezone) persisted via a follow-up `GET`,
  confirmed an invalid timezone was rejected with `400`, then called `DELETE /api/users/me` and
  confirmed via **direct SQL queries against the running database** (`docker exec ... psql`, not
  just the API) that zero rows remained in `users`, `symptom_logs`, `medications`, and `habits` for
  that account — and that logging back in with the same credentials now fails with `401`.
- `npm run build` (both `prisma generate` and `tsc`) succeeds after the `tsconfig.json` `lib`
  addition described above.

---

## 2026-08-19 — Phase 2: `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`

**Task:** [Tasks.md](../../Tasks.md) → Phase 2 → "Implement `POST /api/auth/forgot-password` —
generate a time-limited reset token and send a reset email (use a placeholder/mock email
provider for local dev)" and "Implement `POST /api/auth/reset-password` — validate the reset
token and update the password hash." Picks up exactly where the previous entry in this file left
off: that entry worked out *why* this pair of endpoints needs a "prove you control the email"
flow instead of the "prove you know the current password" pattern `change-password` uses, and
explicitly left the real email-provider choice open. This entry builds the endpoints themselves,
using the placeholder mailer Tasks.md explicitly allows for local dev in the meantime.

**Delivered via branch:** `feature/2.6-forgot-reset-password`.

### Background / concepts

#### The placeholder mailer: `backend/src/lib/mail.ts`

- The previous entry explained why a *real* send needs an actual transactional email provider
  (Resend, Postmark, SendGrid, SES, etc.) — none of which is wired up yet, deliberately, since
  picking one is a product/infra decision, not something to bolt on while building this
  endpoint. `sendPasswordResetEmail(to, resetLink)` exists purely so `forgot-password` has
  *something* to call in the meantime: instead of delivering anything, it just logs the link to
  the server's own console, clearly labeled `[mail:placeholder]` so nobody later mistakes that
  console line for a real delivered email once a real provider is eventually wired in.
- The function is declared `async` even though this implementation never actually awaits
  anything. A real provider call would need to await a network request, so keeping the shape
  `async` now means swapping in a real provider later is a drop-in body change inside this one
  file — every caller (`auth.ts`) already awaits the call and needs no changes at all.

#### Why a reset token isn't hashed with bcrypt, the way a password is

- `passwordHash` uses bcrypt because a password is a short, human-chosen secret — bcrypt's slow,
  salted design exists specifically to make brute-forcing that kind of low-entropy secret
  expensive even if the hash leaks.
- A reset token is the opposite kind of secret: `crypto.randomBytes(32).toString("hex")`
  produces 32 bytes (256 bits) of genuinely random data — already far too much entropy for
  brute-forcing to be a realistic concern, hashed or not. What still matters, though, is the same
  "never store the raw secret" principle passwords already follow: if the `users` table ever
  leaked, the raw token — the one thing actually usable to reset someone's password — shouldn't
  be recoverable from what's stored. A plain, fast SHA-256 hash (`hashResetToken` in `auth.ts`)
  is enough for that; bcrypt's slowness would just be paying a real performance cost for a
  brute-forcing threat that doesn't apply to a high-entropy value.

#### Why the response is identical whether or not the email matches an account

- This is the concrete implementation of the leak the previous log entry named: an anonymous
  `POST /forgot-password` caller must not be able to tell "this email has an account here" apart
  from "it doesn't," the same way `login`'s `401 INVALID_CREDENTIALS` deliberately doesn't say
  which of email/password was wrong. Concretely, that meant writing the handler so the *only*
  branching happens *before* the response is built (whether to actually generate a token and
  call the mailer), never *in* the response itself — both branches return the exact same `200 {
  message: "If that email is registered, a reset link has been sent." }`.
- This matters more than usual for a wellness/health app specifically: confirming an email is
  registered here would let an attacker learn someone is a user of a health-tracking product at
  all, which is itself sensitive.

#### Why the token is single-use, and how "single-use" is actually enforced

- A reset link that still works after being used once would leave a live credential sitting in
  whatever inbox or browser history it passed through indefinitely. `reset-password` enforces
  single-use the simple way: on a successful reset, `resetTokenHash` and `resetTokenExpiresAt`
  are both cleared back to `null` in the same database write that updates `passwordHash`. A
  second request with the same raw token hashes to the same `resetTokenHash` value as before, but
  that value no longer matches *any* user row — it fails exactly like a token that was never
  issued, or one that already expired. No separate "used" flag was needed; clearing the fields
  that make a token findable is what makes it unusable.

### What was done

1. **`prisma/schema.prisma` + migration `20260819115502_add_user_reset_token`.** Added two
   nullable columns to `User`: `resetTokenHash` (`String?`) and `resetTokenExpiresAt`
   (`DateTime?`). Both stay `null` except during the window between a `forgot-password` request
   and either a successful `reset-password` call or the token's own expiry — the same "columns
   that are usually empty, briefly populated for one purpose" shape as nothing else currently in
   this schema, so a dedicated table wasn't worth the extra join for what's fundamentally two
   fields on `User`. Applied with `npx prisma migrate dev --name add_user_reset_token` against
   the local Postgres container.
2. **`backend/src/lib/mail.ts` (new).** `sendPasswordResetEmail(to, resetLink)` — the placeholder
   mailer described above.
3. **`backend/src/routes/auth.ts`.** Added `forgotPasswordSchema` (`email`) and
   `resetPasswordSchema` (`token`, reusing the existing `passwordField` for `newPassword`); added
   `hashResetToken` (SHA-256, see above); added `RESET_TOKEN_TTL_MS` (one hour — long enough for
   a real person to receive and act on the email without rushing, short enough that a token
   sitting unused in an old inbox stops being a meaningful risk fairly quickly) and a local
   `FRONTEND_URL` fallback constant (same value/fallback `app.ts` already uses for CORS, kept as
   its own local constant rather than importing across files for one string).
   - `POST /forgot-password` (rate-limited via the existing `authRateLimiter`): looks up the
     user by email; if found, generates a raw token, stores only its hash + expiry, and calls the
     placeholder mailer with a link of the form `${FRONTEND_URL}/reset-password?token=<rawToken>`;
     always returns the same generic `200` regardless of whether a user was found.
   - `POST /reset-password` (also rate-limited — a reset token is a guessable-in-principle
     secret the same way a password is, so it gets the same brute-force protection as
     login/register/change-password): hashes the incoming token and looks up a user by
     `resetTokenHash`; rejects with `400 INVALID_RESET_TOKEN` if no match, or if
     `resetTokenExpiresAt` is missing or in the past; on success, hashes and stores the new
     password, clears both reset-token columns (making the token single-use, see above), clears
     the refresh cookie (same mechanism `change-password` uses, and arguably more important here
     — a password reset is often prompted by the old password having leaked in the first place),
     and returns `200 { message: "Password updated" }`.
4. **Tests (`auth.test.ts`).** `forgot-password`: generates a token and logs a reset link for a
   real account (spying on `console.log`, since that's what the placeholder mailer calls,
   without needing to mock the whole `mail` module — reading the spy's captured calls *before*
   `mockRestore()`, since restoring also clears them); returns the identical generic response,
   and never calls the mailer at all, for an email with no matching account; rejects a malformed
   email with `400 VALIDATION_ERROR`. `reset-password`: full success path (refresh cookie
   cleared, old password stops working, new password works, reset-token columns cleared);
   rejects reusing an already-used token; rejects an expired token (backdating
   `resetTokenExpiresAt` directly rather than waiting a real hour); rejects a garbage/unknown
   token; rejects a new password that fails the strength rules.
5. **`npm test`** — 178/178 passing (8 new tests across the two endpoints, the rest
   pre-existing).
6. **`npm run build`, `npx eslint .`, `npx prettier --check .`** — all clean.
7. **Manual end-to-end verification against the compiled, running server**, via `curl`:
   registered a real user, called `forgot-password`, read the raw token out of the running dev
   server's own console output (exactly what the placeholder mailer is for), called
   `reset-password` with it, confirmed the old password now fails to log in and the new one
   succeeds, and confirmed replaying the same token a second time is rejected with
   `INVALID_RESET_TOKEN`. See `docs/log/02-auth-frontend.md`'s matching entry for the
   browser-driven version of this same flow through the real frontend pages.

### Why it's needed

This closes the gap the previous entry in this file documented from a real, live incident: a
locked-out user with no self-service way back into their account, requiring a manual database
edit only someone with direct production access could perform. This makes password recovery
self-service for the first time, without needing a real email provider to exist yet.

### Decisions

- **SHA-256, not bcrypt, for the reset token hash.** Covered above — the token's own entropy
  already does the job bcrypt's slowness exists for; using bcrypt here would only add real
  latency for a threat model that doesn't apply.
- **Two nullable columns on `User`, not a separate `PasswordResetToken` table.** A separate
  table would only ever hold at most one live row per user at a time (a second `forgot-password`
  call should simply overwrite the pending token, not create a second one) — which is exactly
  what a couple of nullable columns on `User` already model, with no join needed to check them.
- **Both `forgot-password` and `reset-password` rate-limited**, not just `forgot-password` as the
  Tasks.md wording's "at minimum" technically required. A reset token is a secret an attacker
  could try to guess or brute-force the same way a password can be, so it gets the same
  protection `login`/`register`/`change-password` already have.
- **Caught and fixed a real test-authoring bug while writing this entry's own tests**: an early
  version of the `forgot-password` "success" test called `logSpy.mockRestore()` *before* reading
  `logSpy.mock.calls`, which silently discarded the very thing the test needed to assert on —
  `mockRestore()` doesn't just restore the original `console.log`, it clears recorded calls too,
  the same as `mockReset()`. The fix was ordering, not logic: read whatever the spy captured
  first, then restore it.

### State at end of this step

Real, working, tested `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`
endpoints exist, verified end to end against a live server and (per the frontend entry) a live
browser. The email-provider choice remains deliberately open — the placeholder mailer's
console-log output is sufficient for local dev and for this project's current stage, but a real
send still requires picking a transactional provider before this app has real, non-technical
users relying on it.

### Verification

- `npm test` — 178/178 passing.
- `npm run build`, `npx eslint .`, `npx prettier --check .` — all clean.
- Manual `curl` round-trip against the compiled, running server (see "What was done" above for
  the full sequence) — covering the full happy path plus the single-use rejection.
- Full frontend browser verification of the same flow through the real UI — see
  `docs/log/02-auth-frontend.md`.

---

## 2026-08-20 — A real production bug: refreshing the app on mobile logged users out, and what `SameSite` actually gates

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a genuine bug report against the
deployed app ("refreshing the app on mobile Android sends me back to the login page"),
investigated and fixed the same way any other bug in this log has been: read the real code,
reproduce it for real, confirm the actual cause, then fix it and prove the fix. This entry also
answers two follow-up questions asked directly once the fix was proposed: *is the fix actually
safe from a security standpoint*, and *don't tokens need to expire — isn't that the whole point of
a refresh token?* Both are covered in full below, not just asserted.

This entry assumes everything the *"full authentication pattern, explained end to end"* entry
above already covers — the two tokens, why there are two, `HttpOnly` cookies, `requireAuth`,
`RequireAuth`, the refresh-on-401 flow. None of that is repeated here. What follows is the one
piece that pattern didn't need yet at the time it was written: what actually happens once the
frontend and the API are deployed to two genuinely different websites, not just two different
local ports.

### Background / concepts

#### Same-origin, same-site, and cross-site — three different words for three different comparisons

These sound interchangeable and aren't; mixing them up is exactly what let this bug ship.

- **Origin** = scheme + host + port, compared exactly. `https://wellbeing-blue.vercel.app` and
  `https://api.up.railway.app` are different origins. So are `http://localhost:5173` and
  `http://localhost:4000` — different *port*, so different origin, even on the same machine. This
  is the comparison CORS cares about (recap just below).
- **Site** = the **registrable domain** (informally, "the part of the domain you'd actually have to
  buy" — `vercel.app` and `up.railway.app` are each their own registrable domain; `wellbeing-blue`
  and `api` are just subdomains *within* those). Two different subdomains of the *same*
  registrable domain (`app.example.com` and `api.example.com`) are **same-site** even though
  they're different origins. Two different registrable domains are **cross-site**, full stop — no
  amount of subdomain naming closes that gap. Critically: an IP literal like `127.0.0.1` is never
  same-site with a hostname like `localhost`, even on one machine — this is what made a fully
  local, no-real-deployment reproduction of this bug possible (see *What was done* below).
- **This project's actual deployment is cross-site, not just cross-origin.** The frontend lives on
  `*.vercel.app`, the backend on `*.up.railway.app` — two different registrable domains. Every
  single request between them, no matter what it's carrying, is a cross-site request. This wasn't
  a mistake; it's just what "frontend on Vercel, backend on Railway" *is*, architecturally. The gap
  was that one specific cookie setting hadn't been chosen with that fact in mind yet.

#### CORS, recap — and what it *doesn't* cover

CORS is already explained in full in the root [IMPLEMENTATION_LOG.md](../../IMPLEMENTATION_LOG.md)
and the real bug entry in `docs/log/02-auth-frontend.md`. The one-line recap that matters here:
**CORS controls whether the browser lets the page's own JavaScript *read the response*** of a
cross-origin request. It says nothing at all about whether a *cookie* gets attached to the
*request* in the first place — that's a completely separate gate, covered next.

#### `SameSite` — the gate CORS doesn't cover, and the part the earlier refresh-token entry only told half of

The Phase 2.3 entry above (*"refresh token cookie storage/rotation"*) already introduced
`SameSite=Lax`, but only from one angle: *"tells the browser not to attach this cookie on
cross-site requests... which is what makes cookies resistant to CSRF."* True, but incomplete — the
same restriction that blocks a *malicious* cross-site request from carrying the cookie also blocks
a *legitimate* one, and this app's own frontend calling its own backend is, per the definitions
above, exactly that: a cross-site request, from the browser's point of view, with no way to tell
"our own frontend" apart from "some other website" just by looking at the site relationship alone.

The precise rule for `SameSite=Lax` (the default in every modern browser even when unset): the
cookie is sent on **same-site requests always**, and on **cross-site top-level navigations using a
"safe" method** (essentially: GET, and only when the browser is actually changing the address bar
to a new page — following a link, typing a URL) — and **never on a cross-site subresource
request**, which is precisely what every `fetch()`/`XHR` call is, including every single
`apiFetch` call this frontend makes and, specifically, the `rehydrateSession()` call added in the
Phase 5 entry (`docs/log/02-auth-frontend.md`) to restore a session after a page reload. That call
is a `POST` via `fetch()` — cross-site, not a top-level navigation, not "safe" — so under `Lax`, in
this app's actual cross-site deployment, the browser was never going to attach the refresh cookie
to it at all. Not "sometimes fails" — structurally, definitionally, never.

**Two independent gates, and a cross-site cookie-authenticated request needs to pass both:**
CORS decides whether the *response* can be read; `SameSite` decides whether the *cookie* is even
sent on the *request*. Configuring one correctly (this project's CORS was already correct — see
the Phase 2.3 entry's own *Decisions*) does nothing at all to fix the other being wrong. This is
the mistake worth carrying forward: "I set up CORS, cross-origin should just work" is a genuinely
common and reasonable-sounding assumption that misses an entire second gate.

### What was done

1. **The bug report:** a real user, on a real deployed Android phone, refreshing the app landed
   back on `/login` — even though they'd been actively using it moments before.
2. **Reasoned about the likely cause first**, from the code alone: the deployed frontend and
   backend are on different registrable domains (Vercel, Railway) — genuinely cross-site, not just
   cross-origin — and the refresh cookie was `SameSite=Lax`. Per the rule above, that predicts
   exactly this failure for the `rehydrateSession()` call specifically.
3. **Reproduced it for real, locally, rather than shipping a fix on theory alone** — this project's
   standing rule (see `docs/LESSONS-LEARNED.md`'s general principles) that a mocked/theoretical
   understanding of a bug isn't the same as having actually seen it happen. The trick: run the
   local frontend dev server bound to `http://127.0.0.1:5173` instead of its usual
   `http://localhost:5173`, pointed at a backend on `http://localhost:4000` with `FRONTEND_URL`
   (the CORS allow-list) updated to match. `127.0.0.1` and `localhost` are never same-site (see
   *Background* above) — this reproduces the real deployment's cross-site relationship completely
   locally, with zero risk to the real production database.
4. **What the reproduction showed, before any fix:** registered and logged in through a real
   Chromium browser (Playwright) — landed on `/dashboard` successfully (the *login* response
   itself doesn't depend on the cookie being *sent back* yet, only on it being *set*). Inspecting
   the browser's actual cookie jar (`page.context().cookies()`) immediately after: **empty** — the
   `Set-Cookie` header had been sent, but between `SameSite=Lax` and the response also lacking
   `Secure` (skipped in non-production, per the original design), the browser hadn't kept it at
   all. A full page reload afterward — losing the in-memory access token exactly the way a real
   refresh does — landed on `/login`. Bug reproduced exactly, without touching Android or
   production data at all.
5. **The fix**, in `backend/src/lib/cookies.ts`: `sameSite: "none"` instead of `"lax"`. This
   requires `secure: true` **unconditionally**, not just in production as before — the two
   attributes aren't independent; a browser rejects a `None` cookie outright if it isn't also
   marked `Secure`, regardless of environment. Local dev still works over plain `http` despite
   this: Chrome (and Chromium, what the reproduction above actually used) specifically treats
   `localhost` and `127.0.0.1` as secure contexts regardless of scheme, so the `Secure` requirement
   doesn't block local development the way it would for any other plain-`http` host.
6. **Re-verified the same reproduction with the fix applied**, confirming the actual mechanism, not
   just "the code looks right": cookie now present in the jar after login (`sameSite: "None"`,
   `secure: true`), `/api/auth/refresh` returned `200` instead of `401`, and the reload stayed on
   `/dashboard`.
7. **Re-verified the normal, same-site local dev setup** (`localhost` frontend + `localhost`
   backend, the everyday development configuration) still works completely unaffected by the
   change — same-site requests were never the part that was broken.
8. **Backend test suite**: 191/191 passing, unaffected — no test asserts the exact `SameSite`/
   `Secure` values, only `HttpOnly` and `Path`.

### Why it's needed

Without this fix, **every** logged-in user's session was fragile in production, on every platform
— not an Android-specific defect, a cross-site-deployment defect that Android happened to surface
first. The reason it showed up on mobile specifically isn't a different root cause; it's that
mobile browsers reclaim and fully reload backgrounded tabs far more eagerly than desktop browsers
tend to (a desktop tab can sit open, still holding its in-memory access token, for a very long
session without ever truly reloading). The moment *any* browser on *any* platform did a real full
reload against the real deployed app, it would have hit this same wall — the Android report was
simply the first time that happened to someone paying attention to the result.

### Decisions

- **`SameSite=None` + unconditional `Secure`, rather than a same-origin proxy.** The more
  thorough architectural fix for "frontend and API on different sites" is often to put them behind
  one shared origin instead — e.g. a Vercel rewrite proxying `/api/*` to the Railway backend, so
  the browser never sees a cross-site relationship at all, and `SameSite=Lax` would then work
  exactly as originally intended. That's a real, reasonable option, deliberately **not** taken
  here: it requires infrastructure changes (a Vercel rewrite pointed at this project's specific
  Railway URL, plus switching the frontend's API base to a relative path) that couldn't be
  verified end-to-end in this session the same rigorous way the smaller fix was — this session
  doesn't have write access to the actual Vercel/Railway configuration to test it for real, and
  shipping an unverified infrastructure change for a login-critical path is exactly the kind of
  thing this project's own working practices warn against. Noted here as a legitimate future
  hardening step, not a gap being silently ignored.
- **Is `SameSite=None` actually safe here? Reviewed directly, not just assumed:**
  `SameSite=Lax`'s *other* job (besides "works cross-site at all") is CSRF protection — stopping
  some *other* website from silently making a request that carries this cookie. Switching to
  `None` genuinely removes that specific layer for this cookie. Tracing through what a
  cross-site-forced request against each cookie-reading endpoint could actually accomplish:
  - **`POST /api/auth/refresh`** reads the cookie, rotates it, and returns `{ user, accessToken }`
    in the response body. A forced request would rotate the *victim's own* cookie in the
    *victim's own* browser — harmless to them, their session keeps working normally — and the
    attacker's page still can't *read* that response body at all, because CORS (a separate,
    already-correct gate — see *Background* above) only allows this project's real frontend
    origin, not an attacker's. Net effect of a forced refresh: nothing an attacker can use.
  - **`POST /api/auth/logout`** just clears the cookie unconditionally (see the route above —
    no auth check at all, by design, since a stateless JWT can't be individually revoked
    server-side). A forced request logs the victim out early, forcing a re-login. A real but
    low-severity nuisance ("logout CSRF"), not a data exposure — noted here as an accepted
    residual risk, not hidden.
  - **Every endpoint that actually touches user data** (mood/symptom/medication/habit logs,
    dashboard, trends, history, profile, change-password) requires `requireAuth`, which reads
    only the `Authorization: Bearer <token>` header (see `middleware/requireAuth.ts`) — **never**
    the cookie. An attacker's cross-site page has no way to read or forge that header, because the
    access token it would need never leaves this app's own frontend's JavaScript memory. These
    endpoints were never protected *by* `SameSite` in the first place, so relaxing it here doesn't
    touch their security at all.
  - **Conclusion:** the cookie's blast radius is deliberately narrow — scoped to `/api/auth` only,
    and read by exactly two routes whose worst forced-request outcomes are "nothing useful to the
    attacker" and "an inconvenient forced logout." Trading away CSRF protection *specifically for
    this cookie* is a reasonable, bounded cost for making the session work at all in this app's
    real deployment topology.
- **`secure: true` unconditionally, not gated by `NODE_ENV` anymore.** The original code skipped
  `Secure` outside production specifically so local `http` development wouldn't silently break.
  That reasoning doesn't apply the same way to `SameSite=None`, which *requires* `Secure`
  regardless of environment — and, as covered above, Chrome's `localhost`/`127.0.0.1` exemption
  means local dev doesn't actually need that skip anymore anyway.

### Answering the two follow-up questions directly

- **"Don't tokens need to expire — isn't that the whole point of a refresh token?"** Yes, exactly
  — both already did, unrelated to this fix. `backend/src/lib/jwt.ts`: `ACCESS_TOKEN_TTL_SECONDS`
  = 15 minutes, `REFRESH_TOKEN_TTL_SECONDS` = 7 days, both passed as `expiresIn` to `jwt.sign`,
  and `jwt.verify` (used by both `verifyAccessToken` and `verifyRefreshToken`) rejects an expired
  token automatically — this is a built-in guarantee of the JWT library itself, not something this
  project's own code has to separately remember to check. On top of expiry, the refresh token also
  **rotates** on every use (Phase 2.3, above) — so a legitimately-used session's refresh token
  keeps renewing its own 7-day window continuously, while a stolen-but-unused one still hits a
  hard 7-day ceiling regardless. This is the two-token pattern's entire reason for existing,
  covered in full in the *"full authentication pattern"* entry above: short-lived token the
  frontend actively handles, longer-lived token the browser handles automatically and JavaScript
  never touches, each expiring on its own independent clock.
- **"Is this OK from a security perspective?"** See the CSRF walkthrough directly above — yes,
  with the specific reasoning shown rather than asserted, and one accepted residual risk (logout
  CSRF) named explicitly rather than glossed over.

### Verification

- Reproduced the actual bug locally, in a real browser, under conditions matching the real
  deployment's cross-site relationship (`127.0.0.1` vs `localhost`) — not just read about it or
  inferred it from the `Set-Cookie` header in isolation. See *What was done* steps 3–4.
- Re-ran the identical reproduction after the fix and confirmed it now succeeds (cookie stored,
  `200` from `/refresh`, session survives a full reload) — see step 6.
- Re-confirmed the normal, everyday local dev setup is unaffected — see step 7.
- `npm test` (backend) — 191/191 passing.
- `npm run build` (backend) — compiles cleanly.
- Traced every route that reads the refresh cookie, and confirmed every route that touches real
  user data does not — see *Decisions* above.

---
