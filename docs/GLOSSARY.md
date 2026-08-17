# Glossary

A lookup table for terms and tools used throughout this project's [implementation
log](../IMPLEMENTATION_LOG.md). Each entry is a short definition plus a pointer to where it's
explained in full, with the surrounding context of why it mattered at that moment — this page is
deliberately *not* a replacement for those fuller explanations, just a fast way to find them.

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
"Big picture" section — *"How 'talking to it behind the scenes' works: the API."*

### bcrypt / password hashing

A one-way transformation applied to a password before it's ever stored, so the real password is
never recoverable from the database — even by someone with full database access. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), *"Password hashing: why it matters and how
it works here."*

### Bearer token

An access token sent in an HTTP `Authorization: Bearer <token>` header, the standard way an API
client proves who it is on every request. See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
*"Bearer tokens vs. the refresh cookie — two different auth mechanisms, on purpose."*

### Branch protection / ruleset

GitHub features that can block direct pushes to a branch (e.g. `main`), require pull requests,
and prevent force-pushes or deletions — turning a written convention into something GitHub
itself enforces. See [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md),
*"Branch protection vs. a ruleset — GitHub has two overlapping systems."*

### Build artifact

The actual thing a hosting platform runs after a build step — compiled JavaScript for the
backend, static HTML/CSS/JS for the frontend. See [docs/log/07-deployment.md](log/07-deployment.md),
*"What a 'build artifact' actually is, concretely, for each half of this project."*

### Cascading delete (`onDelete: Cascade`)

A database-level rule saying "when this row is deleted, automatically delete every row that
refers to it too" — used throughout this schema so deleting a user (or a medication, or a habit)
cleans up everything that depended on it, rather than leaving orphaned rows behind. See
[docs/log/05-medication-logging.md](log/05-medication-logging.md), *"Cascading deletes, two
levels deep."*

### CI (Continuous Integration) / GitHub Actions

Automated checks that run on GitHub's own servers whenever something happens (like opening a
PR), rather than depending on someone remembering to run them locally. See
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), *"GitHub Actions, properly
explained, and a before/after screenshot upgrade."*

### Composite index

A database index built across more than one column together (e.g. `[userId, loggedAt]`), used
when queries always filter/sort by that same combination of columns — faster than two separate
single-column indexes for that specific access pattern. See [docs/log/03-mood-logging.md](log/03-mood-logging.md),
*"The composite index, and why `[userId, loggedAt]` specifically (not two separate indexes)."*

### CORS (Cross-Origin Resource Sharing)

A browser security rule that blocks a webpage from one address from making requests to a
different address unless the target server explicitly allows it. Explained first in the root
[IMPLEMENTATION_LOG.md](../IMPLEMENTATION_LOG.md)'s "Big picture" section, with a real bug this
project hit covered in [docs/log/02-auth-frontend.md](log/02-auth-frontend.md), *"The CORS bug
this step actually found (not just fixed defensively)."*

### Declaration merging (TypeScript)

TypeScript's mechanism for adding a property to a type defined by a third-party library (e.g.
adding `userId` to Express's own `Request` type), without forking or wrapping that library. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), *"Attaching the user to the request:
TypeScript declaration merging."*

### DNS (Domain Name System)

The system that translates a human-readable domain name into the actual server address a
browser connects to, via records configured at a domain's registrar. See
[docs/log/07-deployment.md](log/07-deployment.md), *"DNS: how a domain actually gets pointed at a
host it wasn't bought from."*

### Docker / Docker Compose

A way of running software (here, PostgreSQL) in an isolated, reproducible container rather than
installing it directly onto a machine; Compose is the tool for describing and starting one or
more containers together with a single config file. See [docs/log/00-project-setup.md](log/00-project-setup.md),
*"Tooling: install Docker Desktop (needed to run PostgreSQL locally)."*

### Environment variables / `.env`

Configuration values (database URLs, secret keys) kept outside the actual code, loaded at
runtime — different per environment (a laptop vs. production) and never committed to git. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), *"Connection strings, `.env`, and what
actually counts as a 'secret' here."*

### ESLint / Prettier / TypeScript compiler

Three genuinely different tools often confused for one: TypeScript's compiler checks *types*;
ESLint checks *code patterns/style rules* (and can catch real bugs, not just style); Prettier
only *reformats* code, with no opinion on correctness at all. See
[docs/log/00-project-setup.md](log/00-project-setup.md), *"What a linter is, and why it's a
different tool from the TypeScript compiler"* and *"Why Prettier is a *third*, separate tool from
either of those."*

### Express / middleware

Express is the Node.js web framework this backend is built on; **middleware** is any function
that runs on a request before it reaches its final route handler (e.g. `requireAuth`, which
checks the access token on every protected route). See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
*"How Node.js and Express actually work, end to end"* and *"What 'middleware' means in Express."*

### Git worktree

A way to have more than one branch of the same repository checked out into separate folders at
the same time, sharing one underlying `.git` history — used in this project to let multiple AI
agents build different features simultaneously without colliding. See
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), *"The isolation mechanism:
git worktrees, explained from scratch."*

### HttpOnly cookie

A cookie that JavaScript running in the browser cannot read or modify — used for this project's
refresh token specifically so it can't be stolen via a cross-site-scripting bug the way a token
sitting in `localStorage` could be. See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
*"Why a cookie instead of just leaving the refresh token in the JSON body."*

### Idempotent

An operation that produces the same end result no matter how many times it's run — this
project's seed script is written this way specifically so it's safe to run on every single
deploy, not just the first one. See [docs/log/07-deployment.md](log/07-deployment.md)'s most
recent entries on automatic database seeding, and the general principle in
[docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), *"Lifecycle hooks vs.
explicit script chaining: a general rule of thumb, not just a Prisma one."*

### JWT (JSON Web Token)

A signed, tamper-evident token used to prove who a request is coming from without the server
needing to look anything up in a database on every request. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), *"What a JWT actually is, and why two of
them."*

### Layout route (React Router)

A route with no path of its own that renders a shared wrapper (via `<Outlet>`) around whichever
child route actually matched — used in this project for the `RequireAuth` guard, so every
protected page shares the same "redirect to login if not authenticated" logic in one place. See
[docs/log/02-auth-frontend.md](log/02-auth-frontend.md), *"Client-side routing, and the 'layout
route' pattern used for the auth guard."*

### Lifecycle hooks (npm) vs. explicit script chaining

An npm lifecycle hook (like `postinstall`) runs automatically as a side effect of another command
— convenient, but only as reliable as how that other command gets invoked, which varies across
hosting platforms. Explicit chaining (`"build": "prisma generate && tsc"`) is more verbose but
unambiguous. This project hit a real bug from trusting a hook on a platform that didn't run it as
expected. See [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), *"Lifecycle
hooks vs. explicit script chaining: a general rule of thumb, not just a Prisma one."*

### Lockfile (`package-lock.json`)

A file recording the *exact* version of every dependency (including dependencies of
dependencies) actually installed, so two different machines running `npm ci` get byte-for-byte
identical `node_modules`. See [docs/log/07-deployment.md](log/07-deployment.md), *"What a
lockfile is, and why 'the locking' matters."*

### Migration (Prisma)

A versioned, ordered SQL file describing one change to the database schema — `migrate dev` is
used locally (also generates the file), `migrate deploy` applies already-written migrations in
production without ever generating new ones on the fly. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), *"Prisma: schema, migrations, and the
generated client"* and [docs/log/07-deployment.md](log/07-deployment.md), *"Production
migrations: how 'upgrading' the live schema actually works, and the honest truth about
rollbacks."*

### ORM (Object-Relational Mapper) / Prisma Client

A layer that lets code query a database using regular function calls and objects instead of
writing raw SQL by hand, while still generating real SQL underneath. Prisma additionally
*generates* a fully-typed client from the schema file, so TypeScript catches a typo'd column name
at compile time instead of a runtime SQL error. See [docs/log/01-auth-backend.md](log/01-auth-backend.md),
*"Prisma: schema, migrations, and the generated client."*

### Prisma `enum`

A column type restricted to a fixed, named set of values (e.g. a `Habit`'s `type` can only ever
be `BOOLEAN`, `NUMERIC`, or `DURATION`) — enforced by the database itself, not just application
code. See [docs/log/06-habit-logging.md](log/06-habit-logging.md), *"`HabitType` as a Prisma
`enum`, not a plain `String`."*

### Rebase vs. merge

Two different ways to bring one branch's changes onto another: a merge adds a new commit tying
two histories together side by side; a rebase rewrites a branch's commits to look as if they'd
started from a different point all along. See [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md),
*"Rebasing: why the *local* copy of these branches may still need one."*

### Stacked PR

A pull request whose base branch is another not-yet-merged feature branch (instead of `main`),
used when one task genuinely depends on code from a task that hasn't been reviewed and merged
yet. See [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), *"What a 'stacked'
PR is, and why these three ended up that way."*

### Timing-based user enumeration

A vulnerability where an attacker can tell whether an email address has an account just by how
*fast* a login attempt fails (a wrong-password check takes longer than a no-such-user check),
even if the error message itself is identical either way. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), *"Defending login against timing-based
user enumeration."*

### Token rotation

Issuing a brand new refresh token every time the old one is used to get a fresh access token, and
invalidating the old one — so a leaked-but-unused refresh token becomes worthless the next time
the legitimate user refreshes. See [docs/log/01-auth-backend.md](log/01-auth-backend.md), *"What
'rotation' means and why it's worth doing."*

### Zod

A TypeScript-first validation library used throughout this backend to check that request bodies
actually match the shape/types a route expects, before any of that data touches the database. See
[docs/log/01-auth-backend.md](log/01-auth-backend.md), *"Validating input with Zod."*
