# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

WellTrack is a wellness-tracking web app for people managing chronic health conditions
(symptoms, mood, medications, habits, and trends over time). It is an MVP built to the
spec in [Documents/requirements.md](Documents/requirements.md).

The repo is a monorepo with two independently runnable projects:

```
/frontend   React + TypeScript + Tailwind CSS (Vite)
/backend    Node.js + Express + TypeScript (Prisma + PostgreSQL, not yet added)
```

Frontend and backend only ever communicate over the HTTP API defined in requirements §12 —
never by importing each other's code.

## How work in this repo is organized — read this first

Implementation proceeds **task by task against [Tasks.md](Tasks.md)**, in order, phase by
phase. For every task:

1. Create a feature branch off `main` (see *Git Workflow* below for the naming convention).
   Never commit directly to `main`.
2. Do the work, making atomic commits as you go (see *Git Workflow*).
3. Satisfy *Testing Requirements* below and **build it and run it** to prove it actually
   works (e.g. `npm run build`, then start the dev server and hit an endpoint) — not just
   that the code compiles in theory.
4. Check off the completed item in `Tasks.md`.
5. Add an entry to **[IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md)** documenting the step.
   This log is written as a training manual for someone new to web development: explain
   tools/concepts the first time they appear (what they are and why they're needed), not
   just what command was run. Follow the existing entry format (Background/concepts → What
   was done → Why it's needed → Decisions → Verification).
6. Push the branch and open the pull request with `gh pr create` (GitHub CLI is installed
   and authenticated via an existing `GITHUB_TOKEN`) — see *Git Workflow* for what the PR
   itself should contain. Do not merge PRs — the user reviews and merges on github.com.

## Commands

### Backend (`/backend`)

```
npm run dev     # ts-node-dev, hot-reload dev server on PORT (default 4000)
npm run build   # tsc -> dist/
npm start       # node dist/index.js (runs compiled output, as in production)
```

No test runner is configured yet (Phase 13 in `Tasks.md` adds backend tests, likely
Jest/Vitest + Supertest). No linter is configured yet either (a later Phase 0 task adds
ESLint/Prettier).

`backend/src/app.ts` builds and configures the Express app (middleware, routes) but does
not call `.listen()`; `backend/src/index.ts` is the only file that starts the server. This
split exists so future test code can import the app directly (via Supertest) without
binding a real port. Add new routes inside `app.ts`, not `index.ts`.

`backend/tsconfig.json` uses `"moduleResolution": "Bundler"`, not `"node"` — the installed
TypeScript version (7.x) removed the old `"node"`/`node10` option. Keep this in mind if
adding compiler options or following older TypeScript tutorials/docs.

### Frontend (`/frontend`)

```
npm run dev       # Vite dev server (default http://localhost:5173)
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve the production build locally
npm run lint      # oxlint
```

No test runner is configured yet (Phase 13 in `Tasks.md` adds frontend tests, likely
Vitest + React Testing Library).

Tailwind CSS is v4, wired in via the `@tailwindcss/vite` plugin in `vite.config.ts` — there
is deliberately no `tailwind.config.js`/`postcss.config.js`; utility classes are enabled by
the single `@import "tailwindcss";` line in `src/index.css`. Don't add a v3-style Tailwind
config unless intentionally migrating.

The frontend reads the backend's URL from `VITE_API_URL` (see `frontend/.env.example`).
Only env vars prefixed `VITE_` are exposed to browser code by Vite — this is intentional,
not a bug, so never rename an env var off that prefix expecting it to still be readable
client-side.

### Environment files

Both projects use `.env` (git-ignored) + a committed `.env.example` documenting required
variables. Copy the example and fill in real values before running locally.

## Reference documents

- [Documents/requirements.md](Documents/requirements.md) — full product/functional/API/data-model spec (source of truth for what to build).
- [Tasks.md](Tasks.md) — the ordered implementation checklist; work through it top to bottom.
- [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md) — chronological build log/training manual; also documents project-specific conventions (git/GitHub workflow, tooling decisions) in more depth than this file.

## Git Workflow

**Branch naming.** Before starting a task, create a branch off `main` named:

```
feature/<task-number>-<brief-description>
```

e.g. `feature/0.3-scaffold-frontend`, `feature/2.1-auth-register-endpoint`. Use the task's
position in `Tasks.md` (phase number + item number within that phase) as `<task-number>`,
and a short kebab-case summary as `<brief-description>`.

**Commits.** Make atomic commits — each commit should represent one coherent change, not a
mix of unrelated edits — using these prefixes:

| Prefix       | Use for |
|--------------|---------|
| `feat:`      | new features |
| `fix:`       | bug fixes |
| `docs:`      | documentation (README, `Tasks.md`, `IMPLEMENTATION_LOG.md`, etc.) |
| `tests:`     | tests |
| `refactor:`  | refactoring with no behavior change |

**Pull requests.** After completing a task, open a PR (`gh pr create`) with:

- **Title** matching the task (e.g. the `Tasks.md` item text, or close to it).
- **Summary** of the change made.
- **Testing notes** — how it was verified (build/run output, commands used, edge cases
  considered), per the build-and-run-first habit described above.

Before opening the PR, make sure the corresponding checkbox in `Tasks.md` is checked off and
included in the PR's diff.

## Testing Requirements

Before marking any task in `Tasks.md` as complete:

1. **Write light unit tests for any new functionality.** Not exhaustive coverage — just
   enough to cover the core behavior the task introduced (e.g. a new validation rule, a new
   calculation, a new endpoint's happy path). Test tooling isn't wired up yet in either
   project (see *Commands* above — backend's `npm test` is currently a stub, frontend has no
   test script). Add minimal test tooling (e.g. Vitest) as part of the first task that
   introduces genuinely testable logic, rather than waiting for the dedicated test-focused
   tasks in `Tasks.md` Phase 13 — those are for filling out full coverage, not for standing
   up the tooling for the first time.
2. **Run the full test suite**, not just the new tests — `npm test` in the relevant project
   (`/backend` and/or `/frontend`, whichever was touched) — and confirm it passes.
3. **If any test fails**, read the failure output and diagnose whether the code or the test
   is wrong:
   - If the code is wrong, fix the code and re-run the suite.
   - Only change a test if the test itself is incorrect (e.g. it asserts the wrong expected
     behavior). Never edit a test just to make it pass without understanding why it failed.
