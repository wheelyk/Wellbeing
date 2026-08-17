# Lessons Learned

Every real bug found during this project, in one place. Each entry is short on purpose — what
happened, the actual root cause, and the general lesson — with a link to the full story (how it
was diagnosed, what was tried, what didn't work) in the relevant [implementation log](../IMPLEMENTATION_LOG.md)
topic file. Read this page for the pattern; read the linked entry for how to actually find one of
these yourself next time.

For definitions of the tools/concepts named below, see the [Glossary](GLOSSARY.md).

---

## Data correctness bugs

### Clearing a field during edit silently didn't clear it

**What happened:** editing an entry (mood, symptom, medication, or habit) and deleting its notes
text, then saving, looked like it worked in the UI — but the old notes reappeared on the next
real page load.

**Root cause:** every entry form sent an empty optional field as `undefined`, which
`JSON.stringify` drops from the request body entirely. The backend's `PATCH` handlers only ever
update columns whose key is actually *present* in the request — an absent key means "don't
touch this," not "clear it." That distinction never mattered for *creating* an entry (nothing to
clear yet), only for *editing* one that already had a value.

**Lesson:** "not provided" and "explicitly cleared" are two different things, and a `PATCH`
endpoint has to be able to tell them apart — usually by accepting an explicit `null` for anything
that's genuinely optional. Test clearing a field, not just setting one, for any edit UI.

**Full story:** [docs/log/03-mood-logging.md](log/03-mood-logging.md), *"A real bug found in
review: clearing an optional field during edit didn't actually clear it."*

### A rescale migration's own safety claim was wrong — caught by testing it twice

**What happened:** a migration that widened the mood app's energy/stress scale from 1–5 to 1–7
claimed to safely rescale old values, but a specific edge case in that math was wrong.

**Root cause:** covered in full in the entry itself — the kind of off-by-one/edge-case error
that's easy to write and easy to *believe* is correct without actually re-deriving it against
concrete numbers.

**Lesson:** running a migration once and having it succeed isn't the same as it being *correct*
— for anything with real arithmetic in it, test the actual before/after values, not just "the
migration ran without erroring."

**Full story:** [docs/log/03-mood-logging.md](log/03-mood-logging.md), *"A real bug in this
migration's own safety claim — caught by actually testing it twice."*

### A `Promise.all`-based component's tests passed for the wrong reason

**What happened:** three dashboard sections that fetch two things at once via `Promise.all` had
new tests fail with `Cannot read properties of null (reading 'length')`.

**Root cause:** the tests mocked `fetch` with `.mockResolvedValue(sameResponseObject)` — which
returns the identical `Response` instance for every call. A `Response` body can only be read
once; the second simultaneous `.json()` call silently resolved to `null` instead of throwing,
because this app's shared `apiFetch` helper swallows JSON-parse failures defensively.

**Lesson:** `mockResolvedValue`/`mockReturnValue` share one fixed value across every call to a
mock; `mockImplementation` produces a fresh value each time. The two are interchangeable for a
mock that's only ever called once — and silently *not* interchangeable the moment a component
calls it more than once concurrently.

**Full story:** [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), the
`DashboardPage.tsx` decomposition entry (2026-08-17).

---

## Frontend UI bugs

### A logout redirect raced against the route guard's own redirect

**What happened:** after changing a password (which logs the user out), a subsequent login
sometimes landed on `/settings` instead of `/dashboard` — with the wrong confirmation message,
or none at all.

**Root cause:** the code called `await logout()` *before* `navigate()`. `logout()` flips
`isAuthenticated` to false while the still-current page is a protected route, so `RequireAuth`
(the layout route guarding it) fires its *own* competing redirect — with its own `state`
overwriting the one the explicit `navigate()` call was about to set.

**Lesson:** when a state change can itself trigger a side effect elsewhere in the app (like a
route guard reacting to auth state), the order of "update state" vs. "navigate" matters, and it's
exactly the kind of bug a mocked test suite won't catch — this one was found only by actually
driving the flow in a real browser.

**Full story:** [docs/log/02-auth-frontend.md](log/02-auth-frontend.md), *"A real, found-by-actually-testing-it race condition between two different redirects to `/login`."*

---

## Deployment / infrastructure bugs

### The symptom picker was empty in production, silently

**What happened:** the live site's symptom dropdown had nothing in it but a disabled
placeholder — not broken, just genuinely empty.

**Root cause:** the seed script that creates the system-default symptoms had been run locally
and in CI, but nothing in the actual production deploy path (`npm run build` → `npm start`) ever
invoked it — a one-time setup step that was proven working everywhere except the one place
unattended automation actually runs.

**Lesson:** a step that "only needs to happen once" is exactly the kind of thing that's easy to
lose track of across environments, unless it's made a safe, idempotent part of the thing that
runs automatically every time (here: chained into `start`, not left as a manual, rememberable
step).

**Full story:** [docs/log/07-deployment.md](log/07-deployment.md), *"A real production bug: the
symptom picker was empty, because seeding never ran there."*

### A stacked PR merged into the wrong branch — twice

**What happened:** a PR showed as "Merged" on GitHub, but its actual code never reached `main` —
confirmed directly via `git log main..<branch>`, which still listed every one of its commits as
missing.

**Root cause:** a stacked PR's base branch survived its own merge (wasn't deleted) — GitHub only
auto-retargets a stacked PR to `main` when its base branch *disappears*. A base that merges but
survives silently keeps the next PR pointed at it, so merging that PR delivers its commits to the
now-orphaned branch, not `main`.

**Lesson:** "is this PR merged?" and "did this PR's code reach `main`?" are two different
questions for a stacked PR specifically. `git log main..<branch>` answers the second one
directly; GitHub's "Merged" badge only answers the first. Fixed permanently (not just
documented around) by turning on `delete_branch_on_merge` at the repo level.

**Full story:** [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), *"The real
bug: `postinstall` never reached `main` at all"* and *"The exact stranded-PR bug happened again,
on PR #45."*

### A GitHub API permission fix "didn't work" for three retries — because the wrong token was edited

**What happened:** creating a branch-protection ruleset via the GitHub API kept failing with
`403`, even after adding the required permission to a fine-grained personal access token.

**Root cause:** the account had more than one fine-grained token, and the one edited wasn't the
one actually stored in this machine's `GITHUB_TOKEN` — editing a token's permissions only ever
affects that one token, never any other, even on the same account.

**Lesson:** when a fix that should obviously work doesn't, verify which *specific* credential is
actually in play (a partial token fingerprint, printed and cross-checked, is what solved this)
before assuming the failure means the fix itself is wrong, or defaulting to "maybe it just needs
time to propagate."

**Full story:** [docs/log/08-git-github-workflow.md](log/08-git-github-workflow.md), *"A GitHub
account can have many tokens at once, and editing one never touches another."*

### Vercel showed a red "Build Failed" for a branch with no real app in it

**What happened:** an orphan git branch used only to hold generated CI screenshots (no actual
frontend code) showed up in Vercel's dashboard as a failed deployment on every push.

**Root cause:** Vercel's GitHub integration tries to deploy every branch pushed to a connected
repo. Its "Ignored Build Step" feature — the obvious fix — runs a check *inside* the configured
Root Directory, which doesn't exist on a branch with no `frontend/` folder at all: a
chicken-and-egg problem where the ignore mechanism can't run because the very thing it would
ignore is missing.

**Lesson:** a tool's "skip this" feature can have its own precondition that isn't obviously
satisfied in every scenario it's supposed to cover — the fix here was giving the branch just
enough of a `frontend/` folder (a one-line stub config) for the ignore mechanism to have
somewhere to run at all.

**Full story:** [docs/log/07-deployment.md](log/07-deployment.md), *"A harmless-but-alarming
Vercel 'Build Failed': the screenshot CI branch has no app in it."*

### Direct links to any page but the homepage 404'd in production

**What happened:** the deployed frontend worked fine when navigated to from the homepage, but
opening `/dashboard` or `/login` directly (or refreshing on one) returned a real 404 from Vercel.

**Root cause:** this is a single-page app — every route is handled by client-side JavaScript
after `index.html` loads, not by separate files on the server for each path. Without an explicit
rewrite rule, Vercel looked for a literal `dashboard` file on disk, found nothing, and 404'd
before React Router ever got a chance to run.

**Lesson:** any SPA hosting setup needs an explicit "serve `index.html` for every path" rewrite
rule — this isn't a framework bug, it's a standard, expected piece of configuration every
client-side-routed app needs on every static host.

**Full story:** [docs/log/07-deployment.md](log/07-deployment.md), *"Fixing a real production
bug: direct links to any page but the homepage 404'd."*

### Environment variables were set on the wrong Railway service

**What happened:** a deploy looked like it should work, but genuinely didn't, until this was
caught directly rather than assumed.

**Root cause:** Railway can host multiple services (e.g. the backend app and its Postgres
database) under one project — environment variables have to be set on the *specific* service
that needs them, not "the project" as a loose, undifferentiated whole.

**Lesson:** when a platform has a concept of multiple services under one project, always confirm
*which* service a setting actually landed on — a value that looks configured "somewhere" isn't
the same as it being configured on the thing that reads it.

**Full story:** [docs/log/07-deployment.md](log/07-deployment.md), *"A real mistake, caught
before it mattered: variables set on the wrong service."*

### A Prisma migration checksum mismatch, self-inflicted

**What happened:** found while double-checking the README, not from a failure report.

**Root cause:** an already-applied migration file's contents had been edited after the fact —
Prisma records a checksum of each migration when it's applied, specifically to catch exactly this
(a migration that looks the same by filename but no longer matches what actually ran).

**Lesson:** never hand-edit a migration file that's already been applied anywhere (locally, in
CI, or in production) — if a change is needed, write a *new* migration instead, even for a tiny
correction.

**Full story:** [docs/log/09-housekeeping.md](log/09-housekeeping.md), *"A real, self-inflicted
Prisma migration checksum mismatch, found while double-checking the README."*

---

## General principles that came out of these

- **A green checkmark / "success" status proves less than it looks like.** "The migration ran,"
  "the PR shows Merged," "the deploy succeeded" are all claims worth directly verifying (`git
  log`, reading the actual response body, checking the real database) rather than trusting the
  status alone — several bugs above were only caught this way.
- **Lifecycle hooks (like `postinstall`) are only as reliable as how the surrounding command gets
  invoked** — solid on a machine you fully control, much less certain on third-party
  infrastructure. Prefer explicit chaining (`"start": "migrate deploy && seed && node ..."`) for
  anything that must not silently get skipped. See the [Glossary](GLOSSARY.md)'s "Lifecycle hooks"
  entry.
- **A mocked test suite can't catch a bug that only exists in the interaction between two real
  running pieces** (a route guard and a logout call; a browser tab regaining focus; a real
  database's actual current state). Several of the bugs above were only found by actually driving
  the app in a real browser against real running servers — this project's standing habit of
  build-and-run verification before calling anything done exists specifically because of bugs
  like these.
