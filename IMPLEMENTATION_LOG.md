# WellTrack — Implementation Log

## What this document is

This is a step-by-step build log for the WellTrack project, written so that someone who is
**new to web development** can read it and understand not just _what_ was done, but _why_
it was done that way. Think of it as a training manual that happens to be built alongside
the real project.

Each entry below corresponds to one completed task from [Tasks.md](Tasks.md) and follows
the same shape:

- **Task** — which checklist item this covers.
- **Background / concepts** — plain-language explanations of any tool, term, or idea used
  in this step, especially the first time it shows up.
- **What was done** — the actual actions taken, in order.
- **Why it's needed** — how this step fits into the bigger picture of "an app users can log
  into and use."
- **Decisions** — choices that had more than one reasonable answer, and the reasoning.
- **Verification** — how we proved it actually works, not just that files were created.

Entries are in chronological order, oldest first. Concepts are usually only explained in
full the _first_ time they appear — later entries link back rather than repeat themselves.

---

## Big picture: how the frontend and backend actually talk to each other

The individual scaffold entries below explain the backend and frontend _separately_, since
that's how they were built. But neither one is useful alone, so before diving into those
entries, here's how the two connect — the part that ties everything together.

**Two separate programs, running on two separate ports.** After Phase 0, running this
project locally means two things are running _at the same time_, each listening on its own
"door" (**port**) on your computer:

- The **backend** (Express), on port `4000` — a program whose only job is to receive
  requests and send back data. It has no visual appearance at all; it's not a webpage.
- The **frontend** (Vite dev server), on port `5173` — serves the actual webpage your
  browser displays: HTML, the React app, styling, images.

When you open the app in a browser, you're only ever looking at the frontend. The backend is
invisible to you directly — the frontend talks to it _behind the scenes_.

**How "talking to it behind the scenes" works: the API.** Whenever the frontend needs data
(e.g. "show me today's mood entry") or needs to save something (e.g. "the user just logged a
symptom"), the React code running in the browser sends an **HTTP request** to the backend —
the same kind of request a browser sends when loading any web page, just aimed at the
backend's address instead, and carrying data instead of asking for a page. The backend reads
the request, does whatever's needed (e.g. look something up in the database, once Phase 1+
adds one), and sends back an **HTTP response** — usually formatted as **JSON**
(`{"mood": 4, "loggedAt": "2026-08-14T09:00:00Z"}`), a simple, universal text format for
structured data that both JavaScript (frontend) and Node.js (backend) can read and write
natively.

This request/response pattern — a defined set of URLs the backend understands, each doing
one specific thing — is what's meant by an **API** (Application Programming Interface). The
full list of URLs this project's backend will expose is laid out in requirements §12 (e.g.
`POST /api/auth/login`, `GET /api/symptom-logs`) and mirrored as checklist items throughout
[Tasks.md](Tasks.md). Right now, after Phase 0, there is exactly **one** such URL:
`GET /api/health` (see the backend scaffold entry below) — everything else gets added
endpoint-by-endpoint in Phases 2–4.

**Why the frontend needs to be told the backend's address.** The frontend has to know _where_
to send these requests. That's the purpose of `frontend/.env.example`'s `VITE_API_URL`
(currently `http://localhost:4000`) — a setting, not a hard-coded value, because the address
changes between environments (your laptop during development vs. wherever the app is
actually hosted once deployed in Phase 14). The frontend code will read this value and
prefix every API request with it, once Phase 5 builds the actual API client.

**Why CORS matters here specifically.** Browsers enforce a security rule: a webpage loaded
from one address (`http://localhost:5173`, our frontend) is blocked by default from making
requests to a _different_ address (`http://localhost:4000`, our backend) — even though
they're both "localhost" and both under our control, the browser only looks at whether the
port number matches, and `5173 ≠ 4000` counts as different. This is exactly why the backend
scaffold entry below installs and enables the `cors` package: it makes the backend explicitly
tell the browser "requests from this frontend are allowed," which is what lets the two
actually communicate once real API calls start happening in Phase 5 onward. Without it,
every request from the frontend to the backend would be silently blocked by the browser,
even though both servers themselves are running fine.

**Why they're still two independent projects, not one.** Even though they need to cooperate,
frontend and backend are kept as separate npm projects with separate dependencies, separate
build steps, and (eventually) separate deployments — this is what requirements §4 means by
"structured so that the frontend and backend remain independently testable and deployable."
Concretely: the backend can be tested and even hosted with zero knowledge of React; the
frontend could, in principle, be pointed at a totally different backend implementation
without changing how it's built. They only ever interact through the API contract described
above — never by directly importing each other's code.

---

## How this log is organized

Up to 2026-08-16, this was a single, ever-growing file — simple, but it had a real cost once
several PRs started being open at the same time (including [multiple AI agents working on
different features in parallel](docs/log/08-git-github-workflow.md)): _every_ task appended
to the same file, so any two branches both adding an entry on the same day were now editing
the exact same lines, which is exactly what a merge conflict is. This one file had become the
single most common source of conflicts in the whole project (see the retrospective in
[Git & GitHub Workflow](docs/log/08-git-github-workflow.md)).

The fix: entries are now split across topic files under [`docs/log/`](docs/log/), grouped by
feature area rather than kept in one continuous timeline. Two branches adding entries about
_different_ features (say, habit logging and a deployment fix) no longer touch the same file
at all — and even two branches both working in the _same_ topic file conflict far less often
than the old single-file-forever design did.

**This file (`IMPLEMENTATION_LOG.md`) is now an index, not a log.** It stays short and
evergreen — the "what this document is" and "big picture" sections above, plus the list below
linking out to every topic file with its entries' headlines shown, so you can scan what exists
without opening every file. The actual entries live in the linked files, in chronological order
within each one, following exactly the same Background/What was done/Why/Decisions/
Verification format used throughout this whole project.

**Four more ways into the same material, for different purposes:** the
[Glossary](docs/GLOSSARY.md) is a fast lookup table for terms and tools used throughout this log
(JWT, CORS, migrations, and so on), each pointing back to the topic file that explains it in
full — useful when you know _what_ you're looking for and just need to find where it's covered.
[Lessons Learned](docs/LESSONS-LEARNED.md) instead collects every real bug found during this
project's build in one place — what happened, the actual root cause, and the general lesson —
useful for browsing what's gone wrong before, rather than looking something specific up.
[Frontend Concepts](docs/FRONTEND-CONCEPTS.md) explains the _concepts and tooling_ behind the
frontend work rather than the tasks themselves — how a REST API differs from Server Actions, why
Tailwind looks the way it does once you think in components, and what each tool in the stack is
actually for (including what this project deliberately doesn't use, and why).
[Working With AI](docs/WORKING-WITH-AI.md) steps back from the code entirely and covers the
_process_ this project was built by: managing context (`/clear` and `/compact`), delegating to
subagents, turning off irrelevant MCP servers, skills vs. MCP, `CLAUDE.md` and its hierarchy, and
verifying rather than trusting — a living checklist of habits, with real examples from this
project's own sessions.

### [Project Setup & Tooling](docs/log/00-project-setup.md)

- 2026-08-14 — Phase 0: Initialize the git repository and folder layout
- 2026-08-14 — Phase 0: Scaffold the backend (Node.js + Express + TypeScript)
- 2026-08-14 — Phase 0: Push the initial commit to GitHub, and adopt a branch strategy
- 2026-08-14 — Phase 0: Scaffold the frontend (React + TypeScript + Tailwind CSS)
- 2026-08-14 — Tooling: install and authenticate the GitHub CLI, switch to Claude opening PRs
- 2026-08-14 — Tooling: add CLAUDE.md, and moving a new file onto its own branch mid-flight
- 2026-08-14 — Tooling: install Docker Desktop (needed to run PostgreSQL locally)
- 2026-08-16 — Phase 0: ESLint + Prettier for both projects (and an unexpected TypeScript downgrade)

### [Authentication — Backend](docs/log/01-auth-backend.md)

- 2026-08-14 — Phase 1 + Phase 2: PostgreSQL, Prisma, the `User` model, and `POST /api/auth/register`
- 2026-08-15 — Phase 2: `POST /api/auth/login`
- 2026-08-15 — Phase 2: refresh token cookie storage/rotation + `POST /api/auth/refresh`
- 2026-08-15 — Phase 2: `POST /api/auth/logout`
- 2026-08-15 — Phase 2: Express auth middleware (`requireAuth`)
- 2026-08-16 — Phase 2: `POST /api/auth/change-password`
- 2026-08-16 — The full authentication pattern, explained end to end
- 2026-08-16 — A real account lockout, a manual database recovery, and why "forgot password" specifically needs email
- 2026-08-19 — Phase 2: `GET/PATCH/DELETE /api/users/me`, and how cascade-delete was already doing the hard part
- 2026-08-19 — Phase 2: `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`
- 2026-08-20 — A real production bug: refreshing the app on mobile logged users out, and what `SameSite` actually gates

### [Authentication — Frontend](docs/log/02-auth-frontend.md)

- 2026-08-15 — Phase 5 + Phase 6: wiring the frontend to auth — and why a vertical slice
- 2026-08-16 — Phase 6: Settings page with change-password form (and a real race-condition bug)
- 2026-08-17 — Phase 5: rehydrating a session from the refresh cookie on page load
- 2026-08-18 — NavBar overflowing on mobile with a long display name/email
- 2026-08-19 — Phase 5: a bottom nav on mobile, a top nav on desktop, and a real FAB collision
- 2026-08-19 — Phase 6: Settings page grows a Profile section and an account deletion flow
- 2026-08-19 — Phase 6: forgot-password and reset-password pages

### [Mood Logging](docs/log/03-mood-logging.md)

- 2026-08-15 — Phase 1: `MoodLog` model + migration
- 2026-08-15 — Phase 3: `GET/POST/PATCH/DELETE /api/mood-logs`
- 2026-08-15 — Phase 7: Mood entry form, wired into the Dashboard
- 2026-08-16 — Clarifying what 1 and 5 mean on the energy/stress scales
- 2026-08-16 — Widening energy/stress from 1–5 to 1–7, after more user feedback
- 2026-08-16 — Migrating historical energy/stress values onto the new 1–7 scale
- 2026-08-17 — Phase 7: Edit action for mood entries, reusing the same form
- 2026-08-17 — A real bug found in review: clearing an optional field during edit didn't actually clear it

### [Symptom Logging](docs/log/04-symptom-logging.md)

- 2026-08-16 — Phase 1: `Symptom` and `SymptomLog` models + migration + seed
- 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/symptoms` and `/api/symptom-logs`
- 2026-08-16 — Phase 7: Symptom entry form, wired into the Dashboard
- 2026-08-17 — Letting users add their own symptoms inline (and two new defaults: Anxiety, Depression)
- 2026-08-17 — Phase 7: Edit action for symptom entries, reusing the same form
- 2026-08-17 — Fixed: clearing notes during edit didn't actually clear it

### [Medication Logging](docs/log/05-medication-logging.md)

- 2026-08-16 — Phase 1: `Medication` + `MedicationLog` models + migration
- 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/medications` and `/api/medication-logs`
- 2026-08-16 — Phase 7: Medication entry form, wired into the Dashboard
- 2026-08-17 — An optional dosage field, so "Diazepam 2mg" isn't crammed into the name
- 2026-08-17 — Phase 7: Edit action for medication entries, reusing the same form
- 2026-08-17 — Fixed: clearing notes during edit didn't actually clear it

### [Habit Logging](docs/log/06-habit-logging.md)

- 2026-08-16 — Phase 1: `Habit` and `HabitLog` models + migration
- 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/habits` and `/api/habit-logs`
- 2026-08-16 — Phase 7: Habit entry form, wired into the Dashboard
- 2026-08-17 — Phase 7: Edit action for habit entries, reusing the same form
- 2026-08-17 — Fixed: clearing notes during edit didn't actually clear it

### [History](docs/log/11-history.md)

- 2026-08-17 — Phase 9: `GET /api/history` and the History page
- 2026-08-22 — A real bug found during a general bug hunt: History's date filter ignored the user's own timezone

### [Deployment (Railway + Vercel)](docs/log/07-deployment.md)

- 2026-08-15 — Hosting and domains, explained (ahead of actually deploying)
- 2026-08-15 — Why migration should stay easy, what a "build artifact" is, and how deployment actually works
- 2026-08-15 — First real Railway deploy attempt: the monorepo build failure, `package.json`, and what a "server" actually is
- 2026-08-15 — Fixing the real Railway build failure: `postinstall` and Prisma's generated client
- 2026-08-15 — The PR #16–#19 chain, actually walked through slowly
- 2026-08-15 — `npm install`, lockfiles, generated Prisma code, and lifecycle hooks, from the ground up
- 2026-08-15 — The first successful Railway build — what it actually means, and how auto-deploy works
- 2026-08-15 — Where secrets actually live in production, and how a hosted Postgres database works
- 2026-08-15 — Production migrations: how "upgrading" the live schema actually works, and the honest truth about rollbacks
- 2026-08-15 — The backend is genuinely connected to a real production database
- 2026-08-15 — What a Railway-generated domain actually is, before turning it on
- 2026-08-15 — A slow, careful walkthrough: which port to use, and both ways to get a working URL
- 2026-08-15 — Confirmed live: the backend is genuinely reachable from the public internet
- 2026-08-15 — Deploying the frontend to Vercel, and why `FRONTEND_URL`/CORS matters for real this time
- 2026-08-16 — Fixing a real production bug: direct links to any page but the homepage 404'd
- 2026-08-16 — A harmless-but-alarming Vercel "Build Failed": the screenshot CI branch has no app in it
- 2026-08-17 — A real production bug: the symptom picker was empty, because seeding never ran there
- 2026-08-22 — Phase 14 smoke test: a real production bug, found by actually using the deployed app

### [Git & GitHub Workflow (branches, PRs, subagents)](docs/log/08-git-github-workflow.md)

- 2026-08-15 — Tooling: stacked PRs, auto-retargeting, and rebasing (#7 → #8 → #9)
- 2026-08-15 — Tooling: a GitHub ruleset that actually enforces "no direct pushes to `main`"
- 2026-08-15 — Checking in: what's actually running, and what a PR-visible screenshot would take
- 2026-08-15 — Debugging a broken image delivery, then automating PR screenshots via CI
- 2026-08-15 — GitHub Actions, properly explained, and a before/after screenshot upgrade
- 2026-08-15 — The real bug: `postinstall` never reached `main` at all (a stacked-PR gotcha), plus a more robust fix
- 2026-08-15 — Auditing every branch for stragglers, and finding one that had been missing since PR #1
- 2026-08-15 — Why deleting a merged branch is safe (and why keeping it around actively causes bugs here)
- 2026-08-16 — The exact stranded-PR bug happened again, on PR #45 — recovered the same way
- 2026-08-16 — Building three features at once with parallel AI agents
- 2026-08-16 — Turning on "automatically delete head branches," so this stops happening
- 2026-08-16 — Retrospective: why PRs, stacking, and parallel agents kept colliding, and what to actually do about it
- 2026-08-16 — Actually splitting `IMPLEMENTATION_LOG.md` into topic files
- 2026-08-17 — Decomposing `DashboardPage.tsx` into one section component per log type
- 2026-08-17 — Two lasting regression checks for the dashboard, not just a one-off manual verification
- 2026-08-17 — A bug fix stranded by outage timing, and how `git cherry-pick` recovered it
- 2026-08-18 — A third stranding variant: work that was never pushed at all, and `git rebase` to recover it
- 2026-08-18 — GitHub merge queues, explained (and why they're not the same thing as stacked PRs)
- 2026-08-19 — The PR screenshot script broke silently when the Dashboard's buttons changed

### [Housekeeping & Audits](docs/log/09-housekeeping.md)

- 2026-08-16 — Reconciling Tasks.md/requirements.md with reality, and adding "change password"
- 2026-08-22 — A general bug/security/test-coverage review, guided by an actual coverage report

### [Dashboard & Trends](docs/log/10-dashboard-and-trends.md)

- 2026-08-17 — Phase 4 + Phase 8: `GET /api/dashboard` and the real Dashboard summary card
- 2026-08-17 — Phase 4 + Phase 10: `GET /api/trends` and the Trends page (charts, averages, activity calendar)
- 2026-08-18 — A real user-reported bug: "Recent entries" looked wrong, but the counts were right
- 2026-08-18 — Bounding the Dashboard's per-type log lists: real pagination, not just a display fix
- 2026-08-18 — Dashboard redesign: paginating "Recent entries" too, own panels, and collapsible lists
- 2026-08-19 — Inline icon "+ Add" buttons and a floating Quick Add across all four sections
- 2026-08-19 — Phase 7: verifying "no silent failures" for the entry forms, and finding two real gaps
- 2026-08-19 — Quick Add becomes a real dialog, and "Load less" everywhere "Load more" exists

### [Security & Accessibility Audits](docs/log/12-security-and-accessibility-audits.md)

- 2026-08-17 — Phase 11: a real security audit against the running codebase, not just re-reading the checklist
- 2026-08-17 — Fixing the one real gap the audit found: no centralized error-handling middleware
- 2026-08-17 — Phase 12: a real accessibility audit, with axe-core and actual keyboard testing
- 2026-08-18 — Closing the rate-limiting gap the audit found
- 2026-08-18 — Dependabot: security updates enabled, version updates deferred
- 2026-08-22 — A second, deeper security audit: a real rate-limiter bypass, a timing side-channel, and three hardening additions

### [Responsive Design](docs/log/13-responsive-design.md)

- 2026-08-19 — Adopting mobile-first responsive design as a real convention, not just a phrase

### [Reminders (Web Push)](docs/log/14-reminders.md)

- 2026-08-22 — Building web push reminders: the concepts, the architecture decision, and two real bugs found by actually running it
- 2026-08-23 — Production verification, and a third real bug: an awaited fetch between the click and the permission request was silently losing the browser's user-gesture window on mobile

### [Custom Categories](docs/log/15-categories.md)

- 2026-08-23 — Task 1: the generic Category model, alongside (not replacing) the four fixed ones
- 2026-08-23 — Task 2: user-facing frontend (Dashboard, Quick Add, Settings)
- 2026-08-23 — Task 3: admin screen + History integration
- 2026-08-23 — Task 4: Trends support for custom categories (fast-follow)

### [Built-in Category Toggles + Per-Target Reminders](docs/log/16-reminders-and-category-toggles.md)

- 2026-08-24 — Task 2: the generalized Reminder model, scheduler, and CRUD
- 2026-08-24 — Task 1: built-in category toggles
- 2026-08-24 — Task 3: frontend built-in category toggles
- 2026-08-24 — Task 4: Medications management (closes a pre-existing gap)
- 2026-08-24 — Task 5: reminders management rewrite

### [Unify Mood, Symptom, and Habit into the Generic Category Model](docs/log/17-unify-mood-symptom-habit.md)

- 2026-08-25 — Task 1: per-user system-category hiding
- 2026-08-25 — Task 2: Backend — Habit → Category
- 2026-08-25 — Task 3: frontend Habit retirement
- 2026-08-25 — Task 4: Backend — Symptom → Category
- 2026-08-25 — Task 5: frontend Symptom retirement
- 2026-08-25 — Task 6: Backend — Mood → Category (Mood/Energy/Stress)
- 2026-08-25 — Task 7: frontend Mood retirement

### [Per-Category Dashboard Cards](docs/log/18-per-category-dashboard-cards.md)

- 2026-08-26 — Task 1: Backend — category activity/filtering support
- 2026-08-26 — Task 2: Frontend — split "Your categories" into per-category cards
- 2026-08-27 — Bug fix: discovery picker wrongly excluded already-carded categories

### [Medication → Category, and History filtered by category](docs/log/19-medication-to-category.md)

- 2026-08-27 — Task 1: Backend — Medication → Category unification
- 2026-08-27 — Task 2: Frontend — Medication retirement
- 2026-08-27 — Task 3: Backend — History filtered by category, not type
- 2026-08-27 — Task 4: Frontend — History filter UI updated to filter by category

### [Scale Rating Wraps on Mobile](docs/log/20-scale-rating-mobile-wrap.md)

- 2026-08-27 — Bug fix: wide scale categories overflowed and got clipped on mobile

### [Unify Scale Categories to 1-7](docs/log/21-unify-scale-to-seven.md)

- 2026-08-27 — Standardizing every built-in scale category onto a common 1-7 range

### [Category Soft-Delete With Undo](docs/log/22-category-soft-delete-with-undo.md)

- 2026-08-27 — Replacing Archive with a 30-day soft-delete, restore, and a real confirmation dialog

### [Category Groups](docs/log/23-category-groups.md)

- 2026-08-28 — Organizing categories into collapsible groups, with hide/rename for groups themselves

### [Admin Group Assignment, and a Best-Guess Backfill for Existing Categories](docs/log/24-admin-group-assignment-and-backfill.md)

- 2026-08-28 — Exposing group assignment on AdminCategoriesPage, and backfilling groups for categories that predate them

### [Cron Reminder Schedules](docs/log/25-cron-reminder-schedules.md)

- 2026-08-28 — Replacing fixed "HH:mm" reminder times with cron expressions

### [Categories Page and Reminder Picker](docs/log/26-categories-page-and-reminder-picker.md)

- 2026-08-28 — Giving categories their own page, and a schedule picker over cron

### [Multiple Schedules Per Reminder](docs/log/27-multiple-schedules-per-reminder.md)

- 2026-08-29 — Letting one reminder do different things on different days

### [Fix: the "+ Add time" Button Did Nothing](docs/log/29-fix-add-time-button.md)

- 2026-08-29 — A reported bug, three possible causes, and why all three were fixed

### [Inline Time Picker, and Fewer Repeat Chips](docs/log/30-inline-time-picker.md)

- 2026-08-29 — Adding a time in one tap instead of three

### [Categories Page Polish: Toasts, Collapse All, and an Add Control That Belongs](docs/log/31-categories-page-polish.md)

- 2026-08-29 — Three pieces of feedback from using the page for real

### [Responsive Row Actions: Icons on Phones, Words on Wider Screens](docs/log/32-responsive-icon-actions.md)

- 2026-08-29 — One accessible name, two visual treatments

### [Next-Run Preview](docs/log/33-next-run-preview.md)

- 2026-08-29 — Showing when a schedule will actually fire, computed by the code that fires it

### [A Real Push Delivery Test](docs/log/34-real-push-delivery-test.md)

- 2026-08-29 — Closing the last unverified link in the reminder chain

### [Making the Backend Suite Tell the Truth Every Run](docs/log/35-reliable-backend-test-suite.md)

- 2026-08-29 — Resolving the parallelism trade-off in favour of reliability
