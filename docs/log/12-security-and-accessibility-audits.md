# Security & Accessibility Audits

## 2026-08-17 — Phase 11: a real security audit against the running codebase, not just re-reading the checklist

**Task:** [Tasks.md](../../Tasks.md) → Phase 11 — Security Hardening. The user asked for this
directly while waiting on an unrelated GitHub outage, alongside a Phase 12 accessibility audit
and two small fixes it surfaced (covered in their own entries/files, linked below).

### Background / concepts

#### What "audit" means here — checking the real thing, not re-reading intentions

Every item in Phase 11 describes something that's *supposed* to already be true, built up over
many earlier tasks in this log. An audit's whole job is confirming each one is actually true
*right now*, against the real running code and — where possible — the real deployed system, the
same "verify, don't assume" discipline this whole log has followed since its first entries. Two
techniques did most of the work:

- **Grep across every route file at once**, rather than trusting memory of what each one does.
  A single `grep -n "\.findMany(\|\.findFirst(\|\.findUnique(\|\.count(" backend/src/routes/*.ts`
  surfaces literally every database read in the backend in one screen, cheap to eyeball for a
  missing `userId` in its `where` clause.
- **Checking the real production system directly**, not just the code that's supposed to
  produce it. Cookie flags are a good example: reading `cookies.ts` shows the *intent*
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
  **ID-tampering** case: a user submitting *another user's* `medicationId`/`symptomId`/`habitId`
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
  documented in full in this same file, directly below, since it was *found* by this audit.

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

Every Phase 11 item is now either confirmed true (with a note on *how* it was confirmed) or
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

Every route in this backend already handles its own *expected* failure cases explicitly — a
wrong password, a not-found id, a failed validation — each with its own status code and JSON
body. None of those paths ever needed a fallback handler, so the gap never showed up in normal
use or in the existing test suite. It only matters for something genuinely *unexpected* slipping
through — e.g. `login`'s `prisma.user.findUnique` call, which has no surrounding `try`/`catch` at
all, would throw uncaught on something like a transient database connection error.

#### What Express does automatically with an uncaught error — and why that matters here specifically

This backend runs **Express 5** (`"express": "^5.2.1"` — check `package.json` if version ever
matters for this). Express 5's real, relevant difference from Express 4: it automatically
forwards a rejected Promise from an `async` route handler to error-handling middleware. In
Express 4, every route would have needed to catch its own errors and call `next(err)` by hand for
this to work at all. That's genuinely convenient — but only if error-handling middleware actually
exists to receive it. **Without any registered**, Express falls back to its own *built-in*
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
   JSON `{error:...}` body. Run against the *unpatched* code, it failed exactly as predicted:
   `res.headers["content-type"]` was `text/html; charset=utf-8`, not JSON.
2. **`backend/src/middleware/errorHandler.ts`** (new file) — an Express error-handling
   middleware (recognized by its four-parameter signature: `(err, req, res, next)`, not three).
   Logs the full error server-side (`console.error`) — genuinely useful for whoever's debugging
   it from the server's own logs, and explicitly *not* sent to the client, which is exactly the
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
  signal for the fix itself, rather than trusting that adding *some* middleware must obviously
  help.
- **A generic client-facing message, always** — regardless of what the underlying error actually
  was, the response never varies. Distinguishing error types for the client is exactly what each
  route's own explicit error handling already does; this middleware exists specifically for the
  *un*-distinguished, unexpected case.

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
against a rule. It has no idea whether an *interaction pattern* matches what a real keyboard or
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
   rehydrated a session after a hard navigation (see the *separate* session-rehydration fix in
   [Authentication — Frontend](02-auth-frontend.md)). The audit script was navigating exactly the
   way this exact bug manifests. Fixed the script to navigate the way a real user actually would
   — clicking the Settings link, a client-side route change — rather than a hard reload.
3. **Manual keyboard-navigation check on the mood-rating radiogroup** (`role="radiogroup"` /
   `role="radio"`, built from plain `<button>` elements — see the original Mood entry form
   entry's own reasoning for why). Tabbed to the first option, pressed `ArrowRight`, and checked
   which element actually had focus afterward.
   **Finding**: `ArrowRight` does **not** move focus between options — each option is instead
   individually `Tab`-stoppable, confirmed by pressing `Tab` and observing focus land on the
   *next* button in sequence, not exit the group. Every option **is** still reachable and
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
   re-derived from scratch): mood shows an emoji *and* a text label ("Great," not just a color);
   symptom severity shows the actual number, not just a color-coded bar; medication shows a
   ✅/❌ emoji *and* "Taken"/"Not taken" text; habits show "Done"/"Not done" text. Nothing in this
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
  app (a hard `page.goto` to a protected route), not evidence of a *new* accessibility problem;
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
never-pushed branch — see the *third stranding variant* entry in
[Git & GitHub Workflow](08-git-github-workflow.md)) through CI, its required **PR Preview
Screenshots** check (`.github/workflows/pr-preview.yml`, driving
`frontend/scripts/capture-pr-screenshots.mjs`) started failing on every run.

**Same underlying cause, different symptom.** The audit script above hit the bug via a *hard
`page.goto` straight to a protected route* — no login had happened yet, so the route guard's
redirect and the rehydration attempt collided. The screenshot script never does that (it always
starts at `/register`), so it didn't fail the same way. Instead: `AuthProvider`'s new mount-time
`rehydrateSession()` call fires on *every* page load, including that very first `/register` visit
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
audit vs. a PR preview), both broke on the *same* new mount-time behavior, in two different ways.
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
