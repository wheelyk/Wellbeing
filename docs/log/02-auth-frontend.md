# Authentication — Frontend

## 2026-08-15 — Phase 5 + Phase 6: wiring the frontend to auth — and why a vertical slice

**Task:** [Tasks.md](../../Tasks.md) → Phase 5 (Frontend Foundation) + Phase 6 (Frontend: Auth
Flows), scoped specifically to make register/login/logout actually work end-to-end in a
browser — not a full completion of either phase (see _Decisions_ for exactly what was left
out and why).

**Delivered via branch:** `feature/5-6-frontend-auth`.

### Why a vertical slice, not "finish Phase 5, then finish Phase 6"

This is worth explaining properly, since it's a deliberate strategy choice, not just how the
work happened to fall out.

- **The alternative — "horizontal" completion — would mean finishing _all_ of Phase 5 first**
  (a fully wireframe-matching bottom nav, every design primitive including `RatingScale`,
  `Modal`, `DatePicker`, a verified WCAG-AA color audit — WCAG-AA is "Web Content Accessibility
  Guidelines, level AA," a widely used standard for how accessible a page's content, including
  color contrast, needs to be) before writing a single line of
  Phase 6. Everything built that way stays untested against real usage until the very end,
  because nothing is actually wired to a real page or a real user flow until Phase 6 exists.
  If a design decision from Phase 5 turns out to be wrong (a primitive's API doesn't fit how
  a real form actually needs it, the auth context's shape is awkward to consume from a real
  page), that's only discovered once a large amount of "finished" Phase 5 work already needs
  reworking.
- **A vertical slice instead cuts through every layer of the stack at once, thin.** Database
  → Prisma → Express route → HTTP → the browser's `fetch` → React state → a rendered page —
  register/login/logout now works through _all_ of these layers, even though each individual
  layer is intentionally minimal (three real pages, three reusable primitives, no bottom nav
  polish yet). The payoff: a genuinely working, demonstrable feature exists after one round
  of work, instead of a pile of unconnected infrastructure that only becomes demonstrable
  much later. (`fetch` is the browser's built-in JavaScript function for sending an HTTP
  request from a page — the standard way frontend code calls a backend API.)
- **It also validates earlier decisions under real conditions for the first time.** Every
  previous Phase 2 entry in this log tested the backend auth endpoints via `curl` or
  Supertest — neither of which enforces a real browser's security model. Wiring an actual
  browser to them here is what surfaced the CORS/credentials gap below (a real bug that
  `curl` and Supertest simply can't catch, since neither of them refuses wildcard-origin
  cookies the way a browser does) and confirmed the `HttpOnly` refresh-cookie design from the
  2.3 entry genuinely works end-to-end, not just in theory.
- **Concretely, "thin" meant:** build enough of Phase 5 (routing, the API client, auth
  context, three primitives) to support Phase 6's pages, and only the parts of Phase 6 that
  make a complete register→login→logout loop — explicitly _not_ forgot/reset password,
  settings, or account deletion, none of which the backend even supports yet either. See
  _Decisions_ for the full list of what's deliberately still missing.

### Background / concepts

#### Client-side routing, and the "layout route" pattern used for the auth guard

- **Normally, every URL your browser visits means asking a server for a whole new page.** A
  "single-page app" (SPA) instead loads one HTML page once, and JavaScript takes over
  deciding what to show as the URL changes — no full page reload. **React Router** is the
  library doing that here: `<BrowserRouter>` watches the URL, `<Routes>`/`<Route>` map a URL
  pattern (e.g. `/dashboard`) to a component to render, and `useNavigate()`/`<Navigate>` let
  code change the URL programmatically (e.g. "go to `/dashboard` after a successful login")
  without a page reload.
- **`RequireAuth` (`src/auth/RequireAuth.tsx`) is a "layout route."** Wrapping a group of
  routes in `<Route element={<RequireAuth />}>...</Route>` means every route nested inside
  it shares one parent check, rather than every page repeating "am I logged in?" itself.
  `RequireAuth` either renders `<Outlet />` (React Router's placeholder for "whichever nested
  route actually matched") if `isAuthenticated`, or `<Navigate to="/login" />` if not — so
  adding a new protected page later (e.g. the real Dashboard, History, Trends) is just adding
  another `<Route>` inside that same wrapper, with zero extra auth code needed on the page
  itself.

#### Keeping the access token in memory only — and the gap that creates

- As established back in the 2.2/2.3 log entries: the **access token** is deliberately never
  persisted anywhere (not `localStorage`, not a cookie) — it lives only as a plain JavaScript
  variable in `api/client.ts` and mirrored in React state via `AuthContext`. This is the
  standard secure pattern for SPAs (nothing a page's own JavaScript can read is safe from
  XSS — Cross-Site Scripting, malicious script an attacker manages to get running on your page,
  e.g. via unsanitized user input — so keeping the access token _only_ in memory limits how long a leak could matter — at
  most 15 minutes, its own expiry).
  The direct consequence: **a full browser reload currently logs the user out** — there's
  nothing in the page's memory to restore from, and nothing yet re-fetches "who is this
  refresh cookie for" on startup. This is a known, deliberate gap for this slice — see
  _Decisions_ for why it isn't closed yet.

#### The CORS bug this step actually found (not just fixed defensively)

- Recall from the 2.3 entry: `app.use(cors())` with no options sends a wildcard
  `Access-Control-Allow-Origin: *`. Browsers have a hard rule: **a wildcard origin cannot be
  combined with credentialed requests** (`credentials: "include"`, which is what lets
  `fetch` send/receive cookies cross-origin — required here since the frontend on port
  `5173` and backend on port `4000` are different origins as far as a browser's CORS logic is
  concerned, even though they're both `localhost`). With the old wildcard config, the browser
  would have silently refused to let the frontend ever receive or send the refresh cookie —
  login would have appeared to work (the access token still arrives fine in the JSON body),
  but refresh would have silently failed the moment the access token expired, with no error
  message pointing at the real cause. Fixed by naming the frontend's exact origin explicitly
  and turning on `credentials: true`:
  ```ts
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));
  ```
  `FRONTEND_URL` is a new env var (`.env`/`.env.example`), defaulting to
  `http://localhost:5173` for local dev — the same reasoning as `DATABASE_URL` from the
  Phase 1 entry: a setting, not a hard-coded value, since it'll differ once the frontend is
  actually deployed.

#### Race-safe token refresh, and the auth-failure listener that closes a real gap

- **Why a single shared refresh attempt, not one per failed request.** If two API calls
  happen to both hit a `401` (`401 Unauthorized` is the standard HTTP status code a server
  sends back when a request's credentials are missing, invalid, or expired) around the same
  time (plausible — the access token expires
  after a fixed 15 minutes regardless of what the user is doing), naively refreshing
  separately for each would mean two concurrent `POST /api/auth/refresh` calls — and because
  refresh **rotates** the cookie (per the 2.3 entry), the second call would receive a cookie
  that's already been superseded by the first, likely failing. `api/client.ts` avoids this by
  holding one shared `refreshPromise`: whichever request hits `401` first kicks off the
  refresh, and any other concurrent caller awaits that _same_ promise instead of starting its
  own. (This is a small **publish/subscribe pattern**: one piece of code "publishes" an
  outcome — here, the shared promise resolving — and any number of other pieces can
  "subscribe" to be notified when it happens, without the publisher needing to know who's
  listening. The same pattern shows up again a few paragraphs below for `onAuthFailure`.)
- **A real bug found by trying to satisfy the checklist literally, not just "close enough."**
  `Tasks.md`'s Phase 5 wording is specific: "...on refresh failure, **redirect to Login**."
  The first implementation only cleared `api/client.ts`'s own module-level `accessToken`
  variable on a failed refresh — but `AuthContext`'s React state (`user`, `accessToken`,
  `isAuthenticated`) is a _separate_ copy, and nothing was telling it to update. Since
  `RequireAuth`'s redirect logic only ever looks at `AuthContext`'s state, a failed background
  refresh would silently leave the app _looking_ logged in (stale user info still showing)
  even though `api/client.ts` itself had already given up on the session. Fixed with a small
  publish/subscribe pattern: `client.ts` exposes `onAuthFailure(listener)`, calls every
  registered listener when a refresh definitively fails, and `AuthContext` subscribes on
  mount to clear its own state when that happens — which is what actually makes `RequireAuth`
  notice and redirect, since clearing that state triggers a re-render of every component
  reading it, `RequireAuth` included. This was caught specifically _because_ a test was
  written to prove the literal checklist wording, not just "seems to work" — see the added
  `RequireAuth` test below.

#### Two different kinds of "prove this actually works," used for two different jobs

- **Vitest + React Testing Library** (already used for the backend; now added for the
  frontend) renders components in a simulated DOM (the **DOM**, or Document Object Model, is
  the browser's in-memory tree representation of a webpage's HTML that JavaScript can read and
  change; `jsdom` — a JavaScript implementation of
  browser DOM APIs with no real browser underneath) and mocks `fetch` directly, so tests run
  in milliseconds without a real network call or a real browser. This is what the 14 new
  frontend tests use — fast, deterministic, and exactly the kind of thing that should run in
  CI on every future change (once Phase 13 sets that up).
- **Playwright**, used here for a genuinely different job: actually launching a real
  (**headless**, meaning it runs without ever showing an on-screen window) **Chromium** (the
  open-source browser engine that powers Google Chrome) browser, clicking through register → dashboard → logout → login →
  dashboard → a protected-route redirect check, and saving screenshots — the same kind of
  check the earlier "what's actually running" entry reached for `chromium-cli` to do and
  couldn't, and explicitly flagged as worth adding "once Phase 5+ gives the frontend real
  pages." That moment arrived this step. Crucially, **this was a one-off manual verification
  script, run once and then deleted — not added as a committed test file.** Formal, permanent
  end-to-end tests are explicitly Phase 13's job (`Tasks.md`: "End-to-end (e.g.
  Playwright/Cypress)"); this run's purpose was purely to produce real, literal proof — actual
  screenshots — that the vertical slice works in an actual browser, not to become part of the
  ongoing test suite. `@playwright/test` and its Chromium browser binary remain installed as
  dev dependencies, though, as a head start on that future Phase 13 task.

#### A properly-fixed version of a previously-worked-around bug

- The 2.2 (login) log entry documented hitting a Vitest/CommonJS import clash (CommonJS is
  Node.js's original module system — `require`/`module.exports` — distinct from, and not
  always compatible with, the newer `import`/`export` syntax)
  caused by a stale, previously-compiled `dist/routes/auth.test.js` interfering with Vitest's
  test discovery, and worked around it by manually deleting `dist/` before testing. Running
  `npm run build && npm test` in this step hit the _exact same_ failure again — because
  `tsc`'s `include: ["src"]` was never actually told to skip test files, so every `npm run
build` regenerates the stale, interfering compiled test file right back. This time, fixed
  it properly instead of re-applying the same manual workaround: added
  `"src/**/*.test.ts"` to `backend/tsconfig.json`'s `exclude` array, so test files are simply
  never part of the production build's output in the first place. Confirmed
  `dist/routes/` now contains only `auth.js`/`auth.js.map`, never `auth.test.js`.

### What was done

1. **Backend CORS fix + `FRONTEND_URL`** — see _Background_ above.
2. **Routing** (`frontend/src/App.tsx`): `/login`, `/register`, `/forgot-password`,
   `/reset-password` (public); `/dashboard`, `/history`, `/trends`, `/settings` (behind
   `RequireAuth`). History/Trends/Settings and the forgot/reset pages are minimal
   placeholders — real content isn't built until their own later phases.
3. **Design tokens + primitives**: a small `@theme` block in `index.css` (brand/surface/text/
   border/danger/success colors), and `Button`, `TextField`, `Card` components — each with
   visible `focus-visible` outlines. `RatingScale`, `Modal`, and `DatePicker` are not built
   yet; nothing in this slice needs them.
4. **`api/client.ts`**: attaches `Authorization: Bearer <token>`, retries once on `401` after
   a race-safe refresh attempt, the `onAuthFailure` listener described above, and a typed
   `ApiError` carrying the backend's `status`/`code`/`details` so pages can show specific,
   friendly messages instead of a generic failure.
5. **`AuthContext`** (`src/auth/AuthContext.tsx`): holds `user`/`accessToken`/
   `isAuthenticated`; `register()` calls the register endpoint then immediately logs in with
   the same credentials (register doesn't issue tokens itself — see _Decisions_); `login()`
   and `logout()` call their respective endpoints and update state; subscribes to
   `onAuthFailure` to clear state on a failed background refresh.
6. **`RegisterPage`/`LoginPage`**: real forms using the primitives above, client-side
   validation mirroring the backend's actual rules (email format; password ≥ 8 chars with a
   letter and a number — the same rule `routes/auth.ts`'s Zod schema enforces), and
   `ApiError`-code-specific messages (`EMAIL_TAKEN` → "already exists,"
   `INVALID_CREDENTIALS`/401 → "Incorrect email or password," etc.) rather than raw server
   text.
7. **`NavBar` + `DashboardPage` + `PlaceholderPage`**: a simple top nav (Home/History/Trends/
   Settings + the current user's name + a logout button) and a Dashboard showing "Welcome,
   {displayName}" plus a note that the real dashboard content is a later phase.
8. **Vitest + React Testing Library setup**: `jsdom` test environment, `setupTests.ts`
   importing `@testing-library/jest-dom/vitest` and explicitly wiring RTL's `cleanup()` into
   `afterEach` (needed because, per the earlier `CLAUDE.md`-driven choice to match the
   backend's explicit-import test style, Vitest's `globals` option is off — and RTL's
   auto-cleanup relies on detecting a global `afterEach`, so without it, unmounted DOM from
   one test was leaking into the next, which is exactly what the first test run's "found
   multiple elements" failures turned out to be). 14 tests across `client.test.ts`,
   `RegisterPage.test.tsx`, `LoginPage.test.tsx`, and `RequireAuth.test.tsx`.
9. **Fixed the `tsc`-compiling-tests-into-`dist` issue for good** — see _Background_ above.
10. **Playwright real-browser verification** — see _Background_ above. Registered a user,
    confirmed the dashboard rendered with the right welcome text, logged out and confirmed
    redirect to `/login`, logged back in and confirmed the dashboard again, then confirmed
    visiting `/dashboard` while logged out redirects straight to `/login` — all with zero
    browser console errors. Screenshots were sent directly to the user, then the script,
    screenshots, and the test user row (via `psql`) were all deleted — none of that is part
    of the committed repo.
11. Updated `Tasks.md`: checked off the Phase 5/6 items actually complete (routing, API
    client, auth context, registration page, login page, logout, route guarding); left
    unchecked, deliberately: the bottom-nav/desktop-nav wireframe adaptation, the remaining
    design primitives (`RatingScale`/`Modal`/`DatePicker`), a verified WCAG contrast pass,
    forgot/reset password, and the settings/account-deletion page.

### Why it's needed

This is the moment the whole project stops being "an API you can `curl`" and becomes "an app
a person can actually use in a browser" — directly closing the gap from the earlier "is
anything visible" conversation, and for the first time exercising the entire Phase 2 backend
auth stack under real browser conditions (which is exactly what caught the CORS bug above).

### Decisions

- **Vertical slice over horizontal phase completion.** Covered in full above — the short
  version: working end-to-end beats a pile of finished-but-unconnected infrastructure.
- **No session persistence across a full page reload, yet.** Rehydrating a session on cold
  load would mean calling `POST /api/auth/refresh` on startup — but that only returns a new
  access token, not the user's profile (email/displayName), and `GET /api/users/me` (plus the
  auth middleware it needs) hasn't been built yet (`Tasks.md` Phase 2, remaining items).
  Building partial rehydration now would mean an awkward "sometimes we know your name,
  sometimes we don't" state; better to build it properly once those backend pieces exist.
- **Register auto-logs-in with the same credentials** rather than sending the user to a
  "please log in now" screen. The register endpoint deliberately doesn't issue tokens itself
  (per the 2.1 entry — a new account still has to log in), but immediately chaining a real
  `login()` call gives a much better first-run experience (straight to the dashboard) at
  effectively zero extra cost, since the frontend already has both credentials in hand right
  after a successful submission.
- **Stub pages for History/Trends/Settings/Forgot/Reset**, not full implementations. Enough
  to legitimately check off "set up routing for..." and keep `NavBar`'s links working, without
  building UI for backend functionality (forgot/reset password, profile editing) that doesn't
  exist yet.
- **Deferred the rest of the design system and accessibility verification** —
  `RatingScale`/`Modal`/`DatePicker` aren't needed until Quick Add (Phase 7) actually needs
  them; a real WCAG contrast audit is explicitly Phase 12's job, not something to hand-wave
  here.
- **Playwright as a one-off manual check, not a committed suite.** Matches the boundary set
  in the previous log entry — real end-to-end tests belong to Phase 13, once there's enough
  UI surface and CI infrastructure to make a permanent suite worthwhile; this run's job was
  producing real proof for _this_ conversation, not ongoing regression coverage.
- **Fixed the `dist`/test-file `tsc` issue properly** (excluding test files from the build)
  rather than re-applying the "just delete `dist/` first" workaround noted in the login entry
  — a workaround that has to be remembered every time isn't really fixed.

### State at end of this step

A complete, working local vertical slice: a visitor can register (landing straight on the
dashboard, auto-logged-in), see their name and email, log out (redirected to `/login`), log
back in (back to the dashboard), and cannot reach `/dashboard` at all without a valid session
(redirected to `/login` instead). A background token-refresh failure now correctly redirects
too, not just an explicit logout click. Nothing persists across a full browser reload yet —
a known, documented gap. Google OAuth was explicitly not built — not in `requirements.md` or
`Tasks.md`, and out of scope for this slice; noted as a possible future enhancement only.

### Verification

- **Backend:** `npm run build` — compiled cleanly, with test files now correctly excluded
  from `dist/`. `npm test` — 18/18 passing, unchanged, confirming the CORS change didn't
  break any existing auth behavior.
- **Frontend:** `npm run build` — compiled cleanly. `npm test` (`vitest run`) — 14/14 passing,
  including the new test proving a failed background refresh actually redirects to `/login`.
  `npm run lint` (`oxlint`) — clean, aside from one harmless Fast Refresh warning (Fast Refresh
  is React's version of the Hot Module Reload behavior described in the earlier Vite scaffold
  entry — it needs a file to export only components to reliably hot-swap it) about
  `AuthContext.tsx` exporting both a component and a hook (a common, accepted pattern; not
  worth splitting into two files for this).
- **Real browser (Playwright, Chromium, headless):** registered a user → landed on the
  dashboard with the correct welcome text → logged out → redirected to `/login` → logged back
  in → dashboard again → visiting `/dashboard` directly while logged out redirected straight
  to `/login`. Zero browser console errors throughout. Screenshots of each stage were sent
  directly to the user as visual proof, then deleted along with the script and the test user
  row (`psql DELETE FROM users WHERE email LIKE 'browser-check-%'`) — none of this is part of
  the committed repo.

---

## 2026-08-16 — Phase 6: Settings page with change-password form (and a real race-condition bug)

**Task:** [Tasks.md](../../Tasks.md) → Phase 6 → "Change password form on Settings page: current
password + new password fields, calls `POST /api/auth/change-password`, with clear
success/error feedback."

**Delivered via branch:** `feature/6.4-settings-change-password` (stacked on
`feature/2.5-auth-change-password`, since it calls that task's endpoint). This is where
change-password becomes something a real person can actually use — the Settings route existed
only as a `PlaceholderPage` until now.

### Background / concepts

#### Scoped deliberately: this is _a_ Settings page, not _the_ Settings page

- Phase 6 has its own, separate, larger "Settings page: view/edit display name and timezone;
  account deletion flow" item, not yet built. `SettingsPage.tsx` today contains _only_ the
  change-password form — matching just what this specific task asked for, not pre-building
  pieces of that later task. Display name/timezone editing and account deletion will be added
  to this same page/file when their own tasks come up, not invented ahead of time here.

#### A real, found-by-actually-testing-it race condition between two different redirects to `/login`

- The form's success handler needs to do three things: tell the backend to change the password
  (done), end the local session, and land the user on `/login` with a helpful message. The
  _first_ version of this wrote that as `await logout(); navigate("/login", { state: {
message } })` — log out, then redirect. That reads perfectly reasonably and passed every
  automated test. **It was still wrong**, caught only by actually driving a real browser through
  the full flow and checking what happened after re-logging in.
- **What actually happened:** `logout()` clears the app's auth state (`user: null, accessToken:
null`). `SettingsPage` lives behind `RequireAuth` (the route guard covered in detail in the
  next entry) — the instant that state change is processed, `RequireAuth` notices
  `isAuthenticated` just became `false` _while `/settings` is still the current route_ and
  fires its **own** redirect to `/login`, carrying `state: { from: location }` (so a normal
  "you got logged out, here's where to come back to" flow works). That redirect and this
  form's own `navigate("/login", { state: { message } })` call are now racing to decide what
  `/login`'s `location.state` actually ends up being — and `RequireAuth`'s won, discarding the
  success message and, worse, meaning a _subsequent_ login redirected back to `/settings`
  (reading `state.from.pathname`) instead of the expected `/dashboard`.
- **Why the automated test suite didn't catch this.** The Vitest/Testing-Library test for this
  flow mocks `fetch` directly and asserts on the _final_ rendered state — it never actually
  exercises React's real scheduling/timing between two competing `setState`-triggered
  re-renders the way a real browser genuinely does. This is exactly the kind of bug real
  end-to-end browser testing exists to catch that a mocked unit test structurally cannot —
  not a weakness in the tests that were written, just a category of bug outside what that
  layer of testing can see.
- **The fix:** reorder to `navigate("/login", { state: { message } })` _first_, then `await
logout()`. Once the route has already changed to `/login` — a route `RequireAuth` doesn't
  guard at all — the subsequent auth-state change has nothing left to react to. No more race,
  because there's no longer a moment where the guarded route is still current _and_ the auth
  state has already flipped.

#### A second false alarm, and the actual lesson in it

- While verifying the fix, a screenshot taken immediately after `page.waitForURL("**/settings")`
  resolved still showed the _old_ Dashboard content. This looked like another real bug — until
  checking the page's actual text content directly (rather than a screenshot) a moment later
  showed the correct Settings content was there all along. `waitForURL` resolves the instant the
  browser's URL changes, which can be a beat before React actually finishes re-rendering and the
  browser repaints — a screenshot taken in that exact window can catch a stale frame. The fix
  was to the _test script_ (wait for a real, specific piece of the new page's content to appear
  before screenshotting), not the application. Worth recording precisely because it looked
  identical to a real bug at first glance, and the only way to tell the difference was checking
  the DOM's actual text directly rather than trusting a single screenshot's timing.

#### A genuine gap found along the way, tracked rather than silently noticed and dropped

- While debugging the above, testing a **hard** page reload (not client-side navigation) at
  `/settings` showed neither the Settings nor the Dashboard content — because this app's
  `AuthContext` never attempts to rehydrate a session on startup. The access token lives only
  in memory (`useState`, no `localStorage`), which is the deliberate, correct choice for
  _storing_ it (covered in the Phase 2.3 refresh-token entry — keeping it out of anything
  JavaScript-readable-and-persistent is part of what limits XSS blast radius). But nothing
  currently uses the still-valid `httpOnly` refresh cookie to silently re-establish a session
  when the app first loads — meaning today, a real user who simply refreshes their browser
  gets bounced to `/login` every time, even though their session is, from the backend's
  perspective, still completely valid. Added as its own new `Tasks.md` item (Phase 5) rather
  than fixed inline here, since it's a distinct, real gap deserving its own dedicated task
  rather than a rushed fix bolted onto this one.

### What was done

1. **`frontend/src/pages/SettingsPage.tsx` (new).** A `Change password` card (current
   password, new password, confirm-new-password with a client-side match check, mirroring the
   backend's strength rules before ever hitting the network) — nothing else on the page yet,
   per the scoping note above.
2. **`frontend/src/App.tsx`.** Swapped the `/settings` route from `PlaceholderPage` to the new
   `SettingsPage`.
3. **`frontend/src/pages/LoginPage.tsx`.** Reads an optional `location.state.message` and shows
   it above the form — generic enough to be reused by any future flow that wants to hand the
   user a one-off note on arrival at Login (forgot/reset-password will likely want the same
   thing).
4. **Fixed the navigate-before-logout race** described above.
5. **Tests (`SettingsPage.test.tsx`).** Weak new password and mismatched confirmation both
   blocked client-side with no network call; a full success path asserting the exact request
   body sent to `/api/auth/change-password` and that the app ends up showing the Login page; a
   wrong-current-password error shown from the API's `INVALID_CURRENT_PASSWORD` response.
6. **`npm test`** — 24/24 passing (20 pre-existing, 4 new).
7. **`npm run build`, `npm run lint`, `npx prettier --check .`** — all clean.
8. **Real, full end-to-end browser verification**, including the specific case the race
   condition affected: register → open Settings → change password → land on Login _with the
   confirmation message actually visible_ → log in with the **new** password → land on
   `/dashboard` (not `/settings`) — the exact sequence that exposed the bug in the first place,
   re-run clean after the fix. Cleaned up every test user and stopped both manually-started
   servers afterward.

### Why it's needed

This closes the change-password vertical slice end to end — the backend half from the previous
entry was only reachable via `curl` until this task gave it a real, usable front door.

### Decisions

- **Navigate before clearing auth state, not after.** Covered in detail above — the only
  ordering that avoids the `RequireAuth` race entirely, rather than trying to "win" a timing
  contest against React's own scheduling.
- **Tracked the session-rehydration gap as a new task rather than fixing it inline.** It's a
  real, separate piece of work (almost certainly an `apiFetch`-style silent refresh attempt on
  `AuthProvider` mount) — worth its own dedicated task and testing, not a rushed addition to a
  change-password PR.

### State at end of this step

A real user can open Settings, change their password, and land back on a working login form
with the new password active — verified directly in a real browser, including the exact
sequence that previously exposed a real race-condition bug. That bug is fixed; the session-
rehydration gap it led to being discovered is tracked, not fixed, as its own task.

### Verification

- `npm test` — 24/24 passing.
- `npm run build`, `npm run lint`, `npx prettier --check .` — all clean.
- Full real-browser walkthrough of the exact sequence that exposed the race condition, re-run
  clean after the fix; confirmed via direct DOM text inspection (not just a screenshot) after
  the screenshot-timing false alarm.

---

## 2026-08-17 — Phase 5: rehydrating a session from the refresh cookie on page load

**Task:** [Tasks.md](../../Tasks.md) → Phase 5 — "On app load, attempt a silent token refresh
(using the `httpOnly` refresh cookie) to rehydrate the session, so a browser refresh doesn't log
out a user whose session is still genuinely valid." Closes the gap tracked (not fixed) in the
previous entry.

### Background / concepts

#### Why a page reload always showed Login, even with a perfectly valid session

`AuthContext`'s `state` (`{ user, accessToken }`) lives in a React component's own memory — a
full page reload doesn't just re-render the app, it destroys and rebuilds the entire JavaScript
runtime from scratch, `AuthProvider` included. Every previous version of this component started
`state` as `{ user: null, accessToken: null }` and never tried to prove otherwise. Meanwhile, the
one piece of evidence that a real session might still exist — the `httpOnly` refresh cookie
`POST /api/auth/login` sets — survives a page reload just fine (that's the entire point of a
cookie), sitting there unread. `RequireAuth` (see the earlier entry introducing it) only ever
looks at `isAuthenticated`, which is derived from that empty starting state — so it always
redirected to `/login`, regardless of whether the cookie was still genuinely valid.

#### Why `/api/auth/refresh` needed a small backend change first

The refresh endpoint already did most of the necessary work — it verifies the cookie, looks up
the user, rotates the cookie, and issues a fresh access token — but only ever _returned_ the
access token, discarding the full user row it had already fetched to get there. Rehydrating a
session needs both pieces: an access token to authenticate future requests, _and_ a user object
to actually populate `AuthContext`'s state with (a display name to show, an email, a timezone).
Fixed by having `/refresh` return `user` too, in the exact same shape `/login` already returns it
in (now shared via one `serializeUser` helper, rather than two copies of the same five fields).

#### The new `isLoading` flag — why silently attempting rehydration in the background isn't enough

The naive version of this fix — just fire the rehydration attempt in a `useEffect` (a React
**hook** — a function letting a component run some code as a side effect of rendering, e.g.
right after it first mounts) and let
`isAuthenticated` update whenever it resolves — has a real, visible bug: `isAuthenticated` reads
as `false` for the entire time that attempt is still in flight, exactly the same as "genuinely
not logged in." `RequireAuth` checking `isAuthenticated` during that window would redirect a user
with a perfectly valid session to `/login` anyway, just because the check hadn't finished yet —
solving the letter of the bug report while leaving a visible flash of the wrong page. `isLoading`
(true only until the mount-time attempt resolves, success or failure) is what lets `RequireAuth`
tell "haven't checked yet" apart from "checked, and there's genuinely no session" — rendering
nothing for that brief moment instead of guessing wrong.

### What was done

1. **`backend/src/routes/auth.ts`**: extracted a `serializeUser()` helper (shared by `/login` and
   `/refresh`) and had `/refresh` return `{ user, accessToken }` instead of just `{ accessToken }`.
2. **`frontend/src/api/client.ts`**: added `rehydrateSession<TUser>()` — a small, deliberately
   separate function from the existing `refreshAccessToken()` (which already handles
   deduplicating _concurrent_ 401-triggered retries, a scenario that can't happen yet at
   `rehydrateSession`'s one call site, before anything else has had a chance to make a request at
   all). Calls `POST /api/auth/refresh` directly and returns `{ user, accessToken } | null`.
3. **`frontend/src/auth/AuthContext.tsx`**: added `isLoading` (starts `true`) and a mount-time
   `useEffect` that calls `rehydrateSession()` once, populating `state` on success, and always
   setting `isLoading` to `false` when it resolves either way.
4. **`frontend/src/auth/RequireAuth.tsx`**: renders `null` while `isLoading` is true, before ever
   checking `isAuthenticated` — the fix for the "flash of the wrong redirect" problem described
   above.
5. **Reproduced the actual bug in a real browser before writing any of the above**: registered a
   user, confirmed landing on the Dashboard, then did a genuine `page.reload()` (not client-side
   navigation) — confirmed it redirected to Login despite a valid, unexpired refresh cookie still
   sitting in the browser. Re-ran the identical script after the fix — confirmed it now stays on
   `/dashboard`, with the welcome heading rendering the user's real display name, fetched via the
   rehydrated session.
6. **Updated every existing test that renders `AuthProvider`** (`RequireAuth.test.tsx`,
   `LoginPage.test.tsx`, `RegisterPage.test.tsx`, `SettingsPage.test.tsx`) — this fix means
   _every_ `AuthProvider` mount now fires an unconditional `fetch` call to `/api/auth/refresh`
   that didn't exist before, which several existing tests' mocks and assertions didn't account
   for (a `.mockResolvedValue()` reused for every call now gets consumed by the new rehydration
   attempt first; a `expect(fetchMock).not.toHaveBeenCalled()` assertion is no longer literally
   true even when the thing it's actually checking — "the form never submitted" — still holds).
   Each was fixed to either account for the extra call explicitly (a prepended
   `mockResolvedValueOnce` simulating "no session yet") or assert more precisely on what actually
   matters (e.g. "never called _with_ `/api/auth/change-password`", not "never called at all").
7. **Added a new, dedicated test** for the actual behavior being fixed: a fresh mount with a
   valid session cookie lands directly on the protected route, never showing `/login` at all —
   the only existing coverage before this was the _unauthenticated_ redirect case and the
   _explicit-login_ case, neither of which exercised silent rehydration on mount at all.

### Why it's needed

Every other web app a user has ever used stays logged in across a browser refresh — this project
not doing that wasn't just an inconvenience, it actively taught users to distrust the "logged in"
state entirely, since it could vanish on an ordinary refresh with no warning.

### Decisions

- **A dedicated `rehydrateSession()`, not reusing `refreshAccessToken()`'s deduplication
  machinery.** Covered above — that mechanism solves a different problem (concurrent retries of
  already-in-flight requests) that structurally can't occur at this call site, so reusing it
  would add complexity without solving anything this specific case needs.
- **`isLoading` renders nothing, not a spinner.** The window this actually covers is a single
  fast local request in the overwhelming common case; a spinner that only ever flashes for a
  fraction of a second is more visual noise than useful feedback. Worth revisiting if real-world
  latency ever makes that assumption wrong.
- **Fixed the ripple through every existing `AuthProvider`-rendering test**, rather than only the
  tests for the new behavior itself — an untouched test that silently started passing for the
  wrong reason (or worse, started failing) is exactly the kind of regression this project's
  "run the full suite, not just new tests" rule exists to catch.

### State at end of this step

A user who reloads the page, closes and reopens the tab, or otherwise triggers a fresh page load
stays logged in for as long as their refresh cookie remains valid (7 days, per the existing
rotation policy) — the last remaining gap from Phase 5's original checklist.

### Verification

- `npm test` (backend) — 114/114 passing (1 new: `/refresh` now returns a matching `user` shape).
- `npm test` (frontend) — 69/69 passing (1 new dedicated rehydration test; every existing
  `AuthProvider`-rendering test updated and still passing).
- `npm run build`, `npm run lint`, `npx prettier --check .` (both projects) — all clean.
- Real browser reproduction: registered a user, confirmed a hard `page.reload()` previously
  landed on `/login` despite a valid cookie; re-ran the identical script after the fix and
  confirmed it now stays on `/dashboard`, with zero console errors during the reload itself (two
  expected, harmless `401` console messages appear only from the _very first_ page load before
  any account exists yet — the mount-time rehydration attempt correctly, honestly reporting "no
  session yet" for a brand-new visitor, doubled by React StrictMode's dev-only double-effect
  invocation (StrictMode is a React development-mode-only tool that deliberately runs certain
  code twice to help surface bugs; it does not run twice in production); neither is a real error, and neither reproduces around the actual reload event this
  fix targets).

---

## 2026-08-18 — NavBar overflowing on mobile with a long display name/email

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a real layout bug, picked back up
from a stashed, unfinished fix (started, then blocked on the session-rehydration fix above
merging first, since both touched auth-adjacent frontend code) and completed here: read the real
code, confirm the actual cause, fix it, then verify against an actual narrow viewport rather than
assuming the fix worked.

### Background / concepts

`NavBar.tsx` renders the four nav links, the signed-in user's `displayName`, and a Log out
button in a single flex row (`justify-between`). A flex item's default `min-width` is `auto` —
its content's natural, unshrunk width — not `0`, which is the counterintuitive part: it means a
flex item normally refuses to shrink smaller than its content even when the row runs out of room,
unless `min-width: 0` is set explicitly to opt back into shrinking. Without that override, a long
`displayName` (or an email used as a fallback display name — see the auth backend log for why
that's the default) pushed the _entire header_ wider than the viewport on a phone-width screen,
rather than the name itself wrapping or truncating.

### What was done

1. Added `min-w-0` to both the right-hand flex container and the name `<span>` itself (Tailwind's
   `min-w-0` utility), plus `truncate` on the span so, once shrinking is actually possible, long
   text ellipsizes instead of wrapping the header onto a second line. `shrink-0` was added to the
   nav links and the Log out button so they claim their needed width first and never shrink
   themselves.
2. **Verifying this in a real browser (not just reasoning about the CSS) surfaced a second,
   real problem the fix above didn't catch**: with four non-shrinking nav links plus a
   non-shrinking Log out button both claiming space first, a genuinely long name at a 375px
   viewport was left with only ~5px of the row to truncate into — not a readable `"Jane D…"`, just
   an unreadable sliver, confirmed by inspecting the rendered span's own bounding box in a headless
   browser. Stopping horizontal overflow isn't the same as the name staying legible.
3. Fixed that by hiding the name entirely below the `sm` (640px) breakpoint (a **breakpoint** is
   a screen-width threshold above or below which Tailwind applies different styles) (`hidden sm:block`) —
   a common, simple mobile pattern — rather than trying to guarantee it a minimum readable width at
   the further expense of the nav links. The Log out button is never hidden at any width; only the
   name disappears on narrow screens.
4. Two tests in `NavBar.test.tsx`: the existing "renders every link and Log out" case, plus a new
   structural regression guard asserting the name span carries all four load-bearing classes
   (`hidden`, `sm:block`, `truncate`, `min-w-0`) and that the Log out button's own class list never
   contains `hidden` — jsdom has no real layout engine and doesn't load the compiled Tailwind
   stylesheet, so it can't verify actual visibility or overflow; that's what the manual browser
   verification below is for.

### Why it's needed

A header that visibly breaks its own layout is the kind of bug a real user notices in the first
five seconds on a phone — and the "obvious" one-line CSS fix (`truncate` + `min-w-0`) turned out to
only be half the fix once actually checked against a real narrow viewport with a genuinely long
name, rather than assumed correct from the diff alone.

### Decisions

- **Hide the name below `sm`, rather than giving it a guaranteed minimum width.** A minimum width
  would have to come from somewhere — either the nav links or the Log out button shrinking, which
  reintroduces the exact "important controls get squeezed" problem this fix exists to avoid.
  Hiding the name is what most mobile-web headers already do for this same reason, and the user's
  own name is the least load-bearing piece of information in this header — every page it appears on
  is already behind an authenticated route.
- **`shrink-0` on the nav links and Log out button, not just `min-w-0`/`truncate` on the name.**
  Both are needed together: `min-w-0` on the name only _permits_ it to shrink below its content
  width; `shrink-0` on everything else is what guarantees the room it needs to shrink _into_ comes
  from the name specifically, not unpredictably from whichever flex item the browser's default
  shrink algorithm picks.
- **Verified in an actual headless browser at 375px and 768px, not just by reading the Tailwind
  classes.** This is exactly what caught the unreadable-sliver problem in step 2 above — a
  plausible-looking CSS diff that compiles and passes structural unit tests can still be wrong in a
  way only rendering it, at the width it's meant to fix, actually reveals.

### Verification

- `npm test` (frontend) — 123/123 passing (2 in `NavBar.test.tsx`, 1 pre-existing + 1 new).
- `npm run build`, `npm run lint` (`oxlint`), `npx prettier --check .` — all clean.
- Real browser check at a 375px viewport (iPhone SE-width) against the actual running dev
  server, with a throwaway user registered with an intentionally long `displayName`
  (`"A Very Long Display Name That Would Overflow A Narrow Mobile Header"`): confirmed
  `document.documentElement.scrollWidth` no longer exceeds the viewport width, the name span is
  `display: none`, and the Log out button's full bounding box stays within the viewport.
- Same check repeated at 768px: confirmed the name span is `display: block`, visibly truncated
  with an ellipsis rather than wrapping or overflowing, and the Log out button still fully fits.
- The two console `401`s seen during both checks are the same already-documented, harmless
  first-page-load rehydration attempt described in the verification section directly above this
  entry — not a regression from this change.
- The throwaway browser-created user was left in the local dev database; the one-off Playwright
  verification scripts used for both manual browser checks were not committed.

---

## 2026-08-19 — Phase 5: a bottom nav on mobile, a top nav on desktop, and a real FAB collision

**Task:** [Tasks.md](../../Tasks.md) → Phase 5 — "Build a bottom navigation component (Home /
History / Trends / Settings) per the wireframes, visible on mobile; adapt to a top/side nav on
desktop without changing the underlying workflow." No wireframes file actually exists in the repo,
so this was built to match the app's existing visual language instead (`index.css`'s design
tokens, `NavBar.tsx`'s own conventions) rather than a spec.

**Delivered via branch:** `feature/5.x-bottom-nav-mobile`.

### Background / concepts

#### Why a _separate_ component, not just restyling `NavBar` with media queries

`NavBar.tsx` (introduced in the 2026-08-15 entry above, fixed for mobile overflow in the entry
directly above this one) was, until now, one always-visible top bar holding the four primary nav
links, the signed-in user's display name, and Log out. A bottom tab bar and a top bar are
different enough in _shape_ — a bottom bar is a full-width row of stacked icon+label buttons
pinned to the viewport's bottom edge; a top bar is a horizontal row of plain text links inline
with branding and account actions — that squeezing both into one component's markup with
breakpoint classes would mean two very different layouts fighting inside a single JSX tree. Two
separate components, each responsible for exactly one screen-size regime, is simpler to read and
easier to test in isolation: `BottomNav.tsx` (new) exists purely for `< md:` (below 768px);
`NavBar.tsx`'s own nav links now exist purely for `md:` and up.

#### The chosen split: `NavBar` goes slim on mobile, `BottomNav` takes over primary navigation

`NavBar` originally packed nav links + name + Log out into one row — the exact crowding problem
the previous log entry's mobile-overflow fix had to work around. Moving primary navigation to
`BottomNav` below `md:` removes that link row from the top bar entirely on a phone screen, so
`NavBar` only needs to show a brand mark ("WellTrack" — added here; the top bar previously had no
branding at all) and account actions (Log out; the display name stays hidden below `sm:`, per the
existing fix) on mobile. The same four links reappear in `NavBar` itself from `md:` up
(`hidden md:flex` on the `<nav>` wrapping them), functioning as a conventional desktop top nav —
same routes, same `NavLink`/`isActive` highlighting logic, just a different chrome depending on
screen width, exactly as `Tasks.md`'s wording asks for ("without changing the underlying
workflow").

#### `BottomNav.tsx`

A `<nav aria-label="Primary">` (`aria-label` gives an element an accessible name for screen
readers, since this nav has no visible heading of its own), `fixed inset-x-0 bottom-0`, `h-16` (64px — a conventional mobile
tab-bar height, comfortably large as a touch target), one flex-1 `NavLink` per route with a small
emoji icon above the label (matching the icon style `QuickAddFab.tsx` already established for its
own per-type menu — see that file's own comment on why these are hardcoded per-component rather
than a shared constant). `md:hidden` is the one class doing all the work of confining it to mobile
— from `768px` up, `NavBar`'s own top nav is the one true primary-navigation surface, so having
both visible at once would be redundant chrome and (see below) an actual visual collision.

#### A real collision this design predicted, and confirmed rather than assumed

A `fixed`, bottom-pinned nav bar is exactly the kind of thing that silently overlaps _other_ fixed
elements already anchored to the bottom of the viewport — and this app already has one:
`QuickAddFab.tsx`'s `+` button (a **FAB**, or "Floating Action Button" — a round button, usually
fixed in a corner of the screen, for a page's primary action; this is where the "Fab" in the
filename comes from), `fixed bottom-6 right-6` on the Dashboard page. Reasoning about the
numbers alone (`BottomNav` is `h-16`/64px tall, sitting at `bottom-0`; the FAB was `bottom-6`/24px
up) suggested a real overlap, but per this project's own established practice (the _previous_ log
entry in this same file title-cased this exact lesson: "a plausible-looking CSS diff... can still
be wrong in a way only rendering it... actually reveals"), this was checked in an actual running
browser rather than trusted from the arithmetic. It was, in fact, a real collision — with
`BottomNav` visible, the FAB's own lower portion sat _inside_ `BottomNav`'s bounding box at a real
375px viewport, confirmed by comparing both elements' actual `boundingBox()` (a Playwright
function returning an element's actual on-screen position and size, in pixels) values in Playwright,
not just the source CSS. Fixed with a mobile-only offset: `bottom-24` (96px — clearing `BottomNav`
plus real breathing room) on the FAB, reverting to the original `bottom-6` from `md:` up, where
`BottomNav` is hidden and the FAB has the full viewport height to itself again. Re-measured after
the fix: FAB bounding box bottom edge at y≈716px, `BottomNav`'s top edge at y≈748px on a 812px-tall
viewport — a clean 32px gap, no overlap.

#### The other collision this design predicted: page content hidden behind the bar

The same `fixed`-positioning problem applies to _every_ page's own content, not just the FAB —
`main`'s last child on any page (`Dashboard`'s last section card, `History`'s last entry or "Load
more" button, `Settings`'s "Update password" button) would sit directly behind `BottomNav` on
mobile unless the page reserves room for it. Every page that renders `NavBar` (`DashboardPage`,
`HistoryPage`, `TrendsPage`, `SettingsPage`, and `PlaceholderPage` — still unused by any live route
today, but kept consistent in case a future page reuses it, same as the other four) got its
`<main>` padding changed from a flat `py-8` to `pt-8 pb-24 md:pb-8` — extra bottom padding on
mobile to clear `BottomNav`'s 64px plus room to spare, reverting to the original symmetric padding
at `md:` where `BottomNav` is hidden again.

### What was done

1. **`frontend/src/components/BottomNav.tsx` (new).** The fixed, mobile-only tab bar described
   above — four `NavLink`s (Home/History/Trends/Settings), each with an icon + label, the active
   route highlighted in brand blue via the same `isActive` pattern `NavBar` already used.
2. **`frontend/src/components/NavBar.tsx`.** Added a "WellTrack" brand mark; wrapped the existing
   nav links in `hidden md:flex` so they only render as a top nav from `md:` up; updated the
   crowding-fix comment from the previous entry to reflect that the nav links no longer compete
   for space on mobile at all (only from `md:` up, where there's more room anyway).
3. **`frontend/src/components/dashboard/QuickAddFab.tsx`.** `bottom-6` → `bottom-24 md:bottom-6`,
   fixing the real FAB/`BottomNav` collision described above.
4. **`DashboardPage.tsx` / `HistoryPage.tsx` / `TrendsPage.tsx` / `SettingsPage.tsx` /
   `PlaceholderPage.tsx`.** Each now renders `<BottomNav />` alongside its existing `<NavBar />`,
   and each `<main>`'s padding changed to `pt-8 pb-24 md:pb-8` (from a flat `py-8`) so content
   isn't hidden behind the bar on mobile.
5. **Tests.** `BottomNav.test.tsx` (new): all four links render with the correct `href`s; the
   active route is highlighted (`text-brand`) and the others aren't; a structural regression guard
   (same jsdom caveat as `NavBar.test.tsx`'s own breakpoint test — no real layout engine, no
   compiled stylesheet, so this can't verify actual visibility) confirming `fixed`, `bottom-0`, and
   `md:hidden` stay present. `NavBar.test.tsx`: added a check for the new brand text, and a
   structural guard that the nav-links wrapper carries `hidden md:flex`.
   `DashboardPage.test.tsx`'s existing composition test needed updating — with both `NavBar` and
   `BottomNav` now rendering together, `getByRole("link", { name: "Home" })` legitimately matches
   two elements instead of one (jsdom doesn't know which one a real browser would actually show at
   a given width), so it now asserts `getAllByRole(...)` returns exactly two, rather than a single
   link that no longer uniquely identifies either nav surface.
6. **Full frontend suite**: `npm test` — 143/143 passing after the `DashboardPage.test.tsx` update
   above (the only failure the change caused, and a genuine, expected update rather than a bug
   worked around).
7. **`npm run build`, `npm run lint` (`oxlint`), `npx prettier --check src`** — all clean.
8. **Real browser verification (Playwright + `playwright-core`, headless Chromium, against real
   running `npm run dev` servers on both projects, backend backed by the real local Postgres —
   see [docs/log/13-responsive-design.md](13-responsive-design.md) for why this project treats
   "compiles and passes unit tests" as necessary but not sufficient)**: registered a real user,
   checked Dashboard and History/Trends/Settings at both 375px and 1280px. At 1280px: `BottomNav`
   correctly not rendered as visible, `NavBar`'s top nav links visible and functional (clicked
   through to History), no horizontal overflow. At 375px: `BottomNav` visible and functional
   (clicked through to History, active state updated correctly), `NavBar`'s own nav links
   genuinely not in the accessible-elements tree at all (not just visually hidden — confirmed via
   `getComputedStyle().display` being `none`, not just an `isVisible()` check), the FAB/`BottomNav`
   collision fix confirmed via real bounding-box measurements (no overlap, 32px clear gap), every
   page's last piece of content visible above the bar after scrolling to the bottom (screenshotted
   for Dashboard, History, Trends, Settings), no horizontal overflow on any of the four pages. Zero
   unexpected console errors — the two `401`s seen are the same already-documented, harmless
   first-load rehydration attempt from the 2026-08-17 entry above, not a regression. The throwaway
   user was deleted from the dev database afterward; the one-off verification scripts were not
   committed; both dev servers (run on dedicated, non-default ports to avoid colliding with other
   work happening on the same shared dev database/host at the same time) were stopped when done.

### Why it's needed

Every page in this app was, until now, unreachable from a phone without a top bar that had already
had to be defensively shrunk to avoid breaking (the previous log entry). A bottom tab bar is the
standard, thumb-reachable mobile navigation pattern for exactly this reason — and building it
without checking the FAB collision would have shipped a feature that visually broke the one page
(`Dashboard`) that already had its own fixed-position UI element.

### Decisions

- **A separate `BottomNav` component, not a responsively-restyled `NavBar`.** Covered above — the
  two chrome shapes are different enough that one component doing both would be harder to read
  and test than two components each owning one screen-size regime.
- **`NavBar` keeps a brand mark + Log out on mobile, not just an empty bar.** Moving primary
  navigation to the bottom doesn't mean the top bar should show nothing — a small, persistent brand
  mark and an always-reachable Log out (never hidden, per the existing rule) is a common, minimal
  pattern for exactly this "primary nav lives elsewhere" situation.
- **`bottom-24 md:bottom-6` on the FAB, not e.g. shrinking `BottomNav` or moving the FAB
  elsewhere.** The simplest fix that changes the fewest things: `BottomNav`'s height and position
  are fixed by its own tab-bar convention, so giving the FAB more clearance on mobile (with no
  change at all once `BottomNav` isn't present) was the smallest, most targeted fix.
- **`PlaceholderPage.tsx` updated too, even though no live route currently uses it.** Consistency
  with the other four `NavBar`-rendering pages costs nothing here and avoids a stale trap for
  whichever future page reuses it next.
- **Verified in a real browser rather than trusting the CSS reasoning**, specifically for the FAB
  collision — matching the explicit lesson recorded in the entry directly above this one in this
  same file. The collision was real, not hypothetical, and the fix's clearance was re-measured
  afterward rather than assumed correct from the class names alone.

### State at end of this step

A user on a phone now has a persistent, thumb-reachable bottom tab bar for Home/History/Trends/
Settings on every authenticated page, with the exact same four routes reachable as a conventional
top nav from `md:` up — no change to the underlying routing or workflow at either size. The one
real cross-feature interaction this introduced (the Dashboard FAB) was found, fixed, and confirmed
fixed in a real browser, not just reasoned about.

### Verification

- `npm test` (frontend) — 143/143 passing (4 new: 3 in `BottomNav.test.tsx`, 1 new assertion in
  `NavBar.test.tsx`'s existing/new tests; 1 pre-existing test in `DashboardPage.test.tsx` updated
  for the now-legitimate duplicate nav links, not worked around).
- `npm run build`, `npm run lint` (`oxlint`), `npx prettier --check src` — all clean.
- Real browser (Playwright, headless Chromium) at 375px and 1280px across Dashboard, History,
  Trends, and Settings — `BottomNav` visible/functional and `NavBar`'s links genuinely hidden
  (`display: none`, not just visually obscured) on mobile; the reverse on desktop; the FAB/
  `BottomNav` collision confirmed fixed via real bounding-box measurements; every page's bottom
  content clear of the bar after scrolling; no horizontal overflow at either width on any of the
  four pages; zero unexpected console errors. Throwaway user and one-off scripts/screenshots
  cleaned up; both dev servers stopped afterward.

---

## 2026-08-19 — Phase 6: Settings page grows a Profile section and an account deletion flow

**Task:** [Tasks.md](../../Tasks.md) Phase 6 — "Settings page: view/edit display name and
timezone; account deletion flow with a clear confirmation step (type-to-confirm or a two-step
dialog) per §15." Pairs with the backend work in
[Authentication — Backend](01-auth-backend.md)'s same-day entry, which builds the
`GET/PATCH/DELETE /api/users/me` endpoints this page calls.

### Background / concepts

#### Why a destructive action needs a _deliberate_ confirmation step, not just any confirmation

Requirements §15 calls for confirming destructive actions before they happen — but not every
confirmation is equally effective. A single "Are you sure?" dialog with a `Delete` button that
looks like any other button is easy to click through on autopilot, especially for someone who's
clicked "confirm" on a hundred other unrelated dialogs that day. **Type-to-confirm** — requiring
the exact word `DELETE` typed into a text field before the destructive button even becomes
clickable — is a stronger gate specifically because it can't be triggered by muscle-memory
clicking. It forces a moment of genuinely reading and typing, which is exactly the kind of
friction that's _appropriate_ for "permanently erase this person's health history," even though
that same friction would be an annoying, unjustified obstacle almost everywhere else in the app.

This is why the button starts out `disabled` and only becomes clickable once
`confirmationText.trim() === "DELETE"` — the gate lives in the button's own `disabled` state, not
in a second dialog someone could reflexively click through:

```tsx
const canDelete = confirmationText.trim() === DELETE_CONFIRMATION_PHRASE;
// ...
<Button type="button" variant="danger" onClick={handleDelete} disabled={!canDelete || deleting}>
```

#### Why the account-deletion `navigate()` happens _before_ `logout()`, again

This exact ordering — navigate to an unguarded route first, _then_ clear auth state — was already
established (and the bug that motivated it explained in detail) in this file's change-password
entry above. It applies identically here: `SettingsPage` is wrapped in `RequireAuth`, and clearing
auth state while still rendering a guarded route would let `RequireAuth`'s own redirect race this
one and overwrite its `state.message`. The account deletion flow reuses the identical pattern,
right down to passing a confirmation message through `navigate`'s `state`.

#### A `Button` component gains a third variant

`Button.tsx` previously only had `primary` (blue, used for most submit actions) and `secondary`
(neutral gray, used for the History page's per-entry delete, since re-logging a mistakenly-deleted
entry is cheap). Account deletion is not that — it's the single most consequential, hardest-to-undo
action anywhere in this app, so it got its own `danger` variant (a red background using the
`--color-danger` token that already existed in `index.css` but had no button styling built on top
of it yet):

```ts
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-surface-muted text-text hover:bg-border",
  danger: "bg-danger text-white hover:bg-danger/90",
};
```

Adding it as a proper variant (rather than overriding classes via the `className` prop on a call
site) avoids a real Tailwind footgun: two utility classes targeting the same CSS property (e.g.
`bg-brand` from the `primary` variant and a `bg-danger` passed in via `className`) don't reliably
override each other based on the order they appear in a single element's `class` attribute —
Tailwind's generated stylesheet order decides the winner, not source order on that one element.
A dedicated variant sidesteps the ambiguity entirely: only one background-color utility is ever
applied to a `danger` button in the first place.

### What was done

1. **`ProfileSection`** (new, inside `SettingsPage.tsx`): fetches `GET /api/users/me` on mount to
   populate a `displayName` text field and a `timezone` `<select>`; submits changes via `PATCH
/api/users/me`; shows a `role="status"` "Profile saved." confirmation on success, and a
   `role="alert"` error otherwise (`role="status"`/`role="alert"` are ARIA accessibility
   attributes that tell assistive technology like screen readers to announce this text
   automatically, without the user needing to navigate to it). The timezone `<select>` offers a deliberately short, curated
   list of ~20 common IANA zones (named time-zone identifiers like `"America/New_York"`,
   maintained in a standard reference list overseen by IANA, the Internet Assigned Numbers
   Authority) (not the full ~400-zone list `Intl.supportedValuesOf` — a built-in browser
   JavaScript function that can list all the values a given feature supports — could
   provide) — a dropdown with hundreds of entries is its own usability problem this task didn't
   call for building a fancier picker to solve. If the account's _current_ timezone isn't in that
   curated list, it's appended so the `<select>` never silently misrepresents the saved value.
2. **`AccountDeletionSection`** (new, inside `SettingsPage.tsx`): the type-to-confirm gate
   described above, calling `DELETE /api/users/me` once enabled, then `navigate("/login", ...)`
   followed by `logout()` — the same ordering, and the same reasoning, as the existing
   change-password flow just above it on the same page.
3. Added a `danger` variant to the shared `Button` component (described above).
4. `backend/tsconfig.json` needed one small unrelated fix to support this work's _backend_ half
   (`Intl.supportedValuesOf` typings) — covered in the paired backend log entry, not repeated here.
5. Tests added to `SettingsPage.test.tsx`: profile loads and displays the fetched values; saving
   sends the right `PATCH` body and shows the confirmation; a server-side validation error (e.g. an
   invalid timezone) surfaces as an inline error without crashing the form; the delete button stays
   disabled for a wrong-case or partial confirmation string and only enables on an exact `DELETE`;
   a successful deletion logs out and redirects to `/login` with a confirmation message; a failed
   deletion shows an error and does _not_ navigate away. The existing change-password tests needed
   updating too — `ProfileSection`'s own mount-time `GET /api/users/me` call meant every render of
   `SettingsPage` now fires an additional fetch alongside `AuthProvider`'s session-rehydration
   call, so the test helper switched from a strict, ordered sequence of `mockResolvedValueOnce`
   calls to a URL/method-matching `routedFetchMock` helper (the same style `DashboardPage.test.tsx`
   already uses, for the same underlying reason: multiple independent fetches firing on one mount,
   whose exact order isn't something a test should depend on).

### Why it's needed

Without this, requirements §15's account-deletion requirement (and Phase 2's backend endpoints)
would have no way for a real user to actually reach them — the API existing isn't the same as the
feature being usable. And without a genuine confirmation gate specifically, "delete my account" sits
one accidental click away from a health app permanently erasing someone's medical history, which is
precisely the kind of mistake a destructive-action confirmation step exists to prevent.

### Decisions

- **Type-to-confirm over a `window.confirm()` two-step dialog** (the pattern History's per-entry
  delete already uses) — deliberately a stronger gate for a stronger consequence, as explained
  above, and also more directly testable: `window.confirm` requires globally stubbing `window
.confirm` in every test that touches deletion, where a real form field is just another element to
  query and type into with the same tools every other test in this file already uses.
- **A real `danger` Button variant, not a one-off `className` override** — avoids the Tailwind
  same-property-two-classes ambiguity described above, and is now available to any future genuinely
  destructive action elsewhere in the app.
- **Sending the full `{ displayName, timezone }` object on every profile save**, even though the
  backend's `PATCH` accepts a true partial update — the form always has both fields populated once
  loaded, so there's no "only send what changed" case to handle on this side; the backend's partial-
  update support is exercised directly by its own tests instead.

### Verification

- Full frontend test suite (`npm test`, 145 tests across 24 files, all passing) — including the
  updated change-password tests, confirming the new `ProfileSection` mount fetch didn't silently
  break them.
- `npm run build` (`tsc -b && vite build`) and `npm run lint` (`oxlint`) both clean;
  `npx prettier --check` clean after formatting.
- Real, running-server, real-browser verification (Playwright via `playwright-core`, already a
  frontend dependency) against the actual dev server: registered a throwaway user, logged in
  through the real Login page, navigated to Settings via the real NavBar link, confirmed the
  Profile section loaded that user's real `displayName` from the API, edited both the display name
  and timezone and saved, **reloaded the page** and confirmed the new values round-tripped through
  a fresh `GET /api/users/me` rather than just reflecting unsaved local state, confirmed the delete
  button stayed disabled for a lowercase `"delete"` and only enabled once `"DELETE"` was typed
  exactly, then completed a real deletion and confirmed both the `/login` redirect with its
  confirmation message _and_ that logging back in with the same credentials now fails. The scratch
  Playwright script used for this was not committed.

---

## 2026-08-19 — Phase 6: forgot-password and reset-password pages

**Task:** [Tasks.md](../../Tasks.md) → Phase 6 → "Forgot password page (request reset email) and
reset password page (submit new password with reset token)." Both pages already existed as
literal stub components (`<p>Coming in a later phase.</p>`), already routed at `/forgot-password`
and `/reset-password` in `App.tsx` — this entry replaces the stub content with real forms wired
to the backend endpoints built in the matching entry in
[01-auth-backend.md](01-auth-backend.md).

**Delivered via branch:** `feature/2.6-forgot-reset-password` (same branch as the backend
endpoints — a vertical slice, the same shape earlier auth work in this project has followed).

### Background / concepts

#### `ForgotPasswordPage`: showing the backend's own generic message, not inventing a new one

- The backend entry explains why `POST /forgot-password` always returns the identical response
  regardless of whether the email matches an account — anything else would let an anonymous
  caller learn who's a registered user. That protection is only real end-to-end if the frontend
  doesn't undo it by branching on _anything_ the backend didn't actually send. This page has
  exactly one success state: on any `200` response, it shows "If that email is registered, a
  reset link has been sent." — the same text the backend already returns, not a page-level
  guess dressed up differently. There's no way for this component to show "email sent!" only for
  real accounts and something else otherwise, because the backend never gives it the information
  needed to make that distinction — which is precisely the point.

#### `ResetPasswordPage`: reading the token from the URL, and the "no token" state

- The reset link the placeholder mailer logs (and a real provider would eventually email) points
  at `${FRONTEND_URL}/reset-password?token=<rawToken>` — so this page reads `token` via
  `useSearchParams` from `react-router-dom` (already used elsewhere in this codebase, e.g.
  trends' period selector) rather than parsing `location.search` by hand.
- If someone lands on `/reset-password` with no `token` query param at all (a bookmarked or
  mistyped URL, not a real reset link), the page shows an explanatory message and a link back to
  `/forgot-password` instead of a form that would only fail once submitted. This is checked
  before rendering the form at all, not as a submit-time validation error — there's no
  password-strength rule that fixes a genuinely missing token, so there's no reason to make
  someone fill in two password fields first to discover that.
- The submit flow mirrors `SettingsPage`'s change-password form closely on purpose (same
  new-password/confirm-password client-side match check, same `passwordField` strength rules
  mirrored client-side, same `navigate("/login", { replace: true, state: { message } })` pattern
  `LoginPage` already reads and displays) — this is the same "prove identity, then get a fresh
  session" shape change-password already established, just via a different proof of identity.

#### The "Forgot password?" link on `LoginPage`

- One new link, `/login` → `/forgot-password`, placed directly under the password field (the
  conventional position for this link in most login forms) so it's discoverable at exactly the
  moment someone would need it — while they're already looking at the password field, having
  presumably just failed to enter it correctly.

### What was done

1. **`frontend/src/pages/ForgotPasswordPage.tsx`.** Replaced the stub with a real form: one
   email field, submits to `POST /api/auth/forgot-password` via `apiFetch(..., { skipAuth: true
})` (same as `login`/`register` in `AuthContext` — this call happens before any session
   exists, so there's no access token to attach and no 401-triggered refresh retry to attempt).
   On success, swaps the form out for the backend's own generic message (see above). On a
   `VALIDATION_ERROR` (malformed email), shows a friendly inline error instead of the generic
   backend message. Links back to `/login`.
2. **`frontend/src/pages/ResetPasswordPage.tsx`.** Replaced the stub with a real form: reads
   `token` from the URL via `useSearchParams`; shows an explanatory message instead of a form
   when it's missing; otherwise renders new-password + confirm-password fields with the same
   client-side validation `SettingsPage` uses, submits to `POST /api/auth/reset-password`
   (`skipAuth: true`, same reasoning as above), and on success navigates to `/login` with a
   success message in route state. Maps `INVALID_RESET_TOKEN` to a friendly "this link is
   invalid or has expired" message.
3. **`frontend/src/pages/LoginPage.tsx`.** Added a "Forgot password?" link under the password
   field, pointing at `/forgot-password`.
4. **Tests.** `ForgotPasswordPage.test.tsx`: submits and shows the generic success message
   (checked for both a real account and a nonexistent one, since the page's whole job is to show
   the identical message either way); shows a friendly error for a malformed email; the
   back-to-login link resolves to `/login`. `ResetPasswordPage.test.tsx`: rejects a weak password
   and a mismatched confirmation without calling the API (mirroring `SettingsPage.test.tsx`'s
   equivalent cases); full success path (asserts the exact request body sent, then the redirect
   to `/login` with the confirmation message); a friendly error for an invalid/expired token; the
   no-token state renders an explanation instead of a form.
5. **`npm test`** — 148/148 passing (9 new tests across the two page test files, the rest
   pre-existing).
6. **`npm run build`, `npx oxlint`, `npx prettier --check .`** — all clean.
7. **Real, browser-driven end-to-end verification**, via a throwaway Playwright script (not
   committed) against the actual compiled build served by real `vite`/backend dev servers:
   registered a user via the API, clicked the new "Forgot password?" link from a real
   `LoginPage`, submitted the forgot-password form and confirmed the generic message rendered,
   read the reset link the placeholder mailer logged to the running backend's own console,
   navigated to it, confirmed mismatched passwords show the client-side error, then submitted
   matching passwords and confirmed the redirect to `/login` carried the success message — and,
   as the final check, actually logged in through the real login form with the new password and
   confirmed it reached `/dashboard`. Both dev servers were run on non-default ports
   (`4010`/`5180`) to avoid colliding with sibling work using the default `4000`/`5173`, and were
   stopped afterward; the throwaway users created during both the `curl`-based backend
   verification and this browser verification were deleted from the (shared, local) Postgres
   instance afterward.

### Why it's needed

Both pages were the last remaining literal stub content in the auth flow — every other Phase 6
auth page (login, register, settings) already does real work. This is also the piece that
actually makes the backend endpoints from this same day's `01-auth-backend.md` entry reachable
by an actual person clicking through the app, not just `curl`.

### Decisions

- **Show the backend's own generic message verbatim, rather than composing a new one
  client-side.** Covered above — the privacy protection only holds end-to-end if the frontend
  doesn't introduce a distinction the backend deliberately doesn't provide.
- **A dedicated "missing token" state on `ResetPasswordPage`, checked before rendering the form,**
  rather than letting a token-less submission fail with a generic backend error. A missing token
  is a different situation from a wrong one (no form was needed at all to know something's
  wrong), so it gets a different, more specific message pointing back to
  `/forgot-password`.
- **Non-default ports for the manual dev-server verification.** Several sibling agents were
  verified to be running their own dev servers on the default `4000`/`5173` in parallel against
  the same shared repo/database during this work — using `4010`/`5180` instead avoided
  disrupting that work rather than requiring anyone's server to be killed.

### State at end of this step

The forgot-password/reset-password flow is fully built and wired end to end — backend endpoints,
frontend pages, and the link connecting them from `LoginPage` — and verified through both `curl`
and a real browser. The email-provider decision remains open (see the backend entry); everything
downstream of "a reset link exists" now works.

### Verification

- `npm test` — 148/148 passing.
- `npm run build`, `npx oxlint`, `npx prettier --check .` — all clean.
- Full browser-driven walkthrough of the real flow (see "What was done" above) — the
  verification script was deleted afterward, and the throwaway users it and the backend `curl`
  verification created were removed from the database.

---
