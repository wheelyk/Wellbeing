# A Real Push Delivery Test

## 2026-08-29 — Closing the last unverified link in the reminder chain

**Task:** The follow-up named at the end of [33-next-run-preview.md](33-next-run-preview.md).
That entry closed the gap between the picker and the scheduler, but ended by admitting what it did
not prove: **that a notification is actually sent.** `web-push` was mocked in every test, so the
entire delivery half of the feature — encryption, VAPID signing, the HTTP request itself — had no
coverage at all.

### Background / concepts

#### What a push notification actually involves

Sending one is more than an HTTP POST. The Web Push protocol requires the server to:

1. **Sign a VAPID JWT** with its private key, proving to the push service which application is
   sending — carried as an `Authorization: vapid ...` header.
2. **Encrypt the payload end-to-end** so the push service itself can't read it. The browser gave us
   a P-256 public key (`p256dh`) and a shared `auth` secret at subscription time; the server
   performs an ECDH exchange against them and encrypts with `aes128gcm`.
3. **POST the ciphertext** to the subscription's `endpoint` URL.

The push service then forwards it to the browser, which decrypts it in a service worker and shows
the notification.

Everything in steps 1–3 is code this project runs. Only the forwarding is someone else's.

#### Why mocking `web-push` hid so much

`vi.mock("web-push")` replaces all of that with a function that records its arguments. Those tests
are still valuable — they prove the scheduler _decides_ correctly — but they would pass just as
happily if the VAPID keys were malformed, the payload never encrypted, or the request never made.

The gap was not theoretical. Every reminder feature built over the last several entries — cron
schedules, multiple rules, the picker — sat on top of a delivery path that no test had ever
executed.

### What was done

A new `backend/src/lib/reminderDelivery.test.ts` that does **not** mock `web-push` and runs the
whole chain:

```
cron expression → scheduler tick → web-push (real VAPID signing, real aes128gcm encryption)
    → HTTP POST → decrypt → assert the exact notification text
```

- **The push service is a local HTTP server.** A subscription endpoint is just a URL; web-push has
  no idea FCM isn't on the other end.
- **The subscriber keys are real.** A genuine P-256 keypair via `crypto.createECDH` plus a 16-byte
  auth secret, exactly as a browser's `PushManager` produces. Holding the _private_ key is what
  makes the next point possible.
- **The payload is decrypted and asserted.** Using `http_ece` (already present, as web-push's own
  encryption dependency), the captured ciphertext is decrypted back to
  `{ title: "WellTrack", body: "Time to log Diazepam." }` — the exact copy the scheduler composed.

Five cases: a decryptable category notification, the VAPID/`Content-Encoding` headers a real
service requires, silence on a day the schedule excludes, the general reminder's own distinct
wording, and a `410 Gone` response genuinely deleting the subscription row.

### Why it's needed

It is the only test in the project that would fail if push delivery were broken.

### Decisions

- **`https.request` delegates to `http.request` for this file only.** web-push calls `https`
  unconditionally, since real endpoints are always TLS. The alternatives were committing a
  self-signed private key to the repo or depending on `openssl` being installed on every machine
  that runs the suite — both for _zero_ additional coverage of this project's own code, since what
  would be exercised is Node's TLS stack. Transport is the one thing swapped; the VAPID JWT,
  the ECDH exchange, the encryption and the socket are all real.
- **Decrypting the payload, not just asserting a request happened.** Checking that _something_ was
  POSTed would have passed even if the ciphertext were garbage. Decryption is what makes this a
  test of delivery rather than of plumbing.
- **A separate file, not an addition to `reminderScheduler.test.ts`.** That file mocks `web-push`
  globally, and it should keep doing so — its subject is the decision logic, and mocking makes
  those tests fast and focused. The two files answer different questions.

### Verification

- The new file passes on its own, three runs in a row: **5/5 each time**.
- **It was mutation-tested rather than trusted.** A new passing test can pass vacuously, so the
  scheduler's notification body was temporarily changed from `Time to log ${label}.` to
  `MUTATED ${label}.`. The test failed with a diff showing exactly that substitution — proving it
  genuinely decrypts and reads the real payload rather than asserting something trivially true. The
  change was then reverted and the absence of residue confirmed with `git diff`.
- `npx tsc --noEmit`, `npm run lint`, `npm run format:check`: clean.

#### An honest note on the suite as a whole

The full backend suite is **intermittently flaky, and this change did not cause it**. Roughly one
run in three sees one to four tests time out — always inside `registerAndLogin`, never with an
assertion failure, a different set each time.

Confirmed pre-existing by running the suite with this file **excluded**, which flaked the same way.
The cause is CPU saturation rather than the database: bcrypt at cost 12 is roughly a third of a
second of pure CPU per registration, most tests register two or three users, and 23 files run in
parallel on 12 cores.

Four configurations were tried and measured — default, a raised `testTimeout`, `maxWorkers: 4`, and
`maxWorkers: 6` with a raised timeout. Each reduced the rate; none eliminated it. The only setting
that held across repeated runs was `fileParallelism: false`, at roughly 3.5× the wall-clock time
(~215s vs ~35s).

**No configuration was shipped with this change.** A partial fix carrying a comment claiming it
worked would have been worse than none, and the speed-versus-reliability trade is a project
decision rather than something to smuggle into an unrelated PR. It is recorded here so the next
person meets a documented condition rather than rediscovering it.

This also corrects an earlier conclusion. The same symptom appeared during
[25-cron-reminder-schedules.md](25-cron-reminder-schedules.md) and was traced to Docker Desktop
shutting down; the config added for it was removed once that was found. That diagnosis was right
about _that_ incident but wrong as a general explanation — the flakiness recurs with Docker healthy
and up for 14 hours. Two distinct causes, one symptom; fixing the first did not fix the second.

### Known follow-ups

- **Decide the parallelism trade-off** for the backend suite, as above.
- **The service-worker half is still untested**: that the browser, on receiving a push, decrypts it
  and displays a notification. That's reachable via Chrome DevTools Protocol
  (`ServiceWorker.deliverPushMessage`) in a Playwright run, and would leave only the push service
  itself unexercised.

---
