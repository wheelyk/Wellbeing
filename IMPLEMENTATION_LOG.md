# WellTrack — Implementation Log

## What this document is

This is a step-by-step build log for the WellTrack project, written so that someone who is
**new to web development** can read it and understand not just *what* was done, but *why*
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
full the *first* time they appear — later entries link back rather than repeat themselves.

---

## Big picture: how the frontend and backend actually talk to each other

The individual scaffold entries below explain the backend and frontend *separately*, since
that's how they were built. But neither one is useful alone, so before diving into those
entries, here's how the two connect — the part that ties everything together.

**Two separate programs, running on two separate ports.** After Phase 0, running this
project locally means two things are running *at the same time*, each listening on its own
"door" (**port**) on your computer:

- The **backend** (Express), on port `4000` — a program whose only job is to receive
  requests and send back data. It has no visual appearance at all; it's not a webpage.
- The **frontend** (Vite dev server), on port `5173` — serves the actual webpage your
  browser displays: HTML, the React app, styling, images.

When you open the app in a browser, you're only ever looking at the frontend. The backend is
invisible to you directly — the frontend talks to it *behind the scenes*.

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

**Why the frontend needs to be told the backend's address.** The frontend has to know *where*
to send these requests. That's the purpose of `frontend/.env.example`'s `VITE_API_URL`
(currently `http://localhost:4000`) — a setting, not a hard-coded value, because the address
changes between environments (your laptop during development vs. wherever the app is
actually hosted once deployed in Phase 14). The frontend code will read this value and
prefix every API request with it, once Phase 5 builds the actual API client.

**Why CORS matters here specifically.** Browsers enforce a security rule: a webpage loaded
from one address (`http://localhost:5173`, our frontend) is blocked by default from making
requests to a *different* address (`http://localhost:4000`, our backend) — even though
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

## 2026-08-14 — Phase 0: Initialize the git repository and folder layout

**Task:** [Tasks.md](Tasks.md) → Phase 0 → "Initialize a git repository and monorepo
layout"

### Background / concepts

- **Git** is a *version control system*. It takes snapshots ("commits") of your code over
  time, so you can see history, undo mistakes, and work on changes safely without losing
  earlier versions. Almost every professional software project uses it. Running `git init`
  turns an ordinary folder into a git-tracked project by creating a hidden `.git` folder
  that stores all that history.
- A **repository** (or "repo") is just the project folder once git is tracking it.
- A **monorepo** is a single repository that holds more than one related project — in our
  case, the website the user sees (**frontend**) and the server that stores/serves their
  data (**backend**) — instead of splitting them into two separate repositories. The
  alternative, "polyrepo," would mean two separate git projects that have to be checked out
  and versioned independently. For a small MVP built by one team, a monorepo is simpler:
  one place to clone, one place to open in an editor, one history that shows how frontend
  and backend changed together.
- **Frontend** = the part of the application that runs in the user's browser (what they see
  and click). **Backend** = the part that runs on a server, handles requests, talks to the
  database, and enforces rules like "you can only see your own data."
- A **`.gitignore`** file tells git which files/folders to *never* track — e.g. dependency
  folders that can be regenerated (`node_modules/`), build output (`dist/`), and secrets
  (`.env` files containing passwords/keys). Without this, it's easy to accidentally commit
  a secret key to git history, which is hard to fully undo later.
- A **`README.md`** is the front door of a repository — usually the first file anyone
  (including future-you) reads. It should explain what the project is and how to run it.

### What was done

1. Ran `git init` in the project root — there was no git repository yet.
2. Created two empty top-level folders, `/frontend` and `/backend`, to hold the two
   projects. (Git doesn't track empty folders, so a placeholder `.gitkeep` file was added
   to each so they show up once committed.)
3. Wrote [README.md](README.md) explaining the monorepo layout and the local dev steps
   (start the database → run the backend → run the frontend).
4. Added a root `.gitignore` covering `node_modules/`, build output (`dist/`, `build/`),
   `.env` files, log files, and the local Claude Code tooling folder (`.claude/`), so none
   of those ever get committed by accident.

### Why it's needed

Nothing runs yet at this point — this step is purely about setting up a safe, organized
foundation before any real code is written: a place for history to be recorded (git), a
place for the two halves of the app to live (`/frontend`, `/backend`), and guardrails so
secrets and generated files don't end up in version control.

### Decisions

- **Monorepo over separate repos.** Reason: simpler to keep frontend and backend in sync
  while both are changing quickly during early MVP development. Requirements document
  explicitly allowed either approach.
- **No commit made yet.** `git init` starts a repository with zero history. We deliberately
  held off on the first commit until there was a coherent, working chunk of code — an empty
  folder skeleton isn't very meaningful to look back on later. (The first real commit will
  likely happen once the backend and/or frontend scaffolding is confirmed working.)

### State at end of this step

Git repository initialized, no commits yet. `/frontend` and `/backend` exist but are empty.

### Verification

Not applicable — there was no code to build or run yet, only folders and documentation.

---

## 2026-08-14 — Phase 0: Scaffold the backend (Node.js + Express + TypeScript)

**Task:** [Tasks.md](Tasks.md) → Phase 0 → "Scaffold backend: Node.js + Express +
TypeScript project"

### Background / concepts

- **Node.js** is a program that lets JavaScript run outside a web browser — e.g. as a
  server on a computer, listening for requests. Our backend is a Node.js program.
- **npm** ("Node Package Manager") is the tool that comes with Node.js for installing
  reusable code written by other people (called *packages* or *dependencies*), and for
  running project scripts. `npm init -y` creates a `package.json` file, which is the
  "identity card" of a Node project: its name, version, dependency list, and the commands
  (`scripts`) you can run against it (like `npm run dev`).
- **Dependencies vs. devDependencies**, both listed in `package.json`:
  - *Dependencies* are packages the app needs to actually run in production (e.g.
    `express`, the web server library itself).
  - *devDependencies* are packages only needed while developing (e.g. TypeScript's compiler,
    or a tool that auto-restarts the server on file changes) — they aren't needed once the
    app is built and running for real users.
- **Express** is a small, very widely used library for building web servers in Node.js. It
  lets you define *routes* — "when a request comes in for this URL and this HTTP method, run
  this function and send back a response." Almost every backend endpoint in this project
  (login, save a symptom log, fetch trends, etc.) will be an Express route.
- **TypeScript** is JavaScript with an added *type system*. Plain JavaScript lets you write
  `user.emial` (typo) and it will only fail when that exact line runs, maybe in production
  in front of a real user. TypeScript checks these kinds of mistakes *before* the code ever
  runs, while you're still writing it, which catches a large class of bugs early — especially
  valuable in a health-data app where a silent bug could mean a user's data is recorded
  wrong. Because browsers and Node.js don't understand TypeScript directly, it has to be
  *compiled* ("transpiled") into plain JavaScript first.
- **`tsconfig.json`** configures the TypeScript compiler: which JavaScript version to target,
  how strict the type checking should be, where source files live (`src`), and where
  compiled output should go (`dist`). We turned on `"strict": true`, which enables the
  full set of TypeScript's safety checks — the recommended setting for any new project.
- **`cors`** (Cross-Origin Resource Sharing) is a browser security rule: by default, a
  webpage served from one address (e.g. `http://localhost:5173`, our future frontend) is not
  allowed to make requests to a server on a different address (e.g. `http://localhost:4000`,
  our backend) unless the backend explicitly says "requests from other origins are allowed."
  The `cors` package adds the necessary permission headers so our frontend will actually be
  able to talk to our backend once both exist.
- **`dotenv`** loads configuration values (like a port number, or later, database
  passwords and secret keys) from a local `.env` file into the running program, instead of
  hard-coding them in the source code. This matters because `.env` is git-ignored — secrets
  never get committed — while an example file, **`.env.example`**, *is* committed, listing
  which variables are needed (with placeholder/blank values) so anyone setting up the
  project knows what to configure.
- **`ts-node-dev`** runs a TypeScript project directly (compiling on the fly) and
  automatically restarts the server whenever a source file changes — similar in spirit to
  the commonly-known tool `nodemon`, but with built-in TypeScript support. This is a
  developer convenience only (a `devDependency`); it's not used when the app is actually
  deployed.
- A **health-check endpoint** (here, `GET /api/health`) is a minimal route that just replies
  "I'm alive" (`{"status":"ok"}`). It doesn't do anything related to the product itself —
  its only purpose is to give us (and later, hosting platforms) an easy way to confirm the
  server is running and reachable.

### What was done

1. Ran `npm init -y` inside `/backend`, generating `backend/package.json`.
2. Installed the packages the running app needs (dependencies): `express`, `cors`,
   `dotenv`.
3. Installed packages only needed for development (devDependencies): `typescript`,
   `ts-node-dev`, plus **type definition** packages `@types/node`, `@types/express`,
   `@types/cors`. (Type definitions are separate small packages that describe the shapes of
   a JavaScript library's functions/objects for TypeScript, since the underlying libraries
   themselves are written in plain JavaScript.)
4. Added `backend/tsconfig.json` telling TypeScript: read source from `src/`, write
   compiled JavaScript to `dist/`, and enable strict type checking.
5. Created `backend/src/app.ts` — builds and configures the Express application: turns on
   `cors`, turns on JSON request-body parsing (so the server can read data sent by the
   frontend as JSON), and defines the one route so far, `GET /api/health`.
6. Created `backend/src/index.ts` — the actual entry point that starts the server: loads
   `.env` values, then calls `app.listen(port)` to start accepting real network requests on
   a port (default `4000`).
7. Added `backend/.env.example` documenting the one environment variable used so far,
   `PORT`.
8. Added three npm scripts to `package.json`:
   - `npm run dev` → starts the server with auto-restart-on-change, for local development.
   - `npm run build` → compiles the TypeScript in `src/` into plain JavaScript in `dist/`.
   - `npm start` → runs the already-compiled JavaScript (`dist/index.js`) — this is how the
     app would actually run in production, where nothing gets compiled on the fly.

### Why it's needed

This is the skeleton every backend feature in this project will be built on top of: a
server that can receive HTTP requests and send back responses. Every future endpoint in
[Tasks.md](Tasks.md) (register, login, save a symptom log, fetch the dashboard, etc.) is
just another Express route added to this same app. Getting this foundation right —
TypeScript for safety, environment variables for configuration/secrets, a working dev
loop — makes every later step faster and less error-prone.

### Decisions

- **Split `app.ts` from `index.ts`.** `app.ts` only builds and configures the Express app
  object; `index.ts` is the only file that actually starts listening on a network port.
  Reason: later, in Phase 13 (automated testing), test code needs to send fake requests
  directly into the app *without* starting a real server on a real port. Keeping the "build
  the app" logic separate from the "start listening" logic makes that possible, and is a
  common, well-understood pattern in Express projects.
- **`moduleResolution: "Bundler"` in `tsconfig.json`.** The version of TypeScript installed
  (7.x, very new) removed the older `"node"` option we tried first (it now errors with
  `TS5108`). `"Bundler"` is the modern replacement that works correctly with our setup
  (`module: "commonjs"` + `esModuleInterop`). This is a low-level compiler detail — it
  doesn't change any application behavior, just which internal algorithm TypeScript uses to
  find imported files.

### State at end of this step

`/backend` is a working Express + TypeScript project with exactly one route
(`GET /api/health`). No database connection, no authentication, no real product features
yet — those come in later phases.

### Verification

Writing code is not the same as knowing it works, so every step includes a verification
pass:

1. **`npm run build`** — compiled the TypeScript with no errors, producing
   `backend/dist/app.js` and `backend/dist/index.js`.
2. **`node dist/index.js`** — ran the *compiled* server (the same thing that would happen
   in production) and confirmed it printed `Backend listening on port 4000`.
3. **`curl http://localhost:4000/api/health`** — sent a real HTTP request to the running
   server and got back `{"status":"ok"}`, confirming the route works end-to-end.
4. Stopped the test server process afterward and confirmed port `4000` was freed, so it
   wouldn't be left running in the background or conflict with future runs.

---

## 2026-08-14 — Phase 0: Push the initial commit to GitHub, and adopt a branch strategy

**Task:** Not a [Tasks.md](Tasks.md) checklist item directly — this is the "get the code
onto GitHub" step that naturally follows scaffolding, and it sets up how *every future task*
will be delivered from here on.

### Background / concepts

- So far, git had only been recording history **locally**, inside the hidden `.git` folder
  on this one computer. A **remote** is a copy of the repository hosted somewhere else —
  here, on **GitHub**, a website that hosts git repositories and adds collaboration features
  on top (pull requests, code review, issue tracking, etc.). `git push` uploads local
  commits to a remote; `git pull` downloads commits made elsewhere.
- A remote is given a short nickname so you don't have to type its full URL every time. The
  conventional default nickname for "the main copy of this project on GitHub" is
  **`origin`**. `git remote add origin <url>` records that nickname once; after that,
  `git push origin main` (or just `git push`, once a branch is "tracking" a remote branch)
  knows where to send commits.
- A **branch** is an independent line of development inside a repository. Every repository
  starts with one default branch (by convention now usually called **`main``**, historically
  `master`). Creating an additional branch lets you make changes *without* touching `main`
  until you're ready — the two branches only "merge" back together when you explicitly ask
  git to do so.
- A **pull request** (PR) is a GitHub feature, not a raw git feature: it's a request to merge
  one branch into another (usually a feature branch into `main`), shown as a page where the
  proposed changes (the "diff") can be reviewed, commented on, and approved *before* they
  become part of `main`. Even solo developers commonly use PRs against their own repos,
  because it gives a deliberate "review, then merge" checkpoint instead of code landing on
  `main` the instant it's written.

### What was done

1. Attempted to publish the repo to GitHub via VS Code's built-in "Publish to GitHub"
   button. VS Code picked an organization the user belongs to, `wheelyk-collab`, and tried
   to create/push to `wheelyk-collab/Wellbeing` — but the signed-in GitHub account didn't
   have push permission there, so VS Code offered to fork it instead. That fork offer was
   correctly declined (forking would have created a *copy* of someone else's repo, not the
   intended destination), but by that point GitHub had already created an empty
   `wheelyk-collab/Wellbeing` repository as the first step of the publish flow.
2. Confirmed the intended destination was actually the user's own personal account,
   `wheelyk/Wellbeing`, not the `wheelyk-collab` org.
3. Checked whether `wheelyk/Wellbeing` already existed on GitHub (`git ls-remote`) — it
   didn't yet, so the user created it manually on github.com as a completely empty
   repository (no auto-generated README/license/`.gitignore`, since this project already
   has its own).
4. Found that VS Code's earlier publish attempt had already added a git remote named
   `origin` pointing at the wrong repo (`wheelyk-collab/Wellbeing`). Fixed it with
   `git remote set-url origin https://github.com/wheelyk/Wellbeing.git` rather than
   `git remote add`, since the nickname `origin` was already taken.
5. Renamed the local default branch to `main` (`git branch -M main`) and ran
   `git push -u origin main`, which uploaded the existing initial commit and set `main` to
   "track" `origin/main` — meaning future plain `git push`/`git pull` commands on this
   branch will automatically know to talk to this remote/branch pair without repeating the
   full command.

### The fiasco, walked through slowly (for git beginners)

It's worth slowing down on this because it's a *very* common way to trip up early on, and
none of it broke anything permanently.

Think of it in three layers:

- **Your computer** has the actual project folder and, inside it, a `.git` folder recording
  history. This is "local."
- **GitHub** hosts *copies* of repositories on their servers, under an *owner* — either a
  person's account (like `wheelyk`) or an *organization* shared by multiple people (like
  `wheelyk-collab`). Anyone can host as many repos as they like; ownership is what controls
  who's allowed to push changes to a given one.
- **VS Code's "Publish to GitHub" button** is a shortcut that does two GitHub-related steps
  for you in one click: (1) create a brand-new empty repo on GitHub under some owner, then
  (2) push your local commits into it. The problem was entirely in step (1): VS Code guessed
  the wrong *owner*.

Here's the sequence of events:

1. You clicked "Publish to GitHub" in VS Code.
2. VS Code asked GitHub to create a new repo called `Wellbeing`, but under the
   `wheelyk-collab` organization rather than your personal `wheelyk` account — likely because
   that org was offered as an option and got picked, whether by default or by selection.
   GitHub happily created it, since *creating* a repo under an org you belong to is allowed
   even if you don't have full write/push permissions to repos there afterward (permissions
   for an org can be scoped per-repo by an admin, separately from "is a member").
3. VS Code then tried step (2), pushing your commits into that freshly created repo, and
   *that* failed — the account didn't have push rights there. GitHub/VS Code's response to a
   failed push due to missing permissions is to offer a fork ("make your own copy elsewhere
   and push there instead").
4. You clicked **Cancel**, correctly, because forking is the wrong fix here — forking would
   have created yet another repo (`your-account/Wellbeing`, a copy *of* `wheelyk-collab`'s
   now-empty repo) rather than simply using the personal repo you actually wanted.
5. Net result of the failed attempt: an empty, unused repo now exists at
   `wheelyk-collab/Wellbeing` on GitHub (harmless — it has no code in it, and deleting it is
   optional cleanup you can do later directly on github.com), and — importantly — **your
   local project already had a remote called `origin` recorded, pointing at that wrong repo**,
   even though nothing had actually been pushed there. VS Code sets up the remote as part of
   step (1), before step (2) (the push) even runs.
6. Once you created the *correct* empty repo yourself, `wheelyk/Wellbeing`, the local project
   still had that leftover, wrongly-pointed `origin` — which is exactly what the "repoint"
   step below fixed.

Nothing here was destructive: no code was lost, nothing was pushed to the wrong place, and
the only actual side effect was one harmless empty repo sitting unused on GitHub.

### What the "repoint" command actually did

Recall from *Background / concepts* above: `origin` is just a **nickname** your local git
config stores for a remote URL — like a saved contact in a phone. VS Code had already saved
a contact named "origin" with the wrong phone number (`wheelyk-collab/Wellbeing`).

There are two different git commands that can look similar but do different things:

- `git remote add origin <url>` — **creates a new contact** named `origin`. This fails with
  an error (`remote origin already exists`) if a contact with that name is already saved,
  which is exactly the error hit when this was tried first.
- `git remote set-url origin <url>` — **edits the existing contact's number** without
  changing its name. This is the correct command once a remote nickname already exists but
  points at the wrong place, which was the actual situation here.

So the fix was:

```
git remote set-url origin https://github.com/wheelyk/Wellbeing.git
```

This changed what `origin` points to — from `wheelyk-collab/Wellbeing` to
`wheelyk/Wellbeing` — without needing to delete and recreate the remote, and without
touching any of the actual commit history. Running `git remote -v` afterward (which lists
all saved remotes and their URLs) confirmed `origin` now pointed at the right repo before
anything was pushed to it, which is why it was checked as part of *Verification* below.

### Why it's needed

Code that only exists on one laptop isn't backed up, isn't shareable, and can't go through
any kind of review process. Pushing to GitHub gives the project an off-machine backup and,
more importantly, unlocks the collaboration workflow (branches + pull requests) described
below — which is how essentially all professional software teams manage change safely.

### The branch strategy going forward, and why it matters

**The rule from here on: nothing gets written directly to `main`. Every task gets its own
branch, and changes reach `main` only through a pull request.**

Concretely, for each task from [Tasks.md](Tasks.md):

1. Create a new branch off `main` (e.g. `git checkout -b backend/auth-register` for "add the
   registration endpoint"). The branch name briefly describes what it's for.
2. Make the change, commit it, verify it builds and runs (the same build/run verification
   habit used in every entry in this log), and push the branch to GitHub
   (`git push -u origin <branch-name>`).
3. Open a pull request on github.com from that branch into `main`.
4. The user reviews the PR (reads the diff, checks the description) and merges it — or asks
   for changes first.
5. `main` only ever contains code that has been through this review step.

**Why this matters, even for a small/solo project:**

- **`main` stays deployable.** If `main` always represents "reviewed, working code," it's
  always safe to deploy from, safe to branch new work off of, and safe for anyone (including
  future collaborators) to pull down and trust.
- **Mistakes are contained.** A half-finished or broken change lives on its own branch and
  simply doesn't affect anything else until it's merged. Compare that to committing straight
  to `main`: a broken commit there immediately affects the "official" version of the project.
- **Review is a real safety net, not a formality.** This project stores **health data** —
  the requirements doc is explicit that security and correctness matter (e.g. "one user must
  never see another user's logs"). A PR is the natural checkpoint to re-read exactly what
  changed before it becomes permanent, which matters more here than in a typical toy project.
- **History becomes readable.** Each PR corresponds to one task and (ideally) one coherent
  purpose, so `git log` on `main` reads like a story of features being added, rather than a
  tangle of in-progress, half-working commits.
- **It's how real teams work**, so practicing it now — even solo — means the habits (small
  focused branches, descriptive PRs, nothing untested landing on `main`) are already in
  place if/when this project ever gets a second contributor.

### Decisions

- **Fixed the wrong `origin` remote rather than deleting/re-adding it.** `git remote add`
  fails if the nickname already exists; `git remote set-url` updates an existing nickname's
  URL in place, which is the correct tool once a remote already exists but points at the
  wrong place.
- **Left the accidental `wheelyk-collab/Wellbeing` empty repo as-is for now** — it's empty
  and harmless, and deleting a GitHub repo is the user's call to make (and to do directly on
  github.com), not something to do automatically on their behalf.
- **Adopted branch-per-task + PR-per-branch as the standing workflow**, agreed with the user:
  Claude creates and pushes branches; the user reviews and merges pull requests on
  github.com. Claude does not merge to `main` or push directly to `main` going forward.

### State at end of this step

`main` on GitHub (`wheelyk/Wellbeing`) now matches the local `main` branch: the initial
commit (project docs + backend scaffold) is live and backed up remotely. All future work
will arrive via feature branches and pull requests rather than direct commits to `main`.

### Verification

- `git push -u origin main` completed with `branch 'main' set up to track 'origin/main'`,
  confirming the push succeeded and the tracking relationship was established.
- `git remote -v` confirmed `origin` now points at `https://github.com/wheelyk/Wellbeing.git`
  for both fetch and push.

---

## 2026-08-14 — Phase 0: Scaffold the frontend (React + TypeScript + Tailwind CSS)

**Task:** [Tasks.md](Tasks.md) → Phase 0 → "Scaffold frontend: React + TypeScript project
(Vite recommended) with Tailwind CSS configured."

**Delivered via branch:** `frontend/scaffold` (see *Branch & PR* section below — this is the
first task done under the new branch-per-task workflow).

### Background / concepts

- **React** is a JavaScript library for building user interfaces out of reusable
  **components** — small, self-contained pieces of UI (e.g. a button, a mood-picker, an
  entire page) written as functions that return what should appear on screen. Almost every
  screen in [Tasks.md](Tasks.md) (Dashboard, History, Trends, Quick Add forms) will be one
  or more React components.
- **Vite** ("veet") is a build tool/dev server for frontend projects. Two jobs: (1) while
  developing, it serves the app instantly and updates the browser the moment a file is
  saved (**Hot Module Reload / HMR** — no manual refresh needed), and (2) for production, it
  bundles all the source files into a small number of optimized `.js`/`.css` files that a
  browser can download efficiently. It plays the same overall role for the frontend that
  `ts-node-dev`/`tsc` play for the backend (see the earlier backend-scaffold entry), just
  with browser-specific concerns (bundling, asset handling) added on top.
- **`npm create vite@latest`** is a scaffolding command: instead of hand-writing every
  starter file, it downloads a known-good project template (here, the `react-ts` template —
  React plus TypeScript) and lays it out for you. This is the frontend equivalent of what
  `npm init` did for the backend, just with a lot more starter files because a UI project
  has more moving parts (HTML entry point, component files, build config) than a bare
  Node script.
- **Tailwind CSS** is a *utility-first* CSS framework. Instead of writing custom CSS class
  names and rules in a separate stylesheet (e.g. `.hero-button { padding: 8px; ... }`),
  you compose small, single-purpose utility classes directly in your markup — e.g.
  `className="flex min-h-screen items-center justify-center"` means "use flexbox, make this
  at least the full screen height, center children horizontally and vertically." The
  requirements doc calls for a "calm, uncluttered" interface with large, consistent
  controls; Tailwind's small composable utilities make it fast to keep spacing, sizing, and
  color consistent across many components without writing (and maintaining) a large custom
  CSS file by hand.
- **Tailwind v4** (the version installed here) works differently from older Tailwind
  versions beginners may see in tutorials: earlier versions needed a separate `tailwind.config.js`
  plus a PostCSS setup step (`npx tailwindcss init -p`). Version 4 instead ships a Vite
  plugin (`@tailwindcss/vite`) that hooks directly into Vite's build pipeline, and is turned
  on with a single line in the main CSS file (`@import "tailwindcss";`) — no separate config
  file required to get started.

### What was done

1. Deleted the placeholder `frontend/.gitkeep` file (no longer needed once real files exist
   in the folder).
2. Ran `npm create vite@latest . -- --template react-ts` inside `/frontend`, generating the
   standard Vite React+TypeScript starter: `index.html` (the one real HTML file the browser
   loads), `src/main.tsx` (mounts the React app into that HTML), `src/App.tsx` (the starter
   root component), TypeScript config files, and `vite.config.ts`.
3. Ran `npm install` to download React, Vite, and their supporting packages into
   `frontend/node_modules` (git-ignored, same reasoning as the backend).
4. Installed `tailwindcss` and `@tailwindcss/vite`, then added the Tailwind plugin to
   `vite.config.ts` alongside the existing React plugin.
5. Replaced the generated `src/index.css` with a single line, `@import "tailwindcss";`,
   which is all Tailwind v4 needs to activate its utility classes project-wide.
6. Replaced the generated `src/App.tsx` — which ships as a full demo page with Vite/React
   logos and a click-counter button, meant to showcase Vite's features rather than be a real
   starting point — with a minimal placeholder component that uses a few Tailwind utility
   classes (`flex`, `min-h-screen`, `items-center`, `justify-center`, text styling), so it
   both compiles cleanly and visibly proves Tailwind is working. Deleted the now-unused demo
   assets (`App.css`, logo images) that only that placeholder page referenced.
7. Set the page `<title>` in `index.html` to "WellTrack" (was the generic "frontend").
8. Added `frontend/.env.example` documenting `VITE_API_URL`, the setting the frontend will
   later use to know where the backend API lives. (Vite requires env vars exposed to the
   browser to be prefixed with `VITE_` — anything without that prefix is intentionally kept
   server/build-only and never bundled into client code, as a safety measure against
   accidentally shipping secrets to the browser.)
9. Rewrote `frontend/README.md` (Vite's generated one is generic template boilerplate) with
   WellTrack-specific local-dev instructions.

### Why it's needed

This is the browser-side counterpart to the backend scaffold: a working React + TypeScript
project, with a styling system in place, that every future screen (Dashboard, Quick Add,
History, Trends, Settings) gets built inside of. Configuring Tailwind now — rather than
later — means every component written from here on can immediately use it, instead of
retrofitting styling once dozens of components already exist.

### Decisions

- **Removed the Vite/React demo content rather than leaving it in place.** A freshly
  scaffolded Vite project includes a full demo page (logos, a counter button, links to Vite
  docs) meant to show off features, not to be shipped. Leaving it in would mean the very
  first real screen written later has to *replace* a working page rather than fill an empty
  one, and it isn't representative of the calm/minimal interface the requirements describe.
  Removed the matching now-unused asset files at the same time, rather than leaving dead
  files behind.
- **Used Tailwind v4's Vite-plugin setup over the older PostCSS-based setup.** It's fewer
  moving parts (no separate `tailwind.config.js`/`postcss.config.js` needed to get started)
  and is the officially recommended path for new Vite projects as of the installed version.
  Worth knowing if following older tutorials, which usually show the v3-style setup instead.
- **Kept Vite's own generated `frontend/.gitignore`** (covering `node_modules`, `dist`, editor
  files) alongside the root one rather than removing it — harmless duplication, and it's the
  standard file Vite ships with every project of this kind.

### State at end of this step

`/frontend` is a working React + TypeScript + Tailwind CSS project rendering a single
placeholder "WellTrack" page. No routing, no API calls, no real screens yet — those start in
Phase 5.

### Verification

1. **`npm run build`** — ran `tsc -b && vite build` with no errors, producing
   `frontend/dist/` with a bundled `index.html`, JS, and CSS file.
2. Inspected the built CSS output and confirmed it contained real generated Tailwind rules
   (e.g. a `min-height` rule from the `min-h-screen` utility) — proving Tailwind is actually
   processing the utility classes used in `App.tsx`, not just installed-but-inactive.
3. **`npm run dev`** — started the real Vite dev server and used `curl` to fetch
   `http://localhost:5173/`, confirming it served the expected HTML shell with the
   `<title>WellTrack</title>` tag set in step 7 above.
4. Stopped the dev server process afterward and confirmed port `5173` was freed.

### Branch & PR

This task was the first one done under the branch-per-task workflow agreed in the previous
entry: all of the above happened on a branch named `frontend/scaffold` (created with
`git checkout -b frontend/scaffold` off `main`), not on `main` directly. Next: commit this
work on that branch, push it to GitHub with `git push -u origin frontend/scaffold`, and open
a pull request from `frontend/scaffold` into `main` for review before it merges.

---

## 2026-08-14 — Tooling: add CLAUDE.md, and moving a new file onto its own branch mid-flight

**Task:** Not a [Tasks.md](Tasks.md) checklist item — running Claude Code's built-in `/init`
command, which generates a `CLAUDE.md` file, plus the git housekeeping needed to deliver it
through the project's normal branch/PR workflow rather than as a stray uncommitted file.

### Background / concepts

- **What `CLAUDE.md` is.** Claude Code (the AI coding assistant driving this whole build) re-reads
  the conversation from scratch every time a new chat session starts — it doesn't remember
  earlier sessions automatically. `CLAUDE.md`, placed at the repo root, is a file Claude Code
  loads automatically at the start of every session in this repo, so a brand-new session
  immediately knows things like "how do I run the tests here," "what's the folder structure,"
  and, specific to this project, "work task-by-task from `Tasks.md`, always through a branch
  and PR, and write it up in `IMPLEMENTATION_LOG.md`." Think of it as an onboarding doc — not
  for a human new hire, but for a fresh AI session that otherwise has no memory of anything
  in this log. It's genuinely useful for a human contributor too, since it's just documentation
  sitting in the repo like any other file.
- **`git stash`.** Sometimes you need to switch which branch you're working on, but you have
  uncommitted changes sitting in your files that aren't ready to be committed yet — and git
  normally won't let you switch branches if doing so would overwrite or lose those changes.
  `git stash` temporarily "puts away" your uncommitted changes (like sweeping papers off a
  desk into a drawer), leaving your files matching the last commit, so you're free to switch
  branches, pull, or do anything else with a clean working tree. `git stash pop` takes the
  most recently stashed changes back out of the drawer and reapplies them to whatever branch
  you're currently on. By default, `git stash` only stashes changes to files git is already
  tracking — a brand-new file that's never been committed (an **untracked** file) is left
  alone unless you add the `-u` flag (`git stash -u`), which was needed here since the new
  `CLAUDE.md` file had never been committed yet.
- **A branch being "ahead" or "behind."** Git can compare any two branches (or a local branch
  against its remote counterpart) and count how many commits exist on one that the other
  doesn't have yet. "Behind by 2" means the other side (here, `origin/main` on GitHub) has 2
  commits your local branch doesn't have — usually because someone merged something on
  GitHub's website directly, without your local copy being told about it yet. This is
  informational, not an error: your local copy is just temporarily out of date until you run
  `git fetch` (download the new history) or `git pull`/`git merge` (download *and* apply it).
- **Fast-forward merge.** When the branch you're merging in is simply "ahead" with no
  conflicting changes of its own, git can update your branch by just moving its pointer
  forward to match — no new "merge commit" needs to be created, and nothing about the
  history is rewritten or combined. This is the simplest, safest kind of merge, and is what
  happened repeatedly in this step (`git merge --ff-only origin/main`).

### What was done

1. Ran the `/init` slash command, which inspected the repo (package.json files, README,
   requirements doc, existing config) and generated `CLAUDE.md` at the repo root — while
   still on the `frontend/scaffold` branch, which by this point was fully committed and
   already merged into `main` via PR #1.
2. Since `CLAUDE.md` isn't really part of the frontend scaffold work, it was moved onto its
   own branch rather than being tacked onto an already-merged branch:
   - `git stash -u` — put the new, uncommitted `CLAUDE.md` file aside.
   - `git checkout main` then `git pull` — switched to `main` and fast-forwarded it to pick
     up the already-merged `frontend/scaffold` work.
   - `git checkout -b docs/claude-md` — created a fresh branch off the now-up-to-date `main`.
   - `git stash pop` — brought `CLAUDE.md` back out of the stash, now sitting on the new
     branch as an untracked file, ready to commit.
3. Committed `CLAUDE.md`, pushed `docs/claude-md`, and opened **PR #2** with `gh pr create`.
4. The user asked to double check nothing had been lost during the stash/branch shuffle.
   Verified with `git stash list` (empty — nothing left behind in the "drawer"),
   `git status` (clean working tree), and `git branch -vv` (confirmed `frontend/scaffold`
   still pointed at its expected last commit, matching GitHub exactly).
5. That check also revealed local `main` was "behind `origin/main`" by 2 commits — because
   the user had already merged PR #2 on GitHub while this verification was happening.
   Nothing was missing; local `main` just hadn't caught up yet. Fixed by fetching and running
   `git merge --ff-only origin/main`, bringing local `main` fully in sync with GitHub.

### Why it's needed

`CLAUDE.md` makes every future Claude Code session in this repo productive immediately,
without needing this entire implementation log re-read (or re-explained by the user) from
scratch — it's a compact, current summary of "how do I run this, and how does work get done
here." Handling the git side carefully (stash → branch → pop, then verifying) matters because
it's exactly the kind of moment — moving a file between branches — where someone new to git
often worries something got silently lost; walking through the verification explicitly
demonstrates that git's stash mechanism is safe when used deliberately, and shows the actual
commands used to *prove* nothing was lost rather than just asserting it.

### Decisions

- **Gave `CLAUDE.md` its own branch/PR rather than adding it to `frontend/scaffold` or
  committing it straight to `main`.** It's an unrelated, self-contained change (repo-wide
  documentation, no app code), and `frontend/scaffold` had already been merged by the time
  it was created — bundling it in would have meant either reopening merged work or breaking
  the "everything through review" rule this same file documents.
- **Verified rather than assumed** after the stash/branch sequence, at the user's request —
  a good general habit any time git history gets rearranged (stash, rebase, cherry-pick), not
  just something specific to this step.

### State at end of this step

`CLAUDE.md` is merged into `main` via PR #2. Local `main` is fully in sync with
`origin/main` (both PR #1 and PR #2 merged in, 5 commits total on `main`). No stashes remain.

### Verification

- `git stash list` → empty, confirming nothing was left stranded in a stash.
- `git status` → clean working tree on every branch touched.
- `git branch -vv` → confirmed `frontend/scaffold`, `docs/claude-md`, and `main` each pointed
  at the exact commits expected, matching their `origin/*` counterparts.
- `git fetch` + `git log main..origin/main` → identified the 2 "missing" commits as the
  already-merged PR #2, not lost work.
- `git merge --ff-only origin/main` → brought local `main` current; confirmed via `git log`
  showing the merge commits for both PR #1 and PR #2 present in history.

---

## 2026-08-14 — Tooling: install Docker Desktop (needed to run PostgreSQL locally)

**Task:** Prerequisite for [Tasks.md](Tasks.md) → Phase 0 → "Set up PostgreSQL locally
(Docker Compose recommended...)" — pulled forward because it blocks implementing
`POST /api/auth/register`, which needs a real database to create user accounts in.

### Background / concepts

- **Why a database is needed at all here.** Registering a user means permanently storing
  their account (email, hashed password, etc.) somewhere that survives the server
  restarting. So far this project has no database — Phase 0/1 set that up. Requirements §4
  specifies **PostgreSQL** as the database engine.
- **A container** packages an application together with everything it needs to run
  (its own tiny filesystem, libraries, configuration) so it runs identically no matter what
  computer it's on — you don't have to manually install PostgreSQL itself, configure it, and
  hope it matches what teammates or a production server have. **Docker** is the tool that
  builds, runs, and manages containers. **Docker Desktop** is the Windows/Mac application
  that provides Docker's engine (the background service actually running containers) plus a
  GUI for managing them.
- **Why Docker needs WSL2 on Windows.** Containers, as built by Docker, are fundamentally a
  Linux technology — the isolation tricks they rely on are part of the Linux kernel. Windows
  doesn't have that kernel, so Docker Desktop runs a lightweight virtualized Linux
  environment underneath to actually execute containers. On modern Windows, that's done via
  **WSL2** ("Windows Subsystem for Linux," version 2) — a real, fairly minimal Linux kernel
  that Microsoft ships as part of Windows, rather than a heavier traditional virtual machine.
  Docker Desktop needs WSL2 installed and enabled to have somewhere to actually run
  containers.
- **A WSL "distribution."** WSL can host one or more Linux **distributions** ("distros" —
  a specific Linux operating system, e.g. Ubuntu, Debian) side by side, similar to how you
  could dual-boot different operating systems, except they run simultaneously and
  lightweight. Running `wsl -l -v` after installing WSL reported *"has no installed
  distributions"* — that sounded alarming, but turned out to be irrelevant here: Docker
  Desktop doesn't need a user-visible distro like Ubuntu at all. It quietly creates and
  manages its own internal utility distros (named `docker-desktop` and
  `docker-desktop-data`) purely to run containers in — those aren't meant to show up as
  something you'd `wsl` into and use directly, so their absence from `wsl -l -v` wasn't a
  problem.
- **Docker's optional sign-in.** Docker Desktop's UI offers to sign in with a Docker Hub
  account on first launch. This is unrelated to whether Docker actually works — the Docker
  *engine* (what actually runs containers) functions fully without being signed in, for
  personal/local development use. Signing in mainly matters for things this project doesn't
  need yet, like publishing your own container images to Docker Hub. Confirmed working
  without any sign-in by running `docker ps` successfully (with an empty result, since no
  containers exist yet).

### What was done

1. Installed Docker Desktop via `winget install --id Docker.DockerDesktop`.
2. Discovered its WSL2 requirement wasn't met yet (`wsl --status` reported WSL wasn't
   installed). Rather than run `wsl --install` automatically — since it can require a
   system restart, which would have interrupted the session — the user was asked to run it
   themselves and restart if prompted.
3. The user ran `wsl --install` — on this machine, it completed **without requiring a
   restart** (this varies: whether a restart is needed depends on what Windows features/
   virtualization support were already enabled on the specific machine; it's not guaranteed
   either way, so it's worth always checking rather than assuming).
4. Re-checked `docker --version` from a *fresh* command — it now worked, whereas it hadn't
   immediately after install. This is the same category of issue seen earlier with the GitHub
   CLI: installers update the system's PATH (the list of folders the OS searches for
   programs), but a terminal session that was already open keeps its own *copy* of the PATH
   from when it started, so it doesn't notice the update until that value is explicitly
   re-read (or a new terminal is opened).
5. `docker ps` still failed at this point with a "cannot connect... is the daemon running?"
   error — installing Docker Desktop and having its `docker` command available isn't the
   same as the background engine actually being started. Launched the Docker Desktop
   application itself (`Docker Desktop.exe`), which is what actually starts that background
   engine, and is a normal one-time step the first time it's installed.
6. Waited briefly for Docker Desktop's first-run startup, then confirmed `docker ps`
   succeeded (returned an empty container list rather than a connection error).

### Why it's needed

Without Docker (or some other way to run PostgreSQL), there is nowhere for the register
endpoint — or any future feature — to durably store data. This unblocks Phase 0's Postgres
setup and Phase 1's data model work, both of which the register endpoint sits on top of.

### Decisions

- **Didn't run `wsl --install` automatically.** It can require a system restart, and a
  restart would end the current working session with no way to resume it automatically —
  a decision with real disruption for the user, so it was left to them to run and restart on
  their own schedule, then return.
- **Chose Docker Desktop over a native Windows PostgreSQL install**, per the user's explicit
  choice when asked, keeping the project aligned with `Tasks.md`'s suggested `docker-compose.yml`
  approach — which also means the same setup instructions will work for any future
  Mac/Linux contributor, not just Windows.

### State at end of this step

Docker Desktop is installed, its background engine is running, and `docker`/`docker compose`
commands work from the terminal. No containers exist yet — the actual PostgreSQL container
is set up in the next entry, alongside Prisma and the `User` model.

### Verification

- `docker --version` → `Docker version 29.7.2, build a7dcaa6`.
- `docker ps` → succeeded with an empty table (headers only, no containers), confirming the
  engine is reachable and working, not just installed.

---

## 2026-08-14 — Phase 1 + Phase 2: PostgreSQL, Prisma, the `User` model, and `POST /api/auth/register`

**Task:** [Tasks.md](Tasks.md) → Phase 2 → "Implement `POST /api/auth/register`" — which, on
inspection, needed two prerequisite Phase 0/1 items pulled forward first, since register
can't create an account without a database to put it in: "Set up PostgreSQL locally" and
"Install and configure Prisma," plus defining the `User` model from Phase 1.

**Delivered via branch:** `feature/2.1-auth-register`.

### Background / concepts

#### How Node.js and Express actually work, end to end

- **Node.js runs one JavaScript program that never "restarts" per request.** Unlike some
  older server technologies (PHP, classic CGI) that re-run a script from scratch for every
  request, a Node.js server is a single long-running program: `node dist/index.js` starts it
  once, it stays in memory, and it just *reacts* to incoming network connections for as long
  as it keeps running. This is why `backend/src/index.ts` calls `app.listen(port, ...)` —
  that call doesn't return; it hands control to Node's event loop, which sits there waiting
  for HTTP requests to arrive.
- **Express is a request router.** At its core, Express keeps an ordered list of "if a
  request matches this method + path, run this function" rules. `app.get("/api/health", handler)`
  registers one such rule. `app.use("/api/auth", authRouter)` (added in this step) registers
  a whole *group* of rules at once — every route defined inside `authRouter` (currently just
  `POST /register`) effectively gets the `/api/auth` prefix glued onto it, so
  `authRouter.post("/register", ...)` becomes reachable at `POST /api/auth/register`. This
  is why the code is organized as one `Router` per feature area (`routes/auth.ts` now;
  `routes/symptoms.ts`, `routes/mood.ts` etc. will follow the same pattern in later phases)
  instead of piling every route directly into `app.ts`.
- **Middleware runs before your route handler, for every matching request.**
  `app.use(express.json())` (added back in the backend-scaffold entry) is *middleware*: a
  function that runs on the way in, before Express even looks for a matching route. Its job
  is to read the raw request body (which arrives as raw bytes) and parse it as JSON,
  attaching the result to `req.body` — which is exactly what makes `req.body.email` and
  `req.body.password` available inside the register route. Without it, `req.body` would be
  empty no matter what the client sent.
- **Route handlers are `async` functions, and Express awaits them implicitly via a Promise
  chain — but only if you don't swallow the error.** The register handler is declared
  `async (req, res) => { ... }` because it does two things that take real time and must be
  waited for: hashing the password (`bcrypt.hash`, deliberately slow — see below) and writing
  to the database (`prisma.user.create`, a network round-trip to Postgres). `await`ing both
  means the function doesn't send a response until each step has actually finished.
- **A `Router` is just an isolated, mountable mini-app.** Keeping `authRouter` in its own
  file (`routes/auth.ts`) and exporting it, rather than defining routes straight on `app` in
  `app.ts`, means `app.ts` stays a short table of contents ("mount health, mount auth, mount
  [future routers]") instead of growing into one enormous file as more endpoints are added
  over the coming phases.

#### PostgreSQL and Docker Compose

- **PostgreSQL** ("Postgres") is the actual database system that will durably store every
  user, symptom log, mood entry, etc. — a program that manages structured, relational data
  and answers structured queries against it, running as its own separate process from the
  Node.js backend.
- **`docker-compose.yml`** describes one or more containers ("services") to run together and
  how to run them — here, a single `postgres` service, using the official `postgres:16-alpine`
  container image (a ready-made package containing Postgres 16, built on the minimal "Alpine"
  Linux base to keep the download small). `docker compose up -d postgres` reads that file and
  starts it as a background container. This means nobody on this project has to manually
  install and configure Postgres on their own machine — everyone runs the exact same
  Postgres version, configured the exact same way, via one shared file in git.
- **A named volume** (`postgres_data:` in the compose file) is a chunk of storage Docker
  manages on your behalf, kept separate from the container itself. Without it, stopping and
  removing the Postgres container would wipe out every row of data along with it, since a
  container's own filesystem is normally throwaway. The volume is what lets the database
  survive the container being recreated (e.g. after `docker compose down` + `up` again).

#### Prisma: schema, migrations, and the generated client

- **Prisma is an ORM** (Object-Relational Mapper): a layer that lets application code work
  with the database using regular TypeScript objects and function calls
  (`prisma.user.create({ data: { ... } })`) instead of hand-writing raw SQL strings
  everywhere. It also gives strong TypeScript types for every model, generated straight from
  the schema, so e.g. misspelling a field name is a compile error, not a runtime surprise.
- **`prisma/schema.prisma` is the single source of truth for the data model.** The `User`
  model added there — `id`, `email`, `passwordHash`, `displayName`, `timezone`, `createdAt`
  — mirrors the fields from requirements §11.1, but written in Prisma's own schema syntax
  rather than raw SQL. Field names use `camelCase` (`passwordHash`) to feel natural in
  TypeScript, while `@map("password_hash")` tells Prisma to actually store that column as
  `password_hash` in Postgres — matching the `snake_case` naming the requirements doc uses —
  so the *database* and the *TypeScript code* can each use the naming convention that's
  idiomatic for them, without a mismatch. `@@map("users")` does the same for the table name.
- **A migration is a recorded, ordered change to the database's structure.** Running
  `npx prisma migrate dev --name init_user` did two things: (1) compared the schema file
  against the (empty) database and generated the exact SQL needed to bring the database in
  line (`CREATE TABLE "users" (...)`, visible in
  `prisma/migrations/20260814155859_init_user/migration.sql`), and (2) actually ran that SQL
  against the running Postgres container. Every future schema change (adding `Symptom`,
  `MoodLog`, etc. in later Phase 1 work) will generate its own migration file, and the whole
  sequence of migration files is what lets *any* copy of this database — a teammate's
  laptop, a CI test database, production — be brought to the exact same structure by
  replaying them in order.
- **The generated client is code, not something you hand-write.** `npx prisma generate`
  reads `schema.prisma` and writes actual TypeScript source into `backend/src/generated/prisma/`
  — this is why that folder is git-ignored (see `backend/.gitignore`, which Prisma's own
  `prisma init` created): it's fully reproducible from `schema.prisma` plus running
  `prisma generate`, the same way `dist/` is reproducible from `src/` plus `tsc`. Nobody
  should hand-edit files in `generated/`; they'd just be overwritten the next time it runs.
- **Prisma 7's driver adapters (a version-specific wrinkle worth knowing about).** The
  installed Prisma version (7.9.1) turned out to be newer than most current tutorials assume:
  older Prisma versions bundled their own compiled database-connector binary internally and
  "just worked" once `DATABASE_URL` was set. Prisma 7's new client generator
  (`provider = "prisma-client"` in the schema, as opposed to the older `"prisma-client-js"`)
  instead expects you to explicitly supply a **driver adapter** — a small package
  (`@prisma/adapter-pg` here) that wraps a *native* Postgres driver for Node
  (`pg`, also installed) and hands it to Prisma. Concretely, this is why
  `backend/src/lib/prisma.ts` constructs `new PrismaPg({ connectionString: ... })` and passes
  it into `new PrismaClient({ adapter })`, rather than just calling `new PrismaClient()` with
  no arguments the way many existing Prisma guides show. Worth remembering if following
  older documentation/tutorials and something doesn't match.

#### Password hashing: why it matters and how it works here

- **Hashing is one-way; encryption is two-way.** Encrypting data means it can be *decrypted*
  back to the original if you have the right key — appropriate for data you need to read
  again later. **Hashing** runs data through a function that's deliberately impossible to
  reverse: there is no key or process that turns a password hash back into the original
  password. This project (like essentially all modern software) stores only a hash of each
  password, never the password itself — confirmed directly by requirements §5.2 ("must
  never store a user's plain-text password") and §13. This is why `backend/src/lib/prisma.ts`'s
  `User` model has a `passwordHash` field and nothing called `password`.
- **Why hashing specifically protects against a database leak.** If the *hashes* leak (e.g.
  a future data breach), an attacker still can't log in as anyone or recover the real
  passwords directly from what leaked — they'd have to separately guess passwords and check
  each guess against the hash, which is exactly what the next two points make slow and
  per-password-expensive on purpose.
- **`bcrypt` — and specifically, salted, deliberately slow hashing.** A generic hash function
  like SHA-256 is built to be *fast*, which is actually bad for passwords: it lets an
  attacker who obtains a batch of hashes try billions of guesses per second against them.
  **bcrypt** (used here via the `bcryptjs` package — a pure-JavaScript implementation, chosen
  specifically to avoid needing native C++ build tools on Windows during `npm install`, which
  the original `bcrypt` package requires) is intentionally slow, and its cost is tunable via
  a **salt rounds** parameter (`SALT_ROUNDS = 12` in `routes/auth.ts`) — each increment
  roughly *doubles* the work required per hash. It also automatically generates a random
  **salt** (extra random data mixed into each password before hashing) per password, so two
  users with the identical password `"Sup3rSecret"` end up with two completely different
  stored hashes — this defeats precomputed "rainbow table" lookup attacks, since an attacker
  can't just look up a hash in a table of known hash→password pairs.
- **Never log or return the hash either.** The register route's Prisma `select` explicitly
  lists which fields to return (`id`, `email`, `displayName`, `timezone`, `createdAt`) rather
  than returning the whole created row — `passwordHash` is deliberately left out, so it can
  never accidentally leak into an API response, even though the hash itself (unlike a raw
  password) isn't directly usable to log in as the user.

#### Connection strings, `.env`, and what actually counts as a "secret" here

- `DATABASE_URL` (`postgresql://welltrack:welltrack@localhost:5432/welltrack?schema=public`)
  is a **connection string** — it bundles the database's location (`localhost:5432`), which
  database (`welltrack`), and login credentials (`welltrack`/`welltrack`) into one value.
  Connection strings are secrets in general, since anyone with one for a production database
  could read/write everything in it.
- **Why this specific value was still put in `backend/.env.example`** (a file that *is*
  committed to git, unlike `.env` itself): the username/password `welltrack`/`welltrack` are
  already sitting in plain text in `docker-compose.yml` — which is *also* committed, by
  design, so that anyone cloning the repo can start an identical local database with one
  command. Since it's already fully visible in a file meant to be public, repeating the same
  non-secret local value in `.env.example` doesn't expose anything new, and it means
  `cp .env.example .env` immediately works with zero manual editing.
- **This reasoning does *not* extend to real secrets that don't exist yet.** Once a JWT
  signing secret (Phase 2, upcoming) or a production `DATABASE_URL` (Phase 14, pointing at a
  real hosted database with a real, non-throwaway password) are introduced, those must never
  appear as real values in any committed file, `.env.example` included — only as a clearly
  fake placeholder there, with the actual value living solely in the git-ignored `.env`
  locally, and in the hosting platform's own environment-variable/secrets configuration in
  production.
- `backend/.env` itself — the file the running app actually reads — is git-ignored (inherited
  from the root `.gitignore` added back in the very first Phase 0 entry, which ignores `.env`
  anywhere in the repo). That's the one safety net that matters regardless of how "secret" any
  particular value in it currently is, because it's what will hold the real secrets later
  without any extra setup needed at that point.

#### Validating input with Zod

- **Zod** is a schema-validation library: you describe the *shape* data should have
  (`z.object({ email: z.string().email(), password: z.string().min(8)... })`), and it checks
  arbitrary incoming data against that shape, returning either "valid, here's the
  type-checked data" or a structured list of what's wrong. This is what enforces requirements
  §17's rules for registration (valid email format; a password strength policy — here, at
  least 8 characters, containing at least one letter and one number) *before* anything touches
  the database, and is the same library flagged back in Phase 3's task list
  ("centralized request validation... `zod` or `express-validator`") — using it here first
  establishes the pattern the rest of the API will follow.

### What was done

1. **Postgres.** Added `docker-compose.yml` at the repo root defining a single `postgres`
   service (image `postgres:16-alpine`, credentials `welltrack`/`welltrack`, database
   `welltrack`, exposed on the standard port `5432`, backed by a named volume so data
   survives container restarts). Started it with `docker compose up -d postgres` and
   confirmed it was accepting connections via `docker compose exec postgres pg_isready`.
2. **Prisma setup.** Installed `prisma` (CLI, dev dependency) and `@prisma/client` in
   `/backend`, then ran `npx prisma init --datasource-provider postgresql`. This generated
   `prisma/schema.prisma`, `prisma.config.ts` (Prisma's newer config file — it's what
   actually loads `backend/.env` and hands `DATABASE_URL` to the Prisma CLI, via
   `import "dotenv/config"` inside it), an initial `backend/.env`, and `backend/.gitignore`.
   It also installed some AI-coding-tool "skill" scaffolding for tools this project doesn't
   use (`.windsurf/`, `.agents/`, `skills-lock.json`, plus a `.claude/skills` folder already
   covered by the repo's existing root `.gitignore`) — removed those to keep the repo focused
   on the project itself.
3. **The `User` model.** Wrote it into `prisma/schema.prisma` per requirements §11.1 (see
   *Background* above for the `@map`/`@@map` naming translation). Filled in real values for
   `backend/.env` and `backend/.env.example`'s `DATABASE_URL`, pointing at the Docker Compose
   Postgres instance.
4. **Migration + client generation.** Ran `npx prisma migrate dev --name init_user`, which
   created and applied `prisma/migrations/20260814155859_init_user/migration.sql` (a
   `CREATE TABLE "users" (...)`). Separately ran `npx prisma generate` to produce the actual
   TypeScript client code in `backend/src/generated/prisma/` (this didn't happen
   automatically as part of `migrate dev` in this version, so it was run as its own step).
5. **Driver adapter.** Installed `@prisma/adapter-pg` and `pg` (plus `@types/pg`) — required
   by Prisma 7's new client generator, per *Background* above. Wrote
   `backend/src/lib/prisma.ts`: a single shared `PrismaClient` instance (constructed with the
   `pg` adapter), so the rest of the app always imports and reuses the same client rather
   than each file creating its own (creating many separate clients would open many separate
   pools of database connections for no benefit).
6. **The register route.** Installed `bcryptjs` and `zod`. Wrote
   `backend/src/routes/auth.ts`: a Zod schema validating `email`/`password`/optional
   `displayName`; on success, hashes the password with bcrypt (12 salt rounds), creates the
   user via Prisma, and returns 201 with the safe, hash-excluded fields. Duplicate emails are
   caught via Prisma's `P2002` "unique constraint violation" error code and turned into a
   409 response; validation failures return 400 with per-field error details. Mounted it in
   `app.ts` via `app.use("/api/auth", authRouter)`.
7. **Manual end-to-end check.** Built (`npm run build`) and ran the compiled server, then
   used `curl` to exercise all four cases directly against the real running Postgres
   container: successful registration (201), duplicate email (409), weak password (400),
   and invalid email (400) — all behaved as intended. Cleaned up the manually-created test
   row afterward via `docker compose exec postgres psql`.
8. **Automated tests — and a real bug they caught.** Installed `vitest` and `supertest`
   (plus `@types/supertest`) as dev dependencies, set the backend's `npm test` script to
   `vitest run` (replacing the placeholder stub script), and wrote
   `backend/src/routes/auth.test.ts` covering: successful registration (and that the
   response never contains a password/hash field), the display-name default, invalid email,
   weak password, duplicate email → 409, and — most importantly — a test that reads the
   user straight back out of the database via Prisma and asserts the stored `passwordHash`
   is neither the plain-text password nor anything resembling it (only that it starts with
   bcrypt's `$2` hash-format prefix, without asserting the exact hash, since bcrypt
   intentionally produces a different hash every time even for the same input — see
   *Background* above).

   Running this suite for the first time immediately failed 4 of 6 tests with a database
   connection error (`SASL: ... client password must be a string`) — a genuine bug, not a
   flaky test: `backend/src/lib/prisma.ts` read `process.env.DATABASE_URL` directly, but
   only `index.ts` ever explicitly loaded `.env` (via its own `import "dotenv/config"`)
   before that code ran. The manual `curl` testing above always went through `index.ts`
   first (`node dist/index.js`), so it never hit this. The automated tests import `app.ts`
   directly (deliberately — see the very first backend-scaffold entry for why `app.ts` and
   `index.ts` are split), which meant `DATABASE_URL` was still `undefined` at the moment
   Prisma tried to connect. Per this project's *Testing Requirements* (`CLAUDE.md`) — fix
   the code, don't fix the test, unless the test itself is wrong — the actual fix was moving
   `import "dotenv/config"` into `lib/prisma.ts` itself, so loading the environment no longer
   silently depends on which file happens to import it first. Re-ran the suite: all 6 tests
   passed.
9. Test data cleanup happens automatically: the test file tracks every email it creates and
   deletes those rows in an `afterAll` hook, then disconnects Prisma — confirmed via a direct
   `SELECT count(*) FROM users` against the container afterward (`0`), so re-running the
   suite repeatedly never collides with leftover data from a previous run.
10. Re-ran `npm run build` after the `prisma.ts` fix (still compiles cleanly) and did one
    final full round-trip against the *compiled* server (`node dist/index.js` → `curl` a real
    registration → 201), then stopped the server and deleted that last manual test row.

### Why it's needed

This is the first real vertical slice of the product: an account a user can actually create,
durably stored, with a properly protected password — everything requirements §5.1/§5.2/§13
require of registration specifically. It also stands up the database/Prisma/testing
infrastructure (Docker Postgres, the `User` model + migration pattern, the shared Prisma
client, Vitest + Supertest) that every subsequent Phase 1–13 task will build directly on top
of, rather than each future task having to figure this out from scratch.

### Decisions

- **Pulled Phase 0/1 database setup forward** rather than strictly finishing every remaining
  Phase 0 item first, since `Tasks.md`'s own phases are ordered by dependency, and register
  is impossible to build meaningfully without a database — implementing it "as a stub" that
  doesn't actually persist anything wouldn't have satisfied the task.
- **Only defined the `User` model now, not the rest of Phase 1's models** (`Symptom`,
  `MoodLog`, etc.) — those aren't needed until their own respective endpoints, and adding them
  speculatively now would be scope creep beyond what this task needed. `Tasks.md`'s Phase 1
  checkboxes reflect this: only the `User` model line is checked.
- **`bcryptjs` over native `bcrypt`.** The native `bcrypt` npm package requires compiling C++
  code during install (via `node-gyp`), which needs build tools that aren't guaranteed to be
  present on a given Windows machine. `bcryptjs` is a pure-JavaScript, dependency-free
  reimplementation with the same hashing behavior and its own TypeScript types — trading a
  little raw hashing speed for zero native-build friction, a reasonable tradeoff for an
  auth-only workload.
- **Display name defaults to the email's local part (text before `@`) when not supplied at
  registration.** Requirements §5.1 lists registration as email + password only, with display
  name editing as a separate, later profile action — but the `User` model's `display_name`
  field (§11.1) isn't marked optional. Defaulting it avoids a nullable field purely for a
  three-step-away edge case, while still letting the caller supply a real one immediately if
  they have it (the frontend's registration form, built later, can choose either way).
- **Duplicate email returns an explicit "Email is already registered" message** (rather than
  a deliberately vague message designed to prevent attackers from probing which emails are
  registered). This is standard, common practice for consumer registration flows and matches
  what requirements describe; formal anti-enumeration hardening isn't called for anywhere in
  the requirements doc and would add friction to a legitimate user trying to log in instead
  by mistake.
- **Tests run against the same local Postgres container as manual dev**, not a separate,
  isolated test database. Acceptable for now specifically because the test suite cleans up
  everything it creates; proper test/dev database isolation is explicitly Phase 13's job, not
  something to solve ahead of time here.

### State at end of this step

PostgreSQL runs locally via `docker compose up -d postgres`. The backend connects to it
through Prisma, using the `User` model. `POST /api/auth/register` is live, validated, and
tested — creating a real, durably-stored user with a securely hashed password, and correctly
rejecting invalid emails, weak passwords, and duplicate emails. No other auth endpoints
(login, refresh, etc.) exist yet.

### Verification

- `npm run build` — compiled cleanly both before and after the `dotenv` fix.
- Manual `curl` round-trip against the compiled server for all four cases (success, duplicate,
  weak password, invalid email) — each returned the expected status code and body.
- `npm test` (`vitest run`) — 6/6 tests passing, including a direct database read-back
  confirming the stored password is actually hashed, not stored in plain text.
- Confirmed via `docker compose exec postgres psql ... SELECT count(*) FROM users` that no
  test or manual smoke-test data was left behind after each check.
- Confirmed the generated Prisma client (`backend/src/generated/prisma/`) never shows up in
  `git status` — it's correctly git-ignored and treated as reproducible build output.

---

## 2026-08-15 — Phase 2: `POST /api/auth/login`

**Task:** [Tasks.md](Tasks.md) → Phase 2 → "Implement `POST /api/auth/login` — verify
credentials, issue short-lived JWT access token + longer-lived refresh token."

**Delivered via branch:** `feature/2.2-auth-login`.

### Background / concepts

#### What a JWT actually is, and why two of them

- **A JWT (JSON Web Token) is a signed, self-contained claim, not a lookup key.** A database
  session ID means nothing on its own — the server has to look it up in a table to know who
  it belongs to. A JWT instead directly *contains* the claim (here, just `{ sub: userId }`,
  `sub` being the JWT standard's name for "subject" — whose token this is) plus an expiry
  (`exp`), and is cryptographically **signed** with a secret only the server knows. Anyone can
  *read* a JWT's contents (it's just base64-encoded JSON, not encrypted — this is why nothing
  sensitive like a password ever goes in one), but nobody can *forge* or *alter* one without
  the signing secret, because the server recomputes the signature on every request and
  rejects the token if it doesn't match. This is what lets the backend verify "yes, this
  really is user X, and this token hasn't expired or been tampered with" without a database
  round-trip on every single request — unlike checking a session ID.
- **Two tokens with two different lifetimes, because they trade off differently.** An
  **access token** (signed in `signAccessToken`, 15-minute expiry) is what gets sent with
  every ordinary API request to prove who's asking — kept short-lived so that if one ever
  leaks (e.g. via a browser bug, a compromised dependency), the window an attacker could use
  it in is small. A **refresh token** (`signRefreshToken`, 7-day expiry) isn't sent with
  every request; its only job is to be exchanged for a new access token once the old one
  expires, which is what task 2.3's upcoming `POST /api/auth/refresh` will do — so the user
  doesn't have to re-enter their password every 15 minutes just because the access token
  expired.
- **Separate signing secrets per token type** (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` —
  new entries in `.env`/`.env.example`). If the two used the *same* secret, anyone who
  obtained it (e.g. via a leaked short-lived access token secret, if it were shared) could
  forge the other kind of token too. Separate secrets mean the two blast radii stay
  independent — this also sets up task 2.3's refresh-rotation logic to only ever verify
  refresh tokens against `JWT_REFRESH_SECRET`, never accidentally accepting an access token
  in a refresh token's place.
- **`backend/src/lib/jwt.ts` centralizes signing.** Same reasoning as `lib/prisma.ts`'s shared
  client from the previous entry: one place that knows how to build a valid access/refresh
  token, rather than every route that eventually issues one (login now; register itself
  doesn't, by design — a new user still has to log in) reimplementing the `jwt.sign(...)`
  call and its options.

#### Defending login against timing-based user enumeration

- **The register endpoint's 409 "Email is already registered" is an intentional, explicit
  signal** (see the previous entry's *Decisions*) — but *login* is a different situation: a
  wrong password and a nonexistent account should look identical to an outside observer,
  because leaking "that email doesn't have an account" from the *login* screen specifically
  would let an attacker cheaply enumerate real user emails at scale (unlike registration,
  where they'd have to actually attempt one registration per guess). This is why both cases
  return the exact same `401 { code: "INVALID_CREDENTIALS" }` response in `routes/auth.ts`.
- **Matching response *time*, not just response *body*, is what actually closes the gap.**
  bcrypt's comparison (`bcrypt.compare`) is deliberately slow (see the previous entry on
  `SALT_ROUNDS`). If the login handler only ran `bcrypt.compare` when a matching user was
  found — and returned immediately for a nonexistent email — a nonexistent-email request
  would come back measurably *faster* than a wrong-password request, and that timing
  difference alone would leak which emails are registered even though the JSON bodies match.
  The fix: `DUMMY_PASSWORD_HASH` is a real, precomputed bcrypt hash of an arbitrary value that
  matches no real password. `bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)`
  always runs the same expensive comparison — against the real stored hash if the user
  exists, against the dummy one if not — so both code paths take roughly the same amount of
  work either way.

### What was done

1. **JWT secrets.** Added `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to `backend/.env`
   (real, randomly generated 32-byte hex values, via
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and to
   `backend/.env.example` (clearly fake placeholder strings, plus a comment explaining the
   two-secret split — per the previous entry's rule that real secrets never go in the
   committed example file, unlike the local-only `DATABASE_URL` credentials).
2. **`backend/src/lib/jwt.ts`.** Installed `jsonwebtoken` (+ `@types/jsonwebtoken`). Wrote
   `signAccessToken(userId)` (15m expiry, `JWT_ACCESS_SECRET`) and
   `signRefreshToken(userId)` (7d expiry, `JWT_REFRESH_SECRET`), each just wrapping
   `jwt.sign({ sub: userId }, secret, { expiresIn })`.
3. **The login route.** Added `loginSchema` (email + non-empty password) and
   `authRouter.post("/login", ...)` to `routes/auth.ts`: looks the user up by email,
   `bcrypt.compare`s the password against either the real hash or `DUMMY_PASSWORD_HASH` (see
   *Background*), and on success returns `200` with the same safe user fields the register
   route returns (id/email/displayName/timezone/createdAt — never `passwordHash`) plus
   `accessToken` and `refreshToken`. Any failure — unknown email or wrong password — returns
   a uniform `401 { error: { message: "Invalid email or password", code: "INVALID_CREDENTIALS" } }`.
4. **Tests.** Added a `POST /api/auth/login` block to `routes/auth.test.ts`: successful login
   (asserts both tokens verify with `jwt.verify` against the real secrets, decode to the
   correct `sub`, and that the refresh token's `exp` is later than the access token's — i.e.
   actually longer-lived, not just differently labeled), wrong password → 401, unknown email
   → 401 (same code as wrong password), invalid email format → 400, and missing password →
   400.
5. **Ran into an environment problem unrelated to the new code, and fixed the environment,
   not the code.** Docker Desktop wasn't running when tests were first re-run in this step
   (`docker compose ps` failed to reach the Docker engine at all), so every test touching the
   database — including the *existing*, previously-passing register tests — failed with a
   generic `500`. Started Docker Desktop, waited for its engine to come up, then
   `docker compose up -d postgres` and confirmed `pg_isready`. Also deleted a stale
   `backend/dist/` from an earlier manual build while debugging — it's git-ignored,
   reproducible output, but a leftover `dist/routes/auth.test.js` was confusing Vitest's file
   discovery (Vitest imports the compiled CommonJS version too, which errors, since Vitest
   itself is ESM-only) — a good reminder that stale build output can occasionally interfere
   with the very tests meant to verify the source.
6. **`npm test`** — all 11 tests passed (the original 6 register tests, unchanged, plus 5 new
   login tests).
7. **`npm run build`** — compiled cleanly.
8. **Manual end-to-end check against the compiled server.** Started `node dist/index.js`,
   then via `curl`: registered a fresh user, logged in with the correct password (200, real
   access/refresh tokens back), logged in with a wrong password (401,
   `INVALID_CREDENTIALS`), and logged in with an email that was never registered (401, the
   identical `INVALID_CREDENTIALS` body — confirming the two failure cases are genuinely
   indistinguishable from the response alone). Cleaned up the manually-created user afterward
   via `docker compose exec postgres psql ... DELETE FROM users ...` and confirmed the table
   was back to empty, then stopped the manually-started server.

### Why it's needed

Registration alone only gets a user *into* the database — login is what lets that same user
prove who they are on a later visit and get back the credentials (the access/refresh tokens)
that every other protected endpoint in Phase 2 onward will require. It's also the first place
tokens are minted at all, so the signing infrastructure built here (`lib/jwt.ts`, the two
secrets) is what the upcoming auth middleware (verifying access tokens on protected routes)
and `POST /api/auth/refresh` (task 2.3) will both build on directly.

### Decisions

- **Login and register return uniform-looking failures for different reasons, on purpose.**
  Register's 409 is deliberately specific (see the previous entry); login's 401 is
  deliberately generic, *and* timing-matched via `DUMMY_PASSWORD_HASH` — because the two
  endpoints have different attack surfaces (an attacker "guessing" during registration has to
  create real accounts to test each email; an attacker guessing during login can test emails
  for free and, without the timing fix, would only need a stopwatch — not even a full
  password-guessing attempt — to enumerate them).
- **Access and refresh tokens use separate secrets** rather than one shared `JWT_SECRET`,
  even though nothing *forces* that split yet — it costs nothing today and avoids a shared
  blast radius later once refresh-token rotation (task 2.3) starts trusting refresh tokens
  for a more sensitive operation (minting new access tokens).
- **Refresh tokens are returned in the JSON body for now, not yet as an HTTP-only cookie.**
  Requirements §14 and Tasks.md's own next item (2.3, "refresh token storage/rotation
  strategy... HTTP-only secure cookie") call out cookie-based refresh-token storage as its
  own distinct task with its own design decisions (cookie flags, rotation-on-use, revocation)
  — bundling that into the login endpoint itself would blur two separable pieces of work.
  This login response shape (`{ user, accessToken, refreshToken }`) is expected to change
  once 2.3 lands.
- **15-minute access / 7-day refresh token lifetimes.** Not specified numerically anywhere in
  requirements.md; chosen as conventional, reasonable defaults for a wellness app with no
  unusual sensitivity profile — short enough that a leaked access token is only dangerous
  briefly, long enough on the refresh side that a user isn't forced to fully re-log-in every
  session.

### State at end of this step

`POST /api/auth/login` is live: a registered user can log in with the correct email and
password and receive a signed access token and refresh token; wrong passwords and unknown
emails are both rejected identically (body and, in practice, timing) with `401
INVALID_CREDENTIALS`. Refresh tokens aren't usable for anything yet — `POST /api/auth/refresh`
(task 2.3) hasn't been built — and nothing in the app verifies an access token on a protected
route yet either, since no protected routes exist before Phase 2's later middleware task.

### Verification

- `npm test` (`vitest run`) — 11/11 tests passing (6 pre-existing register tests unchanged, 5
  new login tests), against the real local Postgres container.
- `npm run build` — compiled cleanly.
- Manual `curl` round-trip against the compiled server: register → login success (200, valid
  tokens) → login wrong password (401) → login unknown email (401, identical body to the
  wrong-password case). All four matched expectations.
- Confirmed via `docker compose exec postgres psql ... SELECT count(*) FROM users` that no
  manual test data was left behind afterward.
- Manually decoded the returned tokens (via the same `jwt.verify` logic the tests use) to
  confirm the access and refresh tokens carry the correct `sub` (user id) and that the
  refresh token's expiry is meaningfully later than the access token's.

---

## 2026-08-15 — Phase 2: refresh token cookie storage/rotation + `POST /api/auth/refresh`

**Task:** [Tasks.md](Tasks.md) → Phase 2 → "Implement refresh token storage/rotation
strategy (e.g. HTTP-only secure cookie for the refresh token) and `POST /api/auth/refresh`."

**Delivered via branch:** `feature/2.3-auth-refresh` (branched from `feature/2.2-auth-login`,
since this task builds directly on `lib/jwt.ts` and the login endpoint from that branch,
which wasn't merged to `main` yet — see *Decisions*).

### Background / concepts

#### Why a cookie instead of just leaving the refresh token in the JSON body

- **A refresh token is more dangerous to leak than an access token.** The previous entry's
  access token expires in 15 minutes; a leaked refresh token is valid for 7 days *and* can
  mint new access tokens on demand. That makes it a much higher-value target for anything
  that can read the page's JavaScript — a malicious browser extension, an XSS bug, a
  dependency that turns hostile.
- **This is exactly the class of attack an `HttpOnly` cookie is designed to block.** A cookie
  marked `HttpOnly` is attached automatically by the browser on requests to the matching
  path, but is *invisible to JavaScript* (`document.cookie` simply won't show it). So even if
  an attacker manages to run arbitrary JS on the page, they still can't read the refresh
  token out of it — the previous body-based approach had no such protection; any JS on the
  page could read `response.body.refreshToken` directly. This is why the login response body
  now only carries `accessToken`, and the refresh token exists solely as a cookie.
- **The other three cookie flags set alongside `HttpOnly`** (`lib/cookies.ts`):
  - `Secure` — tells the browser to only ever send the cookie over `https`, never plain
    `http`, so it can't be sniffed on the wire. Skipped in non-production (`NODE_ENV !==
    "production"`) because local dev runs over plain `http`, where a `Secure` cookie would
    silently just never be sent at all — not a security relaxation so much as making the
    cookie work at all locally, with production still getting the real protection.
  - `SameSite=Lax` — tells the browser not to attach this cookie on cross-site requests
    (e.g. a `<form>` on some other website submitting to this API), which is what makes
    cookies resistant to CSRF in the first place. `Lax` (rather than `Strict`) still allows
    the cookie on top-level navigation, which doesn't matter yet for an API-only backend but
    is the conventional safe default.
  - `Path=/api/auth` — scopes the cookie so the browser only attaches it on requests to
    `/api/auth/*` (i.e. login, refresh, and future logout/reset endpoints), not on *every*
    request to the backend. Once Phase 3's data endpoints exist, none of them will see this
    cookie at all — smaller blast radius if anything downstream ever mishandled cookies.

#### What "rotation" means and why it's worth doing

- **Rotation = every successful refresh issues a brand-new refresh token, not just a new
  access token.** `POST /api/auth/refresh` calls `signRefreshToken` again and overwrites the
  cookie with the new value on every call, in addition to returning a new access token.
- **Why bother, if the old one hasn't expired yet?** Without rotation, a single refresh token
  is valid, unchanged, for its entire 7-day lifetime — if it ever leaked once (e.g. copied
  from a debugger, logged somewhere by accident), it stays usable for the attacker the whole
  time, with zero indication anything is wrong. With rotation, the *legitimate* browser is
  continuously exchanging its refresh token for a fresh one, so a leaked-and-unused token
  becomes stale relatively quickly in normal usage. This implementation is deliberately the
  simple, stateless version — verify-and-reissue, no server-side record of which refresh
  tokens have been "used up" — not the fuller reuse-detection pattern (where reusing an
  already-rotated token would revoke the whole token family). That fuller version needs a
  database table tracking issued tokens, which is more machinery than this MVP's threat model
  currently calls for; noted here so it isn't confused with having been built.

### What was done

1. **`backend/src/lib/jwt.ts`.** Renamed the TTL constants to be second-based
   (`ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`) instead of the string form
   (`"15m"`/`"7d"`) so the refresh token's lifetime is defined in exactly one place and can be
   reused as a number for the cookie's `maxAge` (which needs milliseconds, not a string) —
   avoids the two ever silently drifting apart. Added `verifyRefreshToken(token)`, wrapping
   `jwt.verify` against `JWT_REFRESH_SECRET` specifically (never `JWT_ACCESS_SECRET` — see
   the previous entry's *separate secrets* reasoning).
2. **`backend/src/lib/cookies.ts` (new).** `setRefreshTokenCookie(res, token)` and
   `clearRefreshTokenCookie(res)`, centralizing the cookie name (`refreshToken`) and all four
   flags described above in one place, so login, refresh, and the future logout endpoint
   (task 2.4) all set/clear the identical cookie rather than each re-specifying the flags and
   risking one getting it wrong.
3. **`cookie-parser`.** Installed `cookie-parser` + `@types/cookie-parser` and wired
   `app.use(cookieParser())` into `app.ts`, ahead of the routes — this is what populates
   `req.cookies` from the raw `Cookie` request header; without it `req.cookies` would be
   `undefined`.
4. **Updated the login route.** Now calls `setRefreshTokenCookie` and no longer returns
   `refreshToken` in the JSON body — the response shape is now `{ user, accessToken }`,
   exactly the change flagged as expected in the previous entry's *Decisions*.
5. **New `POST /api/auth/refresh` route.** Reads `req.cookies.refreshToken`; if missing,
   `401 MISSING_REFRESH_TOKEN`. Otherwise `verifyRefreshToken`s it (catching a bad signature
   or expiry) and looks the user up by the token's `sub`; either failure — bad token or a
   `sub` whose user no longer exists (e.g. account was deleted) — clears the cookie and
   returns a uniform `401 INVALID_REFRESH_TOKEN` (same "don't leak which failure case"
   principle as login's `INVALID_CREDENTIALS`, applied here to "expired" vs. "forged" vs.
   "deleted user" rather than "wrong password" vs. "no such account"). On success, rotates
   the cookie (new `signRefreshToken`) and returns a new `accessToken`.
6. **Tests.** Updated the existing login test to assert the refresh token is absent from the
   body and present as an `HttpOnly`, `Path=/api/auth` cookie instead (parsed out of the raw
   `Set-Cookie` header, since supertest doesn't expose cookies as a friendlier object). Added
   a `POST /api/auth/refresh` block: valid cookie → 200 with a new access token and a rotated
   cookie; no cookie → 401 `MISSING_REFRESH_TOKEN`; a garbage/malformed token → 401
   `INVALID_REFRESH_TOKEN` with the cookie cleared; a token *correctly signed but with the
   wrong secret* (`JWT_ACCESS_SECRET` instead of `JWT_REFRESH_SECRET`) → 401, confirming the
   two token types genuinely can't be swapped; and a well-formed token for a user deleted
   after login → 401.
7. **`npm test`** — 16/16 passing (11 pre-existing register/login tests, 5 new refresh tests)
   against the real local Postgres container.
8. **`npm run build`** — compiled cleanly.
9. **Hit a pre-existing, unrelated tooling break: `npm run dev` (`ts-node-dev`) now crashes on
   startup** (`TypeError: Cannot read properties of undefined (reading 'fileExists')` inside
   `ts-node`'s config loader) — a `ts-node`/TypeScript 7.x incompatibility, not caused by this
   step's changes (`npm run build`, using `tsc` directly rather than `ts-node`, compiles
   without any error). Worked around it for manual verification by running the compiled
   output directly (`npm run build && npm start`) instead of the dev server; the underlying
   `ts-node-dev` breakage is left as a follow-up, not fixed here, since fixing dev-mode
   tooling is unrelated to the refresh-token feature itself.
10. **Manual end-to-end check against the compiled server**, via `curl`: registered a user,
    logged in (`Set-Cookie: refreshToken=...; HttpOnly; SameSite=Lax; Path=/api/auth`
    confirmed in the raw response headers, and `refreshToken` confirmed absent from the JSON
    body), then called `/api/auth/refresh` three ways — with the real cookie (200, new access
    token, cookie rotated to a new value), with no cookie at all (401
    `MISSING_REFRESH_TOKEN`), and with a garbage cookie value (401 `INVALID_REFRESH_TOKEN`,
    and the response's `Set-Cookie` showed the cookie being cleared, i.e. `Max-Age=0`/epoch
    expiry). Cleaned up the manually-created user afterward directly via `psql` (`DELETE FROM
    users WHERE email LIKE 'manual-verify-%'`) and stopped the manually-started server.

### Why it's needed

Without this step, the refresh token minted at login was inert — nothing could ever redeem it
for a new access token, and it sat in the JSON response body where any JS on the page could
read it. This closes both gaps: the token now lives somewhere the page's own JavaScript can't
touch, and there's a working endpoint that lets a returning user keep their session alive past
the access token's 15-minute expiry without re-entering their password, which is what Phase
5/6's frontend API client (task: "attaches the access token, and on a 401 automatically
attempts a token refresh before retrying once") will call.

### Decisions

- **Branched off `feature/2.2-auth-login` instead of `main`.** This task's code depends
  directly on `lib/jwt.ts` and the login endpoint added in 2.2, and PR #7 (2.2) was still open
  for review — not yet merged to `main` — when this task started. Branching off `main` would
  have meant working without the very code being extended. This branch will need a rebase
  onto `main` once #7 is merged, which is expected and normal for stacked work like this.
- **Stateless rotation, not full reuse-detection.** Covered under *Background* above — chosen
  as the right amount of complexity for this MVP's threat model; a database-backed
  "token family" revocation system is a reasonable future hardening step, not a gap being
  silently ignored.
- **`Path=/api/auth` rather than the whole site.** Keeps the refresh cookie out of every
  non-auth request entirely, which is strictly safer than a site-wide cookie and costs
  nothing, since only the auth routes ever need to read it.
- **CORS is still wide open (`cors()` with no options) even though cookies now matter.**
  Tasks.md has "Add CORS configuration restricting allowed origins" as its own later, separate
  checklist item (Phase 2's security-hardening group). Once the frontend actually starts
  calling this cross-origin (Phase 5+), sending credentialed (cookie-bearing) requests
  requires CORS to name an explicit origin and set `credentials: true` — a wildcard origin
  cannot be combined with credentials per the browser spec. Left as-is here deliberately, to
  keep this task scoped to the token/cookie mechanics rather than reaching into a separately
  tracked task; flagged here so it isn't forgotten before the frontend needs it.

### State at end of this step

`POST /api/auth/refresh` is live: a valid refresh cookie exchanges for a new access token and
a rotated refresh cookie; a missing, invalid, or user-deleted-since-issued refresh token is
rejected with a uniform `401 INVALID_REFRESH_TOKEN` (or `MISSING_REFRESH_TOKEN` when there's
no cookie at all) and the cookie is cleared. The login endpoint's response shape has changed
to `{ user, accessToken }` — code or docs elsewhere referencing `res.body.refreshToken` from
the previous entry are now stale. Logout (task 2.4, next) still doesn't exist — right now
nothing clears a refresh cookie except a failed refresh attempt.

### Verification

- `npm test` (`vitest run`) — 16/16 tests passing (11 pre-existing, 5 new), against the real
  local Postgres container.
- `npm run build` — compiled cleanly.
- Manual `curl` round-trip against the compiled server (`npm start`): register → login
  (verified `Set-Cookie` flags and body shape directly in the raw HTTP response) → refresh
  with the real cookie (200, rotated cookie) → refresh with no cookie (401) → refresh with a
  garbage cookie (401, cookie cleared). All five matched expectations.
- Confirmed via `psql` that the manually-created test user was removed afterward.

---
