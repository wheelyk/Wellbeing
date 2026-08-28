# Glossary

A lookup table for terms and tools used throughout this project's [implementation
log](../IMPLEMENTATION_LOG.md). Each entry is a short definition plus a pointer to where it's
explained in full, with the surrounding context of why it mattered at that moment — this page is
deliberately _not_ a replacement for those fuller explanations, just a fast way to find them.

Entries link to a **file**, not a specific heading — GitHub's heading anchors are generated from
a slugging algorithm that's easy to get subtly wrong by hand (the same reasoning the root
[IMPLEMENTATION_LOG.md](../IMPLEMENTATION_LOG.md) index already follows). Once you're in the
linked file, search (Ctrl+F / Cmd+F) for the **heading text quoted in italics** after each entry.

Organized alphabetically. If a term you're looking for isn't here, it may still be explained
in-line the first time it comes up in the log — try searching the topic files directly, or see
[Lessons Learned](LESSONS-LEARNED.md) for a different way into the same material (real bugs
found, rather than concepts explained).

---

### API (Application Programming Interface)

A defined set of URLs a backend understands, each doing one specific thing, that a frontend (or
any other program) can send requests to. Explained in the root [IMPLEMENTATION_LOG.md](../IMPLEMENTATION_LOG.md)'s
"Big picture" section — _"How 'talking to it behind the scenes' works: the API."_

### bcrypt / password hashing

A one-way transformation applied to a password before it's ever stored, so the real password is
never recoverable from the database — even by someone with full database access. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Password hashing: why it matters and how
it works here."_

### Bearer token

An access token sent in an HTTP `Authorization: Bearer <token>` header, the standard way an API
client proves who it is on every request. See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
_"Bearer tokens vs. the refresh cookie — two different auth mechanisms, on purpose."_

### Branch protection / ruleset

GitHub features that can block direct pushes to a branch (e.g. `main`), require pull requests,
and prevent force-pushes or deletions — turning a written convention into something GitHub
itself enforces. See [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md),
_"Branch protection vs. a ruleset — GitHub has two overlapping systems."_

### Build artifact

The actual thing a hosting platform runs after a build step — compiled JavaScript for the
backend, static HTML/CSS/JS for the frontend. See [docs/log/07-deployment.md](log/07-deployment.md),
_"What a 'build artifact' actually is, concretely, for each half of this project."_

### Cascading delete (`onDelete: Cascade`)

A database-level rule saying "when this row is deleted, automatically delete every row that
refers to it too" — used throughout this schema so deleting a user (or a medication, or a habit)
cleans up everything that depended on it, rather than leaving orphaned rows behind. See
[docs/log/05-medication-logging.md](log/05-medication-logging.md), _"Cascading deletes, two
levels deep."_

### CI (Continuous Integration) / GitHub Actions

Automated checks that run on GitHub's own servers whenever something happens (like opening a
PR), rather than depending on someone remembering to run them locally. See
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), _"GitHub Actions, properly
explained, and a before/after screenshot upgrade."_

### Composite index

A database index built across more than one column together (e.g. `[userId, loggedAt]`), used
when queries always filter/sort by that same combination of columns — faster than two separate
single-column indexes for that specific access pattern. See [docs/log/03-mood-logging.md](log/03-mood-logging.md),
_"The composite index, and why `[userId, loggedAt]` specifically (not two separate indexes)."_

### CORS (Cross-Origin Resource Sharing)

A browser security rule that blocks a webpage from one address from making requests to a
different address unless the target server explicitly allows it. Explained first in the root
[IMPLEMENTATION_LOG.md](../IMPLEMENTATION_LOG.md)'s "Big picture" section, with a real bug this
project hit covered in [docs/log/02-auth-frontend.md](log/02-auth-frontend.md), _"The CORS bug
this step actually found (not just fixed defensively)."_

### CRUD

Create, Read, Update, Delete — the standard shorthand for the four basic operations almost every
resource in this API supports (e.g. `POST`/`GET`/`PATCH`/`DELETE` on `/api/mood-logs`), and the
template every later log type in this project (symptoms, medications, habits, categories) repeats.
See [docs/log/03-mood-logging.md](log/03-mood-logging.md), _"Phase 3:
`GET/POST/PATCH/DELETE /api/mood-logs`."_

### `curl`

A command-line tool for sending an HTTP request and reading the raw response directly — used
throughout this project's own manual verification steps to call the API the same way a browser or
the frontend's code would, without a UI in the way. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Phase 1 + Phase 2: PostgreSQL, Prisma,
the `User` model, and `POST /api/auth/register`."_

### Declaration merging (TypeScript)

TypeScript's mechanism for adding a property to a type defined by a third-party library (e.g.
adding `userId` to Express's own `Request` type), without forking or wrapping that library. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Attaching the user to the request:
TypeScript declaration merging."_

### DNS (Domain Name System)

The system that translates a human-readable domain name into the actual server address a
browser connects to, via records configured at a domain's registrar. See
[docs/log/07-deployment.md](log/07-deployment.md), _"DNS: how a domain actually gets pointed at a
host it wasn't bought from."_

### Docker / Docker Compose

A way of running software (here, PostgreSQL) in an isolated, reproducible container rather than
installing it directly onto a machine; Compose is the tool for describing and starting one or
more containers together with a single config file. See [docs/log/00-project-setup.md](log/00-project-setup.md),
_"Tooling: install Docker Desktop (needed to run PostgreSQL locally)."_

### Environment variables / `.env`

Configuration values (database URLs, secret keys) kept outside the actual code, loaded at
runtime — different per environment (a laptop vs. production) and never committed to git. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Connection strings, `.env`, and what
actually counts as a 'secret' here."_

### ESLint / Prettier / TypeScript compiler

Three genuinely different tools often confused for one: TypeScript's compiler checks _types_;
ESLint checks _code patterns/style rules_ (and can catch real bugs, not just style); Prettier
only _reformats_ code, with no opinion on correctness at all. See
[docs/log/00-project-setup.md](log/00-project-setup.md), _"What a linter is, and why it's a
different tool from the TypeScript compiler"_ and _"Why Prettier is a *third*, separate tool from
either of those."_

### Express / middleware

Express is the Node.js web framework this backend is built on; **middleware** is any function
that runs on a request before it reaches its final route handler (e.g. `requireAuth`, which
checks the access token on every protected route). See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
_"How Node.js and Express actually work, end to end"_ and _"What 'middleware' means in Express."_

### Foreign key / Restrict / `SetNull`

A foreign key is a column that points at another table's row (e.g. `Reminder.categoryId` points
at a `Category`). What happens when the row it points at is deleted is a per-relation choice:
`Restrict` blocks the delete outright while any row still points at it; `Cascade` deletes the
dependent row too (see this glossary's own "Cascading delete" entry); `SetNull` instead blanks the
foreign key column to `NULL`, leaving the dependent row in place but pointing at nothing. See
[docs/log/16-reminders-and-category-toggles.md](log/16-reminders-and-category-toggles.md),
_"Task 1: built-in category toggles."_

### `gh` (GitHub CLI)

GitHub's own command-line tool for creating pull requests, checking CI status, and other GitHub
operations without leaving the terminal or opening a browser — used constantly throughout this
project's own workflow. See [docs/log/00-project-setup.md](log/00-project-setup.md),
_"Tooling: install and authenticate the GitHub CLI, switch to Claude opening PRs."_

### Git worktree

A way to have more than one branch of the same repository checked out into separate folders at
the same time, sharing one underlying `.git` history — used in this project to let multiple AI
agents build different features simultaneously without colliding. See
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), _"The isolation mechanism:
git worktrees, explained from scratch."_

### HTTP status codes (2xx/4xx/5xx)

Grouped by their first digit: 2xx means success (`200 OK` for an ordinary successful request,
`201 Created` specifically for a `POST` that made a new resource); 4xx means the _client_ did
something wrong (`400 Bad Request` is a generic catch-all, `401` means not authenticated, `404`
means not found, `409 Conflict` means the request is well-formed but clashes with existing data);
5xx means the _server_ itself failed. These ranges recur throughout this project's own log. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Phase 1 + Phase 2: PostgreSQL, Prisma,
the `User` model, and `POST /api/auth/register`."_

### HttpOnly cookie

A cookie that JavaScript running in the browser cannot read or modify — used for this project's
refresh token specifically so it can't be stolen via a cross-site-scripting bug the way a token
sitting in `localStorage` could be. See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
_"Why a cookie instead of just leaving the refresh token in the JSON body."_

### Idempotent

An operation that produces the same end result no matter how many times it's run — this
project's seed script is written this way specifically so it's safe to run on every single
deploy, not just the first one. See [docs/log/07-deployment.md](log/07-deployment.md)'s most
recent entries on automatic database seeding, and the general principle in
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), _"Lifecycle hooks vs.
explicit script chaining: a general rule of thumb, not just a Prisma one."_

### JWT (JSON Web Token)

A signed, tamper-evident token used to prove who a request is coming from without the server
needing to look anything up in a database on every request. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"What a JWT actually is, and why two of
them."_

### Layout route (React Router)

A route with no path of its own that renders a shared wrapper (via `<Outlet>`) around whichever
child route actually matched — used in this project for the `RequireAuth` guard, so every
protected page shares the same "redirect to login if not authenticated" logic in one place. See
[docs/log/02-auth-frontend.md](log/02-auth-frontend.md), _"Client-side routing, and the 'layout
route' pattern used for the auth guard."_

### Lifecycle hooks (npm) vs. explicit script chaining

An npm lifecycle hook (like `postinstall`) runs automatically as a side effect of another command
— convenient, but only as reliable as how that other command gets invoked, which varies across
hosting platforms. Explicit chaining (`"build": "prisma generate && tsc"`) is more verbose but
unambiguous. This project hit a real bug from trusting a hook on a platform that didn't run it as
expected. See [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), _"Lifecycle
hooks vs. explicit script chaining: a general rule of thumb, not just a Prisma one."_

### Lockfile (`package-lock.json`)

A file recording the _exact_ version of every dependency (including dependencies of
dependencies) actually installed, so two different machines running `npm ci` get byte-for-byte
identical `node_modules`. See [docs/log/07-deployment.md](log/07-deployment.md), _"What a
lockfile is, and why 'the locking' matters."_

### Merge queue

A GitHub feature that tests each approved PR against a _combined_ branch (`main` + every PR ahead
of it in the queue + its own changes) before actually merging it, catching the case where two
individually-fine PRs would break something together — different from a [stacked PR](#stacked-pr),
which is a deliberate code dependency between two specific PRs, not a general safety net for
unrelated ones. Not yet enabled in this project. See
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), _"GitHub merge queues,
explained (and why they're not the same thing as stacked PRs)."_

### Migration (Prisma)

A versioned, ordered SQL file describing one change to the database schema — `migrate dev` is
used locally (also generates the file), `migrate deploy` applies already-written migrations in
production without ever generating new ones on the fly. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Prisma: schema, migrations, and the
generated client"_ and [docs/log/07-deployment.md](log/07-deployment.md), _"Production
migrations: how 'upgrading' the live schema actually works, and the honest truth about
rollbacks."_

### "Optimistic" UI update

Updating the screen immediately, before the server has actually confirmed the change, then rolling
back only if the request turns out to have failed - makes the app feel instant rather than waiting
on a round trip for every click, at the cost of needing an explicit "undo" path for the rare
failure case. See [docs/log/03-mood-logging.md](log/03-mood-logging.md), _"Phase 7: Mood entry
form, wired into the Dashboard."_

### ORM (Object-Relational Mapper) / Prisma Client

A layer that lets code query a database using regular function calls and objects instead of
writing raw SQL by hand, while still generating real SQL underneath. Prisma additionally
_generates_ a fully-typed client from the schema file, so TypeScript catches a typo'd column name
at compile time instead of a runtime SQL error. See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
_"Prisma: schema, migrations, and the generated client."_

### Playwright

A browser-automation library — it drives a real browser (usually Chromium) to click, type, and
navigate the way a person would, then lets a test or script assert on what actually rendered. Used
throughout this project for both its automated e2e suite and one-off manual verification scripts
against the real running app. See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
_"A real production bug: refreshing the app on mobile logged users out, and what `SameSite`
actually gates."_

### Prisma `enum`

A column type restricted to a fixed, named set of values (e.g. a `Habit`'s `type` can only ever
be `BOOLEAN`, `NUMERIC`, or `DURATION`) — enforced by the database itself, not just application
code. See [docs/log/06-habit-logging.md](log/06-habit-logging.md), _"`HabitType` as a Prisma
`enum`, not a plain `String`."_

### `Promise.all`

Runs several promises (e.g. two independent `fetch` calls) at the same time and waits for all of
them to finish, rather than awaiting one, then the other, in sequence - faster when the requests
don't depend on each other's results. See
[docs/log/10-dashboard-and-trends.md](log/10-dashboard-and-trends.md), _"Phase 4 + Phase 8:
`GET /api/dashboard` and the real Dashboard summary card."_

### React `key` prop / reconciliation

React decides whether to update an existing on-screen component in place or throw it away and
mount a brand-new one by comparing each element's `key` between renders — same `key` means "this
is still the same thing, just update it"; a different `key` means "this is a new thing," which
tears down the old component (losing its internal state, and re-running its `useEffect`s from
scratch) and mounts a fresh one. This is what lets a `key` be used deliberately to _force_ a
component to remount — e.g. to make it refetch data — but only works if the key genuinely changes
exactly when it needs to; a key that's supposed to change but sometimes doesn't (see the Lessons
Learned entry below) means React quietly treats two different situations as the same one. See
[docs/LESSONS-LEARNED.md](LESSONS-LEARNED.md), _"A React remount `key` collided with itself
because it was built from the wrong value."_

### Rebase vs. merge

Two different ways to bring one branch's changes onto another: a merge adds a new commit tying
two histories together side by side; a rebase rewrites a branch's commits to look as if they'd
started from a different point all along. See [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md),
_"Rebasing: why the *local* copy of these branches may still need one."_

### REST

A widely-used style for designing HTTP APIs around resources and standard verbs (`GET` to read,
`POST` to create, `PATCH` to update, `DELETE` to remove) rather than one endpoint per action - the
convention this project's own API follows throughout. See
[docs/log/03-mood-logging.md](log/03-mood-logging.md), _"Phase 3:
`GET/POST/PATCH/DELETE /api/mood-logs`."_

### Same-origin / same-site / cross-site

Three different comparisons, easy to conflate: **origin** is scheme + host + port compared
exactly (so `localhost:5173` and `localhost:4000` are different origins); **site** is just the
registrable domain (so `app.example.com` and `api.example.com` are different origins but the
_same_ site); anything not same-site is **cross-site**. This project's real deployment (Vercel +
Railway) is genuinely cross-site, not just cross-origin — the distinction a real production bug
hinged on. See [docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Same-origin, same-site,
and cross-site — three different words for three different comparisons."_

### `SameSite` cookie attribute

A cookie attribute controlling whether the browser attaches that cookie on a cross-site request —
a completely separate gate from [CORS](#cors-cross-origin-resource-sharing), which only controls
whether a cross-origin _response_ can be read. `Lax` (this project's original setting) blocks the
cookie on any cross-site `fetch`/XHR, which silently broke this app's own legitimate
cross-site session-restore call in production. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"`SameSite` — the gate CORS doesn't cover,
and the part the earlier refresh-token entry only told half of."_

### SHA / commit hash

The unique identifier Git gives every commit, generated from its content and its parent commit -
which is why rewriting a commit (a rebase, a cherry-pick, an amend) always produces a brand-new SHA
even when the actual code change is identical, and why two branches can hold "the same" change as
genuinely different commits. See
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), _"A bug fix stranded by
outage timing, and how `git cherry-pick` recovered it."_

### Stacked PR

A pull request whose base branch is another not-yet-merged feature branch (instead of `main`),
used when one task genuinely depends on code from a task that hasn't been reviewed and merged
yet — not to be confused with a [merge queue](#merge-queue), which is about ordering _unrelated_
PRs safely, not expressing a dependency. See
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), _"What a 'stacked' PR is, and
why these three ended up that way."_

### Timing-based user enumeration

A vulnerability where an attacker can tell whether an email address has an account just by how
_fast_ a login attempt fails (a wrong-password check takes longer than a no-such-user check),
even if the error message itself is identical either way. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Defending login against timing-based
user enumeration."_

### Token rotation

Issuing a brand new refresh token every time the old one is used to get a fresh access token, and
invalidating the old one — so a leaked-but-unused refresh token becomes worthless the next time
the legitimate user refreshes. See [docs/log/01-auth-backend.md](log/01-auth-backend.md), _"What
'rotation' means and why it's worth doing."_

### UUID

A Universally Unique Identifier - a randomly generated 128-bit id, used as this project's primary
key on nearly every table, chosen so an id can be generated anywhere (not just by the database)
with the practical guarantee that two different rows will never collide on one. See
[docs/log/04-symptom-logging.md](log/04-symptom-logging.md), _"Phase 1: `Symptom` and
`SymptomLog` models + migration + seed."_

### Vitest / Supertest

Vitest is the JavaScript/TypeScript test framework this project uses to run test files, check
assertions, and report pass/fail; Supertest is a companion library specifically for testing HTTP
servers, letting a test send a real request straight into the Express app in-process and inspect
the response, without a separate running server or an actual network call. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Phase 1 + Phase 2: PostgreSQL, Prisma,
the `User` model, and `POST /api/auth/register`."_

### XSS (Cross-Site Scripting)

An attack where malicious script an attacker manages to get running on your page can act with the
full trust and access of the real site - e.g. reading anything client-side JavaScript can reach,
including a token sitting in `localStorage`. Part of why this project keeps its refresh token in
an [HttpOnly cookie](#httponly-cookie) instead. See
[docs/log/02-auth-frontend.md](log/02-auth-frontend.md), _"Phase 5 + Phase 6: wiring the frontend
to auth — and why a vertical slice."_

### Zod

A TypeScript-first validation library used throughout this backend to check that request bodies
actually match the shape/types a route expects, before any of that data touches the database. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), _"Validating input with Zod."_
