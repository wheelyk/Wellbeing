# Reminders (Web Push)

## 2026-08-22 — Building web push reminders: the concepts, the architecture decision, and two real bugs found by actually running it

**Task:** Not a single [Tasks.md](../../Tasks.md) checklist item — the reminders/nudges feature
had been explicitly deferred pending an infrastructure decision (email vs. push). Discussed
directly first: email is a poor fit for a same-day "you haven't logged anything today" nudge -
not time-sensitive, easily buried in an inbox, no delivery guarantee - so **Web Push** was chosen
instead. Built across three stacked PRs: subscription storage + preferences, the scheduler that
decides who to notify and sends it, and the frontend service worker + Settings UI.

### Background / concepts

#### What "push" actually means, architecturally

A normal HTTP request only ever flows one way at a time, initiated by the browser - the backend
can't just reach out to a phone or laptop whenever it feels like it, the same way it can't reach
into a closed browser tab. **Web Push** solves this with a piece of infrastructure neither this
app's frontend nor backend controls: every browser vendor runs its own always-on **push service**
(Google runs one for Chrome, called **FCM** - Firebase Cloud Messaging; Mozilla runs "autopush"
for Firefox; Apple runs its own for Safari). When a user's browser subscribes a page to push, the
browser itself opens a standing connection to *its own vendor's* push service and hands back a
unique **endpoint URL** on that service - a real URL this project's own subscriptions look like
`https://jmt17.google.com/fcm/send/<random-id>` for a Chrome user. From then on, this app's
backend doesn't talk to the user's device at all - it POSTs the notification payload to that
endpoint URL, and the browser vendor's own infrastructure relays it to the actual device,
however that device happens to be connected (WiFi, cellular, whatever). This is why a backend
needs no special relationship with "the user's phone" - it only ever needs to reach a small
number of well-known push services, and the browser already told it which one and which specific
subscriber to send to.

#### VAPID: proving who's allowed to send, without a separate deal with every browser vendor

Before 2016, Chrome specifically required every website wanting to send push notifications to
register with Google and embed a Google-issued "GCM Sender ID" API key directly in the app - a
real coupling to one specific vendor's own developer program. **VAPID** (Voluntary Application
Server Identification) replaced this with a vendor-neutral standard: the *application* (this
backend, not any browser vendor) generates its own public/private keypair once
(`npx web-push generate-vapid-keys` - see `backend/src/lib/webPush.ts`), and every push it sends
is accompanied by a JWT signed with its own private key. Any push service - Google's, Mozilla's,
anyone's - can verify that signature against the matching public key without ever needing this
project to sign up for anything with them specifically. The public half of that same keypair is
also what the *browser* needs, at subscribe time, to prove to its own push service that "only the
server holding the matching private key is allowed to send to this subscription" -
`GET /api/push/vapid-public-key` exists purely to hand the frontend that one public value.

#### Service workers: the piece that can receive something with no page open

A push message arriving is only useful if *something* is running to notice it and show a
notification - and a browser tab isn't always open. A **service worker**
(`frontend/public/sw.js`) is a small background script the browser keeps running independently of
any particular page, specifically so it can react to events like an incoming push even when
nothing of this app is currently on screen. It's also why this file has to live at a plain,
unbundled URL (`/sw.js`) rather than inside the normal Vite-bundled `src/` tree - a service worker
needs its own real network-fetchable script location to register against, not something wrapped
up inside the app's own JS bundle.

#### When Web Push is actually a good fit, versus the real alternatives

- **Email** - free, universally supported, and this project already has the wiring
  (`backend/src/lib/mail.ts`'s placeholder, used for password reset) - but wrong for a
  same-day, "act now" nudge specifically: low urgency, easily filtered/ignored, and no reliable
  way to know it was ever actually seen.
- **Native mobile push** (Apple's APNs, Google's FCM used the *native-app* way, not the web way) -
  generally the most reliable option, and works even without a browser tab ever having been
  open recently - but requires an actual installed native app (or wrapping this web app in
  something like Capacitor), which this project doesn't have and isn't building.
- **SMS** - highest attention/urgency of any option, but costs real money per message, needs a
  phone number and a provider (e.g. Twilio), and feels meaningfully more intrusive - a poor fit
  for a low-stakes "did you log today" nudge.
- **Web Push** (chosen) - free, works from a plain web app with no app store involved, and
  reasonably immediate - but comes with real, known limitations worth stating plainly rather
  than glossing over: it needs an explicit permission grant (some users will decline), **iOS
  Safari doesn't support it at all unless the site has been added to the Home Screen first** (a
  real adoption barrier, not a bug - see `isPushSupported()` in
  `frontend/src/lib/pushNotifications.ts`, which shows a plain explanatory message instead of a
  broken toggle on unsupported browsers), and a subscription can go silently stale (browser data
  cleared, notifications revoked) - handled here by deleting a subscription
  `backend/src/lib/reminderScheduler.ts` finds reported as gone (410/404) by the push service
  itself, rather than retrying forever against something that no longer exists.

The right general lesson: Web Push is a good fit specifically for "a web app, no native app,
free reminders are fine, and the audience is mostly not on an un-installed iOS Safari tab" - not
a universal default over email or SMS for every notification need.

### What was done

1. **Task 1** (`feature/reminders-push-subscriptions`): Prisma `PushSubscription` model plus
   `reminderEnabled`/`reminderTime`/`lastReminderSentDate` on `User`; `web-push` for VAPID-based
   sending, validated lazily rather than at process startup so existing dev/test flows aren't
   broken by an unset key before this feature is ever used; `GET /api/push/vapid-public-key` and
   `POST`/`DELETE /api/push/subscribe`, with the same ownership-scoping discipline every other
   route in this app already follows.
2. **Task 2** (`feature/reminders-scheduler`): `reminderEligibility.ts`'s `shouldSendReminder` -
   a pure function, the same shape as `calculateStreak` (`lib/streak.ts`), unit-tested with
   plain string/boolean inputs rather than mocked timers. `reminderScheduler.ts`'s 5-minute
   in-process tick resolves each eligible user's own local time/day (reusing `timezone.ts`),
   checks whether they've logged anything yet today, and sends via `web-push` to every one of
   their subscriptions.
3. **Task 3** (`feature/reminders-frontend`): `frontend/public/sw.js`, `pushNotifications.ts`'s
   subscribe/unsubscribe helpers, and a new `RemindersSection` in Settings.

### Two real bugs, found only by actually driving a real browser

Every unit and integration test in this feature passed from the start - none of them could have
caught either of these, because neither jsdom nor a mocked Push API has the real timing behavior
involved. Both were found by literally registering an account, clicking the real UI, and reading
what actually happened (the same "build it and run it" discipline this whole project follows),
against **headed** Chromium specifically - headless Chromium doesn't support the Push API's real
registration handshake at all (`AbortError: Registration failed - push service not available`),
and Chromium also disables Push entirely in incognito-style contexts, so `browser.newContext()`
(Playwright's default) had to be swapped for `launchPersistentContext` with a real profile
directory to even get a fair test - both genuinely real Chromium constraints, not this app's own
bugs, but worth knowing before anyone else tries to script-verify push notifications.

#### Bug 1 — `serviceWorker.ready` can resolve before the worker is actually `"activated"`

`navigator.serviceWorker.ready` is documented as resolving once a registration has an active
worker - and it does - but the worker it hands back can still report `state === "activating"`,
not yet `"activated"`, at that exact moment. Calling `pushManager.subscribe()` while a worker is
still in that in-between state didn't reject with a clear error - it **hung indefinitely**,
confirmed directly by adding step-by-step logging around a real subscribe attempt. The fix:
explicitly wait for the worker's own `statechange` event to report `"activated"`
(`waitForActivation` in `pushNotifications.ts`) before ever calling `subscribe()`.

#### Bug 2 — the classic "check, then listen" race, found *while fixing bug 1*

The first version of that fix still occasionally hung. The reason is a general concurrency
pattern worth knowing well beyond this one feature: checking a value, and *then* attaching a
listener for it to change, leaves a real gap - if the value changes in between the check and the
listener being attached, that change's own event fires with nobody listening yet, and is lost
forever. Here specifically: the worker could finish activating in the moment between reading
`worker.state` and calling `addEventListener("statechange", ...)`, and the wait would then never
resolve, because the one event it needed had already come and gone. The fix is a standard one for
this exact shape of race: **re-check the value synchronously, immediately after attaching the
listener**, so a transition that already happened is caught by the manual re-check instead of
depending on an event that may never come again. A dedicated unit test
(`pushNotifications.test.ts`) simulates exactly this ordering with a fake service worker object,
confirmed to fail without the re-check and pass with it.

### Why it's needed

Both bugs are the kind that a mocked test environment structurally cannot surface - jsdom has no
real service worker lifecycle to race against at all. This is the same lesson this project has
already learned more than once (a redirect race, a shared-mock test bug) applied to a new corner
of the app: for anything with genuine timing/interaction risk between two real, independently-
running things (here, this app's own JS and the browser's own service worker lifecycle), driving
the real thing end-to-end is what finds what a unit test never will.

### Decisions

- **VAPID + `web-push`, not a third-party push-as-a-service product.** VAPID is the open,
  vendor-neutral standard every major browser already supports directly - reaching for a paid
  wrapper service would add a dependency and a cost for something the browser platform itself
  already provides for free.
- **A generic "you haven't logged anything today" nudge for v1, not per-medication dose
  reminders.** Confirmed directly: per-medication reminders are a materially larger, separate
  feature (recurring per-item schedules, not a single daily check) - explicitly out of scope
  here, tracked as a real future task rather than scope-crept into this one.
- **Lazy VAPID-key validation, not eager (unlike the JWT secrets).** The JWT secrets are needed
  by literally every authenticated request; VAPID keys are only needed once someone actually
  tries to use this feature, so failing at process startup on an unset value would break every
  *other* route for a feature nobody may have touched yet.
- **`headless: false` and a persistent profile for manual verification, not Playwright's usual
  defaults.** Both were required to get an honest read on real Push API behavior at all -
  documented directly in this entry so nobody re-discovers this the hard way debugging a
  mysterious "push service not available" error later.

### State at end of this step

All three tasks build and test cleanly. The two real timing bugs are fixed and independently
regression-tested. Full manual verification confirmed the entire pipeline end-to-end against
real infrastructure: a real browser subscribing via a real Google FCM endpoint, a real
`PushSubscription` row persisted, and the real scheduler tick correctly identifying the account as
eligible and successfully sending through `web-push` to that same real endpoint.

**Still needed before this is usable in production:** real VAPID keys added to Railway's
Variables tab (a local dev keypair already exists in `backend/.env`, gitignored; production needs
its own, generated the same way) - the same manual, one-time step already done for the JWT
secrets.

### Verification

- `npm test` (backend and frontend, across all three tasks): all passing, including the new
  pure-logic tests for `shouldSendReminder` and `waitForActivation`, and integration tests for
  the scheduler's real database wiring (with `web-push`'s actual network call mocked in the
  automated suite).
- Confirmed both new regression tests actually catch their respective bugs: temporarily reverted
  each fix in isolation, watched the corresponding test fail, then restored the fix and watched
  it pass again.
- **Full real-browser, real-infrastructure manual verification** (headed Chromium, a persistent
  profile, a real throwaway account, cleaned up afterward): registered → enabled reminders in
  Settings → granted the real notification permission prompt → confirmed a real
  `PushSubscription` row landed in the database with a genuine `jmt17.google.com/fcm/send/...`
  endpoint → manually triggered the real scheduler tick against that same account → confirmed it
  correctly identified the account as eligible, attempted a real send via `web-push`, and updated
  `lastReminderSentDate`.
- `npm run build`, `npm run lint`, `npx prettier --check` (both projects): all clean.

---

## 2026-08-23 — Production verification, and a third real bug: losing the user gesture between click and permission request

**Task:** Not a new feature — verifying this feature actually works against production now
that real VAPID keys exist, and following up on what that verification found.

### What was done

Generated a fresh production VAPID keypair, walked through adding it to Railway's Variables tab
on the correct (backend) service, and confirmed via a throwaway account that
`GET /api/push/vapid-public-key` returned the real key (`200`, matching what was configured) —
it had initially kept returning the pre-configuration `500` even after the variables were added,
because Railway hadn't yet run a fresh deployment to load them into the running process (adding
variables alone didn't trigger one here); a manual redeploy from the Railway dashboard fixed
that. This mirrors this project's own recurring lesson about environment configuration: a value
being *set somewhere* isn't the same as it being *loaded into the process that reads it*.

With the backend confirmed working, a real end-to-end check on an Android phone (Chrome, over
the actual deployed frontend) surfaced a genuine bug: enabling reminders in Settings always
reported "Notifications were blocked" — but the site was never actually listed as blocked in
Chrome's own Site Settings, meaning the browser's notification permission for the site was still
`default`, not `denied`.

**Root cause:** `RemindersSection`'s submit handler
(`frontend/src/pages/SettingsPage.tsx`) did `await apiFetch(".../vapid-public-key")` *before*
calling `subscribeToPush` (which is what actually calls `Notification.requestPermission()`).
Browsers only treat a permission request as tied to the user's own click for a short window
after that click — an awaited network round-trip in between is enough to lose it, and when that
happens, mobile Chrome specifically auto-rejects the request *silently*, without ever showing
the real permission prompt and without persisting an actual site-level "blocked" decision. The
app's own error message ("blocked") was technically accurate for that one call, but confusingly
implied a persisted browser-level block that had never actually happened — hence not finding it
listed anywhere to un-block.

**Fix:** fetch the VAPID public key once, in the same `useEffect` that already loads the user's
profile on mount, and have the submit handler use that cached value directly. Enabling reminders
now calls `subscribeToPush` with no `await` in front of it inside the click handler's own call
stack, preserving the gesture all the way to `Notification.requestPermission()`.

### Why it's needed

Same general lesson as the two bugs found while first building this feature: a mocked test
environment can't surface this either — jsdom has no concept of "user activation" at all, so
every existing automated test for this flow passed both before and after the fix. This one
needed a real phone, a real click, and a real (initially slow enough) network round-trip to
show up at all.

### Decisions

- **Pre-fetch on mount, not lazily on first use.** The public key rarely changes and is cheap to
  fetch once; the alternative (fetching lazily but somehow "close enough" to the click) is fragile
  and depends on network timing rather than removing the await entirely.
- **Fail silently if the pre-fetch fails**, rather than surfacing a separate error before the user
  even tries to enable reminders — `handleSubmit`'s own existing guard (`vapidPublicKey` still
  `null`) already reports a clear error at the point the user actually acts, so a second, earlier
  warning would be redundant.

### Verification

- `npm test` (frontend): full suite green (235 tests), including the existing
  `SettingsPage — reminders` tests, unchanged — they already mocked
  `GET /api/push/vapid-public-key` per-test, which now simply gets hit on mount instead of on
  submit.
- `npx tsc --noEmit`: clean.
- Production: re-verified `GET /api/push/vapid-public-key` returns `200` with the real key via a
  throwaway account (registered, checked, deleted via `DELETE /api/users/me`).
- **Still to be manually re-confirmed**: enabling reminders on the same Android phone that
  originally surfaced this bug, to see the real permission prompt appear (rather than the
  silent-deny message) now that the gesture is preserved.

---
