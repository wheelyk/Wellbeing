# Security & Accessibility Audits

## 2026-08-17 — Phase 11: a real security audit against the running codebase, not just re-reading the checklist

**Task:** [Tasks.md](../../Tasks.md) → Phase 11 — Security Hardening. The user asked for this
directly while waiting on an unrelated GitHub outage, alongside a Phase 12 accessibility audit
and two small fixes it surfaced (covered in their own entries/files, linked below).

### Background / concepts

#### What "audit" means here — checking the real thing, not re-reading intentions

Every item in Phase 11 describes something that's _supposed_ to already be true, built up over
many earlier tasks in this log. An audit's whole job is confirming each one is actually true
_right now_, against the real running code and — where possible — the real deployed system, the
same "verify, don't assume" discipline this whole log has followed since its first entries. Two
techniques did most of the work:

- **Grep across every route file at once**, rather than trusting memory of what each one does.
  A single `grep -n "\.findMany(\|\.findFirst(\|\.findUnique(\|\.count(" backend/src/routes/*.ts`
  surfaces literally every database read in the backend in one screen, cheap to eyeball for a
  missing `userId` in its `where` clause.
- **Checking the real production system directly**, not just the code that's supposed to
  produce it. Cookie flags are a good example: reading `cookies.ts` shows the _intent_
  (`httpOnly: true`, `secure: process.env.NODE_ENV === "production"`), but only an actual
  `curl -i` against the live login endpoint proves `NODE_ENV` is genuinely set to `"production"`
  on Railway and the header the browser actually receives really does say
  `HttpOnly; Secure; SameSite=Lax` — the same "don't trust a green checkmark, read the real
  response" habit from every deployment entry in this log.

### What was done, item by item

- **"Audit every data-returning endpoint... filtered by `user_id`."** ✅ Grepped every
  `findMany`/`findFirst`/`findUnique`/`count` call across all eight route files
  (`auth.ts`, `moodLogs.ts`, `symptomLogs.ts`, `medicationLogs.ts`, `habitLogs.ts`, `symptoms.ts`,
  `medications.ts`, `habits.ts`). Every one scopes by `userId` except `auth.ts`'s own lookups
  (by `email` during login, before any auth exists; by the token's own `id` for
  refresh/change-password) — both correctly scoped to "the caller's own identity," not another
  user's.
- **"Add automated tests for cross-user access attempts."** ✅ Every resource type already has
  dedicated tests for this — not just "another user can't edit/delete my row" but the sharper
  **ID-tampering** case: a user submitting _another user's_ `medicationId`/`symptomId`/`habitId`
  in a request body to create or re-point a log against it. Confirmed by reading the actual
  assertions in `medicationLogs.test.ts`, not just the test names.
- **"Confirm refresh tokens are HTTP-only, `Secure`, `SameSite` cookies."** ✅ Confirmed twice:
  in code (`cookies.ts`) and empirically — `curl -i` against the real production
  `POST /api/auth/login` returned `Set-Cookie: refreshToken=...; HttpOnly; Secure;
SameSite=Lax`, proving `NODE_ENV=production` really is set on Railway, not just assumed.
- **"Confirm password hashing uses bcrypt/argon2 with an appropriate cost factor."** ✅
  `SALT_ROUNDS = 12` in `auth.ts` — bcrypt's own general recommendation is 10–12; this sits at
  the stronger end.
- **"Confirm input validation is applied on every write endpoint."** ✅ Every `POST`/`PATCH`
  across every route file, including all three of `auth.ts`'s own (`register`, `login`,
  `change-password`), parses through a Zod schema before touching the database.
- **"Confirm rate limiting is active on auth endpoints."** ❌ **Genuinely not implemented** —
  confirmed by grepping for `rate-limit`/`rateLimit` across `package.json` and `src/`, finding
  nothing. This was already correctly unchecked in Tasks.md; the audit confirms it's a real,
  outstanding gap, not a stale checkbox. Not fixed in this pass — flagged as real remaining work.
- **"Review server logs to confirm no health data or credentials are ever logged."** ✅ Exactly
  one `console.log` exists in the entire backend (`index.ts`, logging only the port number on
  startup) — matches what an earlier housekeeping audit already found and checked off.
- **"Configure HTTPS at the hosting/proxy layer."** ✅ Satisfied by the hosting choice itself —
  both Railway and Vercel terminate TLS automatically for every deployment; nothing in this
  project's own code configures or needs to configure this directly.

#### Beyond the checklist — a few extra checks worth doing while already looking

- **CORS** is restricted to exactly one configured origin (`FRONTEND_URL`), not a wildcard, with
  `credentials: true` (required for the cookie to actually be sent cross-origin at all).
- **JWT secrets fail loudly, never silently default.** `requireSecret()` in `jwt.ts` throws if
  `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` aren't set, rather than falling back to some
  hard-coded placeholder value — a common insecure pattern this codebase deliberately avoids.
- **One real gap found this way, not on the original checklist**: no centralized
  error-handling middleware existed. See the dedicated entry in
  [Git & GitHub Workflow](08-git-github-workflow.md) — actually, this project's own convention
  puts cross-cutting backend infrastructure fixes in whichever file best fits; this one is
  documented in full in this same file, directly below, since it was _found_ by this audit.

### Why it's needed

An audit that only re-reads what earlier entries already claimed isn't actually checking
anything — it just repeats the same assumption with more confidence. Grepping the real code and
hitting the real production API is what turns "this should be fine" into "this is confirmed
fine, and here's exactly how."

### Decisions

- **Left rate limiting unchecked and unfixed**, rather than quickly bolting on
  `express-rate-limit` just to close the checkbox — it's a real, separate task with its own
  design questions (which endpoints, what limits, what response), not something to rush through
  as a side effect of an audit.
- **Verified the cookie flags against the live production system**, not just local code reading
  — the `NODE_ENV=production` dependency specifically can't be confirmed by reading source code
  alone; it depends on how the hosting platform actually invokes the process.

### State at end of this step

Every Phase 11 item is now either confirmed true (with a note on _how_ it was confirmed) or
explicitly identified as a real, outstanding gap (rate limiting) — nothing left in an assumed
state. `Tasks.md` reflects exactly this.

### Verification

- `grep` across all eight backend route files for every database read — confirmed userId-scoping
  on every one except the three intentionally-different `auth.ts` lookups.
- Read the actual cross-user and ID-tampering test assertions (not just test names) in every
  `*Logs.test.ts` file.
- `curl -i` against the real, live production `POST /api/auth/login` — confirmed the actual
  `Set-Cookie` header reads `HttpOnly; Secure; SameSite=Lax`.
- `grep` for `rate-limit`/`rateLimit` across the whole backend — confirmed genuinely absent.
- `grep` for `console\.` across the whole backend (excluding tests) — confirmed exactly one
  call, logging only a port number.

---

## 2026-08-17 — Fixing the one real gap the audit found: no centralized error-handling middleware

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item on its own, but directly answers Phase
3's cross-cutting requirement — "Add a centralized error-handling middleware returning a
consistent JSON error shape... without leaking stack traces" — which the Phase 11 audit above
found was never actually built.

### Background / concepts

#### Why this was invisible until now

Every route in this backend already handles its own _expected_ failure cases explicitly — a
wrong password, a not-found id, a failed validation — each with its own status code and JSON
body. None of those paths ever needed a fallback handler, so the gap never showed up in normal
use or in the existing test suite. It only matters for something genuinely _unexpected_ slipping
through — e.g. `login`'s `prisma.user.findUnique` call, which has no surrounding `try`/`catch` at
all, would throw uncaught on something like a transient database connection error.

#### What Express does automatically with an uncaught error — and why that matters here specifically

This backend runs **Express 5** (`"express": "^5.2.1"` — check `package.json` if version ever
matters for this). Express 5's real, relevant difference from Express 4: it automatically
forwards a rejected Promise from an `async` route handler to error-handling middleware. In
Express 4, every route would have needed to catch its own errors and call `next(err)` by hand for
this to work at all. That's genuinely convenient — but only if error-handling middleware actually
exists to receive it. **Without any registered**, Express falls back to its own _built-in_
default handler, which renders an **HTML page** — completely inconsistent with every other
response this API ever sends (`{error:{message,code}}` JSON, always), and something like this
project's own `apiFetch`'s `res.json()` call on the frontend would fail to parse an HTML page
entirely, turning one already-bad situation (a real server error) into a second, confusing one (a
JSON-parse crash on the client, obscuring what actually went wrong).

### What was done

1. **Reproduced the bug first, empirically, before writing any fix** — wrote a test that mocks
   `prisma.user.findUnique` to reject with a plain `Error` (simulating an ordinary,
   expected-to-happen-eventually failure like a transient database blip, not a contrived edge
   case), hits the real `POST /api/auth/login` through the real, unmodified app, and asserts a
   JSON `{error:...}` body. Run against the _unpatched_ code, it failed exactly as predicted:
   `res.headers["content-type"]` was `text/html; charset=utf-8`, not JSON.
2. **`backend/src/middleware/errorHandler.ts`** (new file) — an Express error-handling
   middleware (recognized by its four-parameter signature: `(err, req, res, next)`, not three).
   Logs the full error server-side (`console.error`) — genuinely useful for whoever's debugging
   it from the server's own logs, and explicitly _not_ sent to the client, which is exactly the
   "stack trace" Phase 3's own wording says must never leak into an HTTP response. Responds with
   `{error:{message:"Something went wrong. Please try again.",code:"INTERNAL_ERROR"}}` and a 500
   status.
3. Registered it **last** in `app.ts`, after every route — a hard requirement, not a style
   choice: Express only ever routes a request to error-handling middleware once every earlier
   layer has either handled it or explicitly passed an error along; anything registered after an
   error-handling middleware would simply never run for a request that already errored out.
4. Re-ran the exact same reproduction test against the fixed code — passed, confirming the JSON
   shape is now what a client actually receives.

### Why it's needed

A user hitting a genuine, unexpected server error deserves a clear, generic "something went
wrong, try again" — not a raw HTML error page their app's own JSON-parsing code can't even
display. And server-side, `console.error(err)` here is the one and only place this class of
failure gets recorded at all right now — without it, an unexpected production error would be
completely invisible to whoever's trying to diagnose it later.

### Decisions

- **Reproduced the failure before fixing it**, the same discipline this project already applies
  to bugs found in the wild (see, for instance, this repo's earlier "clearing a field during
  edit didn't actually clear it" fix) — proves the problem is real and gives a concrete pass/fail
  signal for the fix itself, rather than trusting that adding _some_ middleware must obviously
  help.
- **A generic client-facing message, always** — regardless of what the underlying error actually
  was, the response never varies. Distinguishing error types for the client is exactly what each
  route's own explicit error handling already does; this middleware exists specifically for the
  _un_-distinguished, unexpected case.

### State at end of this step

Any unhandled exception from any route now returns the app's standard JSON error shape instead
of an HTML page, and gets logged server-side for diagnosis. Phase 3's cross-cutting
error-handling requirement is complete.

### Verification

- A dedicated regression test (`backend/src/middleware/errorHandler.test.ts`) — confirmed
  failing against the unpatched code (returned HTML), confirmed passing against the fix (returns
  the standard JSON shape).
- `npm test` (backend, full suite) — 114/114 passing.
- `npm run build`, `npm run lint`, `npx prettier --check .` — all clean.

---

## 2026-08-17 — Phase 12: a real accessibility audit, with axe-core and actual keyboard testing

**Task:** [Tasks.md](../../Tasks.md) → Phase 12 — Accessibility & Responsive QA.

### Background / concepts

#### Why automated scanning alone isn't enough — and what it's still genuinely good for

**`axe-core`** is the industry-standard automated accessibility checker — it inspects a page's
actual rendered DOM against WCAG success criteria (missing labels, insufficient color contrast,
invalid ARIA usage, and dozens of other rules) and reports concrete violations, not vague advice.
Installed temporarily for this one-off audit (`npm install --no-save axe-core`, never added to
`package.json` — a decision the project can revisit deliberately later rather than inheriting a
new permanent dependency as a side effect of a single audit) and driven through the real running
app via Playwright, the same way every other live-browser check in this log works.

**What it can't catch, by design**: axe-core only flags things a machine can mechanically verify
against a rule. It has no idea whether an _interaction pattern_ matches what a real keyboard or
screen-reader user would actually expect — e.g. a custom control correctly labeled and
role-annotated can still behave in a way that's technically valid ARIA but not what the ARIA
Authoring Practices Guide recommends for that role. That's exactly why Tasks.md's Phase 12 asks
for a **separate, manual keyboard-only pass** in addition to the automated contrast check —
they catch genuinely different classes of problem.

### What was done

1. **Automated scan across six real pages/states**: Register, Dashboard (empty state), the Mood
   entry form open, the Symptom entry form open, Settings, and Login — each scanned with
   `axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })` against the real running app.
   **Result: zero violations on all six.**
2. **A real bug the audit script itself walked straight into, before any accessibility finding**:
   the script originally navigated to `/settings` via `page.goto()` (a hard page load) — which,
   at the time, silently redirected to Login instead of showing Settings, because nothing yet
   rehydrated a session after a hard navigation (see the _separate_ session-rehydration fix in
   [Authentication — Frontend](02-auth-frontend.md)). The audit script was navigating exactly the
   way this exact bug manifests. Fixed the script to navigate the way a real user actually would
   — clicking the Settings link, a client-side route change — rather than a hard reload.
3. **Manual keyboard-navigation check on the mood-rating radiogroup** (`role="radiogroup"` /
   `role="radio"`, built from plain `<button>` elements — see the original Mood entry form
   entry's own reasoning for why). Tabbed to the first option, pressed `ArrowRight`, and checked
   which element actually had focus afterward.
   **Finding**: `ArrowRight` does **not** move focus between options — each option is instead
   individually `Tab`-stoppable, confirmed by pressing `Tab` and observing focus land on the
   _next_ button in sequence, not exit the group. Every option **is** still reachable and
   operable via keyboard (real `<button>` elements get that for free) — satisfying the literal
   letter of "every interactive element is reachable and operable via keyboard" — but this
   doesn't match the standard ARIA radiogroup keyboard pattern (arrow keys cycling selection,
   `Tab` entering/exiting the group once), which is exactly the class of gap axe-core's
   rule-based scanning can't catch, since both patterns produce valid, correctly-labeled ARIA.
   **Not fixed in this pass** — documented as a real, worthwhile follow-up, not a blocker.
4. **Responsive viewport check**: rendered the (post-login) dashboard at three real viewport
   sizes — 375×812 (mobile), 768×1024 (tablet), 1440×900 (desktop) — and checked
   `document.documentElement.scrollWidth > document.documentElement.clientWidth` (genuine
   horizontal overflow, not just "does it look cramped") at each.
   **Finding**: mobile (375px) genuinely overflows horizontally; tablet and desktop don't. The
   screenshot pinpoints the cause: `NavBar`'s `flex items-center justify-between` layout has no
   wrapping or truncation for the user's display name/email next to the "Log out" button — with a
   long enough identity string (as this test's generated email was), the header simply doesn't
   fit in 375px. **Not fixed in this pass** — a real, reproducible finding, documented as a
   follow-up.
5. **Color-alone-conveys-information check** — confirmed by re-reading the actual rendered
   markup of every log type (already read in full during earlier entries in this log, not
   re-derived from scratch): mood shows an emoji _and_ a text label ("Great," not just a color);
   symptom severity shows the actual number, not just a color-coded bar; medication shows a
   ✅/❌ emoji _and_ "Taken"/"Not taken" text; habits show "Done"/"Not done" text. Nothing in this
   app conveys a value through color alone.
6. **Animation check** — `grep`'d every `.tsx` file for `animate-`, `@keyframes`,
   `transition-transform`, `transition-all`. Found none — every transition used anywhere in this
   codebase is a plain `transition-colors` (a hover/focus/selection color change), nothing more
   elaborate. Nothing to "reduce," since nothing exceeds that already-minimal baseline.

### Why it's needed

An accessibility pass that only runs an automated scanner and stops there would have reported
"zero violations" and missed two real, concrete problems (the radiogroup's keyboard pattern, the
mobile header overflow) that a keyboard-only and multi-viewport pass specifically exist to catch
— which is exactly why Tasks.md's Phase 12 asks for both, not one or the other.

### Decisions

- **Installed axe-core with `--no-save`**, not as a permanent project dependency — this was a
  one-off audit tool for this pass, and adding permanent automated accessibility testing to the
  regular test suite is a real, separate decision (what pages to cover, how to keep it
  maintained) better made deliberately later than inherited as an audit side effect.
- **Documented the two real findings rather than fixing them in the same pass** — this audit was
  explicitly scoped (alongside a security audit and two small, already-identified fixes) to stay
  small while other work was blocked on an external outage; expanding scope to also design and
  build fixes for two newly-discovered UI issues would have undercut that scoping. Both are
  real, reproducible, and worth a dedicated follow-up task.
- **A client-side-navigation fix to the audit script itself**, not a workaround — the script
  hitting the session-rehydration bug mid-audit was a genuine bug in how the script drove the
  app (a hard `page.goto` to a protected route), not evidence of a _new_ accessibility problem;
  worth being explicit about that distinction rather than conflating the two.

### State at end of this step

Zero automated (axe-core, WCAG 2A/2AA) violations across six real pages/states. Every interactive
element is keyboard-reachable and operable, though the mood/severity/energy/stress radiogroups
don't yet follow the full ARIA arrow-key pattern. No information is conveyed by color alone. No
elaborate animations exist to reduce. One real, reproducible responsive bug found (NavBar
overflows horizontally on narrow viewports with a long display name/email) — not yet fixed.

### Verification

- `axe.run()` against six real pages/states via Playwright — zero violations on all six.
- Manual keyboard test (`page.keyboard.press("ArrowRight")`, `page.keyboard.press("Tab")`) on the
  mood rating radiogroup — confirmed the actual focus-movement behavior directly, not assumed
  from the markup.
- `document.documentElement.scrollWidth > document.documentElement.clientWidth` at three real
  viewport sizes, plus a full-page screenshot at 375px confirming the visual cause.
- `grep` across every `.tsx` file for animation-related classes — confirmed none beyond plain
  color transitions.

### Addendum (2026-08-18) — the same class of bug, hitting a second automated script

The "session rehydration confuses an automated browser script" problem above turned out not to
be a one-off. While getting the actual session-rehydration fix (PR #70, recovered from a
never-pushed branch — see the _third stranding variant_ entry in
[Git & GitHub Workflow](08-git-github-workflow.md)) through CI, its required **PR Preview
Screenshots** check (`.github/workflows/pr-preview.yml`, driving
`frontend/scripts/capture-pr-screenshots.mjs`) started failing on every run.

**Same underlying cause, different symptom.** The audit script above hit the bug via a _hard
`page.goto` straight to a protected route_ — no login had happened yet, so the route guard's
redirect and the rehydration attempt collided. The screenshot script never does that (it always
starts at `/register`), so it didn't fail the same way. Instead: `AuthProvider`'s new mount-time
`rehydrateSession()` call fires on _every_ page load, including that very first `/register` visit
— a brand-new CI browser has no refresh cookie yet, so the backend correctly answers `401`. That's
the right, expected behavior for a logged-out visitor, not a bug. But Chrome logs any non-2xx
`fetch` response to the console as an error automatically, regardless of whether the app's own
code handles it gracefully — and the screenshot script's check was "any console error at all fails
the build," with no way to tell "an expected, harmless 401" apart from "something is actually
broken."

**The fix (in `capture-pr-screenshots.mjs`, not the app)**: track the one expected
`/api/auth/refresh` 401 via `page.on("response")` — the real network layer, not by guessing from
console message text — and exclude exactly one matching console error for it. Any other console
error, including a 401 from a route that's supposed to be authenticated, still fails the check
normally; this doesn't quietly widen into "ignore every 401."

**Why this is worth calling out as its own addendum, not just a footnote**: two different
automated scripts, written at two different times for two different purposes (an accessibility
audit vs. a PR preview), both broke on the _same_ new mount-time behavior, in two different ways.
That's a real signal that any future script driving this app through a fresh, logged-out browser
session should expect this one benign 401 on first load — worth knowing before writing the next
one, not just after debugging it a third time.

### Verification (addendum)

- Reproduced first: CI's `screenshots` check failing with `Browser console errors detected:
Failed to load resource: the server responded with a status of 401 (Unauthorized)`.
- Verified the fix locally before pushing — built and started the real backend and frontend
  preview server (mirroring the CI job's own steps exactly), ran the script directly, confirmed
  it exited `0` with all 4 expected screenshots produced.
- Confirmed for real, not just locally: pushed the fix and watched the actual GitHub Actions run
  (`gh run watch`) go green, including the specific `AFTER: capture screenshots` step that had
  been failing.

---

## 2026-08-18 — Closing the rate-limiting gap the audit found

**Task:** [Tasks.md](../../Tasks.md) Phase 2 — "Add rate limiting (e.g. `express-rate-limit`) to
all `/api/auth/*` endpoints" — and the matching Phase 11 item the security audit above flagged as
a genuine, unfixed gap.

### Background / concepts

**What rate limiting is, and why auth endpoints specifically need it.** Without it, nothing stops
a script from submitting thousands of password guesses per second against `/api/auth/login` — a
_brute-force attack_. Rate limiting counts requests from the same client over a rolling time
window and starts rejecting them (with an HTTP `429 Too Many Requests` status) once a threshold
is crossed, turning "try a million passwords in a minute" into "try ten, then wait." It's a
per-route decision, not a blanket one — the right threshold, and even whether a route needs it at
all, depends on what that specific route protects and how it's normally used (see the `/refresh`
decision below).

**`express-rate-limit`'s `skip` option** lets a request bypass counting/blocking entirely based
on a function you provide — used here to make the limiter inert while the automated test suite
runs (see _Decisions_), without needing a second copy of the route wiring for tests.

### What was done

1. **`backend/src/middleware/rateLimiter.ts`** (new): a `createAuthRateLimiter()` factory
   wrapping `express-rate-limit`, configured for 10 requests per 15-minute window per client, with
   a JSON `429` body matching this app's `{ error: { message, code } }` shape (not the library's
   default plain-text response). The real app uses the single `authRateLimiter` instance this
   file also exports.
2. **`backend/src/routes/auth.ts`**: `authRateLimiter` applied as middleware to exactly three
   routes — `POST /register`, `POST /login`, `POST /change-password`. **Deliberately not** applied
   to `/refresh` or `/logout` (see _Decisions_).
3. **`backend/src/middleware/rateLimiter.test.ts`** (new): two tests against a throwaway
   `createAuthRateLimiter({ skip: false })` instance (never the shared real one, so tests can't
   pollute each other's request counts) — one proves the 11th request in a window gets blocked
   with the right status/body, the other proves the real exported instance stays inert while
   `NODE_ENV === "test"`.

### Why it's needed

Login, registration, and password-change are the three places in this app where a client submits
a secret (a password) that a script could try to guess by brute force. Without a limit, an
attacker with a leaked list of email addresses could attempt thousands of common passwords per
account per minute; with this limit, they get ten tries every fifteen minutes — enough for a real
user who mistypes a password, not enough for automated guessing to be practical. This was the one
concrete, unfixed gap the Phase 11 security audit surfaced (see the entry above) rather than a
theoretical nice-to-have.

### Decisions

- **Not applied to `/refresh` or `/logout`.** `/refresh` doesn't take a password — it reads an
  unguessable, cryptographically signed refresh token from an `httpOnly` cookie, which isn't
  something a brute-force loop can meaningfully guess at (there's nothing to iterate over). More
  importantly, this project's session-rehydration fix (see
  [Auth Frontend](02-auth-frontend.md)) now calls `/refresh` automatically on every page load, plus
  roughly every 15 minutes during ordinary use to keep the access token from expiring — a tight
  limit here would risk locking out a real, actively-using visitor, not just an attacker.
  `/logout` never touches a password or a guessable secret at all, so limiting it protects
  nothing.
- **Skip-in-tests via `NODE_ENV`, not a manually-toggled flag.** Vitest sets `NODE_ENV=test`
  automatically for every run in this project (confirmed directly with a throwaway probe test
  before relying on it, not assumed from documentation) — reusing that existing signal means the
  rest of the test suite, which makes many legitimate rapid-fire requests against these same
  routes across dozens of test files, doesn't need to know rate limiting exists at all.
- **A factory function (`createAuthRateLimiter`), not just one hard-coded exported instance.**
  Each `express-rate-limit` instance keeps its own private, in-memory hit-count store. Without the
  factory, the _only_ way to test the real blocking behavior would be to hammer the app's single
  shared instance directly — which would then carry leftover hit counts into whatever test (or
  real request, if run against a live server) came next. The factory lets the test build a second,
  fully independent instance with the exact same real configuration.

### Verification

- `backend/src/middleware/rateLimiter.test.ts` — both new tests passing.
- `npm test` (backend) — 163/163 passing (full suite, not just the two new tests).
- `npm run build`, `eslint`/`tsc --noEmit` — clean.
- **Verified against the real running dev server**, not just the test suite: sent 12 real
  `POST /api/auth/login` requests over HTTP with `curl`, in sequence — the first 10 came back
  `401` (as expected for a wrong password) carrying `RateLimit-Remaining` headers counting down
  from 9 to 0, and requests 11 and 12 came back `429 Too Many Requests` with the configured JSON
  body. (An earlier attempt at this same live check appeared to show no limiting at all — traced
  to curling a dev server process that was still running from _before_ the code existed, a stale
  background process rather than a real bug. Restarting cleanly and re-testing confirmed the fix
  actually works.)

---

## 2026-08-18 — Dependabot: security updates enabled, version updates deferred

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — started as a concept explainer,
written prospectively (same pattern as the merge-queues entry in
[Git & GitHub Workflow](08-git-github-workflow.md)), prompted by a question about whether
Dependabot could help now that Phase 11's security hardening and this file's own audits are
otherwise done. After weighing the two features separately (see _Decisions_ below), the
security-updates half was actually turned on for this repo; version updates were deliberately
left off for now.

### Background / concepts

#### Two separate features under one name

GitHub's Dependabot is actually two independently-toggleable things that get talked about as if
they were one:

1. **Version updates** — driven entirely by a config file (`.github/dependabot.yml`, not present
   in this repo yet). On a schedule you set, it reads a project's manifest files (here, that
   would mean `frontend/package.json`/`package-lock.json` and `backend/package.json`/
   `package-lock.json` separately, since they're two independent npm projects — see
   [CLAUDE.md](../../CLAUDE.md) on why frontend/backend are kept independent) and opens a PR per
   outdated dependency (or a grouped batch, if configured), bumping it to the latest version
   allowed by that dependency's own semver range.
2. **Security updates** — a repo _setting_ (Settings → Code security → Dependabot alerts /
   Dependabot security updates in the GitHub UI), not the config file above, and not the same
   schedule. GitHub continuously cross-references every dependency this project actually
   resolves — including _transitive_ ones nested deep in `node_modules` that nothing in
   `package.json` names directly — against the GitHub Advisory Database (which aggregates CVEs — Common Vulnerabilities and
   Exposures, the standard public catalog of disclosed software security flaws, each with its own
   ID like `CVE-2024-12345` — along with other published vulnerability reports). The moment one of them is found to have a known
   vulnerability, an alert appears under the repo's Security tab, and — if security updates are
   enabled — a PR bumping straight to the first patched version opens automatically, outside the
   normal version-update schedule entirely.

#### Why this is a different threat category than Phase 11 already covered

Phase 11's security audit (see the entry above this one) verified things about _this codebase's
own logic_: are queries scoped by `user_id`, is bcrypt's cost factor reasonable, are cookies
`HttpOnly`/`Secure`, is every write endpoint validated. All of that is about code this project
wrote. A dependency vulnerability is a different shape of risk entirely — a security hole
disclosed _after_ the fact, in code this project didn't write and mostly never reads, three or
four layers deep in a dependency tree nobody manually re-audits once `npm install` succeeds once.
That gap doesn't close itself just because the application-logic audit passed; it needs its own,
ongoing mechanism, which is specifically what Dependabot's security-updates half is for.

#### What enabling it would actually mean for this specific repo

A real `.github/dependabot.yml` here would need three separate `updates:` entries, not one — the
same "two independent projects" split called out throughout this log applies to Dependabot too:

```yaml
updates:
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

The third entry is easy to forget but matters here specifically: this project's CI/PR-screenshot
workflows (see [Git & GitHub Workflow](08-git-github-workflow.md)) pin third-party GitHub Actions
by version, and those pins go stale exactly the same way npm dependencies do.

### What was done

Enabled both halves of Dependabot's security-updates feature for this repo via two direct GitHub
API calls (`gh api -X PUT`, since neither has a dedicated `gh` subcommand):

1. `PUT /repos/wheelyk/Wellbeing/vulnerability-alerts` — turns on Dependabot alerts (the Security
   tab now surfaces any known vulnerability in a resolved dependency, transitive or direct).
2. `PUT /repos/wheelyk/Wellbeing/automated-security-fixes` — turns on Dependabot security updates
   (a PR bumping straight to the first patched version opens automatically once an alert fires).

No `.github/dependabot.yml` was added — that file only controls the separate version-updates
feature (see _Background_ above), which stays off for now.

### Why it's needed

Closes the specific gap described above: a vulnerability disclosed in a dependency after the fact
is a risk category this repo previously had no ongoing mechanism for at all, independent of how
thorough the Phase 11 application-logic audit was.

### Decisions

- **The case for enabling something here at all:** the project already has real production users,
  a real Postgres database with real health data in it, and CI already configured to run against
  every PR automatically — the infrastructure a Dependabot PR needs to be safely reviewable
  (tests, build) already exists.
- **Security updates enabled, version updates deliberately deferred.** A routine version bump
  competing for attention against feature work is a genuine, ongoing tradeoff (npm's ecosystem
  moves fast; even a `weekly` schedule can mean a steady trickle of small PRs); a patch for a
  disclosed vulnerability is not the same kind of decision. Enabling just the security-updates
  setting captures most of the safety benefit with none of the routine-PR noise — the
  `.github/dependabot.yml` config sketched above remains a possible follow-up, not something
  ruled out, just not decided now.
- **Turned on via the GitHub API (`gh api`), not the settings UI.** Both are repo-wide settings
  changes, visible to anyone with access to the repo — done directly rather than delegated,
  consistent with this project's general preference for verifiable, scriptable actions over
  UI clicks that leave no command-line record of what changed or why.

### Verification

- Confirmed both calls actually took effect by reading the settings back immediately after, not
  just trusting the `PUT` requests' success responses:
  - `GET /repos/wheelyk/Wellbeing/vulnerability-alerts` → `204 No Content`, which per GitHub's API
    is itself the "enabled" signal for this specific endpoint (a `404` would mean disabled).
  - `GET /repos/wheelyk/Wellbeing/automated-security-fixes` → `200 OK` with body
    `{"enabled":true,"paused":false}`.

---

## 2026-08-22 — A second, deeper security audit: a real rate-limiter bypass, a timing side-channel, and three hardening additions

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a follow-up, open-ended "look for
security issues" pass, done after a similar general bug-hunt pass had already found and fixed an
unrelated timezone bug (see [History](11-history.md)). Phase 11's audit above already confirmed
the _application-logic_ security properties (query scoping, cookie flags, input validation,
password hashing). This pass looked one layer deeper — at how the app behaves once real network
infrastructure (a reverse proxy) sits in front of it, and at _timing_, not just response content,
as its own kind of information leak.

### Background / concepts

#### What a reverse proxy actually does to a request's "who sent this" information

Every earlier entry in this log's [Deployment](07-deployment.md) file explained that Railway
doesn't run this app's own `node dist/index.js` process directly exposed to the internet — it
sits a **reverse proxy** (Railway's own edge) in front of it. Every real visitor's request
physically arrives at Railway's edge first, and Railway's edge then makes its _own_, separate
connection to this app's process to forward that request along. From the Node process's point of
view, every single request — no matter which real person sent it — technically originates from
the _same_ machine: Railway's edge, not the actual visitor.

To solve this (a completely standard problem, not specific to Railway or this app), a reverse
proxy adds an **`X-Forwarded-For`** header to the request before forwarding it, recording the
_real_ original client's IP address as plain text, so anything downstream can still find out who
actually sent the request if it wants to.

#### `trust proxy`: why Express doesn't just believe that header by default

Express deliberately does **not** read `X-Forwarded-For` by default, for a good reason: unlike a
cookie or a signed token, this header is just an ordinary HTTP header — anyone can type
`X-Forwarded-For: 1.2.3.4` into a raw request by hand and claim to be any IP address they like.
If Express blindly trusted it, any attacker could impersonate any IP address purely by lying in a
header, defeating anything (like a rate limiter) that decides "who is this" based on it.

**`app.set("trust proxy", N)`** is Express's way of saying "I genuinely do sit behind exactly `N`
layers of a _trusted_ proxy, so the _N_-th-from-the-end address in `X-Forwarded-For` really is the
real client — go ahead and use it for `req.ip`." This is safe specifically because a well-behaved
reverse proxy (Railway's edge included) _overwrites or prepends_ this header itself before
forwarding — it doesn't let an external caller's own forged value survive unchanged. Trusting the
proxy is what makes trusting the header underneath it safe; skipping the setting entirely doesn't
avoid trusting a lie, it just throws away real information Express could otherwise have used
correctly.

#### The bug: nothing in this app ever configured `trust proxy` at all

`backend/src/app.ts` never called `app.set("trust proxy", ...)`. The practical consequence:
`req.ip` — which `authRateLimiter` (`rateLimiter.ts`) uses to decide "how many recent attempts has
_this_ caller made" — resolved to the _same_ value for every single request that ever reached the
deployed backend, regardless of who actually sent it. Every real user's register/login/
change-password attempts were being counted into one shared bucket, not one bucket per person.

**Confirmed directly, not just reasoned about**, with a small diagnostic test hitting the real
`createApp()` via `supertest` (a library for firing real HTTP requests at an Express app directly
in a test, without needing an actual running server/port — the same tool this backend's other
route tests already use): two requests, each carrying a different `X-Forwarded-For` value,
produced an _identical_ `req.ip` before the fix, and correctly different `req.ip` values after
adding `app.set("trust proxy", 1)`.

**Why "1," specifically:** the Railway community's own guidance (searched directly rather than
guessed at) is that Railway's edge adds exactly one hop before this app's own process sees a
request — so trusting exactly one layer of `X-Forwarded-For` is the correct, minimal amount of
trust, not an arbitrary guess. (Full research trail in _Verification_ below.)

#### Why this was a security bug, not just a UX inconvenience

A rate limiter's whole job is answering "is _this specific caller_ making too many attempts."
With every caller collapsed into one bucket:

- **The intended protection didn't actually work.** An attacker's own brute-force attempts were
  never isolated from anyone else's legitimate traffic — the limiter wasn't meaningfully slowing
  down a targeted attack the way it was designed to.
- **A trivial, unintentional denial-of-service became possible.** Any 10 register/login/
  change-password requests within 15 minutes — from anyone, or even just ordinary concurrent
  traffic with no malicious intent at all — would lock _every_ real user out of authenticating
  for the rest of that window. A security control meant to protect availability was itself an
  availability risk, because of what it was (mis)keyed on.

#### Timing as its own information channel, separate from the response body

Most people's first idea of "leaking information" is about the _content_ of a response — what
words or data it contains. **Timing side-channels** are a different, easy-to-forget category:
even if two responses say the exact same thing, if one of them consistently takes measurably
_longer_ to arrive than the other, an attacker who can send many requests and measure the average
response time can still tell the two cases apart — the delay itself is the leak, independent of
anything the response body says.

This project had already solved exactly this problem once, for `login`: `DUMMY_PASSWORD_HASH`
(see the earlier [Auth Backend](01-auth-backend.md) entries) exists specifically so that
`bcrypt.compare()` — a deliberately _slow_ operation — always runs, whether or not the submitted
email matches a real account, so "wrong password" and "no such account" take the same amount of
time as well as returning the same response body.

**`forgot-password` had the response-body half of this already done** (its own design doc, quoted
in the earlier auth-backend entries, explicitly reasons through why the message must be
identical either way) — but not the timing half. Its "found" branch performed a real database
`UPDATE` (writing the new reset-token hash); its "not found" branch did nothing at all. A real
database write is measurably slower than doing nothing, so an attacker measuring response time
across many attempts could still statistically distinguish "this email exists" from "it doesn't,"
even though every response's _text_ was identical.

### What was done

1. **Reproduced the `trust proxy` bug first**, via a small standalone diagnostic test (two
   requests, two different `X-Forwarded-For` values, asserting on `req.ip`) before writing any
   fix — confirmed both resolved to the same value.
2. **Researched Railway's actual proxy topology** rather than guessing a hop count, since setting
   this value _too high_ (or to `true`, an unbounded chain) would itself reopen a spoofing risk if
   Railway's edge ever turned out not to be the sole hop.
3. Added `app.set("trust proxy", 1)` to `backend/src/app.ts`, with the reasoning inlined as a
   comment at the call site (not just in this log) so a future reader hits the explanation exactly
   where the setting lives.
4. Added a committed regression test (`backend/src/app.test.ts`) covering the same two-different-
   `X-Forwarded-For`-values scenario as the diagnostic — confirmed failing against the pre-fix
   code, passing against the fix.
5. **Fixed `forgot-password`'s timing gap** (`backend/src/routes/auth.ts`): both branches now
   perform an equivalent-shaped database `UPDATE` unconditionally. The "not found" branch's write
   targets a `DUMMY_USER_ID` that can never match a real row (mirroring `DUMMY_PASSWORD_HASH`'s
   own "always do the real, equivalent-cost work" approach exactly), and the resulting "record not
   found" error is caught and discarded rather than allowed to fail the request.
6. Added a regression test asserting the database write is attempted even when no account
   matches — confirmed failing against the pre-fix code (zero calls to `prisma.user.update`),
   passing against the fix.
7. **Three additional, lower-risk hardening changes**, found while already reviewing this area:
   - Pinned `algorithms: ["HS256"]` (the specific signing algorithm — HMAC combined with SHA-256 —
     this app's own JWTs, see the Glossary's "JWT" entry, have always been signed with) explicitly
     on every `jwt.verify()` call, instead of relying on
     the `jsonwebtoken` library's own default acceptance behavior — defense in depth, so a verify
     call can never be tricked into accepting a token signed a different way than this app itself
     ever signs one, regardless of what a future library version's default turns out to be.
   - Added `helmet()`, a well-established Express middleware that sets a standard baseline of
     security response headers (`X-Content-Type-Options: nosniff`, no `X-Powered-By` framework
     fingerprint, `X-Frame-Options`, HSTS — HTTP Strict Transport Security, a header telling the
     browser to only ever talk to this site over HTTPS from now on, even if a future link or typo
     points it at a plain `http://` address — etc.) with sensible defaults, no per-header tuning
     needed for a JSON-only API like this one.
   - **Verified `helmet`'s default `Cross-Origin-Resource-Policy: same-origin` header wouldn't
     break this app's own real cross-origin usage** (the Vercel frontend fetching from the Railway
     backend) before shipping it — this specific header is a well-known potential gotcha for APIs
     meant to be consumed cross-origin. Confirmed via research (this policy only restricts
     `no-cors`-style loads like `<img>`/`<script>` tags, not regular CORS-mode `fetch()` calls with
     credentials) _and_ empirically, by running the full Playwright end-to-end suite — a real
     Chromium browser making real cross-origin requests — against a locally running backend with
     `helmet()` active. All four specs passed.

### Why it's needed

Both real findings here share a lesson worth naming directly: a security control can be present in
the code, structurally correct in isolation, and still fail completely once it's deployed onto
real infrastructure it wasn't specifically checked against (`trust proxy`) — or once it's checked
against the wrong threat model (a response-body check that never considered timing). Neither of
these would show up by re-reading the code and reasoning "this looks right" — both needed to
actually be run and measured to be caught.

### Decisions

- **`trust proxy: 1`, not `true`.** `true` trusts an unbounded, self-reported chain of proxies —
  correct only if every single hop between the real client and this app is genuinely trusted, and
  unnecessarily permissive (and therefore a real, if narrow, risk) if that's not actually the
  topology. `1` is the precise, minimal value that matches Railway's actual documented setup.
- **A `DUMMY_USER_ID`, not a `try { } catch { }` around skipping the write entirely.** The whole
  point is that the _same_ database work has to happen either way — skipping the write in a
  different way (e.g. an early return before ever calling `update`) would just move the timing gap
  rather than close it.
- **Verified the CORP header against a real browser, not just documentation.** Reading that CORP
  "only affects no-cors requests" is one thing; this app's actual login/Quick-Add/History flows
  are what would have broken if that understanding were wrong, so running the real e2e suite
  against them with the header active was the actual proof, not the research alone.
- **Left one related, lower-severity finding unfixed in code**: `/api/auth/logout` has no
  CSRF protection and could be triggered by a malicious cross-site page, forcing an unwanted
  logout. Documented rather than fixed in this pass — the impact is a nuisance (an unexpected
  logout), not data exposure or account compromise, and every _data-changing_ endpoint in this app
  is already immune to CSRF by construction (they require a Bearer access token in a header, which
  a cross-site request cannot forge or attach automatically the way a cookie is attached).
  Building dedicated anti-CSRF infrastructure for a nuisance-level gap didn't seem proportionate
  next to the two real findings above.

### State at end of this step

The auth rate limiter now correctly identifies individual real clients in production.
`forgot-password`'s enumeration defense is closed against both the response-body and timing
channels. Three additional hardening measures are in place, each verified not to break the app's
real, working cross-origin flow.

### Verification

- `backend/src/app.test.ts` (new): confirmed the `trust proxy` fix with two different
  `X-Forwarded-For` values resolving to two different `req.ip` values - failing before the fix,
  passing after.
- `backend/src/routes/auth.test.ts` (extended): confirmed `forgot-password` now attempts a
  database write even when no account matches - failing before the fix, passing after.
- `npm test` (backend, full suite) — 201/201 passing.
- Full Playwright end-to-end suite run against real local dev servers with `helmet()` active —
  4/4 passing, confirming no regression in the real cross-origin browser flow.
- Web research on Railway's specific reverse-proxy hop count and on `Cross-Origin-Resource-Policy`
  semantics, cross-checked against this app's own actual behavior rather than trusted alone:
  [Railway trust proxy guidance](https://station.railway.com/questions/security-critical-questions-on-edge-prox-8fddd775),
  [MDN: Cross-Origin-Resource-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cross-Origin_Resource_Policy).

---
