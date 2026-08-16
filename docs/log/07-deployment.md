# Deployment (Railway + Vercel)

## 2026-08-15 — Hosting and domains, explained (ahead of actually deploying)

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the user asked how to get the app
published on the web to try it out. This entry covers the concepts *before* any actual
deployment work happens, since none of Phase 14 has been started yet and none of this has
been explained in this log before.

### Background / concepts

#### Why "it runs on my laptop" isn't the same as "it's on the web"

- Every server started in this log so far (`node dist/index.js`, `npm run dev`, `npm run
  preview`) only listens on `localhost` — a special address that only means anything *on the
  machine it's running on*. Nobody else, anywhere, can reach `http://localhost:4000` from
  their own computer, no matter how it's phrased — it's not a privacy setting, it's what
  "localhost" fundamentally means (literally "this computer," not a real place on the
  internet). **Hosting** means running the exact same kind of server, but on a machine that
  (a) has a real, internet-reachable address, and (b) stays switched on and connected
  continuously, instead of only existing while this laptop happens to be open with a terminal
  running. A hosting *platform* (Railway, Vercel, SmarterASP.NET, etc.) is a company that
  provides and manages those always-on machines so nobody has to buy, rack, and maintain
  physical server hardware themselves.

#### What a domain name actually is, and what a registrar does

- Every server on the internet is ultimately reachable by a numeric **IP address** (e.g.
  `76.76.21.21`) — domain names like `athirstycamel.com` exist purely as a human-friendly
  substitute for those numbers, the same idea as a phone contact list mapping "Mum" to an
  actual phone number nobody wants to memorize.
- A **domain registrar** (whichever company issued the screenshot's `athirstycamel.com` —
  Namecheap, GoDaddy, IONOS, and dozens of others all do this) is a company accredited to
  register domain names on your behalf with the actual central registries that operate each
  suffix (e.g. Verisign runs the master database for every `.com` domain that exists;
  Nominet runs it for `.uk`). Buying a domain isn't a one-time purchase of property you then
  own outright — it's closer to a renewable lease: registration is sold in yearly (or
  multi-year) terms, and the domain stops being yours if it isn't renewed (the screenshot
  shows `athirstycamel.com`'s current term running to **6 January 2027**).
- **WHOIS privacy** (the toggle in the screenshot, currently "PRIVACY OFF") controls whether
  the domain owner's real name/address/email are published in WHOIS — a public, historically
  unrestricted lookup database of who owns which domain. Turning it **on** replaces those
  details with the registrar's own proxy contact instead — worth doing for a personal project
  unless there's a specific reason not to, since WHOIS data is scraped constantly (mostly by
  spammers).
- **Critically: a registrar only sells the *name*. It has nothing to do with hosting.**
  Owning `athirstycamel.com` today doesn't mean any web page exists there yet — right now it
  just points at nothing in particular. This is one of the most common points of confusion
  for someone hosting a project for the first time: the domain and the server the domain
  eventually points *at* are typically two completely separate services, from two completely
  separate companies, billed separately — exactly the situation here (domain at one
  registrar, app about to be hosted on Railway/Vercel).

#### DNS: how a domain actually gets pointed at a host it wasn't bought from

- **DNS** (Domain Name System) is the global lookup system that answers "what does this
  domain name actually point to right now?" A **DNS record** is one specific answer to one
  specific kind of question about a domain. The ones that matter for pointing a domain at a
  host:
  - An **A record** maps a name directly to an IPv4 address (e.g. "the root domain
    `athirstycamel.com` → `76.76.21.21`").
  - A **CNAME record** maps a name to *another name* instead of a raw address (e.g. "`app.
    athirstycamel.com` → `cname.vercel-dns.com`") — used when the host's actual server address
    might change over time; the host keeps their own name up to date, so anything pointing at
    that name via CNAME automatically follows along without the domain owner ever touching
    DNS again.
  - **Nameservers** are one level up from individual records — they're *who's in charge of
    answering DNS questions for this domain at all*. Every domain has nameservers assigned at
    the registrar; by default they're the registrar's own.
- **Two different ways to point a domain at a host that isn't the registrar**, both valid,
  with a real tradeoff:
  1. **Change the domain's nameservers** to the host's nameservers (or a dedicated DNS
     provider like Cloudflare's). This hands over *all* DNS control for the domain to
     whoever's nameservers are now set — simplest when the destination offers full,
     easy-to-use DNS management, but it means every other record the domain might need (e.g.
     `MX` records for email, seen as one of the registrar's own KB articles in the
     screenshot: "How to setup MX records for Google Mail/Gmail?") has to be re-added at the
     new location too, or that functionality silently breaks.
  2. **Keep the registrar's nameservers, and add specific records there instead** — just one
     A or CNAME record pointing at the host, added directly in the registrar's own DNS
     management page, leaving everything else (existing email routing, other subdomains)
     completely untouched. This is the more surgical, generally safer option when a domain
     already has other things depending on it, and is what Vercel's and Railway's own custom
     domain instructions default to recommending: add the specific record they give you,
     rather than moving nameservers.
- **DNS changes are never instant.** Every DNS record has a **TTL** (time-to-live) — how long
  other computers are allowed to remember ("cache") an old answer before checking again.
  Depending on the TTL and how aggressively various internet providers cache things, a DNS
  change can take anywhere from a couple of minutes to (rarely, worst case) 24–48 hours to be
  visible everywhere. This is why "I updated the DNS and it still shows the old thing" a few
  minutes later is normal and not a sign anything's broken.
- **HTTPS gets provisioned automatically, but only after DNS is actually correct.** Modern
  hosts like Vercel and Railway automatically obtain a free TLS/SSL certificate (via Let's
  Encrypt) for a custom domain once they can see it's correctly pointed at them — this isn't
  a separate step to configure. This matters concretely for this project: the refresh-token
  cookie's `secure` flag (from the Phase 2.3 entry) is only set outside local development,
  meaning it *requires* real HTTPS to work at all in production — one more reason "add the
  custom domain" and "get a working login" are linked, not independent steps.

#### UK-specific considerations, since that's where this project's user is based

- **This app stores health data — UK GDPR calls this "special category data,"** subject to
  extra protection requirements beyond ordinary personal data, under both the UK GDPR and the
  Data Protection Act 2018. Nothing about deploying a still-fake-data MVP to try it out
  triggers those obligations by itself (no real person's actual health information exists in
  this system yet), but it's exactly the kind of thing to get right *before* any real user's
  data is ever entered — consistent with requirements §14 ("Privacy Requirements"), which
  already exists in this project's own spec for this reason.
- **Server region matters more here than for a typical hobby project.** Both Vercel and
  Railway let you choose which physical region a deployment runs in (e.g. US-East vs.
  Europe). For a health-data app specifically, choosing an EU/UK-region deployment once real
  user data is involved is a sensible precaution against unnecessary international data
  transfer — worth setting correctly from the first real deployment, rather than migrating a
  live database's region later, which is a meaningfully bigger job than picking a dropdown
  now.
- **Billing is in USD by default** on both Vercel and Railway — a UK card will still work
  fine, but expect the usual small foreign-currency conversion handled by the card network,
  not by either platform. Neither platform charges UK VAT directly to an individual on their
  free/hobby tiers in the way a UK-based service might; this is worth re-checking on their
  own pricing pages if this ever moves from "personal project" to something billed as a real
  product.
- **The ICO data protection fee** — UK organisations that process personal data are generally
  required to pay an annual fee to the Information Commissioner's Office and register as a
  data controller, with some small exemptions. Not a concern for a personal MVP with no real
  users, but relevant to know about before this project ever has genuine users' health data
  in it for real.
- **The existing `athirstycamel.com` domain is a `.com`, not a `.uk`/`.co.uk`.** No technical
  reason it needs to change — `.com` works identically for hosting purposes regardless of
  where the site owner or its users are based; a UK-specific TLD is purely a branding choice,
  not a requirement.

### Why it's needed

Deploying this project for real (Railway + Vercel, per the earlier conversation) is about to
involve account creation, DNS changes, and region selection — all much easier to do correctly
once the underlying concepts (what a registrar actually sells, how DNS redirection works, why
two separate hosts need two separate DNS records) are clear, rather than following steps
without knowing why each one matters.

### State at end of this step

No deployment has happened yet — this entry is purely explanatory, written ahead of the
actual Railway/Vercel account setup and deployment work, which continues as its own
conversation thread from here.

---

## 2026-08-15 — Why migration should stay easy, what a "build artifact" is, and how deployment actually works

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — written while the user was creating
Vercel and Railway accounts, covering three things asked about directly: why migrating away
from either platform later should be low-friction, what actually gets built and deployed, and
how to sanity-check a hosting platform's signup/terms as a beginner without a lawyer on hand.

### Background / concepts

#### Why this project should be easy to move off Vercel/Railway later

- **"Vendor lock-in" means a codebase becomes written *against* a specific platform's own
  proprietary features**, not just *hosted on* it — e.g. calling a platform-specific database
  service's own SDK directly, or writing serverless functions in a format only that platform
  understands. Once that happens, leaving isn't just "redeploy elsewhere" — it means rewriting
  the parts of the app that only make sense on the platform being left.
- **This project never did that, for either half of the stack** — not as a specific
  anti-lock-in decision made along the way, but as a natural consequence of building against
  plain, standard technology from the start: the backend is ordinary Express reading
  `process.env.DATABASE_URL` and talking to it via Prisma (which works identically against
  *any* real PostgreSQL server, not a proprietary Railway-flavored one); the frontend is a
  plain Vite build producing ordinary static files, with zero calls to any Vercel-specific
  API. Neither Railway nor Vercel is *needed* by anything in the source code — they're just
  where it happens to run right now.
- **The one piece with real (but standard, not proprietary) migration work is the database.**
  Moving the *code* to a different host is close to free — any Node host can run
  `node dist/index.js`, any static host can serve a `dist/` folder. Moving the *data* means an
  actual export/import step (`pg_dump` / `pg_restore`, or Prisma's own migration files
  replayed fresh against a new empty database) — not because of anything Railway-specific,
  simply because databases hold state that has to be physically copied somewhere else,
  regardless of which two providers are involved.

#### What a "build artifact" actually is, concretely, for each half of this project

- A **build artifact** is the actual thing produced by a build step — the output a computer
  runs or serves, as opposed to the human-authored source code that generated it. This
  project already produces one for each half, and has since very early in this log:
  - **Backend artifact:** `npm run build` runs `tsc`, compiling every `.ts` file in `backend/src`
    into plain `.js` in `backend/dist`. The artifact is that compiled JavaScript —
    it's what actually executes in production (`node dist/index.js`), never the original
    TypeScript directly (Node.js has no idea what TypeScript syntax even means; `tsc`'s entire
    job is translating it into something Node.js does understand).
  - **Frontend artifact:** `npm run build` runs `tsc -b && vite build`, producing
    `frontend/dist` — but unlike the backend, this artifact is **pure static files**: one
    `index.html`, a handful of `.js`/`.css` bundles, nothing else. Critically, *nothing* about
    running this artifact requires Node.js, or any server-side logic at all — a static file
    server just hands these exact bytes to whichever browser asks for them.
- **This distinction is exactly why the two halves of this app need two different *kinds* of
  hosting**, not just two different hosting companies: the backend artifact is a program that
  has to be *kept running continuously* (Railway's specialty — see the earlier entry
  comparing Railway/Render/Fly.io); the frontend artifact is a pile of static files that just
  need to be *served efficiently to lots of browsers*, ideally from servers physically close
  to each visitor (Vercel's specialty, via what's called a CDN — a network of servers in many
  locations all holding a copy of the same static files).

#### How "deployment" actually works on platforms like these (git-based Continuous Deployment)

- Every manual "build it, then run it" step throughout this entire log so far has been done
  by hand, on this one laptop. **Continuous Deployment (CD)** — the natural next step after
  the **Continuous Integration (CI)** already set up via GitHub Actions — means a hosting
  platform does that same build-and-run sequence *automatically*, triggered by a `git push`,
  instead of a person doing it manually.
- **The general mechanism, common to Railway, Vercel, and most modern hosting platforms:**
  connect the platform to a GitHub repository once; from then on, every push to a chosen
  branch (typically `main`) makes the platform automatically clone the repo at that commit,
  run the project's install and build commands (e.g. `npm ci && npm run build` — the exact
  same commands used manually throughout this log), and then either start the resulting
  server process (Railway) or publish the resulting static files (Vercel). Many platforms,
  Vercel included, also build a temporary **preview deployment** for every open pull request —
  conceptually the same idea as this project's own PR screenshot workflow, just done natively
  by the hosting platform itself rather than a custom GitHub Actions job.
- **What's still left to configure, specific to this being a monorepo:** both platforms need
  to be told *which subfolder* is the actual app to build, since `frontend/` and `backend/`
  each have their own separate `package.json` rather than one at the repo root — this is a
  "root directory" setting on both Railway and Vercel, not something they can guess correctly
  on their own. Environment variables (`DATABASE_URL`, `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `FRONTEND_URL` for the backend; `VITE_API_URL` for the frontend) also
  need to be entered into each platform's own settings — this is the production equivalent of
  the local, git-ignored `.env` files used throughout local development, just stored in the
  hosting platform's UI instead of a file on this laptop.

#### How to sanity-check a platform's signup terms as a beginner, without a lawyer

- Legal text reads as alarming mostly because it's unfamiliar, not because it's usually
  unusual — most cloud hosting companies' terms cover the same handful of legally-required
  bases, in similar language, because they're responding to the same laws (e.g. DMCA
  copyright-takedown compliance is a specific, standard requirement for US-based hosts to
  qualify for certain legal protections — it's not a company-specific choice).
- **What's normal, seen directly in Railway's own signup summary:** an age requirement;
  "we'll email you" (account/billing notifications); "we can act on your behalf toward
  services like GitHub" (this is just naming the OAuth connection itself — reading your repo,
  setting up the push-triggered deploy described above); "you grant us a license to what you
  host" (hosting fundamentally means copying and running your code on someone else's
  computer — some form of license is *legally required* for them to be allowed to do that at
  all, and reputable platforms scope it narrowly to "what's needed to provide the hosting
  service," not an unrelated claim on the code itself); "you're responsible for what you
  host" and "provided as-is" (standard liability limitation, present in nearly every software
  ToS ever written, this project's own MVP included implicitly); copyright-takedown
  compliance (the DMCA point above).
- **What would actually be worth stopping over, for contrast** — none of it present in either
  Railway's or Vercel's flow, but worth knowing as genuine red flags on any future platform:
  being asked for the actual *password* to another service (GitHub, Google) instead of a
  proper OAuth "Continue with X" button — legitimate integrations never need a raw password,
  only a scoped, revocable token; a content license that explicitly claims rights to use
  uploaded content for the *platform's own* unrelated purposes, or that survives account
  deletion; requiring payment details before any pricing or free tier is even shown; no stated
  way to export or delete your own data.
- **How much scrutiny is proportionate depends on what's actually at stake.** For this
  project's current stage — a personal MVP, fake test data, no real users — reading the
  human-readable summary (as Railway shows before the full document) is reasonable due
  diligence. This changes once real users' health data is genuinely involved: at that point,
  per the earlier UK GDPR entry, it's worth specifically checking whether the hosting platform
  offers a **Data Processing Agreement (DPA)** — a separate, standard document confirming they
  handle personal data on your behalf under GDPR's rules — which both Vercel and Railway do
  offer, but which isn't something a personal hobby project needs to chase down yet.

### Why it's needed

Account creation and the first real deploy are happening in this same conversation, right
after this entry — understanding what's actually being agreed to, and what the platforms are
about to do with a `git push`, matters more in the moment it's happening than as an
after-the-fact summary.

### State at end of this step

No deployment has happened yet. The user is completing GitHub-based signup on both Vercel and
Railway; actual project configuration (root directory, environment variables, first deploy)
is the next step once both accounts exist.

---

## 2026-08-15 — First real Railway deploy attempt: the monorepo build failure, `package.json`, and what a "server" actually is

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the user connected this repo to a real
Railway project and hit an expected first failure. This entry explains what actually happened,
why `package.json` is the thing every Node hosting platform looks for, what `npm` is really
doing when it "builds" and "starts" something, and answers a question asked directly: is the
running backend basically a console app that listens for requests?

### Background / concepts

#### What actually happened on the first build attempt

- After connecting the GitHub repo, Railway's build system (called **Railpack** — their own
  tool for looking at a pile of source code and figuring out how to build and run it, the same
  general idea as the older, more widely-known "buildpacks" concept popularized by Heroku)
  cloned the repo and tried to figure out what kind of project it was looking at — by default,
  starting from the **repository root**.
- The repo root has no `package.json` at all (only `frontend/package.json` and
  `backend/package.json`, in their own subfolders — a direct consequence of this being a
  monorepo, first explained back in the very first Phase 0 entry). Railpack's own error was
  exactly this: *"Railpack could not determine how to build the app,"* followed by a list of
  languages/frameworks it knows how to recognize (Node included) — it wasn't that Railway
  doesn't support Node.js, it's that it found **nothing recognizable at the location it looked**.
- The fix — setting the service's **Root Directory** to `backend` — tells Railway "treat this
  subfolder as the entire project," so every subsequent step (installing dependencies,
  building, starting) runs from inside `backend/` specifically, completely ignoring
  `frontend/` for this particular service. This is a standard, expected setting for monorepos
  on essentially every hosting platform, not a Railway quirk — Vercel will need the equivalent
  "Root Directory" set to `frontend` for the same reason once that side is configured.

#### Why `package.json` specifically is what every tool looks for first

- `package.json`, first introduced back in the Phase 0 backend-scaffold entry, is a Node
  project's **manifest** — its name, version, list of dependencies, and (most relevant here)
  a `"scripts"` section defining named, reusable commands. This project's `backend/package.json`
  has, among others:
  ```json
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
  ```
- **This is a universal convention across the entire Node.js ecosystem**, not something
  specific to this project or to Railway — literally every Node tool, from a developer's own
  terminal to Railway's Railpack to Vercel's build system, treats "does a `package.json`
  exist, and what's in its `scripts` section" as the standard, first place to look for "how do
  I build/run this." That's precisely *why* Railpack's error was about not finding a
  recognizable project, rather than some Railway-specific configuration file being missing —
  it's looking for the same file any Node developer would look for by hand.

#### What `npm` is actually doing when it "builds" and "starts" the app

- **`npm`** (Node Package Manager) has two related but distinct jobs, both relevant to
  deployment:
  1. **Installing dependencies** (`npm install`, or `npm ci` for a clean, reproducible
     install from the exact versions locked in `package-lock.json`) — downloads every package
     listed in `package.json`'s `dependencies`/`devDependencies` into `node_modules/`, since
     none of that code is committed to git (as established all the way back in the first
     Phase 0 entry's `.gitignore`).
  2. **Running named scripts** (`npm run <name>`) — looks up `<name>` inside the `"scripts"`
     object and runs whatever shell command is written there. `npm run build` runs `tsc`
     (compiling TypeScript into the `dist/` artifact, per the previous entry); `npm start` runs
     `node dist/index.js` — note `start` (and `test`) are the two script names npm lets you run
     *without* the word `run` (`npm start` instead of `npm run start`), a long-standing npm
     convenience for these two especially common script names, not a difference in what's
     actually happening underneath.
- **This is exactly the mechanism Railway (and virtually every similar platform) relies on to
  deploy *any* Node project without needing project-specific instructions from a human**: run
  `npm install` (or `npm ci`), then run whatever's in the `"build"` script if one exists, then
  run whatever's in the `"start"` script to actually launch it. Nothing about this is
  Railway-specific configuration — it's the exact same three commands used by hand, over and
  over, throughout this entire log (`npm install`, `npm run build`, `npm start`/
  `node dist/index.js`), just triggered automatically instead of typed manually.

#### Is the running backend "like a console app listening for requests"? Yes — precisely that.

- **`node dist/index.js` starts an ordinary command-line program.** `node` itself is a console
  application, invoked from a terminal exactly like any other CLI tool — there is no hidden
  "server mode" separate from just running a program. What makes it behave like a *server*
  specifically is one line of this project's own code, `app.listen(port, ...)` (present since
  the very first backend-scaffold entry) — that line tells the operating system "open a
  network listening socket on this port and hand me any data that arrives on it."
- **After that line runs, the program does not exit.** A typical simple console program runs
  top to bottom and finishes. This one instead falls into Node's **event loop** (mentioned
  back in the Phase 2 entries) — an idle waiting state that does nothing at all until some
  event wakes it up. For this program, "an event" specifically means "a new HTTP request
  arrived on the listening socket" — at which point the matching Express route handler runs
  (e.g. the register/login logic from Phase 2), a response gets written back, and the process
  goes back to idling, ready for the next one. It can sit idle indefinitely — this is normal,
  not a hang.
- **The useful comparison, stated directly:** an ordinary console program reads input from the
  keyboard (`stdin`) and writes output to the terminal screen (`stdout`). This program instead
  reads input from a network socket and writes output back to that same socket — otherwise,
  it's the same fundamental shape of program: something that starts, waits for input, reacts,
  and repeats, with no graphical interface at all. There's no special "server" category of
  program distinct from a console app — a server is just a console app whose input/output
  happens to be a network connection instead of a keyboard and screen. **What actually makes
  something "hosted" isn't anything about the program itself — it's simply that Railway keeps
  this exact same kind of process running continuously, on a machine that stays switched on
  and network-reachable, and automatically restarts it if it ever crashes** — the concrete,
  process-level meaning of "hosting" introduced conceptually in the earlier hosting/domains
  entry.

### Why it's needed

Understanding *why* Railway looked where it looked, and *what* "build" and "start" actually
mean, makes the fix (Root Directory) make sense as a consequence of how Node tooling works in
general, rather than an arbitrary Railway setting to memorize. It also directly answers a
question asked mid-deployment rather than leaving "is this basically a console app" as an
unresolved curiosity.

### State at end of this step

Root Directory has been set to `backend` on the Railway service; a fresh build was triggered
automatically as a result. Not yet confirmed successful — that's the next thing to check.
Environment variables (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`FRONTEND_URL`) and the Postgres database service itself still need to be added before the
backend can actually start successfully even once it builds, since none of those exist in this
Railway project yet.

---

## 2026-08-15 — Fixing the real Railway build failure: `postinstall` and Prisma's generated client

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — after fixing the Root Directory setting,
Railway's rebuild failed again, with an error that turned out to be an old friend rather than
a new problem.

### Background / concepts

#### The error was the exact same missing-generated-client bug already diagnosed once

- Railway's build log showed `error TS2307: Cannot find module '../generated/prisma/client'`
  — the identical failure the very first GitHub Actions CI run hit, diagnosed in the earlier
  CI entry: `backend/src/generated/prisma/` is **git-ignored** (it's reproducible output, the
  same reasoning as `dist/`), so it simply doesn't exist anywhere until something explicitly
  runs `npx prisma generate`. The GitHub Actions fix at the time was adding an explicit
  "Generate Prisma client" *step* to that one workflow file — which fixed CI, but did nothing
  for Railway, since Railway has no knowledge of `.github/workflows/pr-preview.yml` at all;
  each hosting platform runs its own, completely separate build process.
- **This time, fixed it once, for every platform, instead of once per platform.** Rather than
  hunting for "Railway's equivalent of a custom build step" and adding a second,
  Railway-specific fix, the actual fix applied here is Prisma's own officially documented
  deployment pattern: add a `"postinstall"` script to `package.json`. npm automatically runs
  a package's `postinstall` script immediately after `npm install` (or `npm ci`) finishes,
  *no matter which tool or platform invoked that install* — a person running `npm install` on
  their own laptop, Railway's build system, a hypothetical future platform, all trigger it
  identically. This guarantees `prisma generate` always runs as a direct consequence of
  installing dependencies, rather than depending on every single place this project ever gets
  built remembering to add its own separate "generate the client" step by hand.
- **`hasInstallScript: true` appearing in `package-lock.json`** is npm recording, in the
  lockfile itself, that this package now declares an install-time script — directly relevant
  to a separate warning glimpsed in Railway's build log about `npm approve-scripts`: newer npm
  versions added a security feature that can require explicit approval before running
  install scripts *from third-party dependencies*, specifically to guard against a known
  supply-chain attack pattern (a malicious package silently running arbitrary code the moment
  it's installed). That warning wasn't actually what caused this build to fail — the real
  failure was squarely the missing generated client — but the lockfile change is worth
  understanding rather than treating as unexplained diff noise.

### What was done

1. Added `"postinstall": "prisma generate"` to `backend/package.json`'s `scripts`.
2. **Verified the fix locally before trusting it to another remote build**, consistent with
   the standing "check before trusting" habit that's guided every deployment step so far in
   this project: deleted `backend/src/generated/` entirely, ran `npm install` fresh, and
   confirmed the `postinstall` hook fired automatically and regenerated the exact same client
   — proving the fix actually works, not just that the syntax is plausible.
3. Re-ran `npm run build` (clean, from a deleted `dist/`) and the full test suite —
   both passed, confirming nothing else regressed.
4. Committed the lockfile's `hasInstallScript` change separately from the actual fix, since it
   was a distinct, automatically-generated side effect rather than a hand-written change.

### Why it's needed

Without this, every future hosting platform this project is ever deployed to would need its
own hand-written "remember to run `prisma generate` first" step rediscovered the hard way, the
same way both GitHub Actions and Railway just independently did. Fixing it at the `npm install`
level instead means it's simply already handled, everywhere, permanently.

### Decisions

- **`postinstall` in `package.json`, not a Railway-specific build command override.** The
  Railway UI does offer a place to set a custom build command per-service, which would have
  fixed *this one platform* — but the `postinstall` approach fixes local development, GitHub
  Actions CI, Railway, and any future platform simultaneously, with zero platform-specific
  configuration anywhere. Worth noting: the GitHub Actions workflow's own explicit
  "Generate Prisma client" step is now technically redundant (its `npm ci` step would trigger
  the same `postinstall` automatically) — left in place rather than removed, since a harmless,
  explicit, clearly-named step is arguably still worth keeping for readability in a workflow
  file, and removing it isn't necessary for anything to work correctly.

### State at end of this step

`backend/package.json` now regenerates its Prisma client automatically after every install,
verified locally. Not yet confirmed on an actual Railway rebuild — that happens once this
branch merges and Railway's auto-deploy picks up the change.

### Verification

- Deleted `backend/src/generated/` and ran `npm install` — the `postinstall` hook fired and
  regenerated the client automatically, confirmed by its presence afterward.
- `npm run build` (from a freshly deleted `dist/`) — compiled cleanly.
- `npm test` — 18/18 passing, unchanged.
- Not yet verified: an actual Railway rebuild with this fix in place.

---

## 2026-08-15 — The PR #16–#19 chain, actually walked through slowly

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the earlier "stacked PRs" entry (back
during #7/#8/#9) explained the general concept, but a *second*, unrelated four-PR pile-up
(#16 through #19) built up quickly during this deployment conversation, and asking "what does
this actually mean" deserved a proper, concrete answer rather than a one-line "merge them in
order" — which, as it turns out, wasn't even fully accurate.

### Background / concepts

#### First, what's actually true right now — checked directly, not assumed

The earlier chat message said "merge #16 → #17 → #18 → #19 in order," which sounds like one
long chain of four. Checking each PR's actual base branch directly
(`gh pr view <n> --json state,baseRefName`) shows something different:

| PR | State | Branches into | What that means |
| -- | ----- | -------------- | ---------------- |
| #16 | **merged** | `main` | Already done. |
| #17 | **merged** | #16's branch | Already done — and it turned out fine that #17 briefly depended on #16, since #16 was merged first. |
| #18 | **open** | `main` | Independent. It was branched *after* #16 and #17 had already merged into `main`, so it already contains everything from both, and doesn't wait on anything. |
| #19 | **open** | #18's branch | Depends on #18 specifically — it was branched from #18 *while #18 was still open*, to reuse code that only existed there so far. |

So the real, current situation is much simpler than "four things in a row": **two PRs are
already done, and of the two remaining, only one (#19) actually depends on the other (#18)**.
The earlier advice to "merge in order" wasn't wrong exactly — merging #16 before #17 was
genuinely required, and it already happened correctly — but stating it as one continuous
four-step chain overstated how connected the *remaining* work actually is, which is exactly
the kind of imprecision worth correcting rather than leaving as a beginner's mental model.

#### Why this pile-up happened at all

- Every one of these four PRs was written to explain a concept *while a live conversation was
  actively happening* (hosting/domains, build artifacts, evaluating a signup's terms, the
  Railway build failure, the `postinstall` fix) — each one was branched, written, and pushed
  in the moment something needed explaining, without pausing to wait for the *previous* one to
  be reviewed and merged first. That's a reasonable way to keep a fast-moving conversation
  moving, but it's exactly the situation that produces exactly this kind of branch pile-up:
  whichever branch happened to be `main`'s current tip *at the moment a new branch was
  created* determined whether that new branch ended up standalone (like #18) or stacked on
  top of something still open (like #19, created while #18 was still unmerged).
- This is the same underlying mechanism explained in the much earlier #7/#8/#9 entry — nothing
  new is happening here mechanically — but four PRs accumulating instead of three, across a
  long, fast-moving conversation, made it genuinely harder to hold the whole shape in your head
  without writing it down and checking it directly, which is exactly why a table beats a
  one-line verbal summary here.

#### What merging each one actually, concretely does

- **Merging #18** takes its one new commit (the Railway/npm-mechanics log entry) and adds it
  to `main`. Nothing unusual — it's a normal, independent PR at this point, indistinguishable
  from any single non-stacked PR merged earlier in this project.
- **Merging #19 afterward** is where the stacked relationship actually matters. Per the
  earlier stacked-PR entry's explanation of GitHub's *retargeting* behavior: the moment #18
  merges (and its branch is deleted), GitHub notices #19's base branch no longer exists and
  automatically repoints #19's base at `main` instead — so by the time you go to merge #19,
  its diff should already cleanly show just its own new commits (the `postinstall` fix + this
  very log entry) against the now-current `main`, the same clean outcome observed and directly
  confirmed back when #7/#8/#9 went through this same mechanism.
- **If #19 were merged *before* #18** (technically possible — GitHub doesn't forbid it), it
  would drag *all* of #18's commits in along with it, since #19's branch physically contains
  them (it was built starting from #18's code). The result on `main` would likely still end up
  correct in this specific case (both PRs' content would land either way, nothing here
  conflicts), but the resulting commit history would misattribute #18's own changes as if they
  were part of #19's PR — worth avoiding for a clean, honest history, which is the actual
  reason the *order* matters when it does, not because merging out of order would break
  anything technically catastrophic.

### Why it's needed

"Merge these in order" is easy to say and hard to actually picture without seeing the real
structure — this entry exists to replace a one-line instruction with something that can
actually be checked against reality (via `gh pr view`) rather than trusted blindly, and to
correct an inaccurate simplification from earlier in this same conversation rather than let it
stand uncorrected in the log.

### State at end of this step

#16 and #17 are merged. #18 and #19 remain open, with #19 depending on #18 specifically (not
on #16 or #17, which are already fully resolved). Correct next step: merge #18, then #19.

### Verification

- `gh pr view <16|17|18|19> --json state,baseRefName` — checked each PR's actual current state
  and base branch directly rather than relying on memory of what was true several turns
  earlier in the conversation, which is exactly what caught the inaccuracy in the original
  "merge four in a row" framing.

---

## 2026-08-15 — `npm install`, lockfiles, generated Prisma code, and lifecycle hooks, from the ground up

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a request to properly explain, for a
beginner, everything actually going on in the `postinstall` fix from two entries ago: what
`npm install` does step by step, what a lockfile ("the locking") actually is, what the
generated Prisma client actually *is* as opposed to just "a folder that goes missing," and
what an npm lifecycle hook is as a general mechanism, not just this one specific case.

### Background / concepts

#### What `npm install` actually does, step by step

Every one of this project's `npm install`/`npm ci` runs — dozens of them by now across this
log — has been treated as a single black-box step so far ("install the dependencies"). Here's
what's actually happening inside it:

1. **Read `package.json`'s dependency lists.** `dependencies` and `devDependencies` each list
   package names and a version *range* (e.g. `"express": "^5.2.1"` — the `^` means "this
   version or any newer compatible one," not necessarily that exact version).
2. **Resolve exact versions.** Because ranges allow flexibility, and because installed
   packages themselves depend on *other* packages (which depend on others, and so on — a real
   dependency tree, often hundreds of packages deep for a modest project), npm has to work out
   one single, consistent, exact version number for every package involved, resolving any
   conflicts where two different packages want incompatible versions of some shared
   dependency.
3. **Download and write `node_modules/`.** Each resolved package's actual code gets downloaded
   (or read from a local cache if already downloaded before) and placed into the
   `node_modules/` folder — the same folder that's been git-ignored since the very first
   backend-scaffold entry, precisely because it's large, fully reproducible from
   `package.json`, and shouldn't be committed.
4. **Run any lifecycle scripts** — covered in its own section below, since this is the part
   directly relevant to the bug that was just fixed.

#### What a lockfile is, and why "the locking" matters

- **The problem a lockfile solves:** version *ranges* in `package.json` (`^5.2.1`) are
  deliberately flexible — but that flexibility means two different `npm install` runs, on two
  different days, could legitimately resolve to two *different* exact versions, even though
  `package.json` itself never changed, simply because a newer compatible version of some
  package was published in between. For an application that needs to behave identically in
  development, in CI, and in production, that unpredictability is a real problem — subtle
  bugs from "well, it worked on my machine" often trace back to exactly this.
- **`package-lock.json`** (present in this project — `backend/package-lock.json` and
  `frontend/package-lock.json`, both committed to git, unlike `node_modules/`) is npm's
  solution: after resolving every package's exact version once, it writes the *entire*
  resolved dependency tree — every package, its exact version, and where it came from — into
  this one file. **This is "the locking":** as long as this file exists and matches
  `package.json`, `npm ci` (specifically — "clean install," used throughout this project's own
  GitHub Actions workflows and recommended for any automated build) installs *exactly* those
  locked versions, every single time, on any machine, forever — not "whatever the ranges
  happen to resolve to today."
- **This is why `package-lock.json` is committed to git but `node_modules/` isn't:** the
  lockfile is a small, readable *description* of exactly what should be installed; deleting it
  and running `npm install` again can regenerate `node_modules/` byte-for-byte reproducibly
  (well — reproducibly in terms of which package versions get installed; the lockfile is what
  makes that reproducible rather than left to chance), whereas the actual downloaded package
  code in `node_modules/` is large, and copy-pasting it into version control would be treating
  a derived, regeneratable thing as if it were precious source code, the same reasoning
  applied to `dist/` and the generated Prisma client itself.
- **`hasInstallScript: true`**, the specific lockfile change from the previous entry, is simply
  one more fact npm now records about this exact, locked dependency tree — "this package has a
  lifecycle script that will run automatically" — relevant to the tooling that decides whether
  those scripts are safe to run automatically, covered below.

#### What the generated Prisma client actually *is*, concretely

- This has been mentioned in passing since the original Phase 1/2 Prisma entry ("the generated
  client is code, not something you hand-write"), but worth being fully concrete now that a
  bug specifically about its *absence* has come up twice: `backend/prisma/schema.prisma` is a
  human-written description of the data model (the `User` model, its fields, its types).
  `npx prisma generate` reads that file and **writes brand new TypeScript source files** —
  actual `.ts`/`.d.ts` files with real class and type definitions matching that schema exactly
  — into `backend/src/generated/prisma/`. Every line of code inside that folder is
  mechanically produced from `schema.prisma`; nobody types it by hand, and it changes
  automatically the moment the schema changes and `generate` is re-run.
- **This is exactly why it's git-ignored, and exactly why its absence broke two separate
  builds.** Being reproducible-from-source is *why* it's excluded from git (the same rule as
  `dist/` and `node_modules/`) — but that same fact means anywhere this project gets freshly
  cloned (a new laptop, a GitHub Actions runner, Railway's build machine) starts with **no**
  `backend/src/generated/prisma/` at all, and needs something to actually run
  `npx prisma generate` before any code that does `import { PrismaClient } from
  "../generated/prisma/client"` can possibly compile. Both build failures fixed so far in this
  log were precisely that missing step, on two different platforms, independently.

#### npm lifecycle hooks, as a general mechanism (not just this one case)

- **`postinstall` is one of several specially-named scripts npm treats differently from
  ordinary custom ones.** Every script this project has defined so far (`"dev"`, `"build"`,
  `"start"`, `"test"`) only ever runs when explicitly asked for by name
  (`npm run build`, or the two special-cased ones, `npm start`/`npm test`, without needing
  `run`). **Lifecycle scripts are different: npm runs them automatically, by itself, at a
  specific defined moment**, without ever being asked by name. `postinstall` specifically means
  "run this automatically, immediately after `npm install`/`npm ci` finishes" — no command
  anywhere in this project's own workflows, or in Railway's build process, ever explicitly
  says "now run `prisma generate`" — npm does it unprompted, purely because that script exists
  under that specific reserved name in `package.json`.
- **Why this is the right fix, mechanically:** every single build environment this project has
  ever run in — a developer's laptop, a GitHub Actions runner, Railway's build machine — starts
  by running `npm install` or `npm ci` as an unavoidable first step (there is no way to get the
  project's dependencies without it). Attaching the missing step to *that* moment, rather than
  to `build` or to some platform's separate "build command" setting, guarantees it happens
  everywhere `npm install` happens — which is to say, guaranteed to happen absolutely
  everywhere this project could ever be built, present or future, without needing to remember
  to configure it again per platform.
- **The `npm approve-scripts` warning glimpsed in Railway's build log** belongs to a genuinely
  separate npm feature worth knowing about, even though it wasn't what caused this particular
  failure: newer npm versions can require a project to explicitly *approve* lifecycle scripts
  that come from **third-party dependencies** (not the project's own `package.json`) before
  running them automatically — a defense against a real, documented category of attack where a
  malicious package publishes a `postinstall` script that silently runs harmful code the
  moment anyone installs it. This project's own `postinstall` script (added in the previous
  entry) is the project's *own* script, not a dependency's, so it isn't affected by that
  particular protection — but it's exactly why lifecycle scripts as a mechanism are treated
  with real caution industry-wide, not just an obscure npm setting.

### Why it's needed

The previous entry explained *what* was fixed and *why the fix was chosen*, at the level of
"here's the bug, here's the fix, here's why this approach beats a platform-specific one." This
entry exists to explain the actual mechanics underneath that fix in enough depth that none of
`npm install`, lockfiles, generated code, or lifecycle hooks have to be taken on faith.

### State at end of this step

No code changes in this entry — purely a deeper explanatory pass over the mechanics behind the
`postinstall` fix already made and pushed in this same branch/PR.

---

## 2026-08-15 — The first successful Railway build — what it actually means, and how auto-deploy works

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — after merging PR #21, Railway's build
finally succeeded (all four phases green). Explains what that genuinely does and doesn't mean
yet, and the mechanics of how merging a PR turned into a real deployment automatically.

### Background / concepts

#### What "Deployment successful" actually confirmed — and what it didn't

- The build going green means something real and specific: the exact bug chased across the
  last several entries (the missing generated Prisma client, then the stranded-commit
  discovery, then the hardened `build` script) is genuinely fixed. `npm run build` completed,
  `node dist/index.js` started, and the process didn't immediately crash.
- **It does not yet mean the app is reachable from the internet, or fully working.** Two
  separate gaps, both visible directly in Railway's own UI:
  - **"Unexposed service"** — Railway services are **private by default**, reachable only from
    other services *inside the same Railway project*, not from the public internet, unless
    public networking is explicitly turned on for that service (generating a real
    `https://something.up.railway.app` URL, or a custom domain per the earlier hosting/DNS
    entry). Nothing about a successful build changes this — exposure is a separate,
    deliberate setting.
  - **No database or environment variables configured yet.** This Railway project doesn't
    have a Postgres service attached, and none of `DATABASE_URL`, `JWT_ACCESS_SECRET`,
    `JWT_REFRESH_SECRET`, or `FRONTEND_URL` have been set. The server can still start and
    listen without any of these — `app.listen()` doesn't touch the database — so
    `GET /api/health` would actually work once exposed, but `register`/`login` would fail the
    moment they tried to reach a database that isn't there.
- **The honest one-sentence summary:** the code is now provably deployable — the exact thing
  that was broken is fixed and confirmed working on real infrastructure — but "deployable" and
  "deployed and usable" are still two different states, and the remaining gap (exposure +
  database + secrets) is ordinary, expected setup work, not a new bug.

#### How merging a PR turned into an automatic deployment, mechanically

- This is the git-based Continuous Deployment mechanism described in general terms back in the
  "build artifacts and deployment" entry, now observed actually happening: Railway's service
  settings have **"Auto deploys when pushed to GitHub"** enabled (seen directly, back when the
  Root Directory setting was first located), watching the `main` branch specifically (shown as
  "Branch connected to production" in that same settings screen).
- **The trigger is a webhook, set up automatically when the GitHub repo was connected.** A
  webhook is GitHub notifying an outside service, over the internet, the instant something
  happens in a repository — in this case, "a push landed on `main`." Every PR merge is, from
  git's point of view, just a particular kind of push to `main` (a merge commit combining the
  PR's branch into it) — so merging PR #21 through GitHub's UI produced exactly the same
  "something was pushed to `main`" event as typing `git push origin main` by hand would have.
  Railway's webhook received that event within seconds, which is why the deployment log showed
  **"Merge pull request #21 from wheelyk/do..., 41 seconds ago"** as the direct cause of the
  new build — the merge *was* the trigger, automatically, with nobody separately telling
  Railway "now go build this."
- **This is the same mechanism, working correctly, that caused the earlier "docs-only PRs kept
  triggering unnecessary rebuilds" observation** a few entries back — every merge to `main`
  triggers this webhook indiscriminately, whether the change was app code or just a log entry.
  Scoping *which* changes trigger a deploy (the same idea as the `paths:` filter added to the
  GitHub Actions screenshot workflow) is possible on Railway too, but hasn't been set up yet —
  noted there as a "not urgent" cleanup, still true here.

### Why it's needed

"It deployed successfully" is easy to misread as "it's live" — distinguishing exactly what
succeeded (the build and process startup) from what's still missing (public exposure, the
database, secrets) prevents the natural next question — "why can't I actually reach it in a
browser yet" — from looking like a fresh bug rather than expected, remaining setup.

### State at end of this step

The backend builds and runs successfully on Railway. It is not yet publicly reachable
(`Unexposed service`), has no attached Postgres database, and has none of its required
environment variables configured. Auto-deploy on push to `main` is confirmed working, end to
end, via a real merge.

### Verification

- Directly observed in Railway's UI: all four deployment phases (Initialization, Build,
  Deploy, Post-deploy) green, status `ACTIVE`.
- Directly observed: `"Unexposed service"` label, confirming no public URL exists yet — not
  inferred, read straight from the platform.
- Directly observed: the deployment's stated trigger, `"Merge pull request #21..."`, confirming
  the auto-deploy-on-push-to-`main` mechanism fired correctly from a real GitHub merge, not
  assumed from configuration alone.

---

## 2026-08-15 — Where secrets actually live in production, and how a hosted Postgres database works

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — before actually adding the four required
environment variables and a Postgres database to the Railway project, two questions asked
directly deserve a proper answer first: where do secrets actually get stored for a deployed
app (a password manager? somewhere else?), and how does a *hosted* database actually work,
given it's ultimately just files on a disk somewhere.

### Background / concepts

#### Where the four environment variables actually need to live

- **The platform's own "Variables" tab is the required location — not optional, not a
  convenience.** Every environment variable this project's backend reads
  (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `PORT`) is read
  via plain `process.env.SOMETHING` in the code — Node.js only ever sees values that were
  actually injected into the running process's environment at startup. Locally, that
  injection has always come from `backend/.env` (via `dotenv/config`, first explained in the
  Phase 0 entry). On Railway, the equivalent mechanism is that service's own **Variables**
  tab — Railway injects whatever's set there into the container's environment the moment it
  starts, the direct production equivalent of the local `.env` file. There is no working
  alternative to this: the app cannot read a value from LastPass, 1Password, or anywhere else
  at runtime — those tools have no connection to the running process at all.
- **A password manager is a genuinely good idea, just for a different, complementary reason:
  a personal backup record, not a functional requirement.** Two of the four values
  (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) are randomly generated once and then need to
  stay *exactly* the same for as long as issued tokens should keep working — if that exact
  value is ever lost with no record of it, the fix is simple (generate a new one, per the
  Phase 2 entry's `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  command) but has a real consequence: every already-issued access/refresh token instantly
  stops validating, forcing every logged-in user to log in again. Keeping a personal copy in a
  password manager is a sensible safety net against that — but it's a backup for the human,
  not something the running application ever reads from.
- **Not all four values need to be invented by hand.** `DATABASE_URL` specifically will be
  **generated automatically by Railway itself**, the moment a Postgres database is added to
  this project (see below) — it doesn't need to be manually composed the way the JWT secrets
  do. `FRONTEND_URL` isn't a secret at all (it's just a public web address, the frontend's own
  deployed URL, once that exists) — it lives in the same Variables tab purely because that's
  the standard place for *all* of a service's configuration, not because it needs protecting.

#### How a hosted Postgres database actually works, given it's "ultimately just a file"

- **The intuition is correct at the lowest level, and irrelevant at every level the
  application actually touches.** Postgres genuinely does store data as files on disk — but
  exactly like this project's own backend (explained in the "is this a console app" entry a
  few steps back), Postgres itself is a **long-running server program**, not a file the
  application opens directly. It starts up, binds to a network port (conventionally `5432`),
  and then sits waiting for connections — the exact same "console app that listens on a socket
  instead of reading the keyboard" shape as this project's own `node dist/index.js`. Nothing
  in this backend's code — or in *any* application anywhere — opens Postgres's data files
  directly; doing so would corrupt them. Every single interaction happens by sending commands
  over that network connection and getting results back, never by touching a file path.
- **The "client" the backend uses is real, specific code, already present in this project.**
  `pg` (installed back in the Phase 1/2 Prisma entry) is a JavaScript library that knows how
  to speak Postgres's specific network protocol — opening a TCP connection to the given host
  and port, authenticating, and translating function calls into the actual bytes Postgres
  expects on the wire. Prisma's `@prisma/adapter-pg` sits on top of that, and the generated
  Prisma Client sits on top of *that* — but underneath all three layers, it's still just
  `pg` making an ordinary network connection, the same fundamental kind of connection this
  project's own frontend makes to its own backend.
- **Credentials work exactly the same way remotely as they already have locally.** The whole
  reason `DATABASE_URL` has always looked like
  `postgresql://username:password@host:port/databasename` (first introduced in the Phase 1/2
  entry, for the local Docker Compose Postgres) is that a connection string is nothing more
  than "where to connect, and proof of who's allowed to." A hosted database changes *which*
  host, port, username, and password appear in that string — nothing about the shape or
  meaning of the string itself changes. Locally, `welltrack`/`welltrack` was chosen by hand,
  for a database only reachable from this one laptop. On Railway, adding a Postgres database
  to the project makes Railway generate a real, random, non-guessable username and password
  automatically — not something to invent manually, the same way a real production JWT secret
  should never be a memorable, human-chosen string either.
- **Why the database itself should never be made publicly reachable, even though the backend
  will be.** Railway supports **private networking** between services that live in the same
  project — the backend can reach the database over Railway's own internal network without
  either service being exposed to the wider internet at all. This matters specifically because
  the database holds the raw data directly (every user's row, every future symptom/mood log),
  with none of the backend's own validation, authentication, or authorization logic in front
  of it — exposing it directly would mean anyone who obtained its credentials could read or
  modify everything with no application-level checks at all. The backend is the only thing
  that should ever be allowed to talk to it directly.

### Why it's needed

Both questions asked directly — "where do secrets actually go" and "how does a database that's
just files on disk let something else connect to it" — are exactly the kind of thing worth
understanding *before* clicking through the actual Railway UI to add them, rather than
copy-pasting values into fields without a clear picture of why they need to go there or what's
happening underneath.

### State at end of this step

No configuration changes yet — this entry is purely explanatory, immediately ahead of actually
adding the Postgres database and the four environment variables to the Railway project, which
is the next step.

---

## 2026-08-15 — Production migrations: how "upgrading" the live schema actually works, and the honest truth about rollbacks

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a forward-looking question asked
directly: as more models get added over time (Phase 1's remaining `Symptom`, `MoodLog`,
`Medication`, `Habit`, etc.), the production database will need to be upgraded to match —
and if something goes wrong, will it be possible to downgrade?

### Background / concepts

#### The forward path: `migrate dev` locally, `migrate deploy` in production — two different commands, on purpose

- Every migration this project has run so far (the `User` model's initial migration, from the
  Phase 1/2 entry) used `npx prisma migrate dev` — and that command has always run against the
  local Docker Compose database only. `migrate dev` does two things at once: it works out what
  changed in `schema.prisma` since the last migration and **writes a brand-new migration
  file** describing that change, *and* immediately applies it. That's exactly right for local
  development, where new migration files are actually meant to be created — but it's the wrong
  tool for production, which should never be generating brand-new, unreviewed migration files
  on the fly.
- **`npx prisma migrate deploy`** is the production counterpart, already used in the GitHub
  Actions CI workflow (`pr-preview.yml`, from the earlier CI entry) but, until this step,
  never actually wired into the Railway deployment itself. It does the other half of the job:
  it looks at the `prisma/migrations/` folder — which **is** committed to git, unlike the
  generated client — and applies whichever migration files exist there but haven't been
  applied to *this particular* database yet. It never generates a new migration file itself;
  it only replays ones that already exist, committed and reviewed ahead of time.
- **This is genuinely "upgrading" the live database, mechanically:** the day a new model
  (e.g. `Symptom`) gets added, the actual steps will be: edit `schema.prisma`, run
  `prisma migrate dev` locally (creating a new migration file, applying it to the local
  database, confirming everything still works), commit that new migration file to git as part
  of the PR — and then the *next* time `migrate deploy` runs in production (now wired into
  `npm start`, see below), it finds that one new, not-yet-applied file and applies it
  automatically. No manual "log into the production database and run some SQL" step required.

#### Why wiring this into `start`, not `build`

- `npm run build` compiles code — a pure, side-effect-free translation from TypeScript to
  JavaScript that doesn't need a live database connection at all, and arguably shouldn't touch
  one (a build step failing because a database happened to be briefly unreachable would be a
  confusing, unnecessary coupling). `npm start` is the moment the app is actually about to
  begin serving real traffic — the natural, correct point to first make sure the schema it's
  about to rely on is actually up to date. `prisma migrate deploy` is safe to run every single
  time the app starts, including every ordinary restart with nothing new to apply — the
  local verification below confirmed exactly that (`No pending migrations to apply`,
  printed, then the app started normally) — so there's no downside to it always running,
  only the upside of guaranteeing the schema is never out of date the moment the app comes up.

#### The honest truth about "downgrading": there isn't a magic undo button

- Some migration systems (Rails' `db:rollback` being the best-known example) support
  automatically reversing the most recently applied migration. **Prisma deliberately does not
  work this way.** There's no `prisma migrate rollback` command that inspects a migration and
  automatically figures out how to undo it — and for good reason: not every schema change has
  an obvious, safe, automatic reverse (dropping a column, for instance, permanently discards
  whatever data was in it — there's no way to "undo" that by inspecting the SQL alone).
- **Prisma's own recommended approach is to roll *forward*, not backward.** If a migration
  turns out to be wrong, the fix is writing a *new* migration that corrects or reverses it —
  e.g. a follow-up migration that re-adds a column, or changes a type back — going through the
  exact same reviewed, committed, `migrate deploy`-applied path as any other change, rather
  than un-applying history. This keeps the migration history an honest, linear record of
  everything that actually happened to the database, including mistakes and their fixes,
  instead of a rewritten record pretending the mistake never occurred.
- **The real safety net for anything migrations themselves can't safely undo (like discarded
  data) is a database backup taken *before* the migration ran** — not a rollback command. This
  is a genuine, current gap worth naming plainly: no backup strategy exists yet for whatever
  Postgres database is about to be added to Railway. Whether Railway's own tier includes
  automatic backups, and what a manual `pg_dump`-based backup habit before risky migrations
  should look like, is worth checking once the database actually exists — flagged here rather
  than silently assumed to be handled.
- **The lower-risk habit that avoids needing rollbacks as often:** preferring additive,
  backward-compatible schema changes where reasonable — e.g. adding a new *nullable* column
  rather than changing an existing one's type, so that even a brief window where old and new
  application code run side by side (a real possibility during a rolling deploy) doesn't
  produce errors either version can't handle. Not always possible, but worth defaulting to
  when it is.

### What was done

1. Changed `backend/package.json`'s `"start"` script from `"node dist/index.js"` to
   `"prisma migrate deploy && node dist/index.js"` — so every time the app actually starts
   (including every future Railway deploy), it first brings the database schema fully up to
   date with whatever migration files are committed to git, before accepting any traffic.
2. **Verified locally against the real Docker Compose database** — ran `npm start` directly
   and confirmed the output showed `1 migration found in prisma/migrations` /
   `No pending migrations to apply` (correctly finding the existing `User` migration already
   applied, nothing new to do), followed by the server starting normally and responding to
   `GET /api/health`.
3. Re-ran the full test suite — 18/18 still passing, confirming this change doesn't affect
   anything else.

### Why it's needed

Without this, every future schema change (the entire rest of Phase 1's models, and beyond)
would need someone to remember to separately, manually apply it to production — an easy step
to forget, and exactly the kind of manual production step this project has otherwise avoided
throughout every part of its deployment setup so far.

### Decisions

- **Wired into `start`, not a separate manual step or a Railway-specific "release phase"
  setting** — Railway doesn't have a distinct release-phase concept the way some platforms
  (Heroku) do, and chaining it into `start` is both platform-agnostic (works identically
  anywhere `npm start` runs) and safe to run unconditionally, confirmed by direct local testing.
- **Did not attempt to build any kind of rollback tooling.** Prisma's own position — roll
  forward, don't try to auto-reverse — is treated as correct here, not worked around. A backup
  strategy (the actual safety net for irreversible changes) is named as a real, current gap
  rather than either solved prematurely (there's no database to back up yet) or left unspoken.

### State at end of this step

Production database migrations will now apply automatically on every app start, the moment a
real database exists to apply them to. No backup strategy exists yet — an open item to revisit
once the Postgres database is actually added to the Railway project, the next step.

### Verification

- `npm start` run locally against the real Docker Compose Postgres — confirmed
  `prisma migrate deploy` ran first, correctly reported no pending migrations, then the server
  started and `GET /api/health` responded `200 {"status":"ok"}`.
- `npm test` — 18/18 passing, unchanged.

---

## 2026-08-15 — The backend is genuinely connected to a real production database

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the Postgres database and environment
variables were added to Railway, with one real mistake caught and fixed along the way, and
this entry records what the actual deploy log proves versus what was only inferred before.

### Background / concepts

#### A real mistake, caught before it mattered: variables set on the wrong service

- The four environment variables were initially added to the **Postgres** service's own
  Variables tab, not the **Wellbeing** (backend) service's. This is an easy mistake to make —
  both are just "a place in Railway's UI called Variables" — but only one of them is the
  running process that actually reads `process.env.*`. Variables sitting on the database
  service are simply never seen by the backend code at all; they'd have sat there, inert,
  looking correctly configured while doing nothing.
- **How this was caught:** rather than assuming the setup was correct because *some* Variables
  tab had the right-looking entries, the actual mixed contents of that tab were checked
  directly — it contained the four manually-added variables sitting alongside a long list of
  Postgres's own auto-generated ones (`PGHOST`, `PGUSER`, `PGPASSWORD`, `POSTGRES_*`, etc.),
  which only appear on a database service, confirming the wrong service was being edited. The
  fix was moving the same four variables to the backend service's own Variables tab instead —
  using Railway's **variable reference** feature for `DATABASE_URL` specifically (a `{{ }}`
  picker that links directly to another service's variable, rather than manually retyping a
  value that could go stale or be mistyped).

#### What the deploy log actually proves, versus what a green checkmark alone would only suggest

- A successful build/deploy status is good evidence something works, but the deploy log's
  actual text is direct, first-hand proof of *what specifically* worked, worth reading
  carefully rather than trusting the checkmark alone:
  - `Datasource "db": PostgreSQL database "railway"...` — the backend genuinely opened a real
    network connection to the real hosted database, using the `DATABASE_URL` variable
    reference — not a guess, an actual successful connection.
  - `1 migration found in prisma/migrations` → `Applying migration
    '20260814155859_init_user'` → `All migrations have been successfully applied.` — this is
    the automatic `prisma migrate deploy` step (wired into `start` two entries ago) genuinely
    doing its job for the first time against a brand-new, empty production database: creating
    the `users` table for real, from the migration file that's been sitting committed in git
    since the very first Prisma entry.
  - `Backend listening on port 8080` — the server actually started and began accepting
    connections, the same `app.listen()` behavior explained in the "is this a console app"
    entry, just running on Railway's infrastructure instead of this laptop.
- **A small, satisfying detail: port 8080, not the usual 4000.** Railway assigns its own port
  to a service via a `PORT` environment variable — this backend's `src/index.ts` has read
  `process.env.PORT ?? 4000` since the very first Phase 0 scaffold entry, for no reason that
  mattered until now. That early, unremarkable design choice is exactly why the app adapted to
  Railway's actual assigned port automatically, with zero code changes required at deploy time.

### What was done

1. Diagnosed and fixed the wrong-service variable mistake, as described above.
2. Added the four variables correctly to the **Wellbeing** service specifically:
   `DATABASE_URL` (as a variable reference to the Postgres service, not a typed value),
   `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (the values generated earlier in this
   conversation), and `FRONTEND_URL` (a temporary placeholder, `http://localhost:5173`, until
   the frontend is actually deployed).
3. Confirmed the resulting automatic redeploy's **Deploy** log directly, line by line, rather
   than trusting the "Deployment successful" badge alone — reading the actual Prisma
   connection, migration, and server-start output described above.

### Why it's needed

This is the first point in the whole deployment effort where the backend is *provably*, not
just *believably*, doing its real job on real infrastructure: connecting to a real database,
correctly evolving that database's schema from committed migration files, and serving
requests — the entire point of everything built since the Phase 1 Prisma entry, now actually
running somewhere other than this laptop.

### Decisions

- **Used a variable reference for `DATABASE_URL` instead of copying the value by hand.** A
  reference stays correct automatically if the database's own connection details ever change
  (e.g. a credential rotation); a manually copied value would silently go stale the moment
  that happened, with nothing pointing at the mismatch until something failed.
- **Verified via the actual log text, not the status badge**, directly because the wrong-service
  mistake earlier in this same step was a reminder that "looks configured" and "is actually
  working" are different claims — worth actually reading the evidence rather than trusting
  the first plausible-looking signal a second time in the same conversation.

### State at end of this step

The backend is deployed, connected to a real Postgres database, has successfully applied its
one existing migration, and is listening for requests — confirmed directly from the deploy
log, not inferred. It is still **not publicly reachable** ("Unexposed service") — enabling
public networking is the next step.

### Verification

- Read the actual Railway deploy log text directly: confirmed the real Postgres connection,
  the successful migration application (creating `users` for the first time in production),
  and the server successfully starting and listening.
- Confirmed the wrong-service mistake by inspecting the *contents* of the Postgres service's
  Variables tab directly (finding it mixed with Postgres's own auto-generated variables) rather
  than assuming from the tab's mere existence that it was the correct one.

---

## 2026-08-15 — What a Railway-generated domain actually is, before turning it on

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — before actually exposing the backend
publicly, a direct question deserved answering first: is a Railway-generated domain the same
kind of DNS/IP/port mapping explained in the earlier hosting entry, and does Railway already
have the DNS side handled?

### Background / concepts

#### The short answer: same underlying idea, but Railway owns the whole namespace already

- The earlier hosting/domains entry explained DNS as "a name resolves to wherever the actual
  server is," and covered the two ways to point a domain *you* own at a host you don't run
  yourself. Clicking **"Generate Domain"** on a Railway service is a related but meaningfully
  simpler case: Railway hands out a subdomain under **their own domain**
  (something shaped like `<something>.up.railway.app`), not a domain the user owns at all.
- Because Railway controls `*.up.railway.app` end to end, they can create whatever DNS record
  is needed **on their own servers, instantly**, the moment the button is clicked — none of
  the "add this record at your registrar, then wait for propagation" process from the earlier
  entry applies here, precisely because there's no separate registrar involved at all in this
  path. That whole process only becomes relevant again if a *custom* domain (like
  `athirstycamel.com`) is later pointed at this same service.
- **HTTPS comes for free here too, for the same reason.** A certificate for a brand-new custom
  domain has to be issued *after* DNS proves the domain really is pointed at the right place —
  which takes a little time. A certificate covering Railway's own domain can be prepared ahead
  of time, since Railway isn't waiting on anyone else's DNS to change — so a generated domain
  is reachable over `https://` immediately, with nothing extra to configure or wait for.

#### The one real nuance: it's not a direct IP-and-port mapping the way local dev is

- Locally, `docker-compose.yml`'s `ports: ["5432:5432"]` is a literal, direct mapping: traffic
  to this laptop's port 5432 goes straight to the Postgres container. **Railway's generated
  domain doesn't work that way.** The domain resolves to **Railway's own shared edge
  infrastructure** — a reverse proxy/router they operate — which then forwards the request
  internally, over Railway's private network, to wherever this specific container actually
  happens to be running at that moment. The backend never gets hold of a dedicated public IP
  address and port the way a hand-run server would; Railway's routing layer is what actually
  knows "traffic for this hostname goes to that container," and that mapping can change
  underneath (e.g. if the container restarts on different underlying infrastructure) without
  the public domain ever needing to change.
- **Why this design is normal, not a Railway-specific oddity.** Essentially every modern
  hosting platform (Vercel included) works this way rather than dedicating one public IP per
  customer — sharing a small number of public-facing IPs across many customers' containers via
  hostname-based routing is both cheaper to operate and exactly why a platform can hand out a
  working public URL in seconds rather than needing to provision new networking hardware per
  customer.

### Why it's needed

Clicking a button labeled "Generate Domain" is easy to treat as a black box — understanding
that it's DNS-plus-routing already fully controlled by Railway, rather than some new mechanism
unrelated to everything explained about DNS so far, means the *next* time a custom domain gets
pointed at this same service, the difference between "this was instant" (today) and "this
needs a DNS record and a short wait" (later) makes sense as the same underlying system, just
missing the "Railway already owns the namespace" shortcut.

### State at end of this step

No networking changes yet — this entry is purely explanatory, immediately ahead of actually
clicking "Generate Domain" on the Wellbeing service.

---

## 2026-08-15 — A slow, careful walkthrough: which port to use, and both ways to get a working URL

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — while actually clicking "Generate
Domain," two more direct questions: which port number belongs in that field, and — slowly,
because this genuinely is one of the more confusing parts of deploying anything for the first
time — how would someone set up their *own* hostname instead of Railway's, and how do DNS and
SSL actually differ between the two paths.

### Background / concepts

#### Which port number goes in that field, worked through one step at a time

Railway's "Generate Service Domain" screen asked for a port, and pre-filled `8080`. Here is
*why* that specific number, traced all the way through, one link at a time:

1. When the container starts, Railway itself decides which port the app should listen on, and
   tells the app by setting an environment variable called `PORT` — the app doesn't choose
   this; Railway does, and it can differ between deployments.
2. This project's own `backend/src/index.ts` has contained this line since the very first
   Phase 0 scaffold entry, long before Railway ever existed in this project:
   `const port = process.env.PORT ? Number(process.env.PORT) : 4000;` — in plain words,
   "use whatever `PORT` says, and only fall back to `4000` if nothing set it."
3. On Railway, `PORT` happened to be set to `8080` this time. The app read that value and
   called `app.listen(8080, ...)` — confirmed directly, word for word, in the deploy log two
   entries ago: `Backend listening on port 8080`.
4. **The "port" field on this Networking screen is asking a completely different question from
   "what's the public web address":** it's asking "when a visitor's request arrives at
   Railway's front door, which internal door of this specific container should it be walked
   through to reach the app that's actually running?" That number has to be `8080` — the exact
   port the app is genuinely listening on right now — or the request would arrive at the
   container and find no one answering at whichever wrong door it was sent to, even though the
   app itself is running perfectly fine on the *correct* port the whole time.
5. **This is exactly why Railway pre-filled `8080` rather than leaving it blank or defaulting
   to something generic like `80`:** it isn't guessing — it can see, from the running
   container, which port the process is actually bound to, and offers that back. Confirming
   the pre-filled value (rather than typing something else, like the locally-familiar `4000`)
   is the correct action here.

#### Path one, slowly: "Generate Domain" (what was actually clicked)

1. Tap **"Generate Domain"** with the port field showing `8080`.
2. Railway immediately creates a new subdomain under its own domain — something shaped like
   `wellbeing-production-xxxx.up.railway.app` — and, on its own servers, an internal record
   saying "requests for this exact name should be routed to this exact container, on port
   8080."
3. Because `up.railway.app` belongs entirely to Railway, this record is real and working the
   instant it's created — there is no second company, no separate registrar, and nothing to
   wait on.
4. A change like this shows up as a pending change to confirm and apply (the "Apply N changes"
   / "Deploy" step) — tapping **Deploy** is what actually makes the new configuration live,
   the same "review, then apply" pattern already familiar from every PR merged throughout this
   whole project, just inside Railway's own UI instead of GitHub's.
5. Once applied, the generated address works immediately, over `https://`, with a certificate
   that didn't need to be separately requested or waited for.

#### Path two, slowly: what "Custom Domain" would actually involve (not clicked yet, explained ahead of time)

This is the other button on the same screen — worth understanding fully now, even though the
generated domain is what's actually being used today, since a custom domain (`athirstycamel.com`,
from the earlier hosting entry) is a realistic future step.

1. **Type the desired hostname into Railway** — e.g. `app.athirstycamel.com`, a *subdomain* of
   the already-owned `athirstycamel.com`, rather than the bare root domain (a common, sensible
   choice: it leaves the root domain free for something else later, like a marketing page, and
   keeps the app clearly separated).
2. **Railway responds with a specific DNS record to create** — typically a **CNAME record**
   (explained in full back in the hosting/domains entry: a record that says "this name is just
   another name for that name") pointing `app.athirstycamel.com` at some Railway-provided
   target address.
3. **That record has to be added at the domain's actual registrar** — wherever
   `athirstycamel.com` itself is registered, *not* inside Railway anywhere, since Railway
   doesn't control that domain's DNS at all. This is the direct, real-world version of the
   "keep the registrar's nameservers, just add one specific record there" option explained
   generally in the earlier hosting entry.
4. **Then: waiting.** Unlike the generated domain (instant, because Railway controls the whole
   namespace), this step depends on the registrar's own DNS servers actually publishing the
   new record, and every other computer on the internet noticing the change — the TTL/
   propagation delay explained in the hosting entry, typically minutes, occasionally longer.
   Railway's UI would show this domain as "pending" or "not yet verified" during this window,
   not because anything is broken, but because nothing can be confirmed working until the DNS
   change is actually visible.
5. **Only once Railway can see the DNS correctly pointing at them does it request an SSL
   certificate for that domain** (via Let's Encrypt, the same free, automated certificate
   authority almost every modern host uses) — this can only happen *after* step 4 succeeds,
   since issuing a certificate for a domain requires proving control over it, and DNS pointing
   correctly is exactly that proof. This step is usually fast (seconds to a couple of minutes)
   once DNS is confirmed, but it is a genuinely separate, sequential step — not simultaneous
   with the DNS change.

#### The two paths, side by side

| | Generate Domain (used today) | Custom Domain (future option) |
| - | - | - |
| **Who controls the DNS** | Railway, entirely | The domain's own registrar (outside Railway) |
| **DNS setup needed** | None — Railway creates its own record instantly | A CNAME record, added by hand, at the registrar |
| **Wait time** | None | Minutes (occasionally longer) for DNS propagation |
| **SSL certificate** | Pre-provisioned, works immediately | Requested automatically, but only *after* DNS is confirmed — a real, sequential extra step |
| **What you type** | Nothing — Railway generates the name | The exact hostname you want (e.g. a subdomain of an owned domain) |

### Why it's needed

"Which port" and "how would a custom domain even work" are exactly the kind of details that
are easy to click through without understanding, and exactly the kind that turn into confusing
mysteries later (a 502 error from a wrong port; a custom domain stuck "pending" for what looks
like no reason) if the underlying mechanism was never actually understood the first time.

### State at end of this step

The backend now has a working, public, HTTPS-secured generated domain. A custom domain has not
been configured — deliberately explained here ahead of time, as a documented future option,
rather than attempted today.

### Verification

Not applicable in the code-verification sense — this entry is a conceptual walkthrough. The
practical verification (does the generated URL actually serve the app) is the next real step:
visiting the generated domain directly and confirming `GET /api/health` responds, the same way
every other endpoint in this project has been verified throughout this log.

---

## 2026-08-15 — Confirmed live: the backend is genuinely reachable from the public internet

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — closing out the previous entry's
prediction with an actual, real-world test, plus a direct answer on public vs. private
networking.

### Background / concepts

#### Public vs. private networking, answered directly

- **Public networking** means reachable from the internet at large — literally any device,
  anywhere, that can make an HTTP request can reach `wellbeing-production-0b8f.up.railway.app`
  now that it's been generated. This is the exact thing "Unexposed service" was warning was
  *not* yet true, several entries back.
- **Private networking** (`wellbeing.railway.internal`, visible in the same Networking screen)
  is the opposite: reachable *only* from other services inside this same Railway project —
  invisible to the public internet entirely, and invisible even to a different Railway project.
  This is the mechanism that should keep the Postgres database itself safe: the backend reaches
  it privately (over the `DATABASE_URL` variable reference set up two entries ago), and the
  database should never get a public domain generated for it the way the backend just did — the
  whole reason, explained back in the secrets/Postgres entry, that a database should never be
  directly reachable from the internet, only through an application's own validation logic in
  front of it.

#### Why this was tested from an actual outside machine, not trusted from Railway's own dashboard

- Every previous "is it actually working" check in this log has followed the same discipline:
  don't trust a status badge or a UI label alone when a real, independent test is possible. The
  generated domain was tested with a plain `curl` request from this laptop — a genuinely
  separate machine, on the open internet, with no special access to Railway's own internal
  view of things — specifically because that's the same vantage point any real future user
  (or, eventually, the deployed frontend) would have. Railway's dashboard showing a domain as
  configured is a claim; an external `curl` actually succeeding is proof.

### What was done

Ran `curl -s -w "\nHTTP %{http_code}\n" https://wellbeing-production-0b8f.up.railway.app/api/health`
directly from this laptop (not from within Railway, not from any tool with special access) and
confirmed a real `200 {"status":"ok"}` response.

### Why it's needed

This is the actual, final proof that everything built and fixed across this whole deployment
effort — the Prisma client generation fix, the stranded-commit recovery, the database
connection, the migration, the public domain — genuinely works end to end, from the actual
public internet, not just according to Railway's own dashboard.

### State at end of this step

The backend is live, public, connected to a real database, and confirmed reachable from outside
Railway entirely. `FRONTEND_URL` is still a placeholder (`http://localhost:5173`) pending the
frontend's own deployment to Vercel — the natural next step.

### Verification

- `curl` from this laptop directly against the public Railway URL — `200 {"status":"ok"}`,
  confirmed independently of Railway's own dashboard.

---

## 2026-08-15 — Deploying the frontend to Vercel, and why `FRONTEND_URL`/CORS matters for real this time

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the frontend was deployed to Vercel,
hitting one real monorepo-detection wrinkle along the way, and this entry re-teaches CORS and
`FRONTEND_URL` from first principles now that it's a real production concern, not a local
convenience.

### Background / concepts

#### The monorepo detection wrinkle: Vercel wanted to deploy *two* services

- Vercel's newer project-import flow auto-scans a connected repository and, seeing both
  `frontend/package.json` and `backend/package.json`, offered to deploy **both** as separate
  "services" under one Vercel project, wiring them together with a `vercel.json` and URL
  rewrites (`/api/*` routed to the backend service, everything else to the frontend).
- **This had to be declined, for a concrete reason, not just "we don't need it."** The backend
  already has a complete, tested, working home on Railway — a persistent, always-running
  process, connected to the real Postgres database, with migrations already applied. Vercel
  runs backend "services" as short-lived serverless functions instead — a fundamentally
  different execution model than the always-on process this project's backend was built and
  tested against (e.g. the shared Prisma client singleton, `lib/prisma.ts`, assumes one
  long-lived connection pool — a pattern that doesn't translate cleanly to a function that
  spins up fresh for each request). Accepting Vercel's offer would have meant a second,
  differently-behaved copy of the backend, not a helpful addition.
- **The fix:** switching the "Application Preset" dropdown from the auto-detected "Services"
  option to the simpler "Vite" preset collapsed the whole multi-service flow back down to a
  single, ordinary static-site deployment — the same "Root Directory" concept already used on
  Railway, just applied to `frontend` instead of `backend`, with no `vercel.json` needed at
  all for this simple case.
- Confirmed working with `VITE_API_URL` set to the Railway backend's URL, then deployed.
  `curl` against the resulting `wellbeing-blue.vercel.app` returned `200`, with
  `<title>WellTrack</title>` present — genuinely serving the built frontend, not a blank or
  error page (also visually confirmed by Vercel's own auto-generated preview screenshot,
  which showed the real login form).

#### CORS and `FRONTEND_URL`, re-taught from the start — why it actually matters now

This was explained once already, back in the Phase 5/6 vertical-slice entry, but only ever
against `localhost`. It's worth re-explaining properly now that a real, third-party-hosted
frontend is involved, since that's the situation CORS actually exists to guard.

- **Two different websites, as far as a browser is concerned.** `wellbeing-blue.vercel.app`
  (the frontend) and `wellbeing-production-0b8f.up.railway.app` (the backend) are two entirely
  separate domains, run by two entirely separate companies, with no inherent relationship to
  each other at all. A browser has no way to know these two are "supposed" to work together —
  as far as it's concerned, this is indistinguishable from a random third-party website trying
  to talk to your bank's API.
- **This is precisely the scenario CORS exists to police.** Without any CORS configuration at
  all, a browser **refuses by default** to let JavaScript running on one website read the
  response from a request to a different website — imagine if any website you visited could
  silently make your browser send requests to your bank, your email, anywhere you happened to
  be logged in, and read the results. CORS is the mechanism that lets a *server* explicitly
  say "no really, it's fine, requests from this specific other website are allowed" — and
  `FRONTEND_URL`, read by `backend/src/app.ts`'s `cors({ origin: FRONTEND_URL, credentials: true })`
  (added back in the frontend vertical-slice entry), is exactly that explicit allow-list,
  currently naming only `http://localhost:5173`.
- **Why this was invisible during local development.** Locally, "two different websites" was
  actually true too — the frontend (`localhost:5173`) and backend (`localhost:4000`) are
  different ports, which browsers treat as different origins — but `FRONTEND_URL` already
  named that exact address, so it never caused a problem. The deployed frontend has a
  completely different address now, and the backend's allow-list doesn't yet know about it —
  which is why updating `FRONTEND_URL` to the real Vercel URL is a required step, not
  optional cleanup.
- **What it would look like if this step were skipped.** Not a clear, obvious error message —
  something more confusing: the register/login forms would appear to "hang" or fail with a
  generic network error in the browser's console, because the *browser itself* blocks the
  response before the frontend's own code ever gets to see it or show a useful message. This
  is a common, genuinely confusing first-time deployment trap, worth naming explicitly rather
  than only discovering it by hitting it.
- **Why `credentials: true` specifically matters here, again, now for real.** The refresh
  token cookie (from the Phase 2.3 entry) only ever gets sent/received on **credentialed**
  cross-origin requests — and browsers refuse to combine a wildcard CORS origin with
  credentials at all, which is exactly why `FRONTEND_URL` has to be an exact, specific address
  rather than something permissive like allowing any origin. This was true and already
  correctly configured for `localhost`; it now needs to be true for the real deployed address
  too.

### Why it's needed

Without updating `FRONTEND_URL`, the deployment would *look* complete — both halves live,
both individually responding — while actually being unusable together, for a reason that
wouldn't show up as an obvious server error anywhere, only as a confusing failure inside the
browser itself.

### State at end of this step

The frontend is deployed and confirmed serving correctly at `wellbeing-blue.vercel.app`.
`FRONTEND_URL` on Railway is being updated to match, right now, as the next immediate step —
until that's done and redeployed, register/login on the live frontend will fail due to CORS,
exactly as explained above.

### Verification

- `curl -o /dev/null -w "HTTP %{http_code}"` against the deployed Vercel URL — `200`.
- `curl | grep "<title>"` — confirmed `<title>WellTrack</title>` present, proving the real
  built app is being served, not a blank or default page.
- Vercel's own auto-generated screenshot of the deployment additionally showed the actual
  login form rendering correctly.

### Follow-up verification, once `FRONTEND_URL` was actually updated on Railway

The explanation above was written *before* the Railway variable was changed, to make the
reasoning clear ahead of time. Once it was updated to `https://wellbeing-blue.vercel.app` and
Railway redeployed, the fix was verified directly against the live services — not just
assumed from a "Deployment successful" badge, consistent with how every other deployment
claim in this log has been checked:

- **A CORS preflight request** (`curl -X OPTIONS .../api/auth/login` with
  `Origin: https://wellbeing-blue.vercel.app`) sent to the real Railway URL. Before the
  variable was updated, the response's `access-control-allow-origin` header came back as the
  old `http://localhost:5173` — proof the fix hadn't taken effect yet. After Railway finished
  redeploying, the same request returned `access-control-allow-origin:
  https://wellbeing-blue.vercel.app` — the backend now explicitly trusts the real frontend.
- **The full auth flow, driven with `curl` against production, using the real `Origin`
  header a browser would send:**
  1. `POST /api/auth/register` — `201 Created`, new user row returned.
  2. `POST /api/auth/login` — `200 OK`, with a `Set-Cookie: refreshToken=...; HttpOnly;
     Secure; SameSite=Lax` header, exactly as designed back in the refresh-token entry.
  3. `POST /api/auth/refresh`, sending that cookie back — `200 OK`, a fresh access token
     returned and the refresh cookie rotated (a new `Set-Cookie` with a different token
     value), matching the rotation behavior built and tested earlier.
  4. `POST /api/auth/logout` — `200 OK`, with `Set-Cookie: refreshToken=...; Expires=Thu, 01
     Jan 1970...` — the standard way a server tells a browser "delete this cookie now."
  - Every one of these four responses carried `access-control-allow-origin:
    https://wellbeing-blue.vercel.app` — confirming the *entire* auth flow, not just one
    endpoint, is reachable from the real deployed frontend now.
- **Caveat, noted honestly:** this test created one real user row in the production database
  (an obviously-labeled test address). There's no account-deletion endpoint yet — that's
  still a pending Phase 2 task — so it hasn't been cleaned up via the API. It's inert test
  data, not a functional problem, but worth naming rather than glossing over.

With this, the deployment is genuinely complete and working end-to-end: a real user, using a
real browser, at `https://wellbeing-blue.vercel.app`, can register and log in, and their
session is backed by a real Postgres database on Railway — not just two services that each
independently return `200` while silently unable to talk to each other.

### The access token + refresh token flow, explained step by step

The refresh-token entry earlier in this log explains *why* each design choice was made
(`HttpOnly`, rotation, separate secrets). What's missing so far is a plain walkthrough of how
the two tokens actually work together over the lifetime of a single visit — worth spelling
out now, using the exact production trace captured above as the concrete example.

There are two tokens at play, and they exist because of a trade-off: a token that's easy to
use on every request should also be one that doesn't matter much if it leaks, and a token
that's dangerous if it leaks should be used as rarely as possible. One token can't be good at
both, so this app uses two:

1. **Register or log in.** The server checks the email/password, and if they're correct,
   hands back *two* different tokens at once, each with a very different job:
   - An **access token** — a short-lived pass (15 minutes) that proves "this request really
     is from a logged-in user." It comes back in the JSON response body, and from here on the
     frontend attaches it to every API request it makes (in an `Authorization` header). Any
     endpoint that needs to know who's asking checks this token.
   - A **refresh token** — a long-lived pass (7 days) whose *only* job is to be exchanged
     later for a brand-new access token, so the user isn't forced to type their password again
     every 15 minutes. Crucially, this one is never handed to the page's JavaScript at all —
     it arrives only as the `HttpOnly` cookie seen in the trace above
     (`Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Lax`), which the browser
     stores and will keep sending automatically on future requests to `/api/auth/*`, without
     any frontend code ever being able to read or copy it.
2. **Using the app.** For the next 15 minutes, every request the frontend makes carries the
   access token, and the backend trusts it without touching the database session at all — this
   is the whole point of a JWT (JSON Web Token): it's cryptographically signed, so verifying it
   is just checking a signature, not a database lookup.
3. **The access token expires.** After 15 minutes, requests carrying it start failing with
   `401 Unauthorized`. This is expected and is *not* meant to log the user out — it's meant to
   trigger step 4 automatically, invisibly to the user.
4. **The frontend calls `POST /api/auth/refresh`.** No body is needed — the browser has
   already attached the `refreshToken` cookie automatically, because the browser handles
   cookies itself, unlike the access token, which the frontend has to attach manually. As seen
   in the trace above, the backend reads that cookie, verifies it, and responds with a brand
   new access token — *and* silently overwrites the cookie with a brand new refresh token too
   (rotation: a different token value than the one that was just sent in). The frontend swaps
   in the new access token and retries whatever request originally got the `401`, and the user
   never sees any of this happen.
5. **This repeats for up to 7 days** without the user ever re-entering their password — each
   refresh both extends the session and replaces the refresh token, so a single refresh token
   value is only ever "live" for a short window of normal use.
6. **Logging out** (`POST /api/auth/logout`) does the opposite of login: instead of setting the
   cookie, it tells the browser to delete it immediately — the
   `Set-Cookie: refreshToken=...; Expires=Thu, 01 Jan 1970...` seen in the trace above is the
   standard way a server does this (a cookie with an expiry date in the past is deleted by the
   browser right away). After this, even if someone still had the now-expired access token, no
   new one can be minted, because there's no refresh token left to redeem.

One thing worth naming plainly: this frontend/backend wiring for automatic refresh-on-401
(the frontend piece of steps 3–4 above) is still a *later*, not-yet-built Tasks.md item —
Phase 5/6's API client. Everything demonstrated in this entry was driven directly against the
backend with `curl`, standing in for what that future frontend code will do automatically.

### Final confirmation: a real person, in a real browser

Everything above was verified with `curl` — a genuine end-to-end test, but still a script
pretending to be a browser. The last, and most important, check is a real person doing the
same thing by hand: opening `https://wellbeing-blue.vercel.app` on an actual phone browser,
registering an account through the real UI, landing on the dashboard, logging out, and
logging back in — confirmed working. This is the check that actually matters most, since it's
the same experience any future real user of this app would have.

With this, WellTrack is genuinely deployed and usable, end to end, by anyone with the link —
not just reachable by automated requests from this machine.

---

## 2026-08-16 — Fixing a real production bug: direct links to any page but the homepage 404'd

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a real user (not automated testing)
tried the live app and got a genuine `404: NOT_FOUND` page from Vercel itself, on a page that
works completely fine in every other form of testing done so far.

### Background / concepts

#### What actually broke, and why nothing until now had caught it

- `curl` confirmed it precisely: `https://wellbeing-blue.vercel.app/` returns `200`, but
  `/login`, `/register`, and `/dashboard` — real, working routes inside the app — each return a
  genuine `404` **from Vercel's own server**, before the app's own code ever runs at all.
- **Why:** this is a single-page application (an "SPA") — React Router (`BrowserRouter` in
  `App.tsx`) decides what to show entirely with JavaScript running *in the browser*, by reading
  the current URL and rendering the matching page, without ever asking the server for a new
  page. That only works once the JavaScript has already loaded, though. The very first request
  for a page — someone typing a URL directly, opening a bookmark, clicking a shared link, or
  even just refreshing the browser while already on `/dashboard` — is a real HTTP request the
  *server* has to answer, before any of this app's own JavaScript is involved at all. Vercel,
  hosting this as a set of static files, looked for an actual file at `/dashboard` (there isn't
  one — only `index.html` exists), found nothing, and correctly reported `404` by its own
  reasonable logic. The fix has to tell Vercel "for any path that doesn't match a real file,
  just serve `index.html` anyway" — at which point the app's own JavaScript loads, sees the URL
  is `/dashboard`, and React Router takes it from there correctly.
- **Why every previous check missed this — a real gap, not a fluke.** Every earlier
  browser-based check in this log (the Playwright walkthroughs) ran against the **local Vite
  dev server**, which has this exact fallback behavior built in automatically — `vite dev`
  always serves `index.html` for any unrecognized path, precisely so SPA routing "just works"
  during development without anyone having to think about it. That convenience quietly hid the
  fact that *production* hosting doesn't do this by default at all. Meanwhile, every direct
  `curl` check against the real Vercel deployment only ever tested `/` (the homepage) — never a
  deeper route — so the gap had no chance to surface. The bug was found by a real person
  clicking around for real, not by any of this project's automated or manual verification,
  which is worth being honest about rather than glossing over.

#### The fix: telling Vercel explicitly, with a `rewrites` rule

- `frontend/vercel.json` (new) — a config file Vercel reads automatically for a project rooted
  at `frontend` — adds one **rewrite** rule: `{ "source": "/(.*)", "destination":
  "/index.html" }`. A rewrite (different from a *redirect*) serves different content at the
  same URL the browser asked for, invisibly — the browser's address bar still shows
  `/dashboard`, but the actual file served is `index.html`. This is exactly what's needed:
  the URL must stay whatever the user typed (React Router reads it to decide what to render),
  while the *content* served needs to be the app's shell regardless of which path was
  requested.
- This is a standard, well-known requirement for hosting any client-side-routed SPA as static
  files — not specific to Vercel, React, or this project; the same underlying problem (and the
  same rewrite-based fix) applies to any static host serving an app that owns its own routing.

### Why it's needed

Without this, the deployed app was only really usable if every single visit started from the
exact homepage — any bookmark, shared link, or browser refresh on any other page would show a
real user a raw, unstyled Vercel error page instead of the app. For a wellness-tracking app
someone might reasonably bookmark their dashboard or get a link sent to them, this is a
significant real-world usability bug, not a cosmetic one.

### Decisions

- **A `rewrites` rule in `vercel.json`, not a change to the React app itself.** The React
  app's own routing code is already correct — `BrowserRouter` and its routes work fine once
  the JavaScript loads. The gap was entirely on the hosting side (what happens *before* that
  JavaScript ever runs), which is exactly what `vercel.json` configures.

### State at end of this step

`frontend/vercel.json` exists with the SPA fallback rewrite. Pending: verifying against the
real Vercel preview deployment this PR generates (Vercel deploys a preview build per PR
automatically, confirmed by the "Vercel"/"Vercel Preview Comments" checks seen on earlier
PRs) — testing there, before this reaches production `main`, rather than only trusting the fix
in theory.

### Verification

- `curl` directly against the current production deployment, confirming the bug precisely
  before writing any fix: `/` → `200`, `/login` / `/register` / `/dashboard` → `404`.
- `npm run build` — compiled cleanly (this change doesn't touch application code, only hosting
  config, so no behavior change expected here — confirmed).
- **Confirmed fixed on real production**, after this PR merged: `curl` against
  `https://wellbeing-blue.vercel.app/dashboard` and `/login` both now return `200` (previously
  `404`), verified directly rather than assumed from the merge alone.

---

## 2026-08-16 — A harmless-but-alarming Vercel "Build Failed": the screenshot CI branch has no app in it

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a red "Build Failed" showed up in
Vercel's dashboard, understandably alarming to see. Worth explaining clearly why it happened,
why it was never actually a broken deployment of the real app, and the slightly fiddly fix.

### Background / concepts

#### What was actually failing, and why it wasn't the real app

- The failed deployment's **Source** was the `pr-screenshots` branch — not `main`, not any of
  this project's `feature/`/`fix/` branches. That branch was created much earlier in this
  project (see the CI screenshot workflow entries) specifically as a place to store the
  before/after `.png` images the PR-preview screenshot workflow generates. It's a **git orphan
  branch** — deliberately created with no shared history with `main` and no application code
  in it at all, just image files organized by PR number (`pr-31/after/*.png`, etc.).
- **Vercel's GitHub integration doesn't know or care that this branch is "special."** By
  default it tries to create a deployment for *every* branch pushed to a connected repository —
  including this one. Since this project's Vercel project is configured with Root Directory
  `frontend` (because the real app lives in `/frontend`, per the original Vercel deployment
  entry), and the `pr-screenshots` branch has no `frontend` folder at all, Vercel's very first
  step — entering that directory — fails immediately. Hence "Build Failed: The specified Root
  Directory 'frontend' does not exist," and the extremely short duration in the screenshot
  (`1s`) — consistent with failing before any real work (install, build) even started.
- **The real app was never at risk here.** Every actual feature/fix branch has a real
  `frontend` directory, so this failure mode is specific to this one orphan branch and has no
  effect on `wellbeing-blue.vercel.app` or any genuine preview deployment.

#### Why the "obvious" fixes (Ignored Build Step / `ignoreCommand`) don't work here

- Vercel has a built-in feature for exactly "skip deployments under some condition" — the
  **Ignored Build Step**, configurable either from the dashboard or via `vercel.json`'s
  `ignoreCommand`. It runs a shell command; exit code `1` means "build normally," exit code `0`
  means "skip this build, mark it Canceled instead of Error." That sounds like the fix — except
  Vercel's own documentation states this command **executes inside the Root Directory**. On the
  `pr-screenshots` branch, that directory doesn't exist, so there's nowhere for the ignore
  check itself to run — a genuine chicken-and-egg problem: the very mechanism meant to say
  "skip this" needs the thing that's missing in order to run at all.

#### The actual fix: give the branch just enough of a `frontend/` folder to be ignorable

- The CI workflow's "Publish screenshots to the pr-screenshots branch" step (which already
  creates and updates this orphan branch on every relevant PR) now also writes a tiny
  `frontend/vercel.json` containing `{"ignoreCommand": "exit 0"}` — nothing else, no real app
  code. This breaks the chicken-and-egg problem: the `frontend` directory now genuinely exists
  (satisfying Vercel's Root Directory requirement), Vercel can enter it and run the ignore
  check, and that check *always* returns "skip" (exit `0`), since this branch should never
  actually be built, ever, unconditionally.
- **The practical difference this makes:** instead of a red "Build Failed" (which looks like a
  real problem, and would reasonably worry anyone glancing at the deployments list), the
  outcome becomes a deliberate, clean "Canceled by Ignored Build Step" — confirmed directly
  afterward via `gh api repos/.../commits/<sha>/status`, which returned exactly that as
  Vercel's own status description.
- **Applied in two places**, both necessary: the CI workflow file itself (so every *future*
  push to this branch includes the stub automatically), and a one-off manual push of the same
  stub onto the branch as it exists *right now* (so the fix takes effect immediately, rather
  than waiting for the next PR that happens to touch `frontend/**` to trigger the workflow
  again).

### What was done

1. **`.github/workflows/pr-preview.yml`.** Added two lines to the existing "Publish
   screenshots to the pr-screenshots branch" step: create `frontend/` and write
   `frontend/vercel.json` with the unconditional `ignoreCommand`, right after the orphan
   branch's worktree is set up, and included it in the `git add` alongside the screenshot
   files.
2. **Applied the same fix directly to the live `pr-screenshots` branch**, using the identical
   `git worktree` technique the CI workflow itself uses, so the existing failed-deployment
   pattern stops immediately rather than only for future pushes.
3. **Verified directly, not assumed:** `gh api repos/wheelyk/Wellbeing/commits/<sha>/status`
   against the manually-pushed commit confirmed Vercel's own response —
   `"Canceled by Ignored Build Step"` — rather than trusting the fix was correct just because
   it matched the documentation's description.

### Why it's needed

A red "Build Failed" in a project's deployment history is the kind of thing that erodes trust
in "is my app actually working right now" at a glance, even when — as here — it's completely
unrelated to the real application. Fixing the noise, and writing down *why* it happened, keeps
Vercel's dashboard trustworthy as a signal rather than something to learn to ignore.

### Decisions

- **A stub `vercel.json` on the orphan branch, not a Vercel dashboard setting.** Covered
  above — the dashboard-level Ignored Build Step has exactly the same "runs inside Root
  Directory" limitation, so it wouldn't have solved this either; the fix has to make the
  directory exist in the first place.
- **Fixed both the workflow and the already-existing branch.** Fixing only the workflow would
  have left the *current* state of `pr-screenshots` (and its next few historical commits)
  still triggering the old failure until a fresh PR happened to touch `frontend/**` again.

### State at end of this step

Future pushes to `pr-screenshots` (from the CI screenshot workflow, exactly as before) will
show as a clean "Canceled" deployment in Vercel rather than a red error. No change to the real
application or any real deployment.

### Verification

- `gh api repos/wheelyk/Wellbeing/commits/<sha>/status` against the manually-pushed fix commit
  — confirmed Vercel's own status: `success` / `"Canceled by Ignored Build Step"`.

---
