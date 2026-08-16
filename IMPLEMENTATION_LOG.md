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
a pull request from `frontend/scaffold` into `main` for review before it merges. (See the
next entry — the actual PR-creation step changed slightly from what was originally planned
here.)

---

## 2026-08-14 — Tooling: install and authenticate the GitHub CLI, switch to Claude opening PRs

**Task:** Not a [Tasks.md](Tasks.md) checklist item — a workflow change requested partway
through the `frontend/scaffold` task, updating how pull requests get created from here on.

### Background / concepts

- A **CLI** (Command Line Interface) tool is a program you control by typing commands into a
  terminal, rather than clicking around a graphical app. `git` itself is a CLI tool; **`gh`**
  is GitHub's *official* CLI — it can do things a normal `git` command can't, because `git`
  only knows about raw repository history (commits, branches), while `gh` knows about
  GitHub-specific concepts layered on top, like pull requests, issues, and repo settings.
  `gh pr create` is the command-line equivalent of clicking "New pull request" on
  github.com.
- Before now, the plan (from the earlier "adopt a branch strategy" entry) was: Claude pushes
  a branch, and *the user* opens the actual pull request by visiting the link GitHub prints
  after a push. That link only pre-fills a form — someone still has to click the final
  "Create pull request" button on the website. The user asked to skip that manual step and
  have Claude create the PR directly instead, which requires the `gh` tool to be installed
  and able to prove to GitHub who is making the request.
- **Authentication** for a CLI tool means proving your identity to a remote service (here,
  GitHub) without a browser sitting open. There are two common ways `gh` can do this:
  - **Interactive login** (`gh auth login`, choosing "Login with a web browser") — `gh`
    shows a one-time code, opens github.com in a browser, you paste the code and approve,
    and `gh` stores a credential locally for future use. This is the normal path for a
    human setting up `gh` for the first time on a machine with nothing configured yet.
  - **A pre-existing access token supplied via environment variable** — specifically here,
    a `GITHUB_TOKEN` environment variable already set on the user's machine (from earlier,
    unrelated setup). An **environment variable** is a named value the operating system
    makes available to any program that runs, without it being written in any file the
    program ships with — a common way to hand a program a secret (like a token) without
    hard-coding it. A **personal access token** is a long random string that acts like a
    scoped, revocable password — "prove you're allowed to act as this GitHub account,"
    without using the account's actual login password.
  - When both are possible, `gh` prefers the environment variable if one is present — which
    is exactly why running `gh auth login` printed *"The value of the `GITHUB_TOKEN`
    environment variable is being used for authentication"* and then exited immediately,
    instead of walking through the interactive browser flow. This looked like the login had
    failed or gotten stuck, but it was actually `gh` reporting "no need, you're already
    authenticated via this token" — confirmed by running `gh auth status` separately, which
    showed `✓ Logged in to github.com account wheelyk (GITHUB_TOKEN)`.

### What was done

1. Installed the GitHub CLI with `winget install --id GitHub.cli` (winget is Windows'
   built-in package manager — the Windows equivalent of running an installer, but
   scriptable from the command line instead of clicking through a setup wizard).
2. Asked the user to run `gh auth login` themselves in their own terminal, since logging in
   is inherently an interactive, human-in-the-loop step (approving access in a browser) —
   not something that should be automated on someone's behalf.
3. That command reported it was already using a `GITHUB_TOKEN` environment variable rather
   than prompting for browser login. Ran `gh auth status` to confirm this meant "already
   authenticated," not "broken" — confirmed with `✓ Logged in to github.com account wheelyk`.
4. Sanity-checked `gh` actually worked against this specific repo by running `gh pr list`
   inside the project folder (returned cleanly with no open PRs at the time, as expected).
5. Created the real pull request for the `frontend/scaffold` branch with
   `gh pr create --base main --head frontend/scaffold --title "..." --body "..."`, which
   opened **PR #1** directly — no manual click-through on github.com needed.

### Why it's needed

This removes a manual step from every future task: instead of Claude handing over a
"pre-filled form" link and waiting for the user to visit it and click a button, Claude can
now open the pull request itself as the final step of finishing a task, the moment its
branch is pushed. The user still reviews and merges every PR on github.com — only the
*creation* step moved.

### Decisions

- **The user authenticates interactively; Claude never runs `gh auth login`.** Logging into
  a GitHub account is a trust decision only the account owner should make, and it requires a
  real browser + human approval step that an automated tool can't (and shouldn't try to)
  perform on someone's behalf.
- **Claude will create PRs going forward but will not merge them.** This matches the
  boundary agreed earlier in the "adopt a branch strategy" entry — automation is allowed to
  *propose* changes (branch, commit, push, open PR) but a human still makes the final call
  to bring them into `main`.

### State at end of this step

`gh` is installed and authenticated on this machine via an existing `GITHUB_TOKEN`. PR #1
(`frontend/scaffold` → `main`) exists at `https://github.com/wheelyk/Wellbeing/pull/1`. All
future tasks will end with Claude running `gh pr create` once their branch is pushed.

### Verification

- `gh --version` confirmed the install succeeded (`gh version 2.97.0`).
- `gh auth status` confirmed an authenticated session (`Active account: true`).
- `gh pr list` returned successfully (no errors) when run inside the repo, confirming `gh`
  can correctly identify and talk to `wheelyk/Wellbeing` specifically, not just GitHub in
  general.
- `gh pr create` returned a real PR URL (`https://github.com/wheelyk/Wellbeing/pull/1`)
  rather than an error, confirming the PR was actually created, not just queued/drafted.

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

## 2026-08-15 — Phase 2: `POST /api/auth/logout`

**Task:** [Tasks.md](Tasks.md) → Phase 2 → "Implement `POST /api/auth/logout` — invalidate/
clear the refresh token."

**Delivered via branch:** `feature/2.4-auth-logout` (branched from `feature/2.3-auth-refresh`,
for the same reason as that branch was stacked on `feature/2.2-auth-login` — it depends on
`clearRefreshTokenCookie` from 2.3's `lib/cookies.ts`, and #7/#8 weren't merged yet).

### Background / concepts

#### Why "invalidate" a stateless JWT just means "stop sending it"

- **There's no server-side session record to delete.** A traditional session-based login
  stores a session ID in a database table, and logging out means deleting that row — after
  that, the session ID is provably useless even if someone still has it. This app's tokens
  are stateless JWTs instead (see the 2.2 entry's *Background*): the server never stores
  "which tokens are currently valid" anywhere, it just verifies signatures on demand. That
  means there is no row to delete, and by extension no way to make a *specific* already-issued
  refresh token stop working before its natural 7-day expiry — the server has no record of it
  existing in the first place.
- **So what does logout actually do here?** It clears the `HttpOnly` refresh cookie via
  `Set-Cookie: refreshToken=; Expires=<epoch>` (`clearRefreshTokenCookie`, already built in
  2.3). The *browser* then stops attaching the cookie to future requests, which in practice is
  what "being logged out" means for the legitimate user on that device — they can no longer
  reach `/api/auth/refresh` without logging in again. This is a real, meaningful action (the
  same-device, same-browser case that "click logout" is actually for), just not the same
  *kind* of guarantee a server-side session deletion gives (which would also stop a copied,
  still-cookied token from working on a *different* device). That gap is a known, accepted
  consequence of the stateless design chosen in 2.2/2.3, not something this task was expected
  to close — closing it would mean building the server-side revocation list explicitly
  deferred in 2.3's *Decisions*.

### What was done

1. **`POST /api/auth/logout` route**, added to `routes/auth.ts`: calls
   `clearRefreshTokenCookie(res)` and returns `200 { message: "Logged out" }`. No request body,
   no auth requirement (per *Background*, above — there's no session to check, so there's
   nothing to reject even from a request with no cookie at all; calling it is always safe).
2. **Tests.** Added a `POST /api/auth/logout` block to `routes/auth.test.ts`:
   - The main case uses `request.agent(app)` (supertest/superagent's cookie-jar-aware client)
     instead of the plain `request(app)` the other tests use, specifically because this is the
     first test where the thing being verified — "the *next* request from the same client
     no longer carries the cookie" — depends on a real cookie jar reacting to a `Set-Cookie`
     header, not just inspecting one response in isolation. The agent registers, logs in,
     calls logout, then calls `/api/auth/refresh` again with no manual cookie handling — and
     that final call getting `401 MISSING_REFRESH_TOKEN` is the actual proof the clear worked,
     the same way a real browser would behave.
   - A second test confirms logout still returns `200` when called with no cookie at all
     (e.g. double-clicking logout, or calling it while already logged out) — since there's no
     session state to be "wrong" about, there's nothing to 401 on.
3. **`npm test`** — 18/18 passing (16 pre-existing, 2 new logout tests).
4. **`npm run build`** — compiled cleanly.
5. **Manual end-to-end check against the compiled server**, via `curl` with a cookie jar
   (`-b`/`-c` against the same file): registered a user, logged in (confirmed the refresh
   cookie present in the jar), called logout (`200 { message: "Logged out" }`, `Set-Cookie`
   header showed the epoch-expiry clear, and the cookie jar file itself no longer contained a
   `refreshToken` line afterward), then called `/api/auth/refresh` using the now-cleared jar
   and got `401 MISSING_REFRESH_TOKEN` — i.e. the same round-trip the agent-based test
   automates, reproduced manually against the real compiled server. Cleaned up the
   manually-created user afterward via `psql` and stopped the manually-started server.

### Why it's needed

Registration, login, and refresh (2.1–2.3) only ever *start or extend* a session — logout is
the first endpoint that lets a user deliberately end one, which requirements §5 and the
Definition of Done checklist ("Register, log in, log out, ... all work end-to-end") both call
out as a baseline expectation. It also directly unblocks Phase 6's frontend "Logout action
(clears session, calls `/api/auth/logout`)" task, which just needs this endpoint to exist and
behave the way it now does.

### Decisions

- **No request body, no auth check.** Nothing about "log this session out" needs the caller to
  prove who they are first — clearing a cookie that may or may not exist is harmless either
  way, and requiring a valid access token here would just add a failure mode (an already-
  expired access token) to an action that should always succeed. This mirrors login/refresh's
  general pattern of only rejecting requests when rejecting is actually meaningful.
- **Did not build server-side token revocation (a denylist/allowlist of issued refresh
  tokens) to make logout "really" invalidate the token everywhere.** Consistent with 2.3's
  same call on rotation — the added complexity (a database table, checking it on every
  refresh) is a deliberate, documented gap against this MVP's threat model, not an oversight.
  If a future task needs "log out this account on all devices," that's the point where this
  would need to be revisited.

### State at end of this step

`POST /api/auth/logout` is live: it always returns `200` and clears the refresh cookie when
one exists. Combined with 2.1–2.3, the full local login lifecycle now works end-to-end at the
API level: register → log in (access token + refresh cookie) → refresh (rotate for a new
access token) → log out (cookie cleared, further refresh attempts rejected). Forgot/reset
password (2.5–2.6) are the remaining pieces before Phase 2's core auth flow is complete.

### Verification

- `npm test` (`vitest run`) — 18/18 tests passing (16 pre-existing, 2 new), against the real
  local Postgres container.
- `npm run build` — compiled cleanly.
- Manual `curl` round-trip against the compiled server, using a real cookie jar file: register
  → login (cookie present in jar) → logout (cookie cleared in jar, confirmed by re-inspecting
  the jar file) → refresh with the now-cookie-less jar (401 `MISSING_REFRESH_TOKEN`).
- Confirmed via `psql` that the manually-created test user was removed afterward.

---

## 2026-08-15 — Tooling: stacked PRs, auto-retargeting, and rebasing (#7 → #8 → #9)

**Task:** Not a [Tasks.md](Tasks.md) checklist item — explains the branch/PR shape that
tasks 2.2–2.4 ended up in, and what will happen mechanically as the user merges
[#7](https://github.com/wheelyk/Wellbeing/pull/7), [#8](https://github.com/wheelyk/Wellbeing/pull/8),
and [#9](https://github.com/wheelyk/Wellbeing/pull/9) in order.

### Background / concepts

#### What a "stacked" PR is, and why these three ended up that way

- **Normally, every feature branch in this project branches off `main`** (see the very first
  *Git Workflow* entry) — you start from the latest reviewed code, make your change, and open
  a PR back into `main`. That works cleanly as long as your branch doesn't need code that
  only exists on someone else's not-yet-merged branch.
- **Tasks 2.2 → 2.3 → 2.4 broke that assumption, on purpose.** Login (2.2) added
  `lib/jwt.ts`. Refresh (2.3) directly needs `lib/jwt.ts` to exist to build on top of it —
  but PR #7 (login) hadn't been merged into `main` yet when 2.3 was started. Branching 2.3
  off `main` at that point would mean starting from a `main` that doesn't have `lib/jwt.ts`
  at all. So instead, `feature/2.3-auth-refresh` was branched **off `feature/2.2-auth-login`
  itself** — meaning it starts from *all* of 2.2's commits, plus its own new ones on top.
  Same reasoning for `feature/2.4-auth-logout`, branched off `feature/2.3-auth-refresh` (it
  needs `clearRefreshTokenCookie` from 2.3's `lib/cookies.ts`). This chain — A, then B built
  on A, then C built on B, each as its own PR — is what "stacked PRs" means.
- **The alternative would have been waiting**: don't start 2.3 until #7 is reviewed and
  merged, don't start 2.4 until #8 is merged. Stacking trades that idle time for the
  bookkeeping described below — a normal, common tradeoff, not a shortcut or a mistake.

#### What each PR's diff looks like *right now*, while stacked

- Because `feature/2.3-auth-refresh` contains 2.2's commits too, PR #8's diff (which GitHub
  computes as "everything on this branch that isn't on the PR's *base* branch") was opened
  with its base explicitly set to `feature/2.2-auth-login`, **not** `main` — so GitHub only
  shows 2.3's *own* new commits, not a confusing re-showing of all of 2.2's changes too. Same
  for #9, based on `feature/2.3-auth-refresh`. This is why each PR's description explicitly
  says which branch it's stacked on, and that it's "not yet merged."

#### What happens automatically when #7 merges: "retargeting"

- GitHub tracks that PR #8's base is the branch `feature/2.2-auth-login` — not a fixed
  snapshot of it, the branch itself. The moment #7 is merged (which, on GitHub, typically
  *deletes* the now-merged `feature/2.2-auth-login` branch), GitHub notices #8 was pointed at
  a branch that no longer exists and **automatically changes ("retargets") PR #8's base to
  `main`** instead, rather than leaving it pointed at a dead branch. This happens by itself,
  with no command to run — it's a GitHub website behavior, not a git operation.
- **What retargeting does *not* do**: it doesn't touch any actual commits. `feature/2.3-auth-refresh`
  still literally contains 2.2's old commits (the ones now already merged into `main` via
  #7), sitting underneath 2.3's own commits, exactly as before. Retargeting only changes
  *which branch GitHub compares against* to compute what to show as "the diff" and "is this
  mergeable." Immediately after #7 merges, since `main` now already contains everything
  `feature/2.2-auth-login` had, comparing `feature/2.3-auth-refresh` against the *new* `main`
  should show the same clean "just 2.3's commits" diff #8 showed before — GitHub is usually
  able to work this out and merge #8 normally with no extra steps needed on GitHub's side.
  (The same then happens to #9 once #8 merges.)

#### Rebasing: why the *local* copy of these branches may still need one

- **A rebase rewrites where a branch's commits "start from."** Concretely, `git rebase main`
  while on `feature/2.3-auth-refresh` would take 2.3's own commits, temporarily set them
  aside, move the branch's starting point to wherever `main` currently is, and then replay
  each of 2.3's commits one at a time on top of that — as if they'd been written starting
  from today's `main` all along, rather than from 2.2's branch back when it was created. This
  is different from a **merge**, which instead adds a new commit that ties two histories
  together side-by-side without moving or rewriting either one's existing commits.
- **Why this matters here specifically:** GitHub's retargeting (above) fixes what the
  *website* shows and how the *merge button* behaves — but it doesn't change what's sitting
  in this local clone's `feature/2.3-auth-refresh` branch, nor in the copy on GitHub's server
  until an actual merge/rebase happens there too. If more work were to continue locally on
  `feature/2.3-auth-refresh` *after* #7 merges, without rebasing first, git would have no
  idea 2.2's commits already landed via a different path (through #7 directly, not through
  #8) — this is exactly the kind of situation the earlier `git stash`/branch-juggling entry's
  "ahead/behind" concept describes, just with two different routes to the same code instead
  of one branch being simply behind. Running `git fetch && git rebase main` at that point
  would replay only 2.3's genuinely new commits on top of the real, current `main` and drop
  the now-redundant duplicate copies of 2.2's commits automatically (git recognizes them as
  already applied).
- **This project hasn't needed to run that rebase yet** — no new commits have been added to
  `feature/2.3-auth-refresh` or `feature/2.4-auth-logout` locally since they were pushed, and
  none of #7/#8/#9 have been merged yet either. It'll become relevant the moment either (a)
  GitHub can't cleanly auto-merge a retargeted PR and asks for manual conflict resolution, or
  (b) any further commits are added to `feature/2.3-...`/`feature/2.4-...` locally before
  their upstream PRs merge.

### Why it's needed

Merging #7, #8, and #9 in order is about to happen, and stacked PRs are one of the more
confusing things to encounter for the first time — "why does this PR's diff look weird," "why
did the base branch change by itself," "do I need to do something called a rebase" are all
reasonable questions to have mid-merge. Writing this down before merging, rather than after,
means the explanation is available at the moment it's actually useful.

### Decisions

- **Stacked the branches rather than waiting for sequential merges**, since 2.3 and 2.4 each
  had a hard code dependency on the previous task's unmerged work, and idling until each PR
  was individually reviewed and merged would have serialized three tasks that could otherwise
  be built back-to-back.
- **Documented this *before* the merges happen**, not after, specifically because the useful
  moment to understand "what's retargeting and do I need to rebase" is right before/while
  doing it — this entry is written prospectively for that reason, unlike most entries in this
  log which describe something already completed and verified.

### State at end of this step

**Update, written right after merging:** #7, #8, and #9 were all merged in order shortly
after this entry was first written. `main`'s history now shows three separate merge commits
(one per PR) landing cleanly with no conflicts — exactly the "GitHub works this out on its
own" outcome predicted above. A `git pull` on `main` afterward was a plain fast-forward, the
simplest possible outcome: no rebase, no conflict resolution, nothing manual required. That
confirms the retargeting behavior described above played out as expected in practice, not
just in theory.

**A small, real example of why this stuff matters, discovered while writing this very
entry:** the *previous* version of this entry was written, committed, and pushed to
`feature/2.4-auth-logout` — but PR #9 got merged (by the user, on GitHub) at almost exactly
the same moment, using whatever commit was on the branch *just before* that push landed.
GitHub doesn't retroactively pull in commits pushed to a branch after its PR has already
merged — a merged PR is done; new pushes to that same branch just sit there, unattached to
`main`, until something explicitly brings them in. Concretely, `git log main..origin/feature/2.4-auth-logout`
showed exactly one stranded commit (this entry's own text). The fix was mundane: open one
more small PR (**#10**) from that same branch into `main`, containing just that one commit,
and merge it too. Not a mistake exactly — more a demonstration, in miniature, of the same
"which branch is ahead/behind and why" thinking from the earlier `git stash` entry, just
triggered by a push/merge race instead of a stash.

PRs #7, #8, #9, and #10 are all merged. No rebase was ultimately needed anywhere in this
whole sequence.

### Verification

- `git fetch` + `git log main..origin/feature/2.4-auth-logout` — precisely identified the one
  stranded commit after PR #9 merged, rather than guessing.
- `git checkout main && git pull` — a clean fast-forward through all three PR merges, with no
  conflicts and no rebase needed, confirming the retargeting behavior worked as described.
- `gh pr view 9 --json state,mergedAt,headRefOid` — directly confirmed which exact commit PR
  #9 merged at, which is what pinpointed that this entry's own commit had arrived just after.

---

## 2026-08-15 — Tooling: a GitHub ruleset that actually enforces "no direct pushes to `main`"

**Task:** Not a [Tasks.md](Tasks.md) checklist item — closes a gap the user noticed: GitHub
itself was warning that `main` had no protection configured, meaning the "everything goes
through a branch and a PR" rule this whole log has followed was, until now, only a written
convention (`CLAUDE.md`) — nothing on GitHub's side actually stopped anyone (including an
accidental `git push origin main`) from pushing straight to it.

### Background / concepts

#### Branch protection vs. a ruleset — GitHub has two overlapping systems

- GitHub has an older feature called **"branch protection rules"** and a newer one called
  **"rulesets"** that does mostly the same job with a more flexible, reusable design (one
  ruleset can target multiple branches by pattern, e.g. "the default branch" specifically,
  rather than a fixed name). Rulesets are the current recommended approach and are what got
  configured here.
- **What a ruleset actually is:** a named, structured list of rules attached to a
  **condition** describing which branch(es) it applies to, plus an **enforcement status**
  (`active` — actually enforced — vs. `disabled`/`evaluate`, the latter being a dry-run mode
  that reports what *would* be blocked without blocking anything). This project's ruleset
  targets `~DEFAULT_BRANCH` — a placeholder meaning "whichever branch is currently configured
  as the repo's default" (`main` here) — rather than hard-coding the literal name `main`, so
  it keeps working correctly even if the default branch were ever renamed later.

#### The three specific rules chosen, and what each one actually blocks

- **`deletion` (Restrict deletions):** without this, anyone with push access could run
  `git push origin --delete main` and the branch — and, practically, the project's entire
  history as far as GitHub is concerned — would simply be gone. Blocks that outright.
- **`non_fast_forward` (Block force pushes):** a force push (`git push --force`) rewrites a
  branch's history to something that isn't a simple continuation of what was there before —
  this is exactly the kind of "destructive, hard-to-reverse" git operation flagged as
  something to always confirm carefully before running, back in the very first turns of this
  project. Blocking it on `main` specifically means that even a mistaken or malicious force
  push from a machine with valid credentials can't silently rewrite the project's official
  history.
- **`pull_request` (Require a pull request before merging), with 0 required approvals:**
  this is the one that actually enforces "no direct commits to `main`" — GitHub rejects *any*
  push straight to `main` once this is active, full stop; the only way code reaches `main` is
  by merging an already-open pull request through GitHub's merge button (or `gh pr merge`).
  Required approvals was deliberately set to **0** rather than 1+: this repository has a
  single collaborator (the project owner), and GitHub does not allow someone to approve their
  own pull request — requiring 1 approval on a solo repo would make every PR permanently
  unmergeable via the normal UI. Zero approvals still keeps the actual protection that
  matters here (routing through a PR, getting a reviewable diff, no accidental direct
  pushes) without demanding a second human who doesn't exist on this project.
- **Left off, deliberately, for now:** *require status checks to pass* (there's no CI
  pipeline yet — that's Phase 13) and *require linear history* (would force every PR to be
  squashed or rebased rather than merged with a regular merge commit, which is how #7/#8/#9
  were merged in the previous entry; no strong reason to forbid that yet).

#### A GitHub account can have many tokens at once, and editing one never touches another

- **A personal access token (fine-grained or classic) is just a long secret string, and an
  account can have any number of them at the same time** — e.g. one created ages ago for a
  different project or tool, one created specifically for this environment, one created by
  accident while experimenting with token settings. GitHub's *Settings → Developer settings →
  Fine-grained tokens* page lists every token the account owns, each with its own name,
  its own separate list of permissions, and its own separate secret value — they don't share
  settings with each other in any way, even though they all belong to the same GitHub
  account and can all authenticate as the same user.
- **Editing a token's permissions in that UI only ever changes *that one token*.** If two
  tokens both exist, and only one of them is the actual value stored in this machine's
  `GITHUB_TOKEN` environment variable, editing the *other* one's permissions has precisely
  zero effect on what `gh api` requests are allowed to do — from the API's point of view,
  nothing changed at all, because the token actually being sent with every request is
  unmodified. This is exactly what happened here: see *What was done* below.

### What was done

1. Confirmed the gap first: `gh api repos/wheelyk/Wellbeing/rulesets` returned `[]` — no
   rulesets existed at all, matching what GitHub's UI was warning about.
2. Wrote the ruleset definition as a JSON file (target `~DEFAULT_BRANCH`, `enforcement:
   "active"`, the three rules above) and attempted to create it via
   `gh api repos/wheelyk/Wellbeing/rulesets -X POST --input ruleset.json` — the GitHub REST
   API endpoint for managing rulesets, used directly rather than via a `gh` subcommand, since
   `gh` doesn't have a dedicated ruleset-management command built in.
3. **Hit a permissions wall, repeatedly.** The request failed with `403 Resource not
   accessible by personal access token`. `gh auth status` showed the active credential is a
   **fine-grained personal access token** (format `github_pat_...`, distinct from a classic
   token, an OAuth token, or anything issued by Claude/Anthropic — this environment simply
   reads whatever value is already stored in the `GITHUB_TOKEN` environment variable on this
   machine, the same one used for every `gh pr create` throughout this log). Fine-grained
   tokens are scoped permission-by-permission per repository, and creating a ruleset needs
   the **Administration** permission specifically — a separate, more powerful permission
   than the **Contents** and **Pull requests** permissions that had already been sufficient
   for every git push and PR created so far.
4. The user went to github.com (Settings → Developer settings → Fine-grained tokens) and
   updated a token's permissions to add **Administration: Read and write**, then confirmed
   saving it. The very next retry **still** failed with the identical 403.
5. To investigate rather than keep blindly retrying, printed a partial fingerprint of the
   token *actually being used* for these API calls (`github_pat_11AB...H23JxQ` — only the
   first 15 and last 6 characters, deliberately not the full secret) so the user could
   cross-check it against their token list.
6. Retried twice more regardless, both still `403` — at this point still assumed to be a
   propagation delay (permission changes on some systems take a short while to take effect
   everywhere), so continuing to retry seemed reasonable.
7. **The real cause, confirmed by the user afterward: the first edit was made to the wrong
   token.** There was more than one fine-grained token on the account, and the one initially
   opened and edited was a *different* token from the one whose value is actually stored in
   this machine's `GITHUB_TOKEN` — see *Background* above for why that guarantees zero
   effect. The fingerprint printed in step 5 was what let the user identify the mismatch:
   comparing it against their token list showed the edited token didn't match. The user then
   found and edited the *correct* token (the one matching that fingerprint) to add
   **Administration: Read and write**.
8. The next retry after editing the *correct* token **succeeded immediately** — no further
   delay, no additional retries needed — returning the full created ruleset object, including
   its id (`20886071`). This on its own is good evidence the earlier "maybe it just needs
   time to propagate" theory was wrong: if propagation delay had been the real cause, the
   *first* edit would eventually have started working too, on its own, without ever touching
   a second token.
9. Confirmed it stuck via `gh api repos/wheelyk/Wellbeing/rulesets`, which now listed exactly
   the one ruleset, `enforcement: "active"`.

### Why it's needed

Everything in this log from the very first `git init` entry onward has followed "branch,
then PR, then merge" — but until this step, that was enforced by nothing except the people
(and Claude) involved choosing to follow it. A ruleset makes it structurally impossible to
skip: even an accidental `git push origin main` from a future session, a future
collaborator, or a moment of forgetting the convention now gets rejected by GitHub itself,
rather than relying on everyone remembering `CLAUDE.md`. This matters more than usual for a
project handling health data, where the PR/review step is a real safety net (per the earlier
Phase 0 *Git Workflow* entry's reasoning), not just a tidiness preference.

### Decisions

- **0 required approvals, not 1+.** Covered under *Background* above — the correct number
  for a solo-maintainer repo, since GitHub cannot let someone approve their own PR, and
  demanding an approval that structurally can never happen would just lock out the merge
  button entirely rather than add any real review step.
- **Used the raw GitHub REST API (`gh api .../rulesets`) rather than the web UI**, since the
  user asked to have this automated where possible — even though it turned out to need
  several retries and a permissions change first, doing it this way leaves an exact,
  reproducible JSON definition of the ruleset in this log, rather than a one-time set of UI
  clicks that would be hard to reconstruct later if the ruleset ever needed to be recreated
  (e.g. on a future repository).
- **Didn't switch to a *fresh* (newly created) token** when the permission edit didn't
  immediately take effect, per the user's explicit choice to keep retrying first — but the
  actual fix that worked wasn't "just wait" either: it was identifying that the *existing*
  token being edited wasn't the one actually in use, and editing the correct one instead. In
  hindsight, printing the token fingerprint (step 5 above) should have been the very first
  troubleshooting move, before any retries — it's what eventually solved this, and doing it
  earlier would have skipped several rounds of retrying a permission change that could never
  have worked no matter how long it waited.
- **Left "require status checks" and "require linear history" off for now** — both are
  reasonable *future* additions (the former once Phase 13 adds CI; the latter is purely a
  history-style preference) rather than gaps in the actual protection this task was about.

### State at end of this step

`main` on GitHub now has an active ruleset (`main-protection`, id `20886071`) that: blocks
deleting the branch, blocks force pushes to it, and rejects any push directly to it that
isn't arriving via a merged pull request. Nothing about the day-to-day workflow changes —
every task in this log has already been delivered via a feature branch and a PR — but that
workflow is now backed by an actual enforcement mechanism instead of only a written
convention.

### Verification

- `gh api repos/wheelyk/Wellbeing/rulesets -X POST --input ruleset.json` — eventually
  returned `201`-equivalent success with the full created ruleset object (id `20886071`,
  `enforcement: "active"`, all three configured rules present in the response).
- `gh api repos/wheelyk/Wellbeing/rulesets` (a plain `GET`) — confirmed the ruleset is listed
  and active, not just accepted-but-silently-dropped.

---

## 2026-08-15 — Checking in: what's actually running, and what a PR-visible screenshot would take

**Task:** Not a [Tasks.md](Tasks.md) checklist item — the user asked "where are we, is
anything visible if we run it," which is a good moment to explain both what's genuinely
there right now and a documentation tool that was reached for but not available.

### Background / concepts

#### What "running the app" means for a project with two separate halves

- As covered back in the very first *Big picture* section near the top of this log, this
  project is two independent programs: the **backend** (an API with no visual appearance of
  its own) and the **frontend** (the actual webpage a browser renders). "Running the app"
  therefore means starting *both* — a database (Postgres, via Docker Compose), the backend
  (`node dist/index.js`, listening on port `4000`), and the frontend (`vite`, serving on port
  `5173`) — and checking each one the way its actual audience would: `curl`/API calls against
  the backend, and an actual browser tab against the frontend.

#### What was tried first: `chromium-cli`, and why a screenshot didn't happen

- Claude Code has a general-purpose skill for "launch and verify the app is actually
  working," which — for a browser-based frontend specifically — recommends driving a
  headless (no visible window) Chromium browser via a tool called **`chromium-cli`**, then
  saving a **screenshot** of whatever it rendered as proof. The idea: a screenshot is much
  stronger evidence than "the server started without crashing" — it's proof of what a real
  user would actually *see*.
- **`chromium-cli` isn't installed in this environment** (`which chromium-cli` came back
  empty) — it's an optional tool some environments have and this one doesn't. Rather than
  spend time installing a new browser-automation dependency purely to prove out a page that's
  currently just one line of static text (confirmed by reading `frontend/src/App.tsx`
  directly — there's no dynamic behavior yet for a screenshot to meaningfully capture), the
  fallback used instead was: start both real servers, `curl` each one directly, and read the
  actual HTML/JSON each one returned — genuinely proving both are running and responding
  correctly, just via text instead of a picture. A live end-to-end `POST /api/auth/register`
  call was also made against the real running backend (and the test row cleaned up
  afterward) as extra proof beyond just the health check.
- **The honest gap:** text output can't show *layout, styling, or visual bugs* the way a
  screenshot can. For this specific check, that gap didn't matter much (the page has no
  layout to speak of yet), but it will start to matter a lot from Phase 5 onward, once real
  UI — forms, buttons, the mood-picker's large visual controls specifically called out in
  requirements §6.2/§8 — actually exists to look wrong or right.

#### Could a PR *itself* show a screenshot, for a reviewer? (Advice, not implemented here)

- **Yes — this is a well-established pattern**, usually called "visual review" or "preview
  screenshots in CI," and it would fit naturally into this project once there's real UI to
  show. The general shape: a CI job (GitHub Actions) runs on every PR, starts the frontend
  the same way this check just did manually, drives it with a headless browser (Playwright,
  the underlying engine `chromium-cli` wraps, is the standard tool for this in JS projects),
  saves one or more screenshots, and then either uploads them as a downloadable **PR
  artifact** or posts them directly as an **automated PR comment** so a reviewer sees the
  actual rendered page without pulling the branch and running it locally themselves.
- **Why this isn't set up yet, and roughly what it would take:** it depends on CI existing at
  all, which is explicitly Phase 13's job (`Tasks.md` — automated tests, and by extension a
  GitHub Actions workflow to run them). Adding screenshot-on-PR on top of that CI once it
  exists would mean: installing Playwright as a dev dependency, writing a small script that
  starts the dev server and captures one or more representative pages, and a GitHub Actions
  step that runs that script and either uploads the images (`actions/upload-artifact`) or
  posts them into the PR via the GitHub API/a community Action built for exactly this. None
  of that exists yet — worth doing once Phase 5+ gives the frontend actual pages worth
  screenshotting, not before.
- **A lighter middle ground**, worth considering even before full CI screenshots: a human
  (or Claude, manually, as was done in this session) pasting a screenshot directly into a PR
  description or comment on GitHub is always possible right now, with zero setup — it's the
  fully-automated-on-every-PR version that needs the CI investment described above.

### What was done

1. Confirmed Postgres was already running (`docker compose up -d postgres` — a no-op, it was
   already up; `pg_isready` confirmed).
2. Built and started the backend from its compiled output (`npm run build && node dist/index.js`
   — not `npm run dev`, per the previously logged `ts-node-dev`/TypeScript 7 incompatibility).
   Confirmed via `curl http://localhost:4000/api/health` → `{"status":"ok"}`.
3. Started the frontend dev server (`npm run dev`, Vite) and confirmed via `curl
   http://localhost:5173/` that it served the expected HTML shell (`<title>WellTrack</title>`).
4. Attempted to use `chromium-cli` for an actual visual screenshot per *Background* above;
   confirmed it isn't installed, and made the deliberate call not to install a new dependency
   just to screenshot a single static heading — used direct HTTP verification instead.
5. Made one more live round-trip against the real running backend (`POST /api/auth/register`)
   to demonstrate the API is genuinely functional, not just "the process didn't crash" —
   then deleted that test row via `psql`.
6. Reported back to the user exactly what each half of the app currently shows, and left both
   servers running afterward at the user's implicit interest in looking themselves, rather
   than stopping them immediately the way every previous verification step in this log has
   (each of which was a private check, not something the user was about to go look at).

### Why it's needed

"Is anything visible" is a completely reasonable question to ask partway through a project
like this, and the honest answer — a fully working API with nothing to click yet — is easy to
misread as "nothing's working" if it isn't explained clearly. This entry exists to make that
gap legible: the backend genuinely works end-to-end (proven directly, again, above); the
frontend showing almost nothing is a *sequencing* fact (Phase 5 hasn't started), not a *bug*.

### Decisions

- **Didn't install `chromium-cli`/Playwright just for this check.** The cost (a new
  dependency, browser binaries to download) wasn't justified by what it would have proven
  right now (a screenshot of one line of static text) — text-based verification (`curl`,
  reading the HTML/JSON directly) was equally conclusive for the current state of the app.
  This will be worth revisiting once Phase 5 gives the frontend real pages.
- **Advised on PR-visible screenshots as a future addition, not something to build now** —
  it's a real, common, worthwhile pattern, but it depends on CI existing first (Phase 13),
  and is far more valuable once there's actual UI to show reviewers rather than a blank
  placeholder page.
- **Left both dev servers running** after this check, rather than stopping them immediately
  as every prior manual verification in this log has done — because this check's entire
  purpose was for the user to go look themselves afterward, unlike previous checks, which
  were private confirmations of code Claude had just written.

### State at end of this step

Backend and frontend are both running locally (ports `4000` and `5173`). No code changed in
this step — this was purely a status check and a documentation entry, not a build task.

### Verification

- `curl http://localhost:4000/api/health` → `{"status":"ok"}`.
- `curl -X POST http://localhost:4000/api/auth/register ...` → `201`, a real created user,
  cleaned up afterward via `psql`.
- `curl http://localhost:5173/` → the expected static HTML shell, `<title>WellTrack</title>`.
- Read `frontend/src/App.tsx` directly to confirm, in source, that the single rendered
  heading really is the entire current UI — not just what happened to load in this check.

---

## 2026-08-15 — Phase 5 + Phase 6: wiring the frontend to auth — and why a vertical slice

**Task:** [Tasks.md](Tasks.md) → Phase 5 (Frontend Foundation) + Phase 6 (Frontend: Auth
Flows), scoped specifically to make register/login/logout actually work end-to-end in a
browser — not a full completion of either phase (see *Decisions* for exactly what was left
out and why).

**Delivered via branch:** `feature/5-6-frontend-auth`.

### Why a vertical slice, not "finish Phase 5, then finish Phase 6"

This is worth explaining properly, since it's a deliberate strategy choice, not just how the
work happened to fall out.

- **The alternative — "horizontal" completion — would mean finishing *all* of Phase 5 first**
  (a fully wireframe-matching bottom nav, every design primitive including `RatingScale`,
  `Modal`, `DatePicker`, a verified WCAG-AA color audit) before writing a single line of
  Phase 6. Everything built that way stays untested against real usage until the very end,
  because nothing is actually wired to a real page or a real user flow until Phase 6 exists.
  If a design decision from Phase 5 turns out to be wrong (a primitive's API doesn't fit how
  a real form actually needs it, the auth context's shape is awkward to consume from a real
  page), that's only discovered once a large amount of "finished" Phase 5 work already needs
  reworking.
- **A vertical slice instead cuts through every layer of the stack at once, thin.** Database
  → Prisma → Express route → HTTP → the browser's `fetch` → React state → a rendered page —
  register/login/logout now works through *all* of these layers, even though each individual
  layer is intentionally minimal (three real pages, three reusable primitives, no bottom nav
  polish yet). The payoff: a genuinely working, demonstrable feature exists after one round
  of work, instead of a pile of unconnected infrastructure that only becomes demonstrable
  much later.
- **It also validates earlier decisions under real conditions for the first time.** Every
  previous Phase 2 entry in this log tested the backend auth endpoints via `curl` or
  Supertest — neither of which enforces a real browser's security model. Wiring an actual
  browser to them here is what surfaced the CORS/credentials gap below (a real bug that
  `curl` and Supertest simply can't catch, since neither of them refuses wildcard-origin
  cookies the way a browser does) and confirmed the `HttpOnly` refresh-cookie design from the
  2.3 entry genuinely works end-to-end, not just in theory.
- **Concretely, "thin" meant:** build enough of Phase 5 (routing, the API client, auth
  context, three primitives) to support Phase 6's pages, and only the parts of Phase 6 that
  make a complete register→login→logout loop — explicitly *not* forgot/reset password,
  settings, or account deletion, none of which the backend even supports yet either. See
  *Decisions* for the full list of what's deliberately still missing.

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
  XSS, so keeping the access token *only* in memory limits how long a leak could matter — at
  most 15 minutes, its own expiry).
  The direct consequence: **a full browser reload currently logs the user out** — there's
  nothing in the page's memory to restore from, and nothing yet re-fetches "who is this
  refresh cookie for" on startup. This is a known, deliberate gap for this slice — see
  *Decisions* for why it isn't closed yet.

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
  happen to both hit a `401` around the same time (plausible — the access token expires
  after a fixed 15 minutes regardless of what the user is doing), naively refreshing
  separately for each would mean two concurrent `POST /api/auth/refresh` calls — and because
  refresh **rotates** the cookie (per the 2.3 entry), the second call would receive a cookie
  that's already been superseded by the first, likely failing. `api/client.ts` avoids this by
  holding one shared `refreshPromise`: whichever request hits `401` first kicks off the
  refresh, and any other concurrent caller awaits that *same* promise instead of starting its
  own.
- **A real bug found by trying to satisfy the checklist literally, not just "close enough."**
  `Tasks.md`'s Phase 5 wording is specific: "...on refresh failure, **redirect to Login**."
  The first implementation only cleared `api/client.ts`'s own module-level `accessToken`
  variable on a failed refresh — but `AuthContext`'s React state (`user`, `accessToken`,
  `isAuthenticated`) is a *separate* copy, and nothing was telling it to update. Since
  `RequireAuth`'s redirect logic only ever looks at `AuthContext`'s state, a failed background
  refresh would silently leave the app *looking* logged in (stale user info still showing)
  even though `api/client.ts` itself had already given up on the session. Fixed with a small
  publish/subscribe pattern: `client.ts` exposes `onAuthFailure(listener)`, calls every
  registered listener when a refresh definitively fails, and `AuthContext` subscribes on
  mount to clear its own state when that happens — which is what actually makes `RequireAuth`
  notice and redirect, since clearing that state triggers a re-render of every component
  reading it, `RequireAuth` included. This was caught specifically *because* a test was
  written to prove the literal checklist wording, not just "seems to work" — see the added
  `RequireAuth` test below.

#### Two different kinds of "prove this actually works," used for two different jobs

- **Vitest + React Testing Library** (already used for the backend; now added for the
  frontend) renders components in a simulated DOM (`jsdom` — a JavaScript implementation of
  browser DOM APIs with no real browser underneath) and mocks `fetch` directly, so tests run
  in milliseconds without a real network call or a real browser. This is what the 14 new
  frontend tests use — fast, deterministic, and exactly the kind of thing that should run in
  CI on every future change (once Phase 13 sets that up).
- **Playwright**, used here for a genuinely different job: actually launching a real
  (headless) Chromium browser, clicking through register → dashboard → logout → login →
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

- The 2.2 (login) log entry documented hitting a Vitest/CommonJS import clash
  caused by a stale, previously-compiled `dist/routes/auth.test.js` interfering with Vitest's
  test discovery, and worked around it by manually deleting `dist/` before testing. Running
  `npm run build && npm test` in this step hit the *exact same* failure again — because
  `tsc`'s `include: ["src"]` was never actually told to skip test files, so every `npm run
  build` regenerates the stale, interfering compiled test file right back. This time, fixed
  it properly instead of re-applying the same manual workaround: added
  `"src/**/*.test.ts"` to `backend/tsconfig.json`'s `exclude` array, so test files are simply
  never part of the production build's output in the first place. Confirmed
  `dist/routes/` now contains only `auth.js`/`auth.js.map`, never `auth.test.js`.

### What was done

1. **Backend CORS fix + `FRONTEND_URL`** — see *Background* above.
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
   the same credentials (register doesn't issue tokens itself — see *Decisions*); `login()`
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
9. **Fixed the `tsc`-compiling-tests-into-`dist` issue for good** — see *Background* above.
10. **Playwright real-browser verification** — see *Background* above. Registered a user,
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
  producing real proof for *this* conversation, not ongoing regression coverage.
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
  `npm run lint` (`oxlint`) — clean, aside from one harmless Fast Refresh warning about
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

## 2026-08-15 — Debugging a broken image delivery, then automating PR screenshots via CI

**Task:** Not a [Tasks.md](Tasks.md) checklist item — two related pieces: (1) diagnosing why
the screenshots sent directly to the user weren't displaying, and (2) building an actual CI
pipeline (this project's first) so future PRs get preview screenshots automatically, pulled
forward from a "worth doing later" note in the previous entry.

### Part 1: a short lesson in isolating a bug by removing variables one at a time

- The user reported the screenshots sent in the previous step showed as a broken-image icon.
  The instinctive first guess — the screenshot files had been deleted from disk right after
  sending, before the chat client had actually rendered them — turned out to be a reasonable
  hypothesis but not something to just assume: it was tested directly, by resending the exact
  same files *without* deleting them afterward. **Still broken.** That ruled out the timing
  theory.
- Next, two more variables were changed at once — sending from a different folder (the
  scratchpad directory instead of the live project folder) and explicitly setting the display
  mode instead of leaving it as a default. **Still broken.** Location and display-mode ruled
  out.
- The decisive test: sending something that had nothing to do with images at all — a plain
  `.txt` file — alongside a trivially simple 1×1 pixel PNG (built from a known-good, minimal
  base64-encoded byte sequence, to rule out anything unusual about Playwright's own screenshot
  encoding). **Both still showed as broken.** A plain text file failing to display is what
  actually pinpointed the cause: this was never about PNGs, file size, or timing — it's a
  display/delivery issue on the chat client's own side, outside anything fixable from within
  this session.
- **The general lesson, worth remembering beyond this one bug:** when several plausible causes
  exist, changing one variable at a time (or, once stuck, picking the most *different* possible
  test — text vs. image is about as different as two file types get) narrows things down far
  faster than guessing and re-trying the same fix repeatedly. This is the same principle
  applied earlier when the GitHub ruleset kept failing with a 403 — the fix there ended up
  being "the wrong token was edited," found only once fingerprinting narrowed down *which*
  token was actually in play, rather than assuming propagation delay and just waiting.
- **The practical resolution:** since the chat delivery mechanism itself isn't reliable in
  this session, the user was pointed at the literal file paths on disk to open directly in
  Windows' own image viewer (both machines are the same machine here) — sidestepping the
  broken delivery path entirely rather than continuing to fight it.

### Part 2: automated PR preview screenshots (this project's first CI pipeline)

#### Background / concepts

- **What GitHub Actions actually is.** Everything in this log up to now has run entirely on
  this one machine — builds, tests, the manual Playwright check. **CI** (Continuous
  Integration) means some of that instead runs automatically, on GitHub's own servers,
  triggered by events like "a pull request was opened." **GitHub Actions** is GitHub's
  built-in CI system: a YAML file under `.github/workflows/` describes one or more **jobs**
  (here, one: `screenshots`), each running as a sequence of **steps** on a fresh, temporary
  virtual machine that's destroyed once the job finishes. Nothing about this workflow changes
  how anyone works locally — it's purely automation that runs *in addition to*, triggered by,
  pushing a branch and opening a PR.
- **A `services:` block gives a job a real, throwaway database for the duration of the run.**
  `pr-preview.yml` declares a `postgres:16-alpine` service, matching `docker-compose.yml`'s
  local setup — GitHub starts it as a container alongside the job's main virtual machine,
  waits for its health check to pass, and tears it down when the job ends. This means the
  workflow gets a completely real, empty Postgres database every single run — the exact same
  kind of "real database, not mocked" testing this project has used from Phase 1 onward, now
  running unattended on GitHub's infrastructure instead of this laptop.
- **`GITHUB_TOKEN` here is a *different* token from every other `GITHUB_TOKEN` in this log.**
  Every earlier entry's `GITHUB_TOKEN` was the fine-grained personal access token living in
  this machine's environment variables, used by the local `gh` CLI. Inside a GitHub Actions
  workflow, `GITHUB_TOKEN` instead refers to a **separate, automatically generated token that
  GitHub injects into every workflow run**, scoped only to the repository the workflow lives
  in, and automatically expired once the job finishes. `actions/checkout` uses it to configure
  git's credentials for that job automatically — which is why the workflow's git commands
  (`git fetch`, `git push`) never need to manually supply a token or password anywhere; it's
  already wired in, as long as the workflow declares the right `permissions:` (`contents:
  write` here, so it's actually allowed to push a new branch).
- **An orphan branch, and why one was used here.** A normal new branch starts from an existing
  commit and shares that commit's whole history. `git checkout --orphan pr-screenshots`
  instead creates a branch with **no parent commits at all** — a completely fresh, empty
  history, unrelated to `main`. This keeps the (frequently-changing, purely generated)
  screenshot images from ever mixing into `main`'s actual development history, while still
  being a real branch on GitHub that files can live on and be linked to.
- **Why `raw.githubusercontent.com` links work at all here.** A PR comment is just Markdown;
  `![caption](url)` only actually shows an image if that URL serves the raw image bytes
  directly. `raw.githubusercontent.com/<owner>/<repo>/<commit-sha>/<path>` is GitHub's own
  endpoint for exactly that — the *unrendered* file content at a specific commit. This only
  works **without requiring the viewer to be logged in** because this repository is public
  (checked explicitly via `gh repo view --json visibility` before relying on this) — the same
  URL pattern against a private repo would 404 for a signed-out visitor, since raw file access
  respects the repo's normal read permissions.

#### What was done

1. Diagnosed the broken-image issue as described in Part 1 — no code changes, just isolating
   the actual cause through a sequence of narrowing tests.
2. Wrote `frontend/scripts/capture-pr-screenshots.mjs` — the same register → dashboard →
   logout → login → dashboard flow used for manual verification in the previous entry, now as
   a permanent, committed script (parameterized via `PREVIEW_BASE_URL`/`SCREENSHOT_DIR` env
   vars instead of hard-coded values) that exits non-zero if the browser logs any console
   error, so a broken PR would visibly fail the workflow rather than silently publish screenshots
   of a broken page.
3. Wrote `.github/workflows/pr-preview.yml`: on every pull request targeting `main`, it spins
   up Postgres, builds and starts the backend (ephemeral, randomly generated JWT secrets —
   `openssl rand -hex 32` — rather than any committed value, since this database is thrown away
   the moment the job ends anyway), builds and serves the frontend's production build via
   `vite preview`, installs a headless Chromium via Playwright, runs the capture script, then
   publishes the resulting screenshots to an orphan `pr-screenshots` branch under a
   `pr-<number>/` folder, and finally posts (or updates, on subsequent pushes to the same PR)
   a single PR comment embedding each screenshot via a `raw.githubusercontent.com` link.
4. Added `frontend/pr-screenshots-output/` to `frontend/.gitignore`, so running the capture
   script locally never risks accidentally committing its output.
5. **Validated the trickiest part — the git branch/worktree logic — locally before trusting it
   to a real CI run**, since iterating on a real GitHub Actions failure is much slower than
   testing locally: created a throwaway bare "fake origin" repo and two genuinely independent
   clones of it (not reusing one clone to fake two runs, which produces misleading results —
   see below), simulating (a) the very first run for a PR, where the `pr-screenshots` branch
   doesn't exist yet and must be created as an orphan, and (b) a later run for the same PR
   (e.g. after a new commit), where the branch already exists and needs updating in place.
   Both paths worked correctly and produced the expected file layout.
6. **Caught a testing mistake mid-verification, not just a code mistake.** The first attempt
   at step 5 reused a single local clone to simulate "run one, then run two" back to back, and
   run two failed outright (`fatal: refusing to fetch into branch ... checked out at ...`).
   This looked like a real bug in the workflow at first — but it wasn't: it was an artifact of
   the *test* incorrectly reusing local state (a worktree left registered from "run one") that
   would never actually exist in real CI, where every run gets a completely fresh, disposable
   virtual machine with no memory of any previous run. Re-ran the check with two fully separate
   clones instead, which is what actually matches how GitHub Actions behaves, and confirmed
   both paths work.
7. Sanity-checked the workflow file's YAML syntax with `js-yaml` (via `npx`, not installed as a
   project dependency) and the embedded shell script's syntax with `bash -n`, since neither
   backend nor frontend tooling can otherwise catch mistakes in a `.github/workflows/*.yml`
   file before it actually runs on GitHub.
8. Ran the committed `capture-pr-screenshots.mjs` script locally, exactly as CI will invoke it
   (same environment variable, same working directory), against the still-running dev servers
   from the previous entry, confirming it produces the same three screenshots as the original
   ad hoc version.

### Why it's needed

Every previous "does this actually work" check in this log has depended on someone (Claude,
or now potentially the user) manually starting servers and looking. This automates that
specific check for the one workflow the user explicitly asked to see: a reviewer opening a
future PR now gets visual proof of the register/login flow directly in the PR, with zero
manual steps — and, as a side effect, this project now has its first real CI job, doing real
integration testing (a genuine Postgres database, a genuine built frontend, a genuine browser)
on every future PR against `main`.

### Decisions

- **Inline PR comment over a downloadable artifact**, per the user's explicit choice — more
  moving parts (the orphan branch, the raw-URL comment), but it's what actually delivers "see
  it directly on the PR" rather than "click through and download a zip."
- **A shared `pr-screenshots` branch with a folder per PR number**, rather than one branch per
  PR. Simpler to reason about (one place all preview images live) and avoids creating a new
  branch per PR that would need separate cleanup; the tradeoff is the branch will grow
  indefinitely as more PRs are opened over time — acceptable for now, and easy to prune later
  (e.g. a scheduled job deleting folders for closed PRs) if it ever becomes a real problem.
- **Ephemeral, randomly generated JWT secrets in CI**, never a hard-coded or committed value —
  consistent with the project's established secrets-hygiene rules (from the Phase 1/2 entry),
  even though this specific database only exists for the few minutes the job runs.
- **A committed script, not another one-off scratch file.** Unlike the manual verification
  script in the previous entry (deliberately deleted, not committed, since Phase 13 owns real
  e2e tests), `capture-pr-screenshots.mjs` *is* committed — it's not a test in the assertion
  sense, but it's a permanent, repeatedly-invoked piece of this project's automation now, not
  a one-off debugging aid.
- **Validated the git logic locally with real (throwaway) repositories before pushing**,
  rather than trusting the YAML on the first real PR run — GitHub Actions failures are slower
  and more annoying to iterate on than a local shell loop, so working out the trickiest logic
  locally first was worth the extra time.

### State at end of this step

`.github/workflows/pr-preview.yml` and `frontend/scripts/capture-pr-screenshots.mjs` are live
and confirmed working against real GitHub infrastructure — see *Verification* below. This is
the project's first working CI pipeline: every future PR against `main` will automatically get
a comment with three live screenshots proving the register/login flow actually works, with no
manual steps.

**Update — the real run found one more real bug.** Opening PR #14 to trigger the workflow for
the first time immediately caught something the earlier local validation couldn't have: the
"Build backend" step failed with `Cannot find module '../generated/prisma/client'`. The cause
was exactly the kind of thing that's invisible on a development machine but not in CI — this
Prisma version's `migrate deploy` doesn't generate the TypeScript client as a side effect (the
Phase 1/2 Prisma entry hit the same thing locally with `migrate dev`, and had to run
`npx prisma generate` as its own separate step). Locally, this never mattered because the
generated client was already sitting on disk from earlier local development sessions and never
got deleted — but a fresh CI checkout starts with nothing generated at all. Added an explicit
`npx prisma generate` step, pushed the fix, and the very next run passed completely.

### Verification

- `npx js-yaml .github/workflows/pr-preview.yml` — valid YAML, no syntax errors.
- `bash -n` on the embedded publish script — valid shell syntax.
- Two independent throwaway git clones — confirmed both the "first run, branch doesn't exist"
  and "later run, branch exists and needs updating" paths produce the correct file layout and
  push successfully.
- `node scripts/capture-pr-screenshots.mjs` run locally against the real dev servers —
  produced the same three screenshots as the ad hoc version from the previous entry, exiting
  cleanly with no console errors detected.
- **The real GitHub Actions run** (`gh run watch`, watched live): first attempt failed exactly
  as described above; after the fix, all 18 steps passed, finishing in 1m19s.
- `gh pr view 14 --comments` — confirmed the bot's comment was actually posted, containing the
  three expected `raw.githubusercontent.com` image links.
- `curl -I` against each of those three URLs directly — all three returned `200 OK` with a
  real, non-zero `Content-Length`, confirming they serve actual image bytes, not a 404 or an
  error page, and require no authentication (consistent with the repo being public).

---

## 2026-08-15 — GitHub Actions, properly explained, and a before/after screenshot upgrade

**Task:** Not a [Tasks.md](Tasks.md) checklist item — refines the CI screenshot workflow per
feedback: only run it when a PR actually touches the frontend, and show a **before** image
(the PR's base branch) next to the **after** image (the PR's own code), not just "after."
Also a proper explanation of what GitHub Actions actually is and can do, requested directly.

### Background / concepts — GitHub Actions, from first principles

This project's only GitHub Actions workflow so far (`pr-preview.yml`) has been explained
piece by piece as it was built. Here's the fuller picture, since it was asked for directly.

- **The problem CI solves.** Everything in this log up to the previous entry happened on one
  person's laptop: builds, tests, manual browser checks. That works, but it depends on someone
  remembering to actually run those checks, and running them the same way every time. **CI**
  (Continuous Integration) means a *server* — not a person's laptop — automatically runs some
  of those same checks whenever something relevant happens (most commonly: a commit is pushed,
  or a pull request is opened/updated). **GitHub Actions** is GitHub's own built-in CI system,
  free to use for public repositories like this one (with paid tiers for heavier usage on
  private repos).
- **A workflow is a YAML file that says "when X happens, do Y."** Any file under
  `.github/workflows/` (any filename, `.yml` extension) is a workflow. The `on:` key names the
  **trigger(s)** — this project's uses `pull_request`, but GitHub Actions supports many others
  worth knowing exist even though this project doesn't use them yet: `push` (runs on every
  push to matching branches — the standard "run my test suite on every commit" trigger),
  `schedule` (cron-style, e.g. "run this every night" — useful for things like a nightly
  dependency-vulnerability scan), `workflow_dispatch` (an explicit "Run workflow" button in
  GitHub's UI, for things you want to trigger manually on demand), and `release` (runs when a
  new GitHub release is published — a common place to trigger an actual deployment).
- **A workflow contains one or more jobs; each job is a sequence of steps.** This project's
  workflow has exactly one job (`screenshots`). Each **job** runs on its own fresh virtual
  machine (`runs-on: ubuntu-latest` here — GitHub also offers Windows and macOS runners),
  which is created new for that job and destroyed once it finishes — nothing persists between
  separate job runs unless something is deliberately saved (see "artifacts and caching"
  below). Multiple jobs in one workflow run in parallel by default, unless one explicitly
  `needs:` another to finish first.
- **A step is either a shell command or a reusable "action."** `run: npm ci` is a plain shell
  command. `uses: actions/checkout@v4` instead runs a pre-built, reusable **action** — a
  packaged piece of automation someone else wrote (in this case, GitHub itself), versioned
  like a library dependency (`@v4`). This project's workflow uses three: `actions/checkout`
  (clones the repo onto the runner — without it, the job starts with an empty filesystem),
  `actions/setup-node` (installs a specific Node.js version), and `actions/github-script` — a
  general-purpose action for running arbitrary JavaScript with a pre-authenticated GitHub API
  client already set up (`github.rest...`), which is what posts/updates the PR comment.
  Thousands of other actions exist in GitHub's Marketplace for things like deploying to a
  cloud provider, running a linter, or sending a Slack notification — using one is usually far
  less work than scripting the same thing from scratch in raw shell commands.
  `actions/upload-artifact` (mentioned below, under "artifacts") is one more worth knowing
  about even though this workflow doesn't use it.
- **What else GitHub Actions can do, beyond what this project uses yet** (worth knowing the
  shape of, for when they become relevant):
  - **Required status checks.** Once this project has real tests running in CI (Phase 13),
    the `main`-branch ruleset from the earlier entry could require that CI job to pass before
    a PR is even mergeable — turning "please remember to run tests" into "GitHub simply won't
    let this merge if tests fail."
  - **Artifacts.** `actions/upload-artifact` saves files from a job as a downloadable zip
    attached to that specific run — the simpler alternative to this project's orphan-branch
    approach, considered and explicitly not chosen back in the previous entry specifically
    because it doesn't show images *directly on the PR*.
  - **Caching.** `actions/cache` can save `node_modules` (or similar) between runs so
    `npm ci` doesn't redownload every dependency on every single run — a common speed
    optimization once a project's CI usage grows large enough for it to matter.
  - **Secrets.** Repository (or organization) **secrets**, configured in GitHub's UI, are
    encrypted values a workflow can reference (`${{ secrets.SOME_NAME }}`) without ever
    printing them in logs — the place a real deployment credential or a third-party API key
    would live, as opposed to this workflow's JWT secrets, which are fine to generate fresh
    on the spot each run since that database is thrown away when the job ends anyway.
  - **Deployments.** A very common use of the `push`/`release` triggers is: run the test
    suite, and if it passes, automatically deploy to a hosting platform — directly relevant
    to this project's own Phase 14 ("deploy to the chosen hosting platform"), once that phase
    arrives.

### What changed in this step

1. **Path-filtered triggering.** Added a `paths:` filter to the `pull_request` trigger:
   ```yaml
   on:
     pull_request:
       branches: [main]
       paths:
         - "frontend/**"
         - ".github/workflows/pr-preview.yml"
   ```
   A PR that only touches `backend/` or documentation files no longer triggers this workflow
   at all — there'd be nothing new for a screenshot to usefully show. The workflow file's own
   path is included too, so a future change to the workflow itself can still be tested by
   opening a PR that only touches this file.
   **A non-obvious detail confirmed while testing this, worth knowing:** the `paths` filter
   on a `pull_request` trigger evaluates against the PR's *entire* base→head diff, not just
   the specific commit in the latest push. Confirmed directly: after this PR's `IMPLEMENTATION_LOG.md`-only
   commit was pushed (touching neither `frontend/**` nor the workflow file), the workflow
   *still* ran again — because the PR's overall diff (from when it branched off `main`) still
   includes the earlier commit that changed `pr-preview.yml`. This is the sensible behavior,
   not a bug: once a PR is "in scope" for a path-filtered workflow, it stays in scope for
   every subsequent push to that same PR, rather than flickering on and off commit-by-commit
   depending on what each individual commit happens to touch.
2. **Before/after comparison.** The backend now starts once and stays up for both captures
   (reasonable specifically *because* the path filter above means a screenshot-triggering PR
   changes frontend code only, in the common case — see *Decisions*). The frontend gets built
   and served twice: once from the PR's own code ("after"), and once from a separate
   `git worktree` checked out at the PR's **base** commit ("before") — reusing the *same*
   capture script from the head checkout both times (pointed at whichever server is currently
   running), rather than needing two copies of the script. This also sidesteps a real
   chicken-and-egg problem: the base commit for *this very PR* doesn't have
   `capture-pr-screenshots.mjs` yet, since this PR is what introduces it.
3. **Graceful degradation when "before" isn't available.** Every "BEFORE:"-prefixed step is
   marked `continue-on-error: true`, and later steps check `steps.before_checkout.outcome`
   before attempting to run at all. The publish step only treats "before" as usable if it
   finds **exactly** the 3 expected screenshots (not just "the folder isn't empty") — a
   partial set (e.g. the base branch's app crashed partway through the flow) is treated the
   same as "no before available" rather than silently showing a broken image for just one row.
   The posted comment adapts its wording and layout accordingly: a two-column
   **Before | After** Markdown table per screenshot when a comparison is available, or the
   original single-image format with a note explaining why there's no comparison when it
   isn't.
4. **Validated the new branching logic locally** before trusting it to a real run, the same
   way the original publish logic was validated in the previous entry: three scenarios against
   throwaway git repos (all 3 "before" screenshots present → comparison table; "before" folder
   entirely absent → after-only; only 2 of 3 "before" screenshots present → also correctly
   treated as after-only, not a partially-broken table). Also extracted the PR-comment-building
   JavaScript into a standalone script and ran it directly with `node` against both the
   "with before" and "without before" cases, printing the actual Markdown each would produce,
   to visually confirm the table and fallback formats are well-formed before relying on
   GitHub Actions' own JS runner to be the first place either ever actually executes.

### Why it's needed

The original workflow ran on *every* PR and only ever showed "here's what it looks like now,"
which is a weaker signal than "here's what changed" — a reviewer has to already know what the
old page looked like to judge whether a visual change is correct. Restricting to
frontend-touching PRs also avoids noise: a PR that only fixes a backend validation rule has no
business getting a screenshot comment at all.

### Decisions

- **Reused the head commit's backend for both "before" and "after" frontend builds**, rather
  than also checking out and rebuilding the backend at the base commit. Since this workflow
  only triggers on PRs that touch `frontend/**` (per the new path filter), the backend is
  identical between base and head in the overwhelming common case, so rebuilding it twice would
  mostly just cost extra job time for no benefit. A PR that changes both frontend and backend
  in one go is the one case where "before" technically compares against the wrong backend
  version — accepted as a known, minor simplification rather than doubling the job's
  complexity and runtime to handle an edge case.
- **"Before" failures never fail the whole job**, only degrade the comment — a missing or
  broken comparison shouldn't block a PR's CI status the way a *broken PR itself* (a failing
  "after" capture) correctly still does. This asymmetry is deliberate: "after" represents the
  actual change being reviewed and must work; "before" is a nice-to-have.
- **Required exactly 3 "before" screenshots, not "at least 1."** A partially-captured before
  state (e.g. the base branch's register form has since changed and the script only got
  partway through) is arguably worse than no comparison at all, since a reviewer might
  mistakenly read a missing "before" image as "nothing changed here" rather than "this
  screenshot wasn't captured."

### State at end of this step

`pr-preview.yml` now only triggers on frontend-touching PRs, and produces a proper before/after
comparison when possible, falling back cleanly to after-only when the base commit's frontend
can't be built or run for comparison. **Confirmed against a real run** — PR #15, which touches
`.github/workflows/pr-preview.yml` itself, triggered the very workflow being changed, and every
step passed on the first attempt this time (unlike the original workflow's first-ever run,
which needed the `prisma generate` fix from the previous entry) — including the full `BEFORE:`
sequence, not just the `if:`-skipped fallback path.

### Verification

- `npx js-yaml .github/workflows/pr-preview.yml` — valid YAML.
- `bash -n` on the updated publish script — valid shell syntax.
- Three local dry runs against throwaway git repos (full before/after, before entirely
  missing, before partially present) — all three produced exactly the expected file layout.
- The PR-comment-building JavaScript, run standalone with `node` against both `hasBefore: true`
  and `hasBefore: false` — produced well-formed Markdown in both cases, including a correctly
  structured Before/After table.
- **The real GitHub Actions run** (PR #15, watched live with `gh run watch`): every step
  passed, including the full `BEFORE:` build/start/capture sequence, finishing in 1m41s.
- `gh pr view 15 --comments` — confirmed the posted comment contains a real Before/After
  Markdown table (not the after-only fallback), for all three screenshot pairs.
- `curl -o /dev/null -w "%{http_code}"` against all six resulting URLs (3 before + 3 after) —
  every one returned `200`, confirming the full comparison actually renders, not just that the
  workflow completed without error.

---

## 2026-08-15 — Hosting and domains, explained (ahead of actually deploying)

**Task:** Not a [Tasks.md](Tasks.md) checklist item — the user asked how to get the app
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — written while the user was creating
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — the user connected this repo to a real
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — after fixing the Root Directory setting,
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — the earlier "stacked PRs" entry (back
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — a request to properly explain, for a
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

## 2026-08-15 — The real bug: `postinstall` never reached `main` at all (a stacked-PR gotcha), plus a more robust fix

**Task:** Not a [Tasks.md](Tasks.md) checklist item — Railway's rebuild failed with the
*identical* error after PR #19 supposedly merged. The actual cause turned out to be a git
workflow mistake, not anything wrong with the `postinstall` fix itself — though a second,
independently-real improvement came out of investigating it anyway.

### Background / concepts

#### What actually happened: a stacked PR that never reached `main`

- The earlier "stacked PRs" entries (#7–#9, and #16–#19) both explained and directly observed
  GitHub's **retargeting** behavior: when a PR's base branch gets merged *and deleted*, GitHub
  automatically repoints any PR still based on it to `main` instead. Both previous times this
  was checked, it worked exactly as described.
- **This time it didn't happen, because the precondition wasn't actually met.** PR #19's base
  was `docs/railway-deploy-and-npm-explainer` (PR #18's branch). PR #18 merged — but its
  branch was **not deleted** afterward (confirmed directly: `git branch -r` still shows
  `origin/docs/railway-deploy-and-npm-explainer` existing right now). Retargeting is
  triggered specifically by the base branch *disappearing* — a branch that merges but survives
  doesn't trigger it. So PR #19's base silently stayed pointed at that now-merged-but-still-
  alive branch, and clicking "merge" on #19 merged its commits **into that branch**, not into
  `main`.
- **GitHub's "MERGED" status was entirely accurate and still misleading in effect.** PR #19
  genuinely was merged — just into the wrong destination. Checked directly:
  `git merge-base --is-ancestor <PR19-merge-commit> main` returned **false**, and
  `git log main..origin/docs/railway-deploy-and-npm-explainer` listed all six commits from
  that PR — including the actual `postinstall` fix — sitting on a branch that was never itself
  merged into `main`. This is why Railway kept failing with the *exact* same error: it was
  building `main`, and `main` genuinely never received the fix, despite every PR involved
  correctly showing as merged.
- **The general lesson:** "is this PR merged?" and "did this PR's changes reach `main`?" are
  two different questions for a stacked PR specifically — normally the same question, but only
  reliably the same once the base branch is confirmed gone. Checking `git log main..<branch>`
  directly (exactly as done here, and back in the earlier #16–#19 entry) is the way to verify
  the second question rather than trusting the first as a proxy for it.

#### The same gotcha, explained plainly (worth reading even after the technical version above)

- Think of a stacked PR's base as a **forwarding address**. Setting PR #19's base to PR #18's
  branch is like saying "deliver my parcel to wherever that branch currently lives." Normally,
  once PR #18 is merged and its branch is deleted, GitHub notices the forwarding address no
  longer exists and automatically updates the label to "deliver to `main` instead" — which is
  exactly what was observed working correctly, more than once, earlier in this log.
- **This time, the forwarding address was never closed down.** The branch merged, but nobody
  deleted it afterward — so as far as GitHub could tell, that address was still a perfectly
  valid place to deliver to. PR #19's label never got updated. Clicking "merge" on #19 dutifully
  delivered its parcel exactly where the label said — a branch that had already made its own,
  separate delivery to `main` earlier and had no further deliveries scheduled. The parcel
  arrived, correctly, at completely the wrong place — and "delivery successful" (GitHub's
  "Merged" badge) is a perfectly true statement about *that* delivery, while still being the
  wrong information for "did this reach the house" (`main`).
- **The practical habit this suggests going forward:** for any stacked PR, once its *base* PR
  merges, it's worth explicitly checking whether that base branch actually got deleted before
  assuming the next PR in the stack will behave itself — or, more simply, just re-verify with
  `git log main..<branch>` (exactly the command that caught this) after merging *any* PR that
  was part of a stack, rather than only when something looks visibly wrong.

#### The independently real second problem: `postinstall` likely wasn't the right mechanism for Railway anyway

- While tracking this down, Railway's build log carried another clue worth taking seriously
  even once the stranded-commit issue was found: `warn config production Use --omit=dev
  instead` — language associated with npm skipping certain install behavior in
  production-oriented environments. Combined with the earlier `npm approve-scripts` warning
  (a real npm security feature that can restrict when lifecycle scripts run automatically),
  there's a reasonable chance Railway's build environment wouldn't have reliably run a plain
  `postinstall` hook even *if* it had actually reached `main` this time.
- **Rather than relying on a lifecycle hook that might or might not fire** depending on exactly
  which flags a given platform's install step happens to use, the more robust fix folds the
  same command directly into the `build` script itself:
  ```json
  "build": "prisma generate && tsc"
  ```
  `npm run build` is unambiguous — it's explicitly invoked, by name, everywhere this project
  gets built (locally, in CI, on Railway), unlike `postinstall`, which depends on *how*
  `npm install`/`npm ci` happened to be invoked. This guarantees the generated client exists
  immediately before `tsc` needs it, regardless of any platform-specific install behavior.
  The `postinstall` script was left in place rather than removed — it's still correct and
  harmless for the plain local-`npm install` case — but `build` no longer depends on it.

#### Lifecycle hooks vs. explicit script chaining: a general rule of thumb, not just a Prisma one

This exact fork — "should this run automatically via a lifecycle hook, or be explicitly
chained into the script that actually needs it?" — comes up anywhere a project has a
generated-or-derived-thing dependency, not just Prisma. Worth having a general rule rather than
re-deriving it from scratch next time:

- **A lifecycle hook (`postinstall` and similar) is *implicit*.** Its big advantage: every
  script that might need the thing it produces — `dev`, `build`, `test`, `start` — benefits
  automatically, for free, without each one having to remember to ask for it. Its real
  weakness, learned directly in this entry: it only runs as a *side effect* of `npm install`/
  `npm ci`, and different environments run that install step differently — some skip
  lifecycle scripts outright for security (a defense against the exact supply-chain-attack
  pattern mentioned in the earlier entry), some use flags this project has no control over.
  **A hook is only as reliable as your control over how install gets invoked** — solid for
  "my own laptop, where I run plain `npm install`," much less certain for "some third party's
  build infrastructure, configured however they've configured it."
- **Explicit chaining inside a named script (`"build": "prisma generate && tsc"`) is
  *unambiguous*.** If that script runs at all, every command in the chain runs, in order, full
  stop — there's no install-flag or security-policy variable that can silently skip a step
  written directly into the script itself. The tradeoff is the opposite one: it only protects
  the *specific* script it's written into. If `test` or `dev` also needed the generated client
  and *didn't* separately chain it in (or rely on the still-present `postinstall`), they'd be
  unprotected — explicit chaining doesn't automatically spread to every script the way a hook
  does.
- **The rule of thumb that falls out of this:** reach for a lifecycle hook for convenience when
  the install environment is fully within your own control or trust; reach for explicit
  chaining specifically in whichever script(s) are the ones that actually *must not fail* on
  infrastructure you don't control — exactly a hosting platform's build step, which is the
  category of thing that just failed twice in this project for exactly this reason. Using
  **both at once**, as this project now does, isn't indecision — it's covering the convenient
  common case (hook) while making the one step that absolutely cannot be allowed to fail
  (`build`) independently self-sufficient, rather than trusting a single mechanism everywhere.

### What was done

1. Diagnosed the real cause using direct git inspection rather than trusting GitHub's "Merged"
   label at face value: confirmed the branch survived, confirmed the merge commit isn't an
   ancestor of `main`, and listed the exact stranded commits.
2. Created a new branch directly from the stranded branch's tip
   (`fix/land-stranded-postinstall-commits`, based on `origin/docs/railway-deploy-and-npm-explainer`)
   to carry all six missing commits into a fresh PR targeting `main` directly this time.
3. On that same branch, additionally changed `"build"` from `"tsc"` to
   `"prisma generate && tsc"` — the more robust fix described above.
4. **Verified locally, deliberately bypassing `npm install`/`postinstall` entirely this time**
   — deleted both `src/generated/` and `dist/`, then ran only `npm run build` directly (not
   `npm install` first) to prove the build script alone, with no help from any install hook,
   regenerates the client and compiles successfully.
5. Re-ran the full test suite — still 18/18 passing.

### Why it's needed

Without this, Railway would have kept failing indefinitely, and — worse — every future
diagnosis attempt would have kept "confirming" the fix was merged (because it genuinely was,
technically) while never explaining why the failure persisted, since the actual gap was in
*where* it merged, not whether it did.

### Decisions

- **Landed the stranded commits via a fresh direct-to-`main` PR** rather than trying to
  retroactively fix the orphaned branch's relationship to the merged one — simpler, and avoids
  further compounding an already-confusing branch history with more corrective surgery.
- **Kept both `postinstall` and the `build`-script fix**, rather than picking one — they're
  not in conflict (running `prisma generate` twice is harmless and fast), and together they
  cover both "however this project's dependencies get installed" and "however `build` gets
  invoked," rather than betting on a single mechanism being reliable everywhere.

### State at end of this step

A new PR carries the six previously-stranded commits (including both Prisma fixes) directly
into `main` this time. Not yet verified against a real Railway rebuild — that's the actual
test, once this merges.

### Verification

- `git merge-base --is-ancestor <PR19-merge-sha> main` → confirmed `false`, proving the
  earlier fix never reached `main` despite showing as merged.
- `git log main..origin/docs/railway-deploy-and-npm-explainer` → listed the exact six stranded
  commits directly, rather than guessing.
- Deleted `backend/src/generated/` and `backend/dist/`, ran **only** `npm run build` (no
  `npm install` first) — confirmed it alone regenerates the Prisma client and compiles
  cleanly, proving the fix no longer depends on any install-time hook at all.
- `npm test` — 18/18 passing, unchanged.
- Not yet verified: an actual Railway rebuild once this new PR is merged.

---

## 2026-08-15 — Auditing every branch for stragglers, and finding one that had been missing since PR #1

**Task:** Not a [Tasks.md](Tasks.md) checklist item — after PR #20 was confirmed merged, the
user asked directly: "check for straggling files." Rather than checking only the one branch
just worked on, every branch in the repository was checked — and turned up three real cases,
one of them far older than expected.

### Background / concepts

#### Why "check the one branch I was just working on" isn't good enough

- The previous entry's fix specifically addressed PR #19's stranding. But the *cause* of that
  stranding — a stacked PR whose base branch merged without being deleted — isn't something
  that only happens once. **The right question wasn't "is #19's content on `main` now,"** it
  was "has this happened anywhere else in this repository's entire history, undetected." A
  targeted fix for one confirmed instance says nothing about whether the same mistake happened
  quietly, elsewhere, earlier — the only way to know is to check *everything*, not just the
  branch already under suspicion.
- **The method:** for every remote branch, compare it against `main` with
  `git log origin/main..origin/<branch>` — this lists every commit that exists on that branch
  but is *not* an ancestor of `main`. A clean branch (fully merged, or never diverged) shows
  zero commits. Any nonzero result is either a real straggler or a branch that's deliberately
  meant to stay separate (like `pr-screenshots`, the orphan branch backing the CI screenshot
  workflow — expected to always show commits here, since it's never supposed to merge into
  `main` at all).

#### What the audit actually found

| Branch | Stranded commit(s) | Origin |
| ------ | ------------------- | ------ |
| `frontend/scaffold` | `bc5efb8` — "Document GitHub CLI install/auth..." | **From the PR #1 era** — pushed after PR #1 had already merged, and never picked up by any later PR. Sat undiscovered for the entire rest of this conversation until this direct audit. |
| `docs/hosting-and-domains-explainer` | `4cf9923` — "docs: explain build artifacts..." | PR #17, the exact same stacked-PR-base-not-deleted pattern diagnosed for PR #19 two entries ago — just not previously checked for. |
| `fix/land-stranded-postinstall-commits` | `1849826` — the beginner-friendly expansion of the merge-gotcha entry | A simple timing race: this commit was pushed roughly 43 seconds *after* the user clicked merge on PR #20, confirmed by comparing the commit's timestamp against the PR's `mergedAt` directly rather than assuming. |

- **The `frontend/scaffold` case is the most notable one.** It predates every other entry in
  this log about stranded commits — including the entry that first explained what a stranded
  commit even *is* (the "moving a file onto its own branch" `CLAUDE.md` entry, and the later
  #7–#9 stacked-PR entry). In other words: this exact failure mode happened once, quietly,
  before it was ever even named or understood — and then kept happening a few more times after
  it *was* understood, simply because nobody had gone back to check whether the first,
  unrecognized occurrence had ever actually been fixed. It hadn't.
- **Distinguishing a real straggler from `pr-screenshots`.** The screenshot-hosting branch
  showed up in the same scan with several commits "not in `main`" — but that's expected and
  correct, not a bug: it's a deliberate orphan branch (explained in the CI screenshot entry)
  that exists purely to host image files for PR comments, and was never meant to merge into
  `main` at all. Distinguishing "expected to diverge forever, by design" from "accidentally
  never merged" is exactly what reading each result rather than reacting to a nonzero count
  requires.

#### How each was actually landed

- **`bc5efb8` and `4cf9923`** (both pure `IMPLEMENTATION_LOG.md` additions, from points in
  history where the file looked very different from its current, much longer state) were
  **cherry-picked** onto a fresh branch from current `main`, rather than branched from their
  original stale tips — branching from the stale tip would have carried along an entire
  outdated snapshot of the file, guaranteeing a massive conflict against everything added
  since. `git cherry-pick <commit>` instead takes just *that one commit's diff* and reapplies
  it against whatever `main` looks like right now.
- **`bc5efb8` cherry-picked cleanly** — its insertion point (the end of the file, at the time)
  hadn't itself been altered since, only extended after, so the patch still applied without
  conflict even though hundreds of lines had been added beneath it since.
- **`4cf9923` conflicted**, because its intended insertion point — right after the "hosting and
  domains" entry — now had *different* new content already sitting there (the "First real
  Railway deploy attempt" entry, correctly landed via PR #18). Resolving it meant manually
  placing the recovered entry in its correct chronological position (before the Railway-deploy
  entry, which is where it was always meant to sit) rather than wherever the automatic merge
  attempt happened to leave it.
- **`1849826`** cherry-picked cleanly, as the newest and simplest of the three.

### Why it's needed

A one-off fix for the specific branch that happened to be visibly broken doesn't answer "is
anything else quietly broken too" — and this audit's own results prove that question was worth
asking: two of the three findings would never have been caught by only checking PR #19's
branch specifically, and one of them had been sitting unnoticed since essentially the
beginning of this project's git history.

### Decisions

- **Audited every branch, not just the one under suspicion**, once asked to check for
  stragglers — the cheap, mechanical cost of checking all of them is trivial compared to the
  cost of a fourth silent failure surfacing weeks from now with no memory of why.
- **Cherry-picked rather than re-branching from stale tips**, specifically because this
  project's `IMPLEMENTATION_LOG.md` grows continuously and any old branch's snapshot of it is
  guaranteed to be badly out of date by now — cherry-pick isolates just the one relevant change
  instead of dragging along an entire obsolete file state.
- **Resolved the one real conflict by hand, choosing correct chronological placement**, rather
  than accepting whichever side a mechanical merge tool would have picked by default — since
  this file's entries are meant to read in order, silently misplacing one would have left the
  log itself confusing for exactly the kind of reader (a beginner reading it end to end) it's
  written for.

### State at end of this step

All three previously-stranded commits are captured on this one branch, ready to land in a
single PR directly into `main`. A full-repository audit (`git log origin/main..<branch>` for
every remote branch) found no further stragglers beyond these three and the expected,
by-design exception (`pr-screenshots`).

### Verification

- `git log origin/main..origin/<branch>` run against **every** remote branch, not just the one
  branch already suspected — this is what surfaced `frontend/scaffold`'s long-dormant straggler,
  which nothing narrower would have found.
- For the PR #20 timing question specifically: compared the stranded commit's actual authored
  timestamp against the PR's `mergedAt` field directly (43 seconds apart) rather than assuming
  a cause from the symptom alone.
- After cherry-picking all three: re-ran the same full-repository scan again, confirming the
  only remaining nonzero result was the expected, by-design `pr-screenshots` branch.

---

## 2026-08-15 — The first successful Railway build — what it actually means, and how auto-deploy works

**Task:** Not a [Tasks.md](Tasks.md) checklist item — after merging PR #21, Railway's build
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — before actually adding the four required
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — a forward-looking question asked
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — the Postgres database and environment
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — before actually exposing the backend
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — while actually clicking "Generate
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — closing out the previous entry's
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

**Task:** Not a [Tasks.md](Tasks.md) checklist item — the frontend was deployed to Vercel,
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

## 2026-08-15 — Phase 2: Express auth middleware (`requireAuth`)

**Task:** [Tasks.md](Tasks.md) → Phase 2 → "Implement an Express auth middleware that
verifies the access token and attaches the authenticated user to the request; use it on all
protected routes."

**Delivered via branch:** `feature/2.7-auth-middleware` (branched from `main`). This is the
first piece of a new "vertical slice" — the same full-stack, one-feature-at-a-time approach
used to get login working end to end — this time aimed at the app's first real wellness-
tracking feature (mood logging), rather than auth itself. This task is the necessary first
step: every log-type endpoint (mood, symptoms, medications, habits) needs to know *which
user* is making the request before it can safely read or write that user's data, and nothing
in the codebase does that yet.

### Background / concepts

#### What "middleware" means in Express

- Express handles a request by running it through a *chain* of functions in order — each one
  called "middleware" — before it reaches the actual route handler. `cors()`, `express.json()`,
  and `cookieParser()` in `app.ts` are all middleware already in use: each one looks at the
  request, does something (parses the body, reads cookies), and calls `next()` to pass control
  along to whatever comes after it. A middleware that *doesn't* call `next()` — because it
  decides the request shouldn't proceed — stops the chain right there, which is exactly how
  authentication gets enforced: `requireAuth` either calls `next()` (proceed) or sends a `401`
  response itself (stop), and nothing after it in the chain ever runs for a rejected request.
- **Why this belongs in its own reusable function rather than being copy-pasted into every
  route.** Every protected endpoint needs the exact same check ("is there a valid access token,
  and if so, whose is it?"). Writing that logic once and attaching it wherever it's needed
  (`router.get("/mood-logs", requireAuth, handler)`) means there's exactly one place that logic
  can have a bug, instead of a dozen near-identical copies that can quietly drift apart.

#### Bearer tokens vs. the refresh cookie — two different auth mechanisms, on purpose

- This app already has one place tokens travel automatically: the refresh token, sent as an
  `HttpOnly` cookie the browser attaches by itself (see the Phase 2.3 refresh-token entry). The
  access token works differently, **on purpose**: it's read from an `Authorization: Bearer
  <token>` request header, which the *frontend's own code* has to attach explicitly (already
  built — see `frontend/src/api/client.ts`'s `apiFetch`, from the Phase 5 API client task).
- **Why not just use a cookie for the access token too?** Because the two tokens have
  deliberately different jobs and different lifetimes. The refresh token's whole point is to
  sit quietly and be sent automatically without any frontend code touching it (that's what
  makes it safe from XSS — see the 2.3 entry). The access token, by contrast, is *supposed* to
  be handled by frontend JavaScript — the API client needs to be able to hold it in memory,
  swap it out the moment a refresh returns a new one, and decide per-request whether to attach
  it at all. A `Bearer` header is simply the standard, conventional way to send a token that
  the calling code manages directly, rather than one the browser manages on its behalf.
- `requireAuth` therefore calls the new `verifyAccessToken` (added to `lib/jwt.ts` alongside
  the existing `verifyRefreshToken`) — checking the signature against `JWT_ACCESS_SECRET`
  specifically. Using the wrong secret here would be a real security bug: it would mean a
  refresh token (a much longer-lived credential) could be used to authenticate ordinary API
  requests, defeating the entire reason the two tokens have separate secrets and separate
  short/long lifetimes in the first place.

#### Attaching the user to the request: TypeScript declaration merging

- Once `requireAuth` verifies a token, the route handler that runs next needs to know *whose*
  request this is. The convention is to attach it directly onto the `req` object
  (`req.userId = payload.sub`), since Express passes that same object through the whole chain.
- Plain JavaScript would let any code just read `req.userId` back out with no fuss. TypeScript,
  by default, doesn't know that property exists on Express's `Request` type and would refuse to
  compile `req.userId`. `backend/src/middleware/requireAuth.ts` fixes this with a small
  `declare global { namespace Express { interface Request { userId?: string } } }` block — this
  is TypeScript's "declaration merging" feature, which lets a project extend a type defined in
  a library it doesn't own. After this, every route handler downstream of `requireAuth` sees
  `req.userId: string | undefined` as a genuinely typed property, with real autocomplete and
  compile-time checking — not an untyped grab-bag.

### What was done

1. **`backend/src/lib/jwt.ts`.** Added `verifyAccessToken(token)`, the access-token counterpart
   to the existing `verifyRefreshToken` — verifies against `JWT_ACCESS_SECRET` specifically.
2. **`backend/src/middleware/requireAuth.ts` (new).** Reads the `Authorization` header, requires
   the `Bearer <token>` format (anything else — missing header, wrong scheme — is treated as
   "no token provided"), verifies it, and either attaches `req.userId` and calls `next()`, or
   responds `401` and stops the chain. Two distinct error codes, mirroring the existing
   refresh-token error pattern: `MISSING_ACCESS_TOKEN` (no token sent at all) vs.
   `INVALID_ACCESS_TOKEN` (a token was sent but is expired, forged, or signed with the wrong
   secret) — useful for a frontend to eventually distinguish "never logged in" from "session
   expired," even though the current API client already handles both the same way (attempt a
   refresh, then give up).
3. **Tests (`requireAuth.test.ts`).** Since no real protected route exists in the codebase yet
   to test this against (that arrives with the next task, the mood-logs endpoint), the test
   file builds a tiny throwaway Express app with one route (`GET /protected`) that exists only
   for this test — exactly the shape a real protected route will have. Covers: a valid token
   (200, correct `req.userId` attached), no `Authorization` header (401
   `MISSING_ACCESS_TOKEN`), a non-Bearer `Authorization` header (401, same code), an expired
   token, a token signed with the *refresh* secret instead of the access secret (401
   `INVALID_ACCESS_TOKEN` in both cases — proving the two token types can't be swapped, the
   same property already tested for the refresh endpoint in the 2.3 entry), and a garbage
   token string.
4. **`npm test`** — 24/24 passing (18 pre-existing, 6 new).
5. **`npm run build`** — compiled cleanly, confirming the declaration-merging trick above is
   valid TypeScript and not just something that happens to run under `ts-node`.

### Why it's needed

Every remaining backend task in this vertical slice — the mood-logs endpoint next — needs to
answer "which user does this request belong to?" before it can safely read or write data.
Without this middleware, that check would either not exist at all (meaning any request could
read or write any user's data by guessing an ID — the exact cross-user data leak Phase 11 is
built to catch) or would need to be reimplemented inline in every single route.

### Decisions

- **`req.userId` (a string) rather than `req.user` (a full user object).** The token only ever
  proves *who* the request is from, not any other detail about them — fetching the full `User`
  row is a separate, deliberate database call that individual routes can make if and when they
  actually need more than the ID (e.g. the future `GET /api/users/me`). Attaching a full user
  object here would mean either a database query on *every single request* whether the route
  needs it or not, or attaching stale/incomplete data — neither is worth it for the common case
  of "just tell me whose mood log to create."
- **Tested against a throwaway route rather than waiting for a real one.** Blocking this task on
  the mood-logs endpoint existing first would invert the dependency the wrong way — the
  endpoint needs the middleware to exist and be correct *first*. Testing the middleware in
  isolation, the same way `lib/jwt.ts`'s functions are unit-tested directly rather than only
  through the routes that use them, keeps this task genuinely finished on its own.

### State at end of this step

`requireAuth` exists, is fully tested, and is ready to be attached to routes — but nothing
uses it yet. No behavior of the live app has changed. The next task (mood-logs endpoint) is
where it gets attached to a real route for the first time.

### Verification

- `npm test` (`vitest run`) — 24/24 tests passing (18 pre-existing, 6 new).
- `npm run build` — compiled cleanly.

---

## 2026-08-15 — Why deleting a merged branch is safe (and why keeping it around actively causes bugs here)

**Task:** Not a [Tasks.md](Tasks.md) checklist item — while resolving a real merge conflict
on PR #27 (documented two entries up), the advice given was "delete each branch after it
merges, in order." That advice was met with a completely reasonable instinct: doesn't keeping
the branch around feel *safer*, in case something needs to be recovered later? Worth answering
properly rather than just asserting it.

### Background / concepts

#### What a git branch actually is — and, just as importantly, what it isn't

- A branch is **not a box that holds commits**. It's just a small, human-readable label —
  formally called a "ref" — that points at one specific commit. `feature/2.7-auth-middleware`
  is nothing more than a sticky note reading "the tip of this line of work is currently commit
  `d71c85d`." The commits themselves — the actual code, the actual history — exist
  independently of that sticky note, stored permanently in git's own database the moment
  they're created.
- **This is why deleting a branch, once its commits are merged, deletes nothing that matters.**
  Once `main` contains those same commits (which is exactly what "merged" means — `main`'s
  label now points at a commit that has all of the feature branch's commits as ancestors),
  the code is reachable from `main` forever, with full history, `git blame`, everything —
  completely independent of whether the `feature/2.7-auth-middleware` sticky note still exists.
  Deleting it only removes a now-redundant second label pointing at commits `main` already
  includes; it's the git equivalent of throwing away a Post-it note *after* copying its
  contents permanently into a filing cabinet, not throwing away the only copy.
- **The one real exception, so this isn't overstated:** a branch with commits that were *never*
  merged anywhere is the only copy of that work — deleting *that* would genuinely lose it (this
  is exactly why the earlier "stranded commit" incidents in this log were worth the forensic
  effort: real, unmerged work was at risk of being mistaken for already-safe). But a branch
  that's been cleanly merged into `main` has already been "copied into the filing cabinet" —
  there is no unique content left on it to protect.

#### Why keeping it around isn't just unnecessary here, but actively causes the exact bug this project already hit once

- This project's stacked-PR workflow (explained in the earlier "Tooling: stacked PRs,
  auto-retargeting" entry) relies on a specific, automatic GitHub behavior: when a PR's base
  branch is merged **and deleted**, GitHub notices the next PR in the stack was pointing at a
  branch that no longer exists, and automatically repoints ("retargets") it at `main` instead.
- **That retargeting is specifically triggered by the branch's deletion — not by the merge
  alone.** A branch that merges but is left alive still looks, to GitHub, like a perfectly
  valid, ongoing place for the next PR to be based on. Nothing tells GitHub "this branch is
  done, move on" except actually removing it.
- This is not a hypothetical risk — it's precisely what happened earlier in this project (see
  "The real bug: `postinstall` never reached `main` at all," a few hundred lines up). PR #18's
  branch merged but wasn't deleted; PR #19 (based on it) stayed pointed at that now-idle
  branch; clicking "merge" on #19 dutifully merged it into that branch instead of `main`,
  producing a PR that genuinely said "Merged" while its actual code never reached `main` at
  all. Real, unmerged commits then had to be forensically recovered and cherry-picked back in.
- So in this project's specific workflow, "keep the branch just in case" isn't a neutral,
  extra-cautious choice — it's the one action that reliably breaks the next PR in the stack,
  learned the hard way once already.

### Why it's needed

The instinct to preserve things rather than delete them is a good one in general — it's the
same instinct behind this log's whole practice of checking `git status` before anything
destructive. It just doesn't apply to a *merged* branch the way it would to, say, an untracked
file or uncommitted work: there, deleting really could lose the only copy; here, the copy
already exists permanently in `main`, and the branch label is the thing actively causing harm
by sticking around.

### Decisions

- No code change — this is a concept worth having written down plainly, since it's the kind
  of thing that's easy to get backwards by applying "don't delete things" as a blanket rule
  rather than understanding *why* that rule exists in the cases where it does apply.

### State at end of this step

No behavior changes. This is purely explanatory, prompted directly by today's PR #27 conflict
resolution and the merge-order/branch-deletion guidance that came with it.

---

## 2026-08-15 — Phase 1: `MoodLog` model + migration

**Task:** [Tasks.md](Tasks.md) → Phase 1 → "Define `MoodLog` model: `id`, `user_id`, `mood
(1–5)`, `energy (nullable 1–5)`, `stress (nullable 1–5)`, `notes (optional)`, `logged_at`."

**Delivered via branch:** `feature/1.4-mood-log-model` (stacked on
`feature/2.7-auth-middleware`, since the next task in this vertical slice — the mood-logs
endpoint — needs both the middleware and this model, and there's no reason to block local
progress waiting for either to be reviewed and merged first).

### Background / concepts

#### Why this is a new table, not just a column on `User`

- A user can log their mood many times (every day, several times a day) — this is a
  classic **one-to-many relationship**: one `User` has many `MoodLog` rows. That can't be
  represented as columns on `User` itself (there's no fixed number of mood logs to reserve
  columns for); it needs its own table, with each row pointing back at the user it belongs to
  via `user_id`.
- **What `mood_id_fkey` (the "foreign key") actually enforces.** `userId String @map("user_id")`
  alone would just be a plain text column — nothing would stop it from containing a value that
  doesn't correspond to any real user. Adding `user User @relation(fields: [userId],
  references: [id], onDelete: Cascade)` tells Postgres itself to enforce that `user_id` must
  match a real row in `users`, at the database level — not just something the application layer
  promises to check. This is a stronger guarantee than an application-only check: even a bug
  elsewhere in the code can't insert an orphaned mood log.
- **`onDelete: Cascade`, concretely.** Requirements call for "removing a `User` removes all
  associated logs" (Phase 1's cross-cutting item). Without `Cascade`, deleting a user whose
  `id` is still referenced by existing `mood_logs` rows would simply be *rejected* by Postgres
  (a foreign key violation) — `Cascade` instead tells Postgres "when the referenced user is
  deleted, automatically delete every row that points to it too," so account deletion (a later
  Phase 2 task) will be able to remove a user cleanly in one step rather than needing to
  manually delete every related table's rows first, in the right order, by hand.

#### `@db.Timestamptz(3)` — why the database column type was overridden

- Prisma's `DateTime` type, on Postgres, defaults to a column type that stores a timestamp
  *without* any timezone information attached — just a raw date and time, with no indication
  of which timezone it's relative to. That's a real problem for this app specifically: a
  wellness log's exact moment matters (grouping entries into "today" correctly depends on it),
  and a user's chosen `timezone` (already stored per-user since the very first `User` model)
  is meaningless without an unambiguous, timezone-aware value to interpret it against.
- `@db.Timestamptz(3)` overrides Prisma's default to Postgres's actual timezone-aware type
  (confirmed directly against the running database above: `timestamp(3) with time zone`) — the
  `(3)` is just precision (milliseconds). This matches what `requirements.md` §11 calls for
  and is the same reasoning Phase 1's cross-cutting "store `logged_at` as `timestamptz`" item
  describes; applied here to the one model this task actually adds, rather than waiting to
  apply it to every model at once at the very end of Phase 1.
- **What this doesn't do yet:** actually computing "which calendar day does this log belong to,
  in the user's timezone" is separate logic, needed by the dashboard/streak features in Phase
  4 — storing the value correctly is a prerequisite for that, not the same thing as having
  built it.

#### The composite index, and why `[userId, loggedAt]` specifically (not two separate indexes)

- Every future read of this data — "this user's mood logs for the last 30 days," "this user's
  most recent mood entry" — filters by `userId` *and* orders/ranges by `loggedAt` together, not
  either one alone. A single composite index on `[userId, loggedAt]` lets Postgres satisfy that
  combined pattern efficiently in one lookup; two separate single-column indexes wouldn't
  combine as effectively for this specific "filter by X, then range over Y" access pattern,
  which is exactly what every planned mood-log query looks like.

### What was done

1. **`backend/prisma/schema.prisma`.** Added the `MoodLog` model as described above, plus the
   reciprocal `moodLogs MoodLog[]` field on `User` (Prisma requires both sides of a relation to
   be declared, not just the "many" side).
2. **Migration.** `npx prisma migrate dev --name add_mood_log` — generated and applied
   `20260815174231_add_mood_log` against the local Postgres container.
3. **`npm run build`** — compiled cleanly (also regenerates the Prisma Client, which is how
   `prisma.moodLog.create(...)` etc. become available with full TypeScript types in the next
   task).
4. **`npm test`** — 24/24 passing, unchanged from the previous entry (this task adds no new
   application code, only schema).
5. **Manual verification directly against Postgres** (not just trusting the migration command's
   own "success" output): `psql \d mood_logs`, confirming the exact column types, the
   `timestamp(3) with time zone` type, the composite index, and the cascading foreign key all
   exist for real in the running database.

### Why it's needed

The mood-logs endpoint (next task) needs somewhere to actually store data — this is that
storage, with the correct relationships and constraints in place before any API code is
written against it, rather than discovering a missing constraint later after real data exists.

### Decisions

- **No `createdAt` field**, unlike `User`. Kept to exactly the fields `requirements.md` and
  `Tasks.md` specify for this model — `logged_at` already captures the moment that matters for
  a log entry (when the mood happened, which can be backfilled to a past date/time); a separate
  "when was this database row inserted" timestamp isn't something any planned feature reads.
- **Stacked this branch on `feature/2.7-auth-middleware` rather than `main`.** This model has
  no code dependency on the auth middleware, but the *next* task (the mood-logs endpoint) needs
  both, and there's no reason to sit idle waiting for either PR to be reviewed first. Both
  branches will need merging in order once reviewed, same as the earlier auth vertical slice.

### State at end of this step

`mood_logs` exists in the local database with the correct shape, constraints, and index. No
API endpoint reads or writes it yet — that's the next task.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 24/24 passing (unchanged).
- `psql \d mood_logs` against the real local database — confirmed column types (including
  `timestamp(3) with time zone`), the composite index, and the cascading foreign key directly,
  not inferred from the migration file alone.

---

## 2026-08-15 — Phase 3: `GET/POST/PATCH/DELETE /api/mood-logs`

**Task:** [Tasks.md](Tasks.md) → Phase 3 → Mood → "`GET/POST/PATCH/DELETE /api/mood-logs` —
full CRUD, scoped to the authenticated user; validate `mood` 1–5, `energy`/`stress` 1–5 when
present."

**Delivered via branch:** `feature/3.5-mood-logs-endpoint` (stacked on
`feature/1.4-mood-log-model`, which is itself stacked on `feature/2.7-auth-middleware` — this
task is where both of the previous two tasks actually get used together for the first time).

### Background / concepts

#### "Scoped to the authenticated user" — what that phrase actually means in code

- Every route in this file reads `req.userId`, which only exists because `requireAuth` (the
  previous task) ran first and put it there — this is `app.ts`'s
  `app.use("/api/mood-logs", requireAuth, moodLogsRouter)`: the middleware runs on *every*
  request to any `/api/mood-logs/*` route before any of this file's own code does.
- **"Scoped" isn't just about who's logged in — it's about which rows a query is even allowed
  to touch.** `GET` filters with `where: { userId: req.userId }`; `PATCH`/`DELETE` look the row
  up with `findFirst({ where: { id, userId: req.userId } })` rather than a plain `findUnique({
  where: { id } })`. The difference matters: `findUnique` by `id` alone would find *any* user's
  mood log if you guessed or otherwise obtained its ID — the query itself would happily return
  someone else's data. Including `userId` in the `where` clause means a mismatched log simply
  doesn't match the query at all, as if it didn't exist. This is the concrete mechanism behind
  Phase 11's later audit item ("confirm queries are filtered by the authenticated `user_id`")
  — and it's tested directly here already (see below), not deferred to that later phase.
- **Why 404, not 403, for "this log belongs to someone else."** A `403 Forbidden` response
  confirms to the caller "yes, this resource exists, you're just not allowed to see it" — which
  is itself a small information leak (an attacker could probe IDs to learn which ones are
  real). Responding `404 Not Found` for both "genuinely doesn't exist" and "exists but isn't
  yours" gives an outside caller no way to tell the two apart — the same reasoning already
  applied to login's undifferentiated `INVALID_CREDENTIALS` response back in Phase 2.

#### Backfilling: accepting a caller-supplied `loggedAt`, safely

- Requirements call for letting a user log an entry for *yesterday*, not just "right now" — a
  real need for a wellness tracker (e.g. remembering this morning's mood in the evening). The
  `loggedAt` field in the request body is entirely optional; when present, it's validated as a
  proper ISO 8601 datetime string by Zod's `z.string().datetime()` before ever reaching the
  database, and when absent, the database's own `@default(now())` (from the previous entry's
  schema) fills it in — "now" is deliberately resolved by the database at insert time, not
  computed earlier in the request-handling code, so it reflects the actual moment of insertion.
- Nothing stops a caller from supplying a `loggedAt` in the *future* here — Tasks.md's spec
  for this task only calls for validating the numeric rating fields, not constraining the date
  range, so this is left permissive rather than adding an unrequested rule.

#### Reading `req.userId` inside a route that ran after `requireAuth`

- This is the payoff of the previous task's TypeScript declaration-merging work: every handler
  in this file can write `req.userId` and have it type-check as `string | undefined`, with real
  autocomplete, purely because `requireAuth.ts` extended Express's own `Request` type once,
  centrally. Nothing in this file needs to re-declare or re-verify what that middleware already
  guarantees.

### What was done

1. **`backend/src/routes/moodLogs.ts` (new).** Four routes:
   - `GET /` — lists the authenticated user's mood logs, most recent first.
   - `POST /` — validates the body with Zod (`mood` required 1–5; `energy`/`stress` optional
     1–5; `notes` optional non-empty string; `loggedAt` optional ISO datetime), creates the row,
     returns `201` with the created log.
   - `PATCH /:id` — validates a *partial* body (any subset of the same fields), looks the log
     up scoped to the caller (`404` if missing or not owned), applies the update, returns `200`.
   - `DELETE /:id` — same ownership lookup, deletes, returns `200`.
2. **`backend/src/app.ts`.** Mounted the router at `/api/mood-logs` with `requireAuth` applied
   at the mount point (`app.use("/api/mood-logs", requireAuth, moodLogsRouter)`) — the first
   route group in the app that isn't wide open, and the first real use of the previous task's
   middleware.
3. **Tests (`moodLogs.test.ts`).** Covers: every route rejecting a request with no access
   token; creating and reading back a log; `loggedAt` defaulting to "now" vs. accepting an
   explicit past date for backfilling; rejecting an out-of-range `mood`/`energy`; listing only
   the calling user's own logs (registers a second user and confirms their log never appears);
   updating an owned log; `404` for an update/delete against a nonexistent ID; **and,
   specifically, a cross-user test** — user A creates a log, user B (a different authenticated
   account) attempts to edit and delete it, both get `404`, and the log is confirmed unchanged
   directly via `prisma.moodLog.findUnique` afterward, proving the intruder's requests had
   zero effect rather than just returning the "right" status code by coincidence.
4. **`npm test`** — 33/33 passing (24 pre-existing, 9 new).
5. **`npm run build`** — compiled cleanly.
6. **Manual end-to-end verification against the compiled, running server** (`npm start`), via
   `curl`: registered and logged in a real user, confirmed `/api/mood-logs` returns `401` with
   no token, then walked the full lifecycle with a real access token — create (`201`), list
   (the created log present), update (`200`, new `mood` value reflected), delete (`200`), and a
   final list confirming the log is genuinely gone (`[]`). Cleaned up the manually-created test
   user afterward via `psql` and stopped the manually-started server.

### Why it's needed

This is the first piece of real wellness-tracking functionality in the app — everything before
this task was infrastructure (auth, deployment) in service of *eventually* letting a user
record something about their day. It also proves out the full pattern (auth middleware → model
→ scoped CRUD route) that every other log type (symptoms, medications, habits) in the rest of
Phase 3 will repeat.

### Decisions

- **Not building the centralized error-handling middleware from Phase 3's cross-cutting
  checklist item in this task.** This route's error responses (`{ error: { message, code } }`)
  are written by hand, matching the exact shape already used throughout `routes/auth.ts` — kept
  consistent with the existing convention rather than introducing a mismatched shape, but the
  *centralized* version (a single Express error-handling middleware other routes could rely on
  instead of each repeating this by hand) is left as that checklist item's own separate task,
  not bundled in here.
- **`200 { message: "Deleted" }` rather than `204 No Content` for `DELETE`.** `204` (with an
  empty body) is the more common REST convention, but this codebase's one existing precedent
  for "an action completed, nothing to return" — `POST /api/auth/logout` — already returns `200`
  with a small JSON body. Matched that existing convention for consistency rather than
  introducing a second, different "successful action" shape.
- **No query parameters on `GET /` yet** (date range, pagination). Tasks.md scopes that to
  Phase 9 (History filtering) — added here it would be speculative, unused by anything yet.

### State at end of this step

A real, working, tested, auth-protected CRUD API for mood logs exists locally. Nothing on the
frontend calls it yet — that's the next task. Deployed production (Railway) does not yet have
this code; it will pick it up whenever this branch is merged to `main` (the same auto-deploy
pipeline documented in the earlier Railway entries).

### Verification

- `npm test` (`vitest run`) — 33/33 passing (24 pre-existing, 9 new).
- `npm run build` — compiled cleanly.
- Manual `curl` round-trip against the compiled, running server: unauthenticated request → 401;
  full create → list → update → delete → list-again lifecycle with a real access token, each
  response matching expectations exactly.

---

## 2026-08-15 — Phase 7: Mood entry form, wired into the Dashboard

**Task:** [Tasks.md](Tasks.md) → Phase 7 → "Mood entry form: 5 large emoji/visual mood
buttons, optional energy (1–5) and stress (1–5) controls, optional notes, date/time picker,
`Save Entry` button — matching the wireframe."

**Delivered via branch:** `feature/7.3-mood-entry-form` (stacked on
`feature/3.5-mood-logs-endpoint`). This is the last piece of the mood-logging vertical slice —
where everything built so far (auth middleware, the `MoodLog` model, the CRUD endpoint)
finally becomes something a real person can see and use, the same way the very first vertical
slice ended with an actual login form rather than just a working `/api/auth/login` endpoint.

### Background / concepts

#### Why this task also touched `DashboardPage.tsx`, not just added a new form component

- Tasks.md's own wording for this item is scoped to the form itself. But a form nobody can
  reach isn't a finished feature yet — the earlier auth vertical slice's whole justification
  (documented back in its own entry) was building thin *end-to-end* slices specifically so
  something is genuinely usable at the end of each one, not just individually correct in
  isolation. `DashboardPage.tsx` (previously just a placeholder welcome message) is where this
  form needed to actually live for that to be true here too.
- **What was deliberately left out**, to keep this task's scope honest rather than quietly
  absorbing later Tasks.md items: the shared "Quick Add" modal used by *all four* log types
  (its own Phase 7 item), and reusing this same form pre-filled for editing (a separate,
  later Phase 7 item covering all log types at once). This entry's dashboard only has mood
  logging, shown inline rather than in a modal, with delete but not edit — intentionally
  smaller than what those later, broader tasks will eventually build.

#### `role="radiogroup"` / `role="radio"` — accessible custom controls, not real `<input>`s

- The five mood buttons (and the energy/stress rating rows) are visually just styled
  `<button>` elements, not native HTML radio inputs — a native radio button can't easily be
  styled as a large emoji tile the way the wireframe calls for. But semantically, they behave
  exactly like a radio group: exactly one selectable at a time (for mood), with a clear
  "currently selected" state. Native radio inputs get this behavior (and screen-reader
  announcements, keyboard behavior) for free; a plain `<button>` doesn't automatically
  communicate any of that to assistive technology.
  - `role="radiogroup"` on the container and `role="radio"` + `aria-checked` on each button is
    how that meaning gets communicated explicitly instead — a screen reader announces these the
    same way it would a native radio group, even though under the hood they're just buttons with
    an `onClick`. This is the same "custom rating control needs explicit ARIA roles" concern
    Phase 12 (Accessibility QA) calls out generally; applied here at the point the first rating
    control actually gets built, rather than retrofitted later.
- The energy/stress rows reuse the same pattern but allow *deselecting* (clicking an already-
  selected value clears it back to "not set") — appropriate since those two fields are
  genuinely optional, unlike mood, which is required.

#### `<input type="datetime-local">` and why the value has to be built by hand

- HTML has a built-in date/time picker input (`type="datetime-local"`) — using it directly
  avoids writing a custom calendar widget for this task, which the requirements don't call for
  ("date/time picker" is satisfied by the native control). The one wrinkle: this input's value
  format is a specific plain string (`"YYYY-MM-DDTHH:mm"`) with **no timezone information at
  all** — it represents whatever the browser's local wall-clock time is, nothing more. The
  `toDateTimeLocalValue` helper in `MoodEntryForm.tsx` builds that exact string from `new
  Date()` to default the field to "right now" in the browser's own local time, since neither
  `Date`'s own `toISOString()` (which is UTC, not local) nor any other built-in method produces
  this specific format directly.
- On submit, that local-time string is converted back with `new Date(loggedAt).toISOString()`
  before being sent to the API — which is what the backend's `loggedAt` field actually expects
  (an unambiguous ISO 8601 instant, validated by the previous task's Zod schema). The
  round-trip matters: a plain local-time string sent as-is would be ambiguous about which
  timezone it was meant in; converting through a real `Date` object resolves that ambiguity
  using the browser's own timezone before the value ever leaves the client.

#### Why the dashboard list doesn't reuse the `Card` component

- `Card` (used by `LoginPage`/`RegisterPage`) is hard-coded to `max-w-sm` — a deliberate choice
  for a centered auth form, but wrong for a dashboard list meant to fill the page's wider
  content column. Overriding a Tailwind utility class by appending another one after it in the
  same `className` string (e.g. trying to cancel `max-w-sm` with a later `max-w-none`) isn't
  reliably safe — which of two conflicting utility classes "wins" depends on the order Tailwind
  itself emits them in the generated stylesheet, not the order they appear in the `className`
  attribute, so this can silently do nothing depending on build details. Rather than relying on
  that, the dashboard's mood-log list and form container use plain `<div>`s with the same
  visual styling (`rounded-2xl border border-border bg-surface p-6 shadow-sm`) copied
  directly, without the width constraint — correct and unambiguous, at the small cost of a
  little duplicated styling until `Card` is generalized (a natural candidate for Phase 5's
  still-unbuilt shared-primitives cleanup, not something to force through here).

### What was done

1. **`frontend/src/components/MoodEntryForm.tsx` (new).** Five emoji mood buttons (1 Bad ↔ 5
   Great, per requirements §6.2's exact wording), optional 1–5 energy/stress rating rows,
   optional notes textarea, a `datetime-local` field defaulting to "now," and Save/Cancel
   buttons. Submits directly via `apiFetch("/api/mood-logs", { method: "POST", ... })` and
   calls `onSaved(log)` with the created row on success — no separate state-management layer,
   consistent with how `LoginPage`/`RegisterPage` already call the API client directly rather
   than through an intermediate store.
2. **`frontend/src/pages/DashboardPage.tsx` (rewritten).** Fetches the user's mood logs on
   mount (`GET /api/mood-logs`), shows a `+ Mood` button that reveals the form inline, prepends
   newly-saved logs to the list, and lets each entry be deleted (optimistic removal from the
   list, rolled back if the `DELETE` request fails).
3. **Tests (`MoodEntryForm.test.tsx`).** Requiring a mood selection before submit is possible;
   a full submission (mood + energy + notes) producing the exact expected request body and
   calling `onSaved` with the server's response; a failed save showing a friendly error; Cancel
   calling `onCancel`.
4. **`npm test`** (frontend) — 18/18 passing (14 pre-existing, 4 new).
5. **`npm run build`** (frontend) — compiled cleanly.
6. **Real browser verification**, per the project's UI-change testing rule — not just tests and
   a type-check. Started the actual compiled backend (`npm start`, working around the
   pre-existing, previously-documented `ts-node-dev` crash) and the frontend dev server, then
   drove a real headless Chromium browser through the full flow with a throwaway Playwright
   script: register → land on Dashboard → open the mood form → select "Good," energy 4, add a
   note → Save → confirm the entry actually appears in the list with the right emoji, values,
   note, and timestamp → delete it → confirm the list returns to its empty state. No browser
   console errors at any point. Screenshots taken at each step and visually reviewed, not just
   asserted programmatically. Cleaned up the browser-created test user afterward and stopped
   both manually-started servers.

### Why it's needed

This is the moment the mood-logging vertical slice becomes a real, usable feature rather than
a set of individually-correct but disconnected pieces — the same significance the original
login form had for the auth slice.

### Decisions

- **Inline on the Dashboard, not a modal.** The shared Quick Add modal (meant to serve all four
  log types at once, per its own Phase 7 checklist item) doesn't exist yet, and building it just
  for mood alone would mean redoing it once the other three log types arrive. An inline toggle
  is simpler and doesn't foreclose that later, shared design.
- **Delete only, no edit, in this slice.** Editing "reusing the same form pre-filled with
  existing values" is its own explicit Tasks.md item, written to cover all four log types at
  once — building a one-off version just for mood here would likely need reworking once that
  broader task starts. Delete alone is enough to make the feature genuinely usable end to end
  (create something, see it, remove it) without pre-building a piece of a not-yet-started task.
- **Plain `<div>`s instead of forcing `Card` to fit.** Covered above — chosen over a
  Tailwind class-override that isn't guaranteed to behave predictably.

### State at end of this step

A real user can register or log in, land on the Dashboard, log their mood with optional energy/
stress/notes/backdated time, see it appear immediately, and delete it — verified directly in a
real browser, not just via tests. This closes out the mood-logging vertical slice: Phase 2.7
(auth middleware) → Phase 1.4 (model) → Phase 3.5 (endpoint) → Phase 7.3 (this task) are each
their own PR, stacked in that order, and need merging in that same order once reviewed.

### Verification

- `npm test` (frontend, `vitest run`) — 18/18 passing (14 pre-existing, 4 new).
- `npm run build` (frontend) — compiled cleanly.
- Real headless-browser walkthrough (Playwright) against the actual running backend and
  frontend dev servers: full register → log mood → view → delete cycle, screenshots reviewed
  at each step, zero browser console errors.

---

## 2026-08-16 — Phase 0: ESLint + Prettier for both projects (and an unexpected TypeScript downgrade)

**Task:** [Tasks.md](Tasks.md) → Phase 0 → "Set up ESLint + Prettier for both projects for
consistent code style."

**Delivered via branch:** `feature/0.4-eslint-prettier` (branched from `main`). This was the
first genuinely unchecked item left in Phase 0 — everything checked off since then (auth,
mood logging, deployment) had jumped ahead of it. It turned into a bigger story than expected:
a real compatibility wall with this project's TypeScript version, and a decision to fix it at
the root rather than work around it.

### Background / concepts

#### What a linter is, and why it's a different tool from the TypeScript compiler

- `tsc` (the TypeScript compiler, already run by both projects' `build` scripts) checks one
  specific thing: **are the types consistent?** Does this function actually return what its
  signature promises, does this variable actually hold the type it's declared as. It has no
  opinion on things that are perfectly type-safe but still bad ideas — an unused variable, an
  `==` where `===` was clearly meant, a `catch` block that silently swallows an error.
- **A linter (ESLint on the backend, `oxlint` on the frontend) checks a different, broader
  category: patterns in the code that are usually mistakes, even if they're not type errors.**
  It reads the code the same way `tsc` does (parsing it into a tree structure) but asks
  different questions of it. The two tools are complementary, not competing — this project
  already runs `tsc` on every build; today's task adds the second layer on top.

#### Why Prettier is a *third*, separate tool from either of those

- **Prettier formats code — indentation, line-wrapping, quote style — it has zero opinion on
  whether the code is *correct*.** A linter could theoretically also enforce formatting rules
  (many older ESLint setups did exactly that), but mixing "is this code correct" with "is this
  code formatted consistently" tends to produce noisy, argument-inducing rule conflicts. The
  modern convention (used here) is to let Prettier own 100% of formatting and have the linter
  defer to it entirely — which is what `eslint-config-prettier` does in the backend's config:
  it doesn't add any new rules, it just **turns off** every ESLint rule that would otherwise
  fight with Prettier over formatting, so the two tools never disagree.
- Running `npx prettier --write .` for the first time on an existing codebase reformats
  whatever wasn't already in Prettier's preferred style — expected, one-time noise. Every
  affected file was reviewed by hand before committing (see *What was done*) to confirm the
  changes were genuinely just whitespace/quote-style, not anything that changed behavior.

#### The real blocker: `typescript-eslint` flatly refuses to run on TypeScript 7

- Installing `typescript-eslint` (the standard package for teaching ESLint to understand
  TypeScript syntax) in the backend hit an immediate, hard failure — not a warning, a thrown
  error that stopped ESLint from running at all: `"typescript-eslint does not support TS 7.0."`
- **Why:** `backend/package.json` had `"typescript": "^7.0.2"` — not because anything in this
  codebase deliberately needs a TypeScript-7-only feature, but simply because TypeScript 7 is
  what `npm install typescript` installs today (confirmed directly: `npm view typescript
  dist-tags` shows `latest: 7.0.2`). TypeScript 7 is a genuinely new major version — a rewritten,
  much faster compiler — and `typescript-eslint` (a separate, independently-maintained project)
  hasn't been updated to support it yet. This is openly, currently tracked as unresolved on
  `typescript-eslint`'s own GitHub issue tracker (#10940) — a real, external, not-yet-closed gap
  in the ecosystem, not a bug specific to this project or something fixable with a config tweak.
- **The tempting-but-wrong fix:** TypeScript's own team publishes an official workaround for
  this exact situation — alias the `typescript` package to a TypeScript-6.0-compatible shim
  package, so tools like `typescript-eslint` (which resolve `typescript` as a normal
  dependency) transparently get version 6 instead, while a *separate* alias
  (`@typescript/native`) gives access to the real TypeScript 7 compiler for actual builds. This
  was seriously considered and rejected: it means the project runs **two different TypeScript
  installs simultaneously** — one used by `tsc`/`vitest`/`ts-node-dev`, another used only by
  the linter — which is a lot of new moving parts and a real chance of the two subtly
  disagreeing, all just to keep using a TypeScript version this project never actually needed
  for any specific feature.
- **The decision made instead: downgrade the whole backend to TypeScript 6.0.3** (the latest
  release on the mature, widely-supported 6.x line) rather than juggling two versions. One
  TypeScript version, used consistently everywhere — `tsc`, `vitest`, `ts-node-dev`, and now
  ESLint too — all agreeing about what the code means. `moduleResolution: "Bundler"` (this
  project's tsconfig setting, explained in an earlier entry) has existed since TypeScript 5 and
  works identically under 6, so nothing about the existing configuration needed to change.
- **An unplanned, welcome side effect: `npm run dev` (`ts-node-dev`) works again.** A much
  earlier entry (Phase 2.3's refresh-token task) documented `ts-node-dev` crashing on startup
  under TypeScript 7 and worked around it by always running the compiled build instead. That
  crash is gone under TypeScript 6 — confirmed by actually starting the dev server and seeing
  it boot cleanly (`ts-node ver. 10.9.2, typescript ver. 6.0.3`) rather than just assuming.
  Today's task fixed a previously-known, previously-worked-around bug as a bonus, not the goal.

#### Why the frontend didn't need any of this

- `frontend/package.json` already pins `"typescript": "~6.0.2"` — it was never on TypeScript 7
  in the first place, so `oxlint` (the frontend's existing linter, chosen during the original
  Vite scaffold) was never at risk of this specific conflict.
- **Why `oxlint` stays, instead of also adding ESLint to the frontend.** Tasks.md's wording says
  "ESLint," but the frontend already had a working, modern linter in place before this task
  started — `oxlint` is a newer tool built to do the same job (catch likely-mistake patterns)
  much faster, since it's written in Rust rather than JavaScript. Installing ESLint *as well*
  would mean two linters arguing over the same code, for no real gain — the spirit of this
  task ("consistent code style tooling exists") is already satisfied by the existing choice.
  Prettier is the genuinely missing piece on the frontend side, and is what this task adds.

#### One real lint finding, and why it was suppressed rather than "fixed"

- ESLint's `@typescript-eslint/no-namespace` rule flagged `requireAuth.ts`'s `declare global {
  namespace Express { ... } }` block (from the auth-middleware entry — the code that lets
  `req.userId` be a properly typed property). The rule exists because `namespace` was
  TypeScript's *original*, now-outdated way to organize code into modules, before ES2015
  modules (`import`/`export`) became standard — for ordinary code organization, the rule is
  right to discourage it.
- **This isn't that case.** "Augment a type that already exists in a third-party library" (here,
  Express's own `Request` interface) is a different, still-current use of `namespace` — it's
  TypeScript's own required syntax for that specific job; there genuinely is no ES2015-module
  equivalent for it. Rewriting working, correct code just to satisfy a rule that doesn't apply
  to this situation would make the code worse, not better. Instead, a single targeted
  `// eslint-disable-next-line` comment suppresses the rule for that one line, with a comment
  explaining *why* — narrow enough that a genuine, accidental `namespace` used for ordinary code
  organization elsewhere would still be caught.

### What was done

1. **Backend.** Installed `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`,
   `prettier`; downgraded `typescript` from `^7.0.2` to `6.0.3`. Added `eslint.config.mjs`
   (ESLint's modern "flat config" format — a single exported array of config objects, replacing
   the older `.eslintrc` JSON format): ESLint's own recommended rules, `typescript-eslint`'s
   recommended rules, `eslint-config-prettier` last (so it wins any rule conflicts), and
   `src/generated/**`/`dist/**` excluded (the Prisma-generated client and compiled output —
   code this project doesn't hand-write and has no business linting). Added `.prettierrc.json`
   (`printWidth: 100`, `trailingComma: "all"` — chosen to roughly match this codebase's existing
   wrapping conventions) and `.prettierignore` (also excluding `prisma/migrations`, which are
   generated, historical, and shouldn't be reformatted after the fact). Added `lint`, `format`,
   and `format:check` scripts to `package.json`.
2. **Frontend.** Installed `prettier` only (kept `oxlint` as the linter, per the reasoning
   above). Added the same `.prettierrc.json` shape and a `.prettierignore` (excluding `dist`,
   `dist-ssr`, and `pr-screenshots-output`, the CI screenshot tool's local output directory).
   Added `format`/`format:check` scripts.
3. **Ran `prettier --write .` in both projects once**, reviewed every changed file's diff by
   hand to confirm each change was purely cosmetic (line-wrapping, quote normalization from the
   Vite scaffold's original single-quote/no-semicolon style to this codebase's existing
   double-quote/semicolon style) — backend: 4 files reformatted; frontend: 6 files.
4. **Fixed the one real ESLint finding** (`requireAuth.ts`'s namespace declaration) with a
   targeted, explained suppression rather than rewriting correct code, per the reasoning above.
5. **Full verification, both projects:** backend — `npm run build` (compiled cleanly), `npm
   test` (33/33 passing, unchanged), `npx eslint .` (zero errors/warnings), `npx prettier
   --check .` (all files compliant); frontend — `npm run build` (compiled cleanly), `npm test`
   (18/18 passing, unchanged), `npm run lint` (one pre-existing `oxlint` warning on
   `AuthContext.tsx`, unrelated to this task and not newly introduced), `npx prettier --check .`
   (all files compliant). Also manually started `npm run dev` in the backend to directly confirm
   the `ts-node-dev` fix described above, rather than just inferring it from the version bump.

### Why it's needed

Beyond satisfying the Tasks.md checklist item itself: a linter catches an entire category of
real bugs (an accidentally-unused variable that was meant to be used, a comparison that always
evaluates the same way) before they ever reach a human reviewer or, worse, production — exactly
the kind of thing that's easy to miss reading a diff but obvious to a tool built to look for it.
Prettier removes an entirely different, low-value source of friction: nobody has to think about
or debate spacing/quote style in a PR review ever again, because there's only one style the
tooling will produce.

### Decisions

- **Downgraded TypeScript rather than aliasing two versions or skipping ESLint on the backend.**
  Covered in detail above — the simplest fix that leaves the project with one TypeScript
  version, fully supported by every tool that touches it, rather than either an unsupported gap
  (no backend linting) or a more fragile dual-version setup solving a problem (needing TS 7)
  this project doesn't actually have.
- **Kept `oxlint` on the frontend instead of adding ESLint there too.** Two linters covering the
  same job is duplicated effort and a source of rule disagreements, not extra safety.
- **Suppressed, not rewrote, the one real `requireAuth.ts` finding** — covered above; the
  underlying code was already correct.

### State at end of this step

Both projects have working, verified lint and format tooling (`npm run lint`, `npm run format`,
`npm run format:check` — `format`/`format:check` new to backend's script names, though
`lint` already existed on the frontend). The backend is now on TypeScript 6.0.3 instead of 7.0.2
project-wide, and `npm run dev` works again as a result. No application behavior changed —
every file's diff in this task is either new config/tooling or a pure reformat.

### Verification

- Backend: `npm run build` (clean), `npm test` (33/33), `npx eslint .` (clean), `npx prettier
  --check .` (clean), `npm run dev` manually started and confirmed working (previously broken).
- Frontend: `npm run build` (clean), `npm test` (18/18), `npm run lint` (one pre-existing,
  unrelated warning), `npx prettier --check .` (clean).
- Every file Prettier reformatted was reviewed by hand via `git diff` to confirm the changes
  were purely cosmetic before committing.

### How to know when it's safe to move back to TypeScript 7

The backend is on TypeScript 6.0.3 now, not forever — TypeScript 7 is a genuinely faster
compiler, and re-upgrading once the ecosystem catches up is a reasonable thing to want later.
Worth writing down *how* to judge that moment, rather than just guessing or trying again
speculatively every so often.

#### The signal that actually matters: does every tool that touches TypeScript support it?

- This project's TypeScript version isn't used by one tool — it's used by `tsc` (the compiler
  itself), `typescript-eslint` (today's blocker), `vitest` (runs `.ts` test files directly),
  and `ts-node`/`ts-node-dev` (the dev server). **An upgrade is only actually safe once *all*
  of them support the new version — not just the one you happen to be testing.** It's easy to
  check the one tool that broke loudly (`typescript-eslint`, here) and miss that another tool
  would have failed just as hard, only more quietly (e.g. producing subtly wrong output instead
  of refusing to run).
- **Where to check, concretely, for a package like `typescript-eslint`:**
  - `npm view typescript-eslint peerDependencies` — shows the exact version range it currently
    declares support for (this is what caught the problem today: it printed `typescript:
    ">=4.8.4 <6.1.0"`, an explicit, honest statement of "I don't support anything past this").
    Re-running this same command in the future and seeing the upper bound move past `7.0.0` is
    the actual, concrete signal an upgrade might be safe — not a changelog claim, not a blog
    post, the package's own declared compatibility range.
  - The specific tracked issue for this gap — `typescript-eslint/typescript-eslint#10940` on
    GitHub — is the most direct source: when that issue is closed (not just "commented on" or
    "in progress"), that's the maintainers themselves confirming support landed.
  - A package's own release notes/changelog around the version where the peer range changes
    usually says explicitly "adds support for TypeScript 7" — worth reading, not just inferring
    from the version number bump alone.

#### What "safe to upgrade" looks like as a concrete process, not just a feeling

- **Never upgrade a core dependency like this directly on `main`.** The right shape is exactly
  what a normal Tasks.md-style task already looks like: a dedicated branch (e.g.
  `chore/upgrade-typescript-7`), bump the version, and then run the *entire* verification
  suite this project already relies on before ever proposing it as a PR — `npm run build`,
  `npm test`, `npm run lint`, `npm run format:check`, and (per this project's standing
  practice) actually starting the dev server and hitting a real endpoint, not just trusting
  that the commands exit with code 0.
- **If anything fails, that's the answer** — not a bug in this project's setup, just a
  concrete, current "not yet" for that specific piece of tooling. Revert the version bump and
  try again later, the same low-drama way today's TS 6 downgrade was reached: prove it broken,
  choose the simplest fix, verify the fix directly, move on.
- **A useful middle-ground check that costs nothing:** periodically running just `npm view
  typescript-eslint peerDependencies` (or the equivalent for any pinned-down tool) doesn't
  require touching the codebase at all — it's a single, free command that tells you whether
  it's even worth spending time on a real upgrade attempt yet.

---

## 2026-08-16 — Fixing a real production bug: direct links to any page but the homepage 404'd

**Task:** Not a [Tasks.md](Tasks.md) checklist item — a real user (not automated testing)
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

## 2026-08-16 — Clarifying what 1 and 5 mean on the energy/stress scales

**Task:** Not a [Tasks.md](Tasks.md) checklist item — direct feedback from a real user of the
mood entry form: the energy and stress number scales (1–5) had no indication of which end was
"low" and which was "high," so it wasn't obvious whether `1` meant "no energy" or "very
energetic."

### Background / concepts

#### Why a plain 1–5 number scale is ambiguous without labels

- The mood scale right above it doesn't have this problem — each button already carries an
  emoji *and* a word (`😞` "Bad" up to `😄` "Great"), so the direction is obvious without
  thinking about it. The energy/stress rows only ever showed bare digits, which carry no
  inherent direction on their own — nothing about the numeral `1` says whether it's the low end
  or the high end of the scale it's part of. This is exactly the kind of gap that's invisible
  to whoever built the form (the direction was obvious *to me*, because I knew what I intended)
  but genuinely unclear to a first-time user with no other context — precisely why real user
  feedback caught it and automated testing/code review didn't.
- **Energy and stress can't share one fixed label pair, either.** For energy, `5` (maximum) is
  the "good" end; for stress, `5` (maximum) is the "bad" end. A single generic caption like
  "1 = Low, 5 = High" would technically be accurate for both but wouldn't actually resolve the
  ambiguity the feedback was about — the fix needed to spell out what "low" and "high" concretely
  *mean* for each specific scale.

#### The fix, and how it's wired for accessibility too

- `RatingRow` (the shared component behind both the energy and stress rows in
  `MoodEntryForm.tsx`) now takes two new props, `lowLabel` and `highLabel`, and renders a small
  line of muted text underneath the buttons: `1 = No energy · 5 = Maximum energy` for the
  energy row, `1 = No stress · 5 = Maximum stress` for the stress row.
- That text isn't just visual. It's given an `id` (via React's `useId()`, which generates a
  unique, stable ID per component instance without hand-writing one) and wired to the
  radiogroup above it with `aria-describedby` — this is how a screen reader knows that
  paragraph is *describing* the control above it, not just unrelated nearby text, so a
  screen-reader user hears the same clarification a sighted user now sees.

### What was done

1. **`frontend/src/components/MoodEntryForm.tsx`.** Added `lowLabel`/`highLabel` props to
   `RatingRow`; energy passes `"No energy"`/`"Maximum energy"`, stress passes `"No
   stress"`/`"Maximum stress"`. Rendered as a `text-xs text-text-muted` line beneath each
   button row, connected to the radiogroup via `aria-describedby`.
2. **Test.** Added a case asserting both caption strings render.
3. **`npm test`** — 19/19 passing (18 pre-existing, 1 new).
4. **`npm run build`**, **`npm run lint`** (`oxlint` — clean, same one pre-existing unrelated
   `AuthContext.tsx` warning as before), **`npx prettier --check .`** — all clean.
5. **Real browser check**, per this project's UI-change testing habit: started the actual
   backend and frontend dev servers, registered a fresh user with Playwright, opened the mood
   form, and took a screenshot — confirmed both caption lines render exactly as intended,
   directly under their respective scales. Cleaned up the test user and stopped both servers
   afterward.

### Why it's needed

The scale was already functionally correct — nothing was broken — but a control a real user
can't confidently interpret is a genuine usability defect for a wellness-tracking app
specifically, where the whole point is recording an accurate, meaningful number. This is also
a good example of feedback that no amount of automated testing would ever have caught, since
the tests (reasonably) already know what `1` and `5` are supposed to mean.

### Decisions

- **Per-scale labels, not a shared generic caption.** Covered above — "low/high" alone
  wouldn't have actually resolved the reported confusion.
- **Text under the buttons, not inside/on them.** Keeps the buttons themselves clean and large
  (already sized for easy tapping), while still placing the clarification immediately adjacent
  and impossible to miss, rather than, e.g., a tooltip that requires an extra interaction to
  discover.

### State at end of this step

Both the energy and stress scales now clearly state what each end of the range means, for
sighted and screen-reader users alike. No API or data shape changes — this is purely a
frontend clarity fix.

### Verification

- `npm test` — 19/19 passing.
- `npm run build`, `npm run lint`, `npx prettier --check .` — all clean.
- Real headless-browser screenshot confirming both caption lines render correctly under their
  respective scales.

---

## 2026-08-16 — Widening energy/stress from 1–5 to 1–7, after more user feedback

**Task:** Not a [Tasks.md](Tasks.md) checklist item — follow-up feedback on the previous
entry's fix: could the energy/stress scales offer more resolution than 1–5? This turned into a
short design discussion (captured here for the reasoning, not just the result) before landing
on 1–7 specifically, rather than the originally-suggested 1–10.

### Background / concepts

#### Why not just jump straight to 1–10, and why not a slider

- **A slider was considered and rejected.** For a self-report health scale used on a phone,
  a slider (`<input type="range">`) is generally a *worse* accessibility choice than discrete
  buttons, not a better one: it's hard to land on an exact value with a fingertip (there's no
  natural "snap" to a specific number the way a button has a fixed, unambiguous hit target),
  and it's less immediately clear to a screen-reader user what's currently selected compared to
  a labeled button with `aria-checked`. The large, discrete-button pattern already in place
  (matching `requirements.md`'s own call for "large, easy-to-select visual controls") stayed.
- **1–10 was considered and also rejected, in favor of 1–7.** Two independent reasons pointed
  the same direction:
  - **Layout:** doubling the current 5 buttons to 10 would either force them below a
    comfortable tap-target size or wrap onto a second row on a narrow phone screen — working
    directly against the "large, easy-to-select" goal the extra resolution was meant to serve.
    7 buttons, by contrast, fit the same single-row layout at the same comfortable size
    (confirmed directly — see *Verification*).
  - **A genuine midpoint.** This was the deciding factor, discussed directly before making the
    change: an *odd*-sized scale has a true center value representing "neither low nor high" —
    1–5's center is 3, 1–7's is 4. An *even*-sized scale (1–6, or 1–10 for that matter, doesn't
    center cleanly either — its "middle" falls between two values, 5 and 6, with neither one
    truly representing "neutral") doesn't offer that, which would arguably make the scale
    *harder* to use meaningfully, not easier, despite offering more raw options. 1–7 was chosen
    specifically because it keeps a clean midpoint while still resolving the original "not
    enough resolution" feedback — a well-established scale size for exactly this kind of
    subjective self-rating (7-point Likert-style scales are a standard, validated choice in
    survey design for this reason).
- **Mood itself stays at 1–5, unchanged.** The feedback and this whole discussion was
  specifically about energy/stress, which only ever had bare numbers. Mood already pairs each
  option with an emoji and a word (`😞` "Bad" through `😄` "Great"), so it doesn't have the
  ambiguity problem the previous entry's fix and this widening are both addressing.

### What was done

1. **Backend (`moodLogs.ts`).** Split the single shared `ratingField` Zod schema into
   `moodField` (unchanged, 1–5) and a new `energyStressField` (1–7), applied to `energy` and
   `stress` only.
2. **Tests.** Updated the existing out-of-range test to also cover the new upper bound (`energy:
   8` now correctly rejected, `energy: 0` still correctly rejected); added a case confirming
   `energy: 7`/`stress: 6` are accepted — values that would have been rejected under the old
   1–5 range.
3. **Frontend (`MoodEntryForm.tsx`).** Renamed and widened the shared rating-values array
   (`RATING_VALUES` → `ENERGY_STRESS_VALUES`, now `[1..7]`); the caption text ("`1 = No energy ·
   7 = Maximum energy`") now reads its upper bound directly from that array instead of a
   hard-coded `5`, so the two can never silently drift apart again.
4. **Tests.** Updated the caption-text assertions to expect `7` instead of `5`; added a test
   confirming all seven options render in order and that the new midpoint (4) is genuinely
   selectable (asserting `aria-checked` toggles on click).
5. **Docs.** Updated both `requirements.md` (§6.2: "Energy level from 1–7," "Stress level from
   1–7") and the two relevant `Tasks.md` checklist items' wording, so both stay accurate to the
   app's real, current behavior rather than describing the original 1–5 design after it changed.
6. **Full verification, both projects:** backend — `npm run build`, `npm test` (34/34, 1 new),
   `npx eslint .`, `npx prettier --check .`, all clean. Frontend — `npm test` (20/20, 2 new),
   `npm run build`, `npm run lint` (`oxlint`, same one pre-existing unrelated warning as
   before), `npx prettier --check .`, all clean.
7. **Real browser check at a deliberately narrow mobile width (375px, iPhone SE-class — the
   narrowest common target)**, specifically to confirm the layout concern from the earlier
   design discussion: all 7 energy buttons render in a single row, comfortably sized, with no
   wrapping or crowding — confirming the prediction rather than just assuming it.

### Why it's needed

Directly addresses real, follow-up user feedback — the previous entry's fix (labeling what 1
and 5 meant) made the existing scale *clearer*, but the actual complaint underneath it was that
5 points didn't feel expressive enough. This closes that loop with a scale that's both more
expressive and, thanks to the genuine midpoint, arguably easier to reason about than the
naively-larger 1–10 alternative would have been.

### Decisions

- **1–7, not 1–10 or 1–6.** Covered in detail above — the midpoint argument and the mobile
  layout constraint both independently pointed at the same answer.
- **Buttons, not a slider.** Covered above — sliders are a real accessibility downgrade for
  this kind of precise, discrete self-rating, not an upgrade.
- **Mood left untouched at 1–5.** The reported problem was specific to the unlabeled,
  ambiguous number rows; mood's emoji+word buttons were never part of the complaint.

### State at end of this step

Energy and stress now accept 1–7 end to end — validated server-side, offered client-side, with
matching tests on both sides and documentation updated to match. Mood is unchanged at 1–5.

### Verification

- Backend: `npm run build`, `npm test` (34/34), `npx eslint .`, `npx prettier --check .` — all
  clean.
- Frontend: `npm test` (20/20), `npm run build`, `npm run lint`, `npx prettier --check .` — all
  clean.
- Real headless-browser screenshot at a 375px mobile viewport width, confirming all 7 buttons
  fit in a single row without wrapping or crowding.

---

## 2026-08-16 — Migrating historical energy/stress values onto the new 1–7 scale

**Task:** Not a [Tasks.md](Tasks.md) checklist item — a direct follow-up question on the
previous entry: existing users had already recorded energy/stress values under the old 1–5
scale — should those be updated to fit the new 1–7 scale, or left as originally entered?

### Background / concepts

#### The decision: rescale, not leave as-is

- Both options were laid out plainly before doing either: leave old values untouched (honest,
  but an old "5" — which meant *maximum* at the time — now silently reads as "5 of 7," no
  longer the maximum, with nothing to indicate it was recorded under a different scale); or
  proportionally rescale old values into the new range, preserving *relative* position even
  though the exact numbers change. The choice made was to rescale — prioritizing that a
  historical "maximum energy" entry should still *read* as maximum energy today, over
  preserving the literal original digit.

#### A real bug in this migration's own safety claim — caught by actually testing it twice

- The rescale mapping is: `1→1, 2→3, 3→4, 4→6, 5→7` (endpoints and the midpoint land exactly;
  2 and 4 need rounding, since 1–5 and 1–7 don't divide evenly, and both round up per standard
  round-half-away-from-zero).
- **The first version of this migration's own comment claimed it was safe to run more than
  once.** That claim was checked directly, not just assumed — the already-applied migration's
  `UPDATE` was run a *second* time by hand against the freshly-migrated test data, and it
  produced *wrong* results: a row already correctly migrated to `3` shifted to `4`; a row
  already at `4` shifted to `6`. The reason: `3` and `4` are simultaneously valid *outputs* of
  this mapping *and* valid *inputs* to it (they're still `<=5`), so a second pass reinterprets
  an already-migrated value as if it were still on the old scale and shifts it again.
- **This is exactly why "add a migration" tasks in this project are always followed by
  actually running them against real inserted data and checking the result directly** (the
  same discipline used for every schema migration so far in this log) rather than trusting a
  migration file's SQL to be correct by inspection alone. The comment was corrected to state
  plainly that this migration is *not* idempotent, and that what actually prevents it from
  running twice in practice is Prisma's own migration-tracking table
  (`_prisma_migrations`), which records a migration as applied and never re-runs it under
  normal `prisma migrate deploy`/`migrate dev` use — not any property of the SQL itself.

#### Why this is a genuinely separate migration file, not a change to the earlier `MoodLog` one

- Prisma migrations are meant to be an append-only, chronological history of exactly what
  happened to the database and in what order — editing an already-applied migration file
  (the original `add_mood_log` one) after the fact would rewrite history that's already been
  applied in some environments (this local database, at least) and not in others, which is
  precisely the kind of drift Prisma's migration system exists to prevent. A new, dedicated
  migration — created with `npx prisma migrate dev --create-only` (which sets up the migration
  folder and timestamp without trying to auto-generate SQL from a schema diff, since this
  change touches data, not the schema) — is the correct, standard way to make a data change
  like this.

### What was done

1. **`backend/prisma/migrations/20260816095258_rescale_energy_stress_to_1_7/migration.sql`
   (new).** Two `UPDATE` statements (one for `energy`, one for `stress`), each a `CASE`
   expression implementing the `1→1, 2→3, 3→4, 4→6, 5→7` mapping, `WHERE energy/stress IS NOT
   NULL` (so rows that never recorded a value stay untouched rather than getting a fabricated
   one).
2. **`frontend/src/pages/DashboardPage.tsx`.** Fixed a real, separate bug this whole change
   surfaced: the recent-entries list hard-coded `/5` after both the energy and stress values —
   correct under the old scale, silently wrong now (a freshly-logged `7` would have displayed
   as "Energy 7/5"). Changed to `/7` for both.
3. **Manual verification against real inserted data, not just reading the SQL.** Inserted six
   test rows directly into the local database covering every old-scale value (`1` through `5`)
   plus a `NULL` case, applied the migration (`prisma migrate dev`), and queried the result —
   confirmed the exact expected mapping (`1,3,4,6,7,NULL`). Then re-ran the same `UPDATE` a
   second time by hand specifically to check for the non-idempotency problem described above —
   which is how it was actually caught, not guessed at. Cleaned up all test rows and the test
   user afterward.
4. **`npm run build`, `npm test` (34/34, unchanged), `npx eslint .`, `npx prettier --check .`**
   — all clean (this migration doesn't change any application code, only historical data).

### Why it's needed

Without this, every energy/stress value a real user had already recorded before this change
would have a meaning that quietly shifted underneath them — the exact "5 no longer means
maximum" problem described above — for a health-tracking app where an honest, comparable
history over time is the entire point.

### Decisions

- **Rescale rather than leave as-is** — covered above; chosen so a historical "maximum" entry
  still reads as maximum today, which matters more here than preserving the literal old digit.
- **A new migration file, not editing the old one** — standard Prisma practice, and the only
  way to make a data-only change without rewriting already-applied history.
- **Documented the non-idempotency explicitly in the migration's own comment**, once the
  double-run test revealed the first draft's claim was wrong, rather than leaving a
  confidently-stated but incorrect safety claim for a future reader to trust.

### State at end of this step

Once this migration reaches production (via the same automatic `prisma migrate deploy` step
already covered in an earlier deployment entry), every pre-existing `mood_logs` row's
`energy`/`stress` values will be rescaled exactly once, automatically, at deploy time — with no
window where old and new data coexist under different scales, since the dashboard fix and this
migration are both part of the same not-yet-merged PR.

### Verification

- Inserted real test data covering every old-scale value directly into the local database,
  applied the migration, and confirmed the exact expected output by querying it back.
- Explicitly tested running the migration's logic a second time to check for (and find, and
  document) a non-idempotency issue — not just assumed safe.
- `npm run build`, `npm test` (34/34), `npx eslint .`, `npx prettier --check .` — all clean.
- All test data and the test user cleaned up afterward.

---

## 2026-08-16 — A harmless-but-alarming Vercel "Build Failed": the screenshot CI branch has no app in it

**Task:** Not a [Tasks.md](Tasks.md) checklist item — a red "Build Failed" showed up in
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

## 2026-08-16 — Reconciling Tasks.md/requirements.md with reality, and adding "change password"

**Task:** Not a single [Tasks.md](Tasks.md) checklist item — a two-part request: (1) audit
`Tasks.md` against what's actually been built and check off anything genuinely done but not
yet marked, and (2) add a "change password" capability (distinct from the existing, unbuilt
"forgot password" email-reset flow) as new tracked tasks, since the app now has two real users.

### Background / concepts

#### "Change password" vs. "forgot password" — two genuinely different features

- **Forgot password** (already in `Tasks.md`, still unbuilt): for someone who's *logged out*
  and doesn't remember their password — requests a reset link by email, clicks it, sets a new
  password without ever proving they knew the old one. This is why it fundamentally needs a
  real transactional email service in production; there's no other way to prove "this really is
  the account owner" for someone who isn't authenticated.
- **Change password** (new): for someone who's *already logged in* and simply wants to update
  their password — provides their *current* password (proving they're genuinely the account
  owner via something they already know, not an email link) plus a new one. This needs zero
  email infrastructure, which is exactly why it was chosen as the practical next step over
  building out forgot-password first.
- Both are real, distinct requirements — `requirements.md` §5.1 previously only listed the
  forgot/reset flow; added "Change their password while logged in, by providing their current
  password and a new one" as its own bullet, and `Tasks.md` gained matching backend
  (`POST /api/auth/change-password`) and frontend (Settings page form) checklist items.

#### The audit: three items were genuinely done but still showed as unchecked

- **`.env.example` files + `.env` in `.gitignore`** (Phase 0) — both example files exist
  (confirmed directly, not assumed) and the root `.gitignore` already covers `.env`. Checked
  off.
- **CORS configuration restricting allowed origins** (Phase 2) — this was built and verified
  live in production during the deployment work (`cors({ origin: FRONTEND_URL, credentials:
  true })`, extensively covered in the earlier FRONTEND_URL/CORS entries) but the checklist
  item was never marked, since that work happened organically during deployment rather than as
  its own dedicated Tasks.md-tracked task. Checked off, with a pointer back to those entries.
- **No plain-text password/health data in logs** (Phase 2) — audited directly rather than
  assumed: `grep -rn "console\." backend/src` turns up exactly one line, in `index.ts`, logging
  only the port number. Register/login responses already have dedicated tests confirming
  `passwordHash` is never present in a response body. Checked off.
- **Root `README.md`** (Phase 0) — a README did exist, but its "Running locally" section still
  had Phase-0-era placeholder wording ("Scaffolding... is added in later setup tasks... Once in
  place, local setup will be:") — technically present, but describing a *future* state rather
  than the app as it actually exists now. Rewritten with the real, current steps (`docker
  compose up -d`, the actual `.env.example` contents, `npx prisma migrate dev`, live URLs) and
  checked off only once accurate — not before.
- **Left alone, deliberately:** Phase 11 (Security Hardening) and Phase 13 (Testing) items,
  even where individual pieces are already true today (e.g., refresh tokens already are
  `HttpOnly`/`Secure`/`SameSite`). Both phases are written as a holistic, one-time audit sweep
  across everything at once, not a checklist to tick opportunistically as individual pieces
  happen to already be true — checking one off in isolation now would misrepresent that the
  full, deliberate review those phases describe has actually happened.

#### A real, self-inflicted Prisma migration checksum mismatch, found while double-checking the README

- While verifying the rewritten README's setup instructions actually work (rather than just
  reading them and assuming), running `npx prisma migrate dev` locally produced: *"The
  migration `20260816095258_rescale_energy_stress_to_1_7` was modified after it was applied. We
  need to reset the 'public' schema... All data will be lost."*
- **What actually happened:** earlier today, that migration was applied locally, *then* its
  comment text was edited afterward (to correct the non-idempotency claim, per that entry).
  Prisma records a checksum — a short fingerprint computed from a migration file's exact
  contents — for every migration it applies, specifically so it can detect precisely this: a
  file that's been edited *after* being run, which could otherwise mean the database and the
  migration history have silently diverged from what the files claim happened.
- **Why this is local-only noise, not a real problem for anyone else.** Only *this* development
  machine ever ran the migration before the comment was corrected. A fresh clone (or Railway's
  production database) only ever sees the already-corrected file and applies it once — its
  recorded checksum matches its content from the very first run, no drift possible. This is a
  problem entirely of editing an already-applied file’s comment on one specific machine, not a
  reflection of anything wrong with the migration itself or the data it already correctly
  produced.
- **Why a full reset (Prisma's own suggested fix) was the wrong call here.** `prisma migrate
  reset` drops and rebuilds the entire local database from scratch — the sledgehammer response
  to "the checksum doesn't match," appropriate when there's genuine doubt about what state the
  database is actually in. Here, there was no such doubt: the migration's SQL logic hadn't
  changed at all, only a comment describing it had — so resetting would have been real,
  unnecessary work (and data loss) to fix a problem that was purely bookkeeping.
- **The actual fix: directly correct the stored checksum to match the file's real, current
  content**, rather than pretending nothing changed or nuking the database. Computed the file's
  true SHA-256 checksum (the same algorithm Prisma itself uses) with Node's built-in `crypto`
  module, then updated that one row in Prisma's own `_prisma_migrations` bookkeeping table
  directly via `psql` — `prisma migrate resolve --applied` (the first thing tried) turned out to
  be the wrong tool for this specific situation, since it's meant for migrations *not yet*
  recorded as applied, not for re-syncing the checksum of one that already is. Confirmed fixed
  immediately afterward: `prisma migrate dev` reported "Already in sync," and `prisma migrate
  status` reported "Database schema is up to date."
- **The general lesson:** editing an already-applied migration file's *comment* feels harmless
  — the actual SQL is untouched — but Prisma's checksum tracking doesn't distinguish "the SQL
  changed" from "a comment changed"; it hashes the whole file. Once a migration has been applied
  anywhere, treat the file as frozen, even down to the comments — exactly the same principle
  the earlier "why deleting a merged branch is safe" entry describes for git commits, just
  applied to a different kind of already-committed history.

### What was done

1. **`Documents/requirements.md`.** Added "Change their password while logged in, by providing
   their current password and a new one" to §5.1's capability list.
2. **`Tasks.md`.** Added `POST /api/auth/change-password` (Phase 2) and a matching Settings-page
   form item (Phase 6). Checked off four items confirmed genuinely complete: both Phase 0
   environment/README items, and two Phase 2 items (CORS, no-sensitive-logging) — each verified
   directly rather than assumed, as detailed above.
3. **`README.md`.** Rewrote the stale "Running locally" section to match the app's real, current
   setup (`docker compose up -d`, actual `.env.example` contents, the `npx prisma migrate dev`
   step `npm run dev` doesn't do automatically, live deployment URLs) — verified by actually
   running the documented steps, not just reading them.
4. **Fixed a real local Prisma migration-checksum mismatch**, discovered specifically because
   the README's instructions were being tested for real rather than trusted on sight — detailed
   above.
5. **`npm run build`, `npm test` (34/34)** — confirmed clean after the checksum fix, same as
   before it (no application code changed in this task, only docs and one bookkeeping row).

### Why it's needed

Two different problems, both about a project staying trustworthy as it grows: stale checklists
and a stale README quietly erode confidence in whether *any* of the tracking documents reflect
reality, and an un-diagnosed migration checksum error would have blocked all future local
development on this machine the next time a migration was touched.

### Decisions

- **Change password before forgot password**, and both added as separate, honestly-scoped
  tasks rather than one combined "password reset" item — covered in detail above.
- **Only checked off Tasks.md items with direct, individual confirmation** — not the two
  holistic audit phases (11, 13), even where some of their content happens to already be true.
- **Fixed the checksum via a direct, targeted correction, not a full database reset** — the
  problem was bookkeeping, not data integrity, so the fix matched that scope exactly.

### State at end of this step

`Tasks.md` and `requirements.md` now accurately reflect both what's built and what's newly
planned. The README's setup instructions were verified to actually work, not just assumed
correct. The local Prisma migration history is back in sync with the actual migration files.

### Verification

- Directly audited (not assumed) every item checked off: `.env.example` file existence,
  `.gitignore` contents, the live CORS configuration, a full `console.*` grep of the backend.
- Actually ran the rewritten README's setup steps against this real local environment —
  `docker compose version`, `npx prisma migrate dev`, `npm run dev` — rather than only reading
  them for plausibility.
- `npx prisma migrate dev` → "Already in sync"; `npx prisma migrate status` → "Database schema
  is up to date" — confirmed the checksum fix directly, not assumed from the `UPDATE` succeeding.
- `npm run build`, `npm test` (34/34) — unchanged, confirming no application behavior shifted.

---

## 2026-08-16 — Phase 2: `POST /api/auth/change-password`

**Task:** [Tasks.md](Tasks.md) → Phase 2 → "Implement `POST /api/auth/change-password` — for a
logged-in user; requires the current password to be re-verified before updating the hash."

**Delivered via branch:** `feature/2.5-auth-change-password`. First half of the change-password
vertical slice added to `Tasks.md` in the previous entry — this is the backend piece; the
Settings-page form is next.

### Background / concepts

#### Why this route needs `requireAuth`, and why it re-checks the password anyway

- This is the first route in `auth.ts` itself to use `requireAuth` — every route in this file
  before now (register, login, refresh, logout) is deliberately reachable *without* being
  logged in, since their whole job is establishing or ending a session. Change-password is
  different: it only makes sense for someone who already has a session, so it's mounted behind
  `requireAuth` like the mood-logs routes are.
- **Being logged in isn't the same as proving you should be allowed to change the password,
  though** — an access token only proves "a request came from whoever holds this token," which
  could be a browser someone left signed in, or a stolen (but not yet expired) token. Requiring
  the *current* password as well as a valid session is a second, independent factor — someone
  with just the access token, but not the actual password, still can't take over the account by
  changing its password out from under the real owner.

#### Clearing the refresh cookie on success — the one thing that actually can be revoked here

- The refresh-token entry (Phase 2.3) already covers why this app's JWTs can't be individually
  revoked server-side: they're stateless, verified by signature alone, with no database record
  of which ones are "still good." That means changing a password can't retroactively invalidate
  some other device's already-issued access token, or force that device to know a change even
  happened — a genuine, previously-documented limitation, not new here.
- **What *can* be done: clear the refresh cookie on the browser making the change**, the exact
  same mechanism `logout` already uses. This doesn't revoke anything happening elsewhere, but it
  does mean *this* browser session ends the moment the password changes, forcing a fresh login
  with the new password — a reasonable, standard expectation after a password change, achieved
  with a function this route already had available rather than any new mechanism.

#### Reusing `passwordField` instead of duplicating the strength rules

- `registerSchema`'s password validation (min 8 characters, at least one letter, at least one
  number) got pulled out into a standalone `passwordField` Zod schema, referenced by both
  `registerSchema` and the new `changePasswordSchema`. Without this, a future change to password
  strength rules would need updating in two places by memory, with real risk of only one
  actually getting updated — the same "single source of truth" reasoning already applied
  elsewhere in this codebase (e.g. `ENERGY_STRESS_VALUES` driving both the button count and the
  caption text in `MoodEntryForm.tsx`).

### What was done

1. **`backend/src/routes/auth.ts`.** Extracted `passwordField`; added `changePasswordSchema`
   (`currentPassword`, `newPassword`); added `POST /change-password` behind `requireAuth` —
   verifies `currentPassword` against the stored hash (`401 INVALID_CURRENT_PASSWORD` if it
   doesn't match, reusing the same constant-time-comparison-via-dummy-hash trick already used by
   login for the "no such user" case, here covering the theoretical case of the token's user
   having been deleted mid-session), hashes and stores `newPassword` on success, clears the
   refresh cookie, returns `200 { message: "Password updated" }`.
2. **Tests.** No access token → `401 MISSING_ACCESS_TOKEN`; wrong current password → `401
   INVALID_CURRENT_PASSWORD`; a new password failing the strength rules → `400
   VALIDATION_ERROR`; full success path — asserts the refresh cookie is cleared in the response,
   that a subsequent login with the *old* password now fails, that a login with the *new*
   password succeeds, and that the stored hash is neither the plaintext new password nor
   unchanged (a real bcrypt hash).
3. **`npm test`** — 38/38 passing (34 pre-existing, 4 new).
4. **`npm run build`, `npx eslint .`, `npx prettier --check .`** — all clean.
5. **Manual end-to-end verification against the compiled, running server**, via `curl`:
   registered a real user, confirmed no-token and wrong-current-password rejections, performed a
   real password change (inspecting the raw response headers to confirm the refresh cookie
   clear), then confirmed directly that logging in with the old password now fails and the new
   password succeeds. Cleaned up the manually-created test user afterward and stopped the
   manually-started server.

### Why it's needed

The app now has real users outside of testing, and until this task, there was no way to change
a password without going through the (still unbuilt) email-based forgot-password flow — meaning
a user who simply wanted to update their password for routine security hygiene had no way to do
so at all.

### Decisions

- **Clearing the refresh cookie rather than leaving the session active.** Covered above — the
  one meaningful "revoke" available given this app's stateless-JWT design, and matches the
  reasonable expectation that changing a password should require logging back in.
- **Reused `passwordField` rather than duplicating the strength regex.** Covered above.

### State at end of this step

A real, working, tested, auth-protected `POST /api/auth/change-password` endpoint exists.
Nothing on the frontend calls it yet — the Settings-page form is the next task, which is what
actually makes this reachable by a real user rather than only `curl`.

### Verification

- `npm test` — 38/38 passing (34 pre-existing, 4 new).
- `npm run build`, `npx eslint .`, `npx prettier --check .` — all clean.
- Manual `curl` round-trip against the compiled, running server, covering every case: missing
  token, wrong current password, weak new password, and a full successful change followed by
  confirming the old password no longer works and the new one does.

---

## 2026-08-16 — Phase 6: Settings page with change-password form (and a real race-condition bug)

**Task:** [Tasks.md](Tasks.md) → Phase 6 → "Change password form on Settings page: current
password + new password fields, calls `POST /api/auth/change-password`, with clear
success/error feedback."

**Delivered via branch:** `feature/6.4-settings-change-password` (stacked on
`feature/2.5-auth-change-password`, since it calls that task's endpoint). This is where
change-password becomes something a real person can actually use — the Settings route existed
only as a `PlaceholderPage` until now.

### Background / concepts

#### Scoped deliberately: this is *a* Settings page, not *the* Settings page

- Phase 6 has its own, separate, larger "Settings page: view/edit display name and timezone;
  account deletion flow" item, not yet built. `SettingsPage.tsx` today contains *only* the
  change-password form — matching just what this specific task asked for, not pre-building
  pieces of that later task. Display name/timezone editing and account deletion will be added
  to this same page/file when their own tasks come up, not invented ahead of time here.

#### A real, found-by-actually-testing-it race condition between two different redirects to `/login`

- The form's success handler needs to do three things: tell the backend to change the password
  (done), end the local session, and land the user on `/login` with a helpful message. The
  *first* version of this wrote that as `await logout(); navigate("/login", { state: {
  message } })` — log out, then redirect. That reads perfectly reasonably and passed every
  automated test. **It was still wrong**, caught only by actually driving a real browser through
  the full flow and checking what happened after re-logging in.
- **What actually happened:** `logout()` clears the app's auth state (`user: null, accessToken:
  null`). `SettingsPage` lives behind `RequireAuth` (the route guard covered in detail in the
  next entry) — the instant that state change is processed, `RequireAuth` notices
  `isAuthenticated` just became `false` *while `/settings` is still the current route* and
  fires its **own** redirect to `/login`, carrying `state: { from: location }` (so a normal
  "you got logged out, here's where to come back to" flow works). That redirect and this
  form's own `navigate("/login", { state: { message } })` call are now racing to decide what
  `/login`'s `location.state` actually ends up being — and `RequireAuth`'s won, discarding the
  success message and, worse, meaning a *subsequent* login redirected back to `/settings`
  (reading `state.from.pathname`) instead of the expected `/dashboard`.
- **Why the automated test suite didn't catch this.** The Vitest/Testing-Library test for this
  flow mocks `fetch` directly and asserts on the *final* rendered state — it never actually
  exercises React's real scheduling/timing between two competing `setState`-triggered
  re-renders the way a real browser genuinely does. This is exactly the kind of bug real
  end-to-end browser testing exists to catch that a mocked unit test structurally cannot —
  not a weakness in the tests that were written, just a category of bug outside what that
  layer of testing can see.
- **The fix:** reorder to `navigate("/login", { state: { message } })` *first*, then `await
  logout()`. Once the route has already changed to `/login` — a route `RequireAuth` doesn't
  guard at all — the subsequent auth-state change has nothing left to react to. No more race,
  because there's no longer a moment where the guarded route is still current *and* the auth
  state has already flipped.

#### A second false alarm, and the actual lesson in it

- While verifying the fix, a screenshot taken immediately after `page.waitForURL("**/settings")`
  resolved still showed the *old* Dashboard content. This looked like another real bug — until
  checking the page's actual text content directly (rather than a screenshot) a moment later
  showed the correct Settings content was there all along. `waitForURL` resolves the instant the
  browser's URL changes, which can be a beat before React actually finishes re-rendering and the
  browser repaints — a screenshot taken in that exact window can catch a stale frame. The fix
  was to the *test script* (wait for a real, specific piece of the new page's content to appear
  before screenshotting), not the application. Worth recording precisely because it looked
  identical to a real bug at first glance, and the only way to tell the difference was checking
  the DOM's actual text directly rather than trusting a single screenshot's timing.

#### A genuine gap found along the way, tracked rather than silently noticed and dropped

- While debugging the above, testing a **hard** page reload (not client-side navigation) at
  `/settings` showed neither the Settings nor the Dashboard content — because this app's
  `AuthContext` never attempts to rehydrate a session on startup. The access token lives only
  in memory (`useState`, no `localStorage`), which is the deliberate, correct choice for
  *storing* it (covered in the Phase 2.3 refresh-token entry — keeping it out of anything
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
   condition affected: register → open Settings → change password → land on Login *with the
   confirmation message actually visible* → log in with the **new** password → land on
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

## 2026-08-16 — The full authentication pattern, explained end to end

**Task:** Not a [Tasks.md](Tasks.md) checklist item — this app's auth system has been built
piece by piece across many earlier entries (register, login, refresh tokens, the backend
`requireAuth` middleware, the frontend `RequireAuth` guard, the API client's automatic
refresh-on-401). Each entry explained its own piece well, but none of them lay out the *whole
shape* in one place. This entry does that deliberately, as a standalone reference — the goal is
that this specific pattern (not just this specific app) is something a beginner could recognize
and re-implement in a completely different project later.

### The core problem this whole pattern solves

HTTP is **stateless** — every request is a brand new, disconnected event as far as the raw
protocol is concerned. The server that handles `POST /api/mood-logs` has no built-in memory of
who's making that request; unless something is done deliberately, there's no way to distinguish
"a real logged-in user" from "a stranger with the URL." Everything in this section exists to
answer one question on every single request: **who is this, and are they allowed to do this?**

### The two tokens, and why there are two instead of one

- **The access token** is a short-lived (15 minutes), signed proof of identity. "Signed" means
  it's cryptographically tamper-evident — the server can verify it hasn't been altered, without
  needing to look anything up in a database. It's deliberately handled by the frontend's own
  JavaScript (attached to requests, held in memory), because it's short-lived enough that even
  if it leaked, the damage window is small.
- **The refresh token** is longer-lived (7 days) and exists for exactly one purpose: trading
  itself in for a new access token, so the user isn't forced to re-enter their password every
  15 minutes. It's deliberately kept *out* of JavaScript's reach entirely — delivered only as an
  `HttpOnly` cookie, which the browser attaches automatically but which `document.cookie` (and
  therefore any malicious script that ends up running on the page) simply cannot read.
- **The general principle this demonstrates:** the token that's riskier to leak (longer-lived,
  more powerful) is the one given the stronger protection (invisible to JavaScript), even though
  that makes it slightly less convenient to work with. The token that's cheaper to leak (short
  lifespan) is the one handed to the more flexible but less protected mechanism. This trade-off
  — matching the *protection* to the *risk*, not applying the same protection uniformly
  everywhere — is a pattern worth recognizing in other security decisions generally, not just
  this one.

### Server-side protection: `requireAuth`, and what "middleware" buys here

- Express (like most server frameworks) lets a request pass through a chain of functions before
  reaching the code that actually handles it. `requireAuth` is one link in that chain: it reads
  the `Authorization: Bearer <token>` header, verifies the token's signature, and either attaches
  `req.userId` and lets the request continue (`next()`), or responds `401` itself and stops the
  chain right there — the actual route handler never even runs for a rejected request.
- **Why a shared middleware instead of checking this inside every route handler:** every
  protected route needs the exact same check. Writing it once and attaching it wherever it's
  needed means there's exactly one place that logic can have a bug, instead of a dozen
  near-identical copies silently drifting apart over time. This is the same reasoning behind
  reusable functions in general, just applied specifically to "a check every protected endpoint
  needs."
- **The generic version of this pattern, for a different project:** any server framework will
  have some equivalent concept (middleware, a decorator, a guard, an interceptor — the name
  varies) for "run this check before the real handler, and let it short-circuit the request."
  Whatever it's called in a given framework, the shape is the same: verify identity once, in one
  place, before any route-specific logic runs.

### Client-side protection: `RequireAuth`, and the trick that makes it work

```tsx
export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

- This is a **route guard**, the frontend's equivalent of the backend's `requireAuth`
  middleware — but it has to work completely differently, because there's no request/response
  chain on the frontend to hook into. Instead, it's just an ordinary React component, placed as
  a *wrapping* route in `App.tsx`:
  ```tsx
  <Route element={<RequireAuth />}>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    {/* ...every other protected page... */}
  </Route>
  ```
- **`<Outlet />` is the key piece to understand.** It's React Router's placeholder for "render
  whichever nested route actually matched" — when a signed-in user visits `/settings`,
  `RequireAuth` renders, sees `isAuthenticated` is `true`, and renders `<Outlet />`, which React
  Router then fills in with `<SettingsPage />`. When `isAuthenticated` is `false`, `RequireAuth`
  never renders `<Outlet />` at all — it renders `<Navigate>` instead, which redirects before
  the protected page's component is ever mounted. The protected page's own code doesn't need to
  know or check anything about auth itself; simply being nested inside this wrapping route *is*
  the protection.
- **`state={{ from: location }}`** carries "where the user was trying to go" along with the
  redirect, so `LoginPage` can send them back to that exact page after a successful login
  instead of always dumping them on the dashboard regardless of what they actually clicked.
- **This is also exactly the mechanism that caused the real race-condition bug in the previous
  entry**, worth restating here as a caution: because `RequireAuth` re-evaluates on *every*
  render, the instant `isAuthenticated` becomes `false` while a guarded route is still current,
  it fires its own redirect — regardless of whether some *other* code is also trying to
  navigate away at that same moment. Any code that logs a user out should navigate to an
  unguarded route *first*, then clear auth state, to avoid competing with `RequireAuth`'s own
  redirect over what `/login` ends up showing.

### A full walkthrough: one user, from cold page load to logging out

Tying every piece together as a single continuous story, in order:

1. **Cold load, not yet logged in.** `AuthProvider` initializes `{ user: null, accessToken:
   null }`. Visiting `/dashboard` — a guarded route — `RequireAuth` sees `isAuthenticated:
   false` and redirects to `/login`, remembering `/dashboard` as `state.from`.
2. **Logging in.** `LoginPage` calls `POST /api/auth/login`. The server verifies the password,
   and responds with a fresh access token in the JSON body *and* sets the refresh token as an
   `HttpOnly` cookie via `Set-Cookie` — the browser stores that cookie automatically; nothing in
   the frontend's own code ever touches it directly. `AuthContext` stores the access token in
   memory and updates `user`. `LoginPage` reads `state.from` and navigates there — back to
   `/dashboard`, exactly where the user originally tried to go.
3. **Using the app.** Every `apiFetch` call now attaches `Authorization: Bearer <accessToken>`
   automatically. The backend's `requireAuth` verifies it on each request; nothing needs to be
   done differently by any individual page or component.
4. **15 minutes pass; the access token expires.** The next API call gets back a `401`.
   `apiFetch` (not the calling code, not the component) notices this itself, and automatically
   calls `POST /api/auth/refresh` — which reads the still-valid refresh cookie the browser has
   been quietly holding onto, verifies it, and returns a *new* access token (while also rotating
   the refresh cookie to a new value — see the Phase 2.3 entry for why). `apiFetch` retries the
   original request once with the new token. **None of this is visible to the user or to
   whatever page triggered the original request** — it just looks like the request quietly
   succeeded, possibly a beat slower than usual.
5. **7 days pass, or the user explicitly logs out; the refresh token is gone too.** The next
   refresh attempt now fails for real (`401 MISSING_REFRESH_TOKEN` or `INVALID_REFRESH_TOKEN`).
   `apiFetch` reports this via `onAuthFailure` — `AuthContext` is listening for exactly that
   signal, and clears its state (`user: null, accessToken: null`) the moment it fires. On the
   *next* render, `RequireAuth` (wrapping whatever protected page the user still happens to be
   looking at) notices `isAuthenticated` is now `false` and redirects to `/login` — even though
   the user never explicitly clicked anything. This is the same mechanism from step 1, just
   triggered by session expiry instead of a fresh page load.

### The pattern, stripped down to what's worth carrying to a different project

- Two tokens, not one: a short-lived one the frontend actively manages, a long-lived one the
  browser handles automatically and JavaScript never touches.
- One shared server-side check (middleware/guard/interceptor — whatever the framework calls it)
  that every protected endpoint uses, rather than each one checking auth itself.
- One shared client-side wrapper component that every protected page is nested inside, rather
  than each page checking auth itself.
- One central place (the API client) that knows how to retry a request after silently
  refreshing an expired token — so *no other code in the entire app* needs to know or care that
  tokens expire at all.
- One shared "the session just ended" signal that the auth store listens for, so expiry
  discovered *anywhere* (a background request, an explicit logout, a failed refresh) all funnel
  through the exact same "log the user out" code path.

### An honest, current limitation, not glossed over

This app's version of the pattern is missing one normal piece, found while testing the previous
entry's change-password flow and now tracked as its own `Tasks.md` item (Phase 5): **there's no
attempt to silently re-establish a session on a fresh page load using the refresh cookie.**
Right now, a browser refresh always starts from `{ user: null, accessToken: null }` and shows
`Login`, even though the refresh cookie sitting in the browser might still be completely valid.
The fix (not yet built) is a straightforward extension of the exact pattern above: on
`AuthProvider`'s first mount, attempt the same `POST /api/auth/refresh` call step 4 already
performs reactively, proactively instead — and only fall back to showing `Login` if that attempt
itself fails.

---

## 2026-08-16 — Phase 1: `Symptom` and `SymptomLog` models + migration + seed

**Task:** [Tasks.md](Tasks.md) → Phase 1 → "Define `Symptom` model: `id`, `user_id (nullable —
null = system symptom)`, `name`, `description (optional)`, `created_at`." and "Define
`SymptomLog` model: `id`, `user_id`, `symptom_id`, `severity (1–10)`, `notes (optional)`,
`logged_at`." Also closes the Phase 1 item "Seed the database with a small set of
system-default symptoms... where `user_id` is null."

**Delivered via branch:** `feature/1.2-symptom-models` (off `main`; this begins the
symptom-logging vertical slice, the same shape the mood-logging slice already took: model →
CRUD endpoint → frontend form, each its own stacked PR).

### Background / concepts

#### A nullable `user_id` modeling two different kinds of row in one table

- Every other owned resource in this app so far (`MoodLog`, and later `Medication`/`Habit`)
  has a `user_id` that's always set — the row always belongs to exactly one user. `Symptom` is
  the first model where that's deliberately *not* always true: a row can either be a **system
  symptom** (seeded once, `userId` is `null`, visible to every user — e.g. "Headache") or a
  **user's own custom symptom** (`userId` set to whoever created it, e.g. "Joint pain" someone
  adds for themselves). Modeling this as one table with a nullable foreign key, rather than two
  separate tables, matches how the feature actually behaves end to end: both kinds of row are
  fetched together (`GET /api/symptoms` returns system symptoms *plus* the caller's own), used
  identically as the target of a `SymptomLog`, and only distinguished at the point where it
  actually matters (edit/delete must reject anything with `userId !== req.userId`, including the
  `null` case — covered in the next task, not this one).
- `user User? @relation(...)` — the `?` on both the field type and the relation field itself is
  what makes this optional; Prisma requires marking both the scalar column (`userId String?`)
  and the relation field (`user User?`) as nullable together, not just one or the other, for a
  genuinely optional relation.

#### Why `SymptomLog → Symptom` has no `onDelete: Cascade` (unlike every other relation so far)

- Every relation added in this app up to now cascades: delete the parent, its children go too
  (`User → MoodLog`, `User → Symptom`, `User → SymptomLog` here). But `SymptomLog → Symptom` is
  different on purpose. If a user deletes a custom symptom they created, their *historical*
  severity logs against it shouldn't silently vanish too — that's real health-tracking history,
  and losing it as a side effect of an unrelated cleanup action would be surprising and bad.
  Leaving this relation at Prisma's default (`Restrict`, since no `onDelete` was specified at
  all) means Postgres will *reject* deleting a symptom that still has logs pointing at it, rather
  than either cascading (losing history) or leaving orphaned rows (a dangling foreign key).
  Concretely this means: before Phase 3's `DELETE /api/symptoms/:id` can let a symptom with
  existing logs actually be deleted, it'll need its own explicit decision (e.g. reject with a
  clear error, or require deleting/reassigning the logs first) — deliberately left as that later
  task's problem, not solved speculatively here.
- System symptoms (`userId: null`) have no user row to delete in the first place, so they're
  never affected by any user's account deletion — only the `User → Symptom` cascade (for a
  user's *own* custom symptoms) and the `User → SymptomLog` cascade (a user's own logs) fire
  when an account is deleted.

#### The seed script: why `prisma.config.ts`'s `migrations.seed`, not `package.json`'s
`"prisma": { "seed": ... }`

- The classic Prisma seeding convention (still what most tutorials show) is a `"prisma": {
  "seed": "ts-node prisma/seed.ts" }` block in `package.json`. This project already moved off
  `package.json`-based Prisma configuration entirely when it adopted `prisma.config.ts` (visible
  in that file's own `migrations.path` — the migrations folder location is configured there, not
  in `package.json`, either). Prisma 7's own config package (`@prisma/config`) defines the
  equivalent modern option as `migrations.seed` inside that same file — using it keeps every
  piece of Prisma configuration in the one place this project already centralized it, rather
  than reintroducing a second, legacy configuration surface just for this one feature.
- `prisma/seed.ts` reuses the app's existing `prisma` singleton from `src/lib/prisma.ts` (the
  one already wired up with the Postgres driver adapter, `PrismaPg`) instead of constructing a
  second `PrismaClient`. This project's generated client (Prisma 7, using `@prisma/adapter-pg`)
  requires an adapter to be passed to its constructor — calling `new PrismaClient()` with no
  arguments, which is what most seed-script examples online show, doesn't compile against this
  project's generated types at all. Discovered this directly: the first version of this seed
  script did exactly that and `ts-node` refused to compile it.
- **Idempotency.** The seed script checks `findFirst({ where: { userId: null, name } })` before
  creating each system symptom, and skips ones that already exist, rather than assuming a clean
  database. `name` has no uniqueness constraint at the schema level (a user is free to name their
  own custom symptom "Headache" too, and that's a different, legitimate row) — so this check is
  deliberately scoped to `userId: null` specifically, meaning "does this *system* symptom already
  exist," not "does any symptom with this name exist." Verified by running the script twice in a
  row: the second run creates nothing and prints nothing, confirmed against `psql` directly.

### What was done

1. **`backend/prisma/schema.prisma`.** Added `Symptom` (`id`, nullable `userId`, `name`,
   optional `description`, `createdAt`) and `SymptomLog` (`id`, `userId`, `symptomId`,
   `severity` as a plain `Int` — the 1–10 range is enforced by Zod in the next task, not the
   database — optional `notes`, `loggedAt` as `@db.Timestamptz(3)`, same reasoning as `MoodLog`'s
   timestamp). Added the reciprocal `symptoms Symptom[]` / `symptomLogs SymptomLog[]` fields on
   `User`. Composite index `[userId, loggedAt]` on `SymptomLog` (same "filter by user, range by
   date" pattern as `MoodLog`); single index on `Symptom.userId` (every `GET /api/symptoms`
   query filters on it, including the `NULL` case for system symptoms).
2. **Migration.** `npx prisma migrate dev --name add_symptom_and_symptom_log` — generated and
   applied `20260816123743_add_symptom_and_symptom_log` against the local (isolated,
   worktree-specific) Postgres database.
3. **`backend/prisma/seed.ts` (new)** and **`backend/prisma.config.ts`** (added
   `migrations.seed: "ts-node prisma/seed.ts"`). Seeds six system-default symptoms (Headache,
   Fatigue, Nausea, Joint pain, Brain fog, Insomnia — a couple more than the three
   `Tasks.md`/`requirements.md` name as examples, since a symptom picker with only three options
   felt thin for a real demo). Also added `"db:seed": "prisma db seed"` to
   `backend/package.json`'s scripts for a discoverable, explicit way to run it outside of
   `migrate dev`/`reset`.
4. **`npm run build`** — compiled cleanly (also regenerates the Prisma Client, adding the
   `prisma.symptom` / `prisma.symptomLog` delegates the next task's routes will use).
5. **`npm test`** — 38/38 passing, unchanged from the previous entry (this task adds no
   application code, only schema + a seed script neither of which any existing test exercises).
6. **`npx eslint .`** and **`npx prettier --check .`** — both clean.
7. **Manual verification directly against Postgres** (not just trusting the migration/seed
   commands' own "success" output): `psql \d symptoms` and `\d symptom_logs`, confirming exact
   column types (`timestamp(3) with time zone` on `logged_at`, `user_id` genuinely nullable on
   `symptoms`), both indexes, the cascading foreign keys from `users`, and the `RESTRICT` (not
   cascade) foreign key from `symptom_logs.symptom_id` to `symptoms.id`; then `SELECT * FROM
   symptoms` confirming all six seeded rows exist with `user_id` genuinely `NULL`.

### Why it's needed

Same reasoning as the `MoodLog` model entry: the symptom-logging endpoint (next task) needs
somewhere to actually store data, with the right constraints already in place, before any API
code is written against it. The seed step specifically is what makes `GET /api/symptoms`
(next task) return something useful the very first time any user calls it, rather than an empty
picker until someone manually creates symptoms.

### Decisions

- **Six system symptoms, not exactly the three `Tasks.md` names as examples.** "Headache,
  Fatigue, Nausea" was explicitly worded as an example (Tasks.md: "e.g. Headache, Fatigue,
  Nausea"), not an exhaustive list — a few more (Joint pain, Brain fog, Insomnia) makes the
  symptom picker in the next frontend task feel like a real feature rather than a three-item
  placeholder, without inventing an exhaustive medical taxonomy this MVP doesn't need.
- **`Restrict`, not `Cascade`, from `SymptomLog` to `Symptom`.** Covered above — the one relation
  in this schema so far that deliberately breaks from the "everything cascades" pattern, because
  losing historical severity logs as a side effect of deleting a symptom definition would be a
  real data-loss bug, not a convenience.
- **`prisma.config.ts`'s `migrations.seed`, not `package.json`'s `"prisma"` block.** Covered
  above — keeps Prisma configuration in the one place this project already centralized it.
- **Reused the existing `prisma` singleton in the seed script**, rather than a second
  `PrismaClient` instance — both because the generated client requires the adapter constructor
  argument to even compile, and because a second client would mean two separate connection pools
  for what's a one-shot script anyway.
- **Stacked this branch on `main` directly, not on another in-progress branch.** Unlike the
  `MoodLog` model (which stacked on the not-yet-merged auth-middleware branch because it needed
  it), this task has no dependency on any other currently in-flight work — `requireAuth` is
  already on `main`.

### State at end of this step

`symptoms` and `symptom_logs` exist in the local (isolated) database with the correct shape,
constraints, and index, and `symptoms` has six real system-default rows in it. No API endpoint
reads or writes either table yet — that's the next task.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 38/38 passing (unchanged).
- `npx eslint .` — clean. `npx prettier --check .` — clean.
- `psql \d symptoms` / `\d symptom_logs` against the real local database — confirmed column
  types (including nullable `user_id` on `symptoms` and `timestamp(3) with time zone` on
  `symptom_logs.logged_at`), both indexes, and both cascading and `RESTRICT` foreign keys
  directly, not inferred from the migration file alone.
- `psql SELECT * FROM symptoms` — confirmed all six seeded system symptoms present with
  `user_id IS NULL`; re-ran the seed script a second time and confirmed (both by its silent
  output and a repeat `SELECT`) it created no duplicates.

---

## 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/symptoms` and `/api/symptom-logs`

**Task:** [Tasks.md](Tasks.md) → Phase 3 → Symptoms → all four bullet points: symptom
CRUD (scoped, with the system-symptom carve-out) and symptom-log CRUD (with the
ID-tampering defense the cross-cutting section calls for).

**Delivered via branch:** `feature/3.1-symptom-endpoints` (stacked on
`feature/1.2-symptom-models`) — the second step of the symptom-logging vertical slice, the
same shape `feature/3.5-mood-logs-endpoint` took for mood.

### Background / concepts

#### Two resources, two route files, because they have genuinely different ownership rules

- `moodLogs.ts` only ever needed one ownership check: "does this row's `userId` match
  `req.userId`?" Symptoms need a second, different check layered on top of that one: a
  `Symptom` can *legitimately* have `userId: null` (a system symptom, readable and usable by
  everyone) but must *never* be editable or deletable by anyone — not even by treating `null`
  as "unowned, anyone may claim it." `routes/symptoms.ts` handles that (`GET` reads with an
  `OR: [{ userId: null }, { userId: req.userId }]` filter; `PATCH`/`DELETE` look the row up
  with a *plain* `userId: req.userId` filter — no `OR`, no `null` branch — so a system symptom
  can never match and always 404s, exactly like another user's private one does).
  `routes/symptomLogs.ts` is a separate concern: logs are always owned outright (never
  system-wide), so its ownership check is the same single-condition shape `moodLogs.ts` already
  uses. Splitting into two files keeps each router's `where` clauses simple and single-purpose
  rather than one file juggling two different ownership shapes.

#### The ID-tampering defense, concretely

- This is Phase 3's cross-cutting requirement, and the reason `symptomLogs.ts` has a
  `symptomIsAccessible(symptomId, userId)` helper that every write path calls before touching
  the database: `POST /` calls it on the `symptomId` in the request body; `PATCH /:id` calls it
  *only* if the update actually includes a new `symptomId` (leaving `symptomId` unchanged
  requires no re-check, since the original create already validated it). The helper itself is
  one query — `findFirst({ where: { id: symptomId, OR: [{ userId: null }, { userId }] } })` —
  the same "is this null (system) or mine" shape `symptoms.ts`'s own `GET` uses, applied here to
  guard writes instead of reads.
- **Why this matters concretely:** without this check, a malicious or buggy client could `POST
  /api/symptom-logs` with `{ symptomId: "<someone else's private symptom UUID>", severity: 8 }`
  and successfully create a log under their own account pointing at data they were never shown
  and don't own — a real information/consistency leak, since anything downstream (the dashboard,
  trends, an eventual "which of my symptoms is worst" view) would then treat that foreign
  symptom's name/description as if it belonged to the caller. The `symptom_logs.symptom_id`
  foreign key (added in the previous task) stops the *database* from accepting a `symptomId`
  that doesn't exist at all, but says nothing about *whose* symptom it is — that's exactly the
  gap `symptomIsAccessible` closes, and it's a genuinely different failure mode from a garden-
  variety Zod validation error, which is why it 404s (`SYMPTOM_NOT_FOUND`) rather than 400s
  (`VALIDATION_ERROR`): the same "don't leak which case it is" reasoning already used for
  mood-log ownership, applied here to "does this ID even refer to something you're allowed to
  use," not just "is this JSON shaped correctly."
- Directly tested (`symptomLogs.test.ts`): one test has user "attacker" `POST` a symptom log
  with user "owner"'s real, private symptom ID and asserts both the `404`/`SYMPTOM_NOT_FOUND`
  response *and* that zero rows were actually created (`prisma.symptomLog.findMany` afterward);
  a second test does the same thing via `PATCH` (attacker tries to retarget their *own* existing
  log onto the owner's private symptom) and confirms the log's `symptomId` is unchanged
  afterward, not just that the response looked right.

#### Why deleting a symptom with existing logs returns `409`, not `500` or a silent success

- The previous task's schema deliberately left `SymptomLog → Symptom` as `Restrict` (no
  cascade), specifically so a symptom's logging history can't vanish as a side effect of
  deleting the symptom definition. That decision has a consequence this task has to actually
  handle: `DELETE /api/symptoms/:id` on a symptom that still has logs pointing at it will make
  Postgres reject the delete with a foreign-key-violation error. Left unhandled, Prisma throws
  that as an uncaught exception and Express's default error handling would turn it into an
  opaque `500` — technically "the delete didn't happen," but with no indication *why*, and no
  clear thing the caller could do about it. Catching
  `Prisma.PrismaClientKnownRequestError` with `code === "P2003"` (Prisma's code for "foreign key
  constraint failed") and translating it into `409 Conflict` with `code: "SYMPTOM_HAS_LOGS"`
  turns a raw database error into an actionable API response — `409` specifically because the
  request is well-formed and the caller is allowed to make it, but it conflicts with the
  resource's current state (logs still exist), which is exactly what `409` means.

### What was done

1. **`backend/src/routes/symptoms.ts` (new).** `GET /` (system + own), `POST /` (create own,
   `name` required, `description` optional), `PATCH /:id` / `DELETE /:id` (ownership-scoped,
   system symptoms and other users' symptoms both 404 identically; `DELETE` catches `P2003` and
   returns `409 SYMPTOM_HAS_LOGS`).
2. **`backend/src/routes/symptomLogs.ts` (new).** `GET /` (own logs, most recent first),
   `POST /` (validates `symptomId`, `severity` 1–10 integer, optional `notes`, optional
   `loggedAt` defaulting to now — same backfill pattern as mood-logs — and runs the
   `symptomIsAccessible` check before creating), `PATCH /:id` / `DELETE /:id` (ownership-scoped
   like mood-logs, plus the same accessibility re-check on `PATCH` if `symptomId` is part of the
   update).
3. **`backend/src/app.ts`.** Mounted both routers behind `requireAuth`:
   `app.use("/api/symptoms", requireAuth, symptomsRouter)` and
   `app.use("/api/symptom-logs", requireAuth, symptomLogsRouter)`.
4. **Tests.** `symptoms.test.ts` (13 tests): no-token rejection; listing system + own but not
   another user's; create with/without description; validation rejection; update; 404 on a
   missing ID; 404 editing/deleting another user's symptom *and*, separately, 404 editing/
   deleting a system symptom (both asserted as the identical response shape); delete; and the
   `409 SYMPTOM_HAS_LOGS` case. `symptomLogs.test.ts` (16 tests): no-token rejection; create
   against an owned symptom and, separately, against a system symptom; **the two ID-tampering
   tests described above**; a nonexistent `symptomId` producing the same `404` as an
   inaccessible one; backfill defaulting/explicit-past-date; severity range/integer validation
   (0, 11, and `5.5` all rejected; 1 and 10 both accepted); list scoping; update; 404s on a
   missing ID and on another user's log; delete.
5. **`npm run build`** — compiled cleanly.
6. **`npm test`** — 62/62 passing (38 pre-existing, 24 new).
7. **`npx eslint .`** — clean. **`npx prettier --check .`** — clean (after running
   `--write` once on the two new test files to match this project's formatting).
8. **Manual end-to-end verification against the compiled, running server** (`npm start`, port
   4101 — this worktree's isolated port), via a throwaway Node script driving `fetch` the same
   way `curl` would: registered two real users (A, B), confirmed `GET /api/symptoms` is `401`
   with no token and returns exactly the 6 seeded system symptoms plus zero custom ones for a
   fresh user; A created a private custom symptom, updated it, then B attempting to `PATCH` it
   got `404`, and A attempting to `PATCH` the system "Headache" symptom *also* got `404` (same
   shape, proving the system-symptom carve-out actually works against a real running server, not
   just in an in-memory test); A logged against both the system symptom and their own private
   one; **B attempting to `POST /api/symptom-logs` against A's private symptom ID got `404`
   `SYMPTOM_NOT_FOUND`** — the ID-tampering defense, confirmed live; A updated and listed their
   logs; deleting A's symptom while a log still referenced it returned `409 SYMPTOM_HAS_LOGS`;
   deleting the log first and then the (now log-free) symptom both succeeded. Cleaned up both
   manually-created test users afterward via `psql` and stopped the manually-started server.

### Why it's needed

This is where the previous task's schema becomes an actual feature a client can call — and,
notably, the first endpoint in this codebase whose central purpose *is* an authorization check
(`symptomIsAccessible`) rather than authorization being a secondary concern layered onto CRUD
that would otherwise be simple. Every other Phase 3 log type (medications, habits) that
references its own "which entity does this log belong to" ID will need the exact same shape of
check.

### Decisions

- **404, not 400, for an inaccessible `symptomId`.** Covered above — kept in the same "don't
  leak which case it is" family as ownership 404s elsewhere, rather than folding it into Zod's
  `VALIDATION_ERROR` shape, since "the JSON is malformed" and "you're not allowed to use this
  ID" are different failure modes worth distinguishing by status/code even though both are
  4xx.
- **`409 SYMPTOM_HAS_LOGS` on deleting a symptom with existing logs**, rather than silently
  cascading (which the previous task's schema decision already ruled out) or leaving it as an
  unhandled `500`. No Tasks.md item calls for this explicitly, but it's a direct, foreseeable
  consequence of the previous task's `Restrict` decision that needed *some* deliberate handling
  rather than an accidental crash the first time a real user hits it.
- **`PATCH` only re-validates `symptomId` accessibility when `symptomId` is actually part of the
  update.** An update that only changes `severity` or `notes` doesn't re-run the check — the log
  was already validated as pointing at an accessible symptom when it was created, and that fact
  can't change without an explicit `symptomId` change in the same request.
- **No route-level rate limiting or pagination added here.** Both are separate, already-tracked
  Tasks.md items (rate limiting is auth-specific in Phase 2; pagination is Phase 9's History
  feature) — out of scope for "build the CRUD endpoint."

### State at end of this step

A real, working, tested, auth-protected CRUD API for symptoms and symptom logs exists locally,
including the ID-tampering defense and the system-symptom carve-out, both verified against a
real running server as well as the automated test suite. Nothing on the frontend calls it yet —
that's the next task.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 62/62 passing (38 pre-existing, 24 new).
- `npx eslint .` — clean. `npx prettier --check .` — clean.
- Manual end-to-end walkthrough against the compiled, running server (script-driven `fetch`
  calls standing in for `curl`): full symptom + symptom-log lifecycle across two real user
  accounts, including the two ID-tampering attempts (both correctly rejected with `404`) and the
  `409` restrict-delete case, each response matching expectations exactly.

---

## 2026-08-16 — Phase 7: Symptom entry form, wired into the Dashboard

**Task:** [Tasks.md](Tasks.md) → Phase 7 → "Symptom entry form: symptom picker, large 1–10
severity control, optional notes, date/time picker (defaults to now), Save/Cancel."

**Delivered via branch:** `feature/7.2-symptom-entry-form` (stacked on
`feature/3.1-symptom-endpoints`). This is the last piece of the symptom-logging vertical
slice — the same closing role `feature/7.3-mood-entry-form` played for mood: everything built
so far (the `Symptom`/`SymptomLog` models, the CRUD endpoints, the ID-tampering defense)
finally becomes something a real person can actually use.

### Background / concepts

#### Why the symptom picker is a `<select>`, not a row of buttons like mood's rating controls

- Mood, energy, and stress each have a small, fixed number of options (5 or 7) — a row of
  large tappable buttons works well and is what the wireframe calls for. Symptoms are
  different: the picker's option list is open-ended (six seeded system symptoms today, plus
  however many a given user has created for themselves) and could grow unbounded over time.
  A native `<select>` handles an arbitrarily long list gracefully (it scrolls, it's
  searchable-by-typing in most browsers, it doesn't need custom overflow handling) in a way a
  row or grid of large buttons doesn't. Severity, in contrast, genuinely is a small fixed set
  (1–10) - exactly the shape mood/energy/stress buttons already suit, so it reuses that same
  `role="radiogroup"`/`role="radio"`/`aria-checked` pattern (in a `grid-cols-5` layout so 10
  options read as two clean rows of 5 rather than one cramped row or an ambiguous wrap).
- **`<optgroup>` for "Your symptoms" vs. "Common symptoms."** The backend's `GET /api/symptoms`
  returns one flat, alphabetically-sorted list mixing system and custom symptoms together
  (right choice for the API — a picker isn't the only thing that will ever read this endpoint).
  The form groups them into two native `<optgroup>`s client-side specifically because the
  distinction actually matters to a user choosing from the list — knowing "this one's mine, I
  can edit/delete it later" vs. "this is a shared default" is useful context a flat list would
  hide. `<optgroup>` also carries its own accessibility semantics for free (exposed to screen
  readers as a labeled group), confirmed directly in this task's own test
  (`screen.getByRole("group", { name: "Your symptoms" })` passes against real jsdom-rendered
  markup, not just visually).

#### Why `symptoms` is a prop, not fetched inside `SymptomEntryForm` itself

- `MoodEntryForm` needs no data to render its options (mood/energy/stress are fixed, hardcoded
  scales) — it only ever *sends* data. `SymptomEntryForm` is the first entry form in this app
  that also needs to *receive* data first (the symptom list) before it can render anything
  useful. Two ways to get it: have the form fetch `GET /api/symptoms` itself on mount, or have
  `DashboardPage` fetch it once and pass it down as a prop. This task chose the latter,
  because `DashboardPage` already needs that exact same list for a second, unrelated reason:
  turning a saved log's `symptomId` back into a readable name in the recent-entries list below
  the form. Fetching it once in the page and threading it down avoids two independent copies of
  the same data that could disagree (e.g. if a symptom were created mid-session in one fetch but
  not reflected in the other), and it also makes the form trivially easier to unit test — tests
  pass a plain in-memory `Symptom[]` array as a prop instead of having to mock a second `fetch`
  call just to get the picker to render any options at all.

#### The two dashboard data-fetching `useEffect`s aren't accidentally duplicated

- `DashboardPage` now has two separate `useEffect(() => { ... }, [])` blocks: one for mood logs
  (pre-existing, unchanged), one new one loading symptoms *and* symptom logs together via
  `Promise.all`. These intentionally stay independent rather than being merged into one giant
  effect — mood and symptoms are unrelated data with no ordering dependency between them, so
  keeping them separate means a slow or failing mood-logs fetch can't block symptoms from
  loading (and vice versa); each section gets its own `loading`/`loadError` state and fails
  independently, which is also why the page now visibly shows two separate "Loading…" states
  that can resolve at different times.

### What was done

1. **`frontend/src/components/SymptomEntryForm.tsx` (new).** A `<select>` symptom picker (two
   `<optgroup>`s: "Your symptoms," "Common symptoms"), a `role="radiogroup"` of ten severity
   buttons (1–10, `grid-cols-5`, required — no deselect, unlike mood's optional energy/stress
   rows), an optional notes textarea, a `datetime-local` field defaulting to "now" (same
   `toDateTimeLocalValue` helper pattern as `MoodEntryForm`), and Save/Cancel. Submits via
   `apiFetch("/api/symptom-logs", { method: "POST", ... })` and calls `onSaved(log)` on success.
   Client-side validation requires both a chosen symptom and a chosen severity before submit,
   with inline errors (`role="alert"`) — mirroring `MoodEntryForm`'s required-field pattern.
2. **`frontend/src/pages/DashboardPage.tsx` (extended).** Added a second data-fetching effect
   (symptoms + symptom logs via `Promise.all`), a `+ Symptom` button revealing the form inline
   (same toggle pattern as `+ Mood`), a `symptomName(symptomId)` lookup helper for rendering
   readable names in the list, and a "Recent symptom entries" section with delete (optimistic
   removal, rolled back on failure) — structurally identical to the existing mood section, not
   a new pattern.
3. **Tests (`SymptomEntryForm.test.tsx`, 6 new).** Requiring both a symptom and a severity
   before submit is possible; the `<optgroup>` split rendering correctly; a full submission
   producing the exact expected request body and calling `onSaved` with the server's response;
   a failed save showing a friendly error; all ten severity options 1–10 present; Cancel calling
   `onCancel`.
4. **`npm run build`** (frontend) — compiled cleanly.
5. **`npm test`** (frontend) — 30/30 passing (24 pre-existing, 6 new).
6. **`npm run lint`** (`oxlint`) — clean (one pre-existing, unrelated warning on
   `AuthContext.tsx`, not touched by this task). **`npx prettier --check .`** — clean.
7. **Real browser verification**, per the project's UI-change testing rule. Started the actual
   compiled backend (`npm start`, port 4101 — this worktree's isolated port) and the frontend
   dev server (port 5173, matching this worktree's `FRONTEND_URL`/`VITE_API_URL`), then drove a
   real headless Chromium browser through the full flow with a throwaway Playwright script:
   register → land on Dashboard → open the symptom form → select "Headache," severity 8, add a
   note → Save → confirm the entry appears in the list with the right symptom name, severity,
   note, and timestamp → delete it → confirm the list returns to its empty state. Zero browser
   console errors at any point. Screenshots taken at each step and visually reviewed (the form
   with its two-row severity grid and grouped picker, the filled form, the saved entry, and the
   post-delete empty state), not just asserted programmatically. Cleaned up the browser-created
   test user afterward via `psql` and stopped both manually-started servers.

### Why it's needed

This closes out the symptom-logging vertical slice the same way `feature/7.3-mood-entry-form`
closed out mood's: the point at which a set of individually-correct backend pieces becomes a
feature an actual person can use, end to end, in a real browser.

### Decisions

- **`symptoms` passed as a prop, not fetched inside the form.** Covered above — avoids two
  independent copies of the same list and simplifies testing.
- **Native `<select>`/`<optgroup>` for the symptom picker, not a custom `role="radiogroup"` like
  mood's.** Covered above — the option list is open-ended in a way mood/energy/stress/severity
  aren't, and a native select handles that without extra work.
- **Severity has no deselect-to-clear behavior, unlike energy/stress.** Severity is a required
  field (every symptom log needs one), the same way mood is required on `MoodEntryForm` — only
  genuinely optional rating fields (energy, stress) get the "click again to unselect" behavior.
- **Inline on the Dashboard, not a modal; delete only, no edit.** Same reasoning as the mood
  entry form's own decisions section — the shared Quick Add modal and pre-filled-edit-form work
  are their own separate, not-yet-started Tasks.md items covering all four log types at once.

### State at end of this step

A real user can register or log in, land on the Dashboard, log a symptom (system or their own
custom one) with a required severity and optional notes/backdated time, see it appear
immediately with its name and severity, and delete it — verified directly in a real browser, not
just via tests. This closes out the symptom-logging vertical slice: `feature/1.2-symptom-models`
→ `feature/3.1-symptom-endpoints` → `feature/7.2-symptom-entry-form` (this task) are each their
own PR, stacked in that order, and need merging in that same order once reviewed.

### Verification

- `npm test` (frontend, `vitest run`) — 30/30 passing (24 pre-existing, 6 new).
- `npm run build` (frontend) — compiled cleanly.
- `npm run lint` (oxlint) — clean (one pre-existing, unrelated warning). `npx prettier --check .`
  — clean.
- Real headless-browser walkthrough (Playwright) against the actual running backend and
  frontend dev servers: full register → log symptom → view → delete cycle, screenshots reviewed
  at each step, zero browser console errors.

---

## 2026-08-16 — The exact stranded-PR bug happened again, on PR #45 — recovered the same way

**Task:** Not a [Tasks.md](Tasks.md) checklist item — while resolving a routine-looking merge
conflict on PR #41 (Medication models), `main` turned out to be missing an entire piece of work
that GitHub's own UI showed as "Merged": PR #45, the symptom entry form.

### What happened, briefly (the full mechanics are already covered in an earlier entry)

- This is the identical failure mode documented in detail back in "The real bug: `postinstall`
  never reached `main` at all (a stacked-PR gotcha)" — not a new bug, the same one recurring.
  PR #45's base was `feature/3.1-symptom-endpoints` (PR #44's branch). PR #44 merged into
  `main`, but its branch was never deleted afterward — so GitHub never retargeted #45 to `main`,
  and clicking "merge" on #45 merged it into that now-orphaned branch instead. Confirmed exactly
  the same way as last time: `git merge-base --is-ancestor <PR45-merge-commit> origin/main`
  returned false, and `git log origin/main..origin/feature/3.1-symptom-endpoints` listed the
  three stranded commits (the form itself, its docs entry, and the merge commit) sitting on a
  branch that was never itself merged into `main`.
- **Why this recurred despite already being documented once:** the earlier entry's fix was
  applied to the specific branches involved in that incident, and the *general habit* it
  recommended — "for any stacked PR, check whether the base branch actually got deleted before
  trusting the next one merged cleanly" — depends on someone actually doing that check each
  time. This PR chain was reviewed and merged by a person working through a long list of
  parallel-agent PRs; it's an easy, human step to miss under exactly that kind of volume, not a
  sign the earlier fix was wrong.
- **The recovery**, identical in shape to last time: cherry-picked the two real commits (the
  merge commit itself doesn't need cherry-picking) from the stranded branch onto a fresh branch
  off the *true* current `main`, verified independently (`npm test` — 30/30 passing, `npm run
  build` — clean) rather than assuming a clean cherry-pick meant a working one, then opened this
  as its own PR.

### Why it's needed

Without catching this, the Medication-models conflict resolution about to happen next would
have been merged against an incomplete `main` — silently reintroducing the exact gap this
recovery closes, just one PR later and harder to notice by then.

### Decisions

- **Checked `main` directly before trusting the conflict I was about to resolve**, rather than
  assuming a "routine" conflict meant nothing more was going on — the same instinct that caught
  this the first time, applied again rather than let familiarity with the pattern breed
  complacency about checking for it.

### State at end of this step

The symptom entry form's code now exists on a branch built directly off current `main`, verified
independently, ready to merge. Once merged, `main` will finally contain everything both PR #45
and this project's own tracking (`Tasks.md`, the earlier symptom-form log entry) already claimed
it did.

### Verification

- `git merge-base --is-ancestor <PR45-merge-commit> origin/main` — confirmed false before
  starting the recovery, not assumed from GitHub's "Merged" badge.
- `git log origin/main..origin/feature/3.1-symptom-endpoints` — listed the exact stranded
  commits directly.
- `npm test` (frontend) — 30/30 passing; `npm run build` — clean, on the recovery branch itself,
  independent of the original PR's own (also passing) checks.

---

## 2026-08-16 — Phase 1: `Medication` + `MedicationLog` models + migration

**Task:** [Tasks.md](Tasks.md) → Phase 1 → "Define `Medication` model: `id`, `user_id`, `name`,
`created_at`." and "Define `MedicationLog` model: `id`, `user_id`, `medication_id`, `taken
(boolean)`, `notes (optional)`, `logged_at`."

**Delivered via branch:** `feature/1.5-medication-models` (branched from `main`). This is the
first step of a new vertical slice — medication logging — following the exact same shape as
the earlier mood-logging slice (model → scoped CRUD endpoint → frontend form). Unlike that
slice, both models for this domain are defined together in one branch rather than split further,
since `Medication` (the user's list of medication names) and `MedicationLog` (each taken/not-
taken record) are small enough, and tightly enough coupled, that splitting them into separate
PRs would add process overhead without adding any real independent value — the log endpoint
can't be tested meaningfully without the medication list existing to reference in the first
place.

### Background / concepts

#### Two tables, not one — why "medication" and "medication log" are different things

- Requirements §6.3 describes recording "whether a medication was taken" — but a medication
  itself (e.g. "Ibuprofen") is a *thing a user takes repeatedly*, while each taken/not-taken
  record is a separate event in time. Collapsing these into one table (say, a `taken` column
  directly on a `medications` row) would only be able to represent the *most recent* status,
  losing all history — the same one-to-many relationship reasoning as `User` → `MoodLog` from
  the earlier entry, just one level deeper here: `User` has many `Medication`s, and each
  `Medication` has many `MedicationLog`s.

#### `MedicationLog` carries both `userId` and `medicationId` — and why that's not redundant

- Every `MedicationLog` already reaches its owning user indirectly, by following
  `medicationId` → `Medication.userId`. Storing `userId` directly on `MedicationLog` too is a
  deliberate denormalization, copying the same shape `MoodLog` already uses (a direct `userId`
  column on every log table, not just on the "parent" record) — it's what lets `GET
  /api/medication-logs` filter and index directly on `[userId, loggedAt]` without an extra join
  through `Medication` on every read, exactly like `MoodLog`'s existing composite index.
- **This column is not, on its own, a security boundary.** Nothing at the database level stops
  a row's `userId` from disagreeing with its `medication.userId` — that would require a check
  constraint spanning two tables, which Postgres doesn't support directly. The actual defense
  against a user submitting *another* user's `medicationId` (the ID-tampering concern Tasks.md's
  Phase 3 cross-cutting item calls out) has to live in the application layer, in the next task's
  route: before creating or updating a `MedicationLog`, the code must look up the referenced
  `Medication` scoped to `req.userId` and reject the request if it's not found or not theirs.
  This migration only builds the storage shape that check will write into — it doesn't replace
  the check itself.

#### Cascading deletes, two levels deep

- `Medication.user @relation(..., onDelete: Cascade)` means deleting a `User` also deletes all
  of their `Medication` rows. `MedicationLog.medication @relation(..., onDelete: Cascade)` means
  deleting a `Medication` also deletes all of *its* `MedicationLog` rows. Together, these chain:
  deleting a `User` cascades to their `Medication`s, which cascades again to every
  `MedicationLog` referencing those medications — satisfying Phase 1's "removing a `User`
  removes all associated logs" requirement without the application needing to manually delete
  in the right table order. `MedicationLog.user` also has its own direct `onDelete: Cascade` to
  `User`, belt-and-suspenders with the same reasoning as the denormalized `userId` column above:
  since `userId` is stored directly rather than only reachable via `medicationId`, it needs its
  own cascade rule too, or deleting a user would leave that column's foreign key constraint
  unsatisfiable.

### What was done

1. **`backend/prisma/schema.prisma`.** Added `Medication` (`id`, `userId`, `name`, `createdAt`)
   and `MedicationLog` (`id`, `userId`, `medicationId`, `taken`, `notes`, `loggedAt` with
   `@db.Timestamptz(3) @default(now())`, matching `MoodLog`'s timestamp handling exactly), plus
   the reciprocal `medications`/`medicationLogs` fields on `User`. `Medication` gets a
   `@@index([userId])` (every "list my medications" query and the ownership check both filter by
   this); `MedicationLog` gets `@@index([userId, loggedAt])` (list/range queries, same shape as
   `MoodLog`) and `@@index([medicationId])` (used when checking a medication's own log history,
   and by the foreign key itself).
2. **Migration.** `npx prisma migrate dev --name add_medication_and_medication_log` — generated
   and applied `20260816123825_add_medication_and_medication_log` against this worktree's
   isolated local database (`welltrack_medication` — a separate database inside the same shared
   Postgres container other concurrent work uses, so this migration couldn't collide with
   anyone else's in-progress schema changes).
3. **`npm run build`** — compiled cleanly (regenerates the Prisma Client, making
   `prisma.medication.create(...)` / `prisma.medicationLog.create(...)` etc. available with full
   TypeScript types for the next task).
4. **`npm test`** — 34/34 passing, unchanged (this task adds no application code, only schema).
5. **Manual verification directly against Postgres**, not just the migration command's own
   output: `psql \d medications` and `\d medication_logs` against the real running database,
   confirming column types (including `timestamp(3) with time zone` on `logged_at`), both
   indexes, and both cascading foreign keys exist for real.
6. **Lint/format** — `npx eslint .` clean, `npx prettier --check .` clean.

### Why it's needed

The medication-logs endpoint (next task) needs somewhere to store data, with the ownership
relationships already in place, before any API code is written against it — same reasoning as
the `MoodLog` model entry.

### Decisions

- **One branch for both models, not two.** Documented above — `Medication` and `MedicationLog`
  are too tightly coupled to usefully review or test independently (a `MedicationLog` can't
  exist without a `Medication` to reference), unlike, say, the earlier auth-middleware and
  `MoodLog` split, where the middleware had genuine standalone value and no dependency on the
  model.
- **Direct `userId` on `MedicationLog`, denormalized from `Medication.userId`.** Matches
  `MoodLog`'s existing shape rather than introducing a new "look it up via a join" pattern for
  just this one table — consistency with the established convention, plus the indexing benefit
  described above.
- **No `description` or dosage/schedule fields on `Medication`.** Kept to exactly what
  `requirements.md` §6.3 and `Tasks.md` specify (name only) — the MVP is "was this medication
  taken," not a full medication-management feature.

### State at end of this step

`medications` and `medication_logs` exist in the local (isolated, per-worktree) database with
the correct shape, constraints, and indexes. No API endpoint reads or writes either table yet —
that's the next task.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 34/34 passing (unchanged).
- `psql \d medications` / `\d medication_logs` against the real local database — confirmed
  column types, indexes, and both cascading foreign keys directly.
- `npx eslint .` and `npx prettier --check .` — both clean.

---

## 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/medications` and `/api/medication-logs`

**Task:** [Tasks.md](Tasks.md) → Phase 3 → Medications → "`GET/POST/PATCH/DELETE
/api/medications` — manage the user's medication list." and "`GET/POST/PATCH/DELETE
/api/medication-logs` — record taken/not-taken status per medication per date."

**Delivered via branch:** `feature/3.6-medication-endpoints` (stacked on
`feature/1.5-medication-models`) — the same "model → scoped CRUD route" pattern the mood-logs
endpoint established, applied here for the first time to a domain with *two* related tables
instead of one.

### Background / concepts

#### Two routers, because there are genuinely two resources

- `medications.ts` manages the user's medication *list* (create "Ibuprofen" once, rename or
  delete it later) — a small, low-frequency resource. `medicationLogs.ts` manages the
  taken/not-taken *events* against that list (potentially several per day, per medication) — a
  high-frequency resource, same shape as `MoodLog`. Splitting these into two route files
  (mounted separately in `app.ts`, at `/api/medications` and `/api/medication-logs`) keeps each
  file focused on one resource's CRUD, rather than one file juggling two different validation
  schemas and two different Prisma models.

#### The ID-tampering defense, concretely — not just "scope the query," but "verify the reference"

- Every route already scopes its *own* table's queries by `req.userId` (`findFirst({ where: {
  id, userId } })`), the same pattern `MoodLog` uses. But `MedicationLog` also carries a
  *second* foreign key — `medicationId`, pointing at a different table the caller doesn't own
  outright, they only own indirectly through their own `Medication` rows. A client can put
  **any** string in the `medicationId` field of a `POST /api/medication-logs` body, including
  another user's real medication ID copied or guessed from elsewhere. Scoping the *log's own*
  query by `userId` does nothing to stop that, because the log doesn't exist yet — there's
  nothing to scope. This is exactly the ID-tampering scenario Tasks.md's Phase 3 cross-cutting
  item warns about, and it needs its own explicit check, separate from ownership-scoping a
  lookup of an existing row.
- The fix, in `medicationLogs.ts`'s `medicationBelongsToUser` helper: before ever writing a
  `MedicationLog` referencing a given `medicationId`, look that medication up scoped to
  `req.userId` (`prisma.medication.findFirst({ where: { id: medicationId, userId } })`) and
  reject with `404 MEDICATION_NOT_FOUND` if nothing comes back. From the caller's perspective, a
  real medication belonging to someone else and a `medicationId` that doesn't exist at all are
  indistinguishable — same "don't confirm existence to an unauthorized caller" reasoning as the
  404-not-403 pattern elsewhere in this codebase, just applied to a body field instead of a URL
  param.
- **This check runs on both `POST` and `PATCH`.** It would be easy to add it only to `POST`
  (where a new `medicationId` is always supplied) and miss that `PATCH` can *also* supply a new
  `medicationId`, re-pointing an existing, legitimately-owned log at a different medication —
  including someone else's. `medicationLogs.ts`'s `PATCH /:id` handler explicitly re-runs the
  same check whenever the update body includes `medicationId`, and a test
  (`rejects re-pointing an existing log at another user's medicationId via PATCH`) proves this
  specifically, not just the `POST` case.

#### `taken` is a required boolean, unlike mood-logs' required numeric field

- `z.boolean()` for `taken` rejects anything that isn't literally `true`/`false` — no coercion
  from `"true"`/`1`/etc. — the same "be strict about what a field actually means" approach
  `moodField`'s `z.number().int().min(1).max(5)` already uses for mood. A truthy-but-wrong value
  like the string `"yes"` fails validation with `VALIDATION_ERROR` rather than silently being
  interpreted as `true`.

### What was done

1. **`backend/src/routes/medications.ts` (new).** `GET /` (list the caller's medications), `POST
   /` (create, `name` required non-empty string), `PATCH /:id` / `DELETE /:id` (ownership-scoped
   via `findFirst`, `404 MEDICATION_NOT_FOUND` if missing or not owned).
2. **`backend/src/routes/medicationLogs.ts` (new).** `GET /` (list the caller's medication logs,
   most recent first), `POST /` (validates `medicationId` + `taken` required, `notes` optional,
   `loggedAt` optional ISO datetime defaulting to now — same backfill pattern as mood-logs — and
   runs the ID-tampering check above before creating), `PATCH /:id` (ownership-scoped lookup of
   the log itself, plus the ID-tampering re-check if `medicationId` is included in the body),
   `DELETE /:id`.
3. **`backend/src/app.ts`.** Mounted both routers behind `requireAuth`, at `/api/medications` and
   `/api/medication-logs`.
4. **Tests (`medications.test.ts`, `medicationLogs.test.ts`).** Mirrors `moodLogs.test.ts`'s
   coverage (no-token rejection, create/list/update/delete, validation rejection, cross-user 404
   on PATCH/DELETE with a `findUnique` afterward proving zero effect) for both resources, plus
   two tests specific to this task's key risk: creating a medication log against another user's
   `medicationId` (expects `404 MEDICATION_NOT_FOUND`, and confirms via
   `prisma.medicationLog.findMany` that no log was actually created), and re-pointing an
   existing log at another user's `medicationId` via `PATCH` (same expectation, confirms the
   existing log's `medicationId` is unchanged afterward).
5. **`npm test`** — 53/53 passing (34 pre-existing, 19 new).
6. **`npm run build`** — compiled cleanly.
7. **Lint/format** — `npx eslint .` clean; `npx prettier --check .` initially flagged the two new
   test files (long single-line `request(app)...` chains it wanted wrapped), fixed with `npx
   prettier --write`, then re-ran the full suite to confirm the reformatting changed no behavior
   (still 53/53).
8. **Manual end-to-end verification against the compiled, running server** (`npm start` on this
   worktree's isolated port, `4102`), via `curl`: registered and logged in a real user, confirmed
   `/api/medications` returns `401` with no token, then create → list → (log create → list →
   update → delete) → delete for both resources, each response matching expectations. Separately
   registered a second "attacker" user and confirmed, against the real running server (not just
   the test suite), that `POST /api/medication-logs` with the first user's real `medicationId`
   returns `404 MEDICATION_NOT_FOUND` rather than creating a log. Cleaned up both manually-created
   test users afterward via `psql` and stopped the manually-started server.

### Why it's needed

This is the second full log-type CRUD API in the app (after mood), and the first one where a
log references a second, separately-owned resource rather than standing alone — proving out the
ID-tampering defense pattern the rest of Phase 3 (symptoms, habits) will each need in their own
way (symptom logs reference symptoms, which can also be system-owned; habit logs reference
habits) once those slices land.

### Decisions

- **Two separate route files, not one combined `medications.ts`.** Covered above — each
  resource has its own validation schema, its own not-found error code
  (`MEDICATION_NOT_FOUND` vs. `MEDICATION_LOG_NOT_FOUND`), and mixing them would blur which
  "not found" a given 404 refers to.
- **`404`, not `400`, for a `medicationId` that doesn't belong to the caller.** The field itself
  is present and well-formed (a non-empty string, satisfying Zod) — the problem is what it
  *refers to*, which is a lookup failure, not a shape failure. This mirrors how `PATCH
  /api/mood-logs/:id` already distinguishes "malformed body" (`400 VALIDATION_ERROR`) from "body
  well-formed but the referenced row isn't yours" (`404`) for the URL param; applied here to a
  body field pointing at a different resource instead.
- **No `MEDICATION_NOT_FOUND` vs. a more specific "not yours" code.** Same reasoning as the
  existing 404-not-403 pattern — a more specific error would leak that the ID is real but
  belongs to someone else.
- **Not building the Phase 3 cross-cutting items (centralized error middleware, centralized
  validation) in this task.** Same call as the mood-logs entry: those are their own separate
  Tasks.md items, deliberately left for a dedicated task rather than bundled into each
  individual endpoint's PR.

### State at end of this step

A real, working, tested, auth-protected CRUD API for both medications and medication logs
exists locally, including the ID-tampering defense specifically tested and manually verified
against a real running server. Nothing on the frontend calls it yet — that's the next task.

### Verification

- `npm test` (`vitest run`) — 53/53 passing (34 pre-existing, 19 new).
- `npm run build` — compiled cleanly.
- `npx eslint .` and `npx prettier --check .` — both clean (after one `prettier --write` pass on
  the new test files, followed by a full re-run of the suite to confirm no behavior changed).
- Manual `curl` round-trip against the compiled, running server (port `4102`): unauthenticated
  request → `401`; full lifecycle for both resources; and a live cross-user attempt to create a
  medication log against another real user's `medicationId` → confirmed `404
  MEDICATION_NOT_FOUND` against the actual running server, not just the automated test.

---

## 2026-08-16 — Phase 7: Medication entry form, wired into the Dashboard

**Task:** [Tasks.md](Tasks.md) → Phase 7 → "Medication entry form: medication picker (or quick
'mark as taken/not taken'), optional notes, date/time picker." → requirements §6.3.

**Delivered via branch:** `feature/7.4-medication-entry-form` (stacked on
`feature/3.6-medication-endpoints`). This is the last piece of the medication-logging vertical
slice — the same significance the mood entry form task had for mood logging: everything built
so far (models, CRUD endpoints, the ID-tampering defense) finally becomes something a real
person can see and use.

### Background / concepts

#### What requirements §6.3 actually asks for, and how that shaped the form

- §6.3 is explicit that medication logging should be low-friction: "Users must be able to
  record whether a medication was taken," with the dashboard summary shown as a plain
  "Medications: 1/2 taken" — the emphasis throughout is on speed (tap to record a status), not
  on a heavy data-entry form. But the API underneath needs a real `medicationId` on every log —
  there has to be *some* mechanism for choosing which medication a log is about. The form
  reconciles these by keeping medication selection itself as large, single-tap buttons (a
  `role="radiogroup"` of medication names, the same accessible-custom-control pattern
  `MoodEntryForm`'s emoji buttons already established) rather than a `<select>` dropdown or a
  multi-step wizard, and by making the taken/not-taken choice two big tappable tiles rather than
  a checkbox buried in a longer form.
- **The bootstrap problem, and how it's resolved without a separate "manage medications"
  screen.** A brand-new user has zero medications — Tasks.md's Phase 7 item only calls for the
  entry *form*, not a separate medication-management page (that's implied by the `/api/medications`
  CRUD endpoints existing, but building a dedicated management UI isn't this task's scope). The
  form solves this inline: if the user has no medications yet, it skips straight to a small
  "add a medication" field instead of showing an empty, useless picker; once at least one
  medication exists, picking one is the default view, with a "+ Add another medication" toggle
  available at any time for adding more without leaving the log-entry flow.

#### Why `onSaved` passes back the medication, not just the log

- `MedicationLog` (from the API) only stores `medicationId` — not the medication's name. The
  Dashboard's log list needs the name to display anything meaningful ("Ibuprofen — Taken", not
  "5c38bf16… — Taken"). The straightforward fix would be re-fetching `/api/medications` after
  every save, but that's an unnecessary round-trip: the form, at the moment it submits, already
  has the full `Medication` object in memory (either from its initial fetch, or from having just
  created it inline seconds earlier). `MedicationEntryForm`'s `onSaved: (log, medication) =>
  void` callback signature hands both back to the Dashboard in one step, which folds the
  medication into its own local list (skipping the add if it's already there, to avoid
  duplicates when logging a second entry against an existing medication) without a second
  network request.

#### Why medications and medication logs are fetched together on the Dashboard

- `DashboardPage`'s new `useEffect` calls `Promise.all([apiFetch("/api/medications"),
  apiFetch("/api/medication-logs")])` rather than two independent, unrelated effects — both
  results are needed together before the log list can render anything meaningful (a log with no
  matching medication name to show), so tying their loading/error state together avoids a flash
  of "Medication" placeholder text while the medications list is still in flight separately.

### What was done

1. **`frontend/src/components/MedicationEntryForm.tsx` (new).** Fetches the user's medications
   on mount; if none exist, shows an inline "add a medication" field first; otherwise shows a
   radiogroup of medication-name buttons (with a "+ Add another medication" toggle always
   available) for picking which one this log is about. A required two-option "Was it taken?"
   radiogroup (large tappable tiles, ✅/❌), an optional notes textarea, and a `datetime-local`
   field defaulting to now (same `toDateTimeLocalValue` helper `MoodEntryForm` uses, duplicated
   locally rather than shared - neither component has a shared utils module yet). Submits via
   `apiFetch("/api/medication-logs", { method: "POST", ... })` and calls `onSaved(log,
   medication)` on success.
2. **`frontend/src/pages/DashboardPage.tsx` (extended).** Added medication state (medications,
   medication logs, loading/error, form-visibility) alongside the existing mood state; a `+
   Medication` button that reveals the form inline (same pattern as `+ Mood`); a "Recent
   medications" list showing each log's medication name (looked up from the fetched medications
   list), taken/not-taken status and icon, optional notes, timestamp, and a working delete
   (optimistic removal, rolled back on failure) - directly mirroring the mood section's
   structure line for line.
3. **Tests (`MedicationEntryForm.test.tsx`).** Requiring a medication to be selected before
   submit is possible; requiring taken/not-taken to be chosen; a full submission producing the
   exact expected request body and calling `onSaved` with both the created log and the selected
   medication; a failed save showing a friendly error; a user with zero medications adding one
   inline and having it auto-selected; Cancel calling `onCancel`.
4. **`npm test`** (frontend) — 26/26 passing (18 pre-existing, 8 new).
5. **`npm run build`** (frontend) — compiled cleanly.
6. **Lint/format** — `npm run lint` (oxlint) clean except one pre-existing warning in
   `AuthContext.tsx`, unrelated to this change (confirmed via `git diff` against the previous
   branch, that file is untouched here); one unsafe-optional-chaining warning in the new test
   file, fixed by replacing a chained `?.` with an explicit `if (!postCall) throw ...` guard
   before indexing into the mock call. `npx prettier --check .` clean after one `--write` pass
   on `DashboardPage.tsx`.
7. **Real browser verification**, per the project's UI-change testing rule. Started the actual
   compiled backend (`npm start`, this worktree's isolated port `4102`) and the frontend dev
   server, then drove a real headless Chromium browser through the full flow with a throwaway
   Playwright script: register → land on Dashboard → open the medication form → add a first
   medication ("Ibuprofen") inline, since none existed yet → mark it Taken with a note → Save →
   confirm it appears in the list with the right name, status, note, and timestamp → open the
   form again, this time picking the *existing* medication from the picker rather than adding a
   new one → mark it Not taken → Save → confirm both entries are listed → delete both → confirm
   the list returns to its empty state. No browser console errors at any point. Screenshots
   taken at each step and visually reviewed, not just asserted programmatically. Cleaned up the
   browser-created test user afterward and stopped both manually-started servers.

### Why it's needed

This closes out the medication-logging vertical slice, the same way the mood entry form task
closed out mood logging - proving the whole chain (model → ID-tampering-safe endpoint →
low-friction frontend) works end to end for a domain with a real second referenced resource,
not just a single flat log table.

### Decisions

- **Inline "add a medication" within the log-entry form, no separate management page.** Covered
  above - Tasks.md scopes this task to the entry form specifically; a dedicated "manage your
  medications" screen (rename/delete existing medications from a list, not just add) isn't
  called for here and would duplicate work if built ad hoc now versus deliberately later.
- **Delete only, no edit, in this slice.** Same call as the mood entry form entry: "reusing the
  same form pre-filled with existing values" is its own explicit, broader Tasks.md item covering
  all four log types at once, not something to partially pre-build here.
- **Medication picker as large tap-buttons, not a `<select>` dropdown.** A native `<select>`
  would be more compact for a user with many medications, but requirements §6.3's low-friction
  framing and the existing `MoodEntryForm` precedent (emoji buttons, not a dropdown, for a
  similar "pick one of a few options" choice) both favor large, unambiguous tap targets over
  dropdown compactness for what's expected to be a short, everyday list.
- **`onSaved(log, medication)` two-argument callback**, instead of re-fetching medications after
  every save or making the Dashboard respawn its own separate "did a new medication just get
  created" tracking. Covered above - avoids an unnecessary round-trip and keeps the medication
  the form just used as the single source of truth for that save.

### State at end of this step

A real user can register or log in, land on the Dashboard, add their first medication inline
while logging it, mark subsequent doses taken or not taken (with optional notes and a backdated
time), see each entry appear immediately with the right medication name, and delete entries -
verified directly in a real browser, not just via tests. This closes out the medication-logging
vertical slice: Phase 1.5 (models) → Phase 3.6 (endpoints) → Phase 7.4 (this task) are each their
own PR, stacked in that order, and need merging in that same order once reviewed.

### Verification

- `npm test` (frontend, `vitest run`) — 26/26 passing (18 pre-existing, 8 new).
- `npm run build` (frontend) — compiled cleanly.
- `npm run lint` (oxlint) and `npx prettier --check .` — both clean (one pre-existing, unrelated
  warning aside; one new-test-file lint warning fixed).
- Real headless-browser walkthrough (Playwright) against the actual running backend and frontend
  dev servers: full register → add medication inline → log taken → log not-taken (existing
  medication) → view both → delete both cycle, screenshots reviewed at each step, zero browser
  console errors.

---

## 2026-08-16 — Phase 1: `Habit` and `HabitLog` models + migration

**Task:** [Tasks.md](Tasks.md) → Phase 1 → "Define `Habit` model: `id`, `user_id`, `name`, `type
(boolean | numeric | duration)`, `created_at`." and "Define `HabitLog` model: `id`, `user_id`,
`habit_id`, `value (shape depends on habit type)`, `notes (optional)`, `logged_at`."

**Delivered via branch:** `feature/1.5-habit-models`, branched off `main` (which already has
`requireAuth` and the full mood-logging vertical slice merged). This starts a new, independent
vertical slice — habit logging — following the exact same shape the mood-logging slice used:
model first, then the CRUD endpoint, then the frontend form.

### Background / concepts

#### The actual problem this task is about: a value whose *shape* depends on another row

Every previous log table (`MoodLog`) has a fixed, known set of columns — a mood log always has a
`mood` field, always an integer 1–5. A habit log is different: `requirements.md` §6.4 says a
habit can be yes/no, a number, or a duration, and *which one* is a property of the `Habit` row
the log points back at, not something fixed for the whole table. This is the core modeling
question this task has to answer: how do you store "a value whose type depends on a foreign
key's row" in a relational database, where every row in a table normally has the same columns
meaning the same thing?

Three real options were weighed:

1. **A single polymorphic column** (e.g. Prisma's `Json` type, or a `String` that gets
   parsed/coerced depending on context). Simplest schema, but every reader of the table has to
   know, out-of-band, how to interpret whatever's in that column — the database itself can't
   enforce "this is a number" vs. "this is a boolean," and a numeric aggregate query (e.g. "this
   week's average water intake") would need to cast a JSON value out of the column every time,
   rather than operating on a plain typed number.
2. **Separate tables per habit type** (`BooleanHabitLog`, `NumericHabitLog`, `DurationHabitLog`).
   Fully typed at the database level, but means the `GET /api/habit-logs` endpoint (needed
   regardless of habit type, e.g. for a combined activity feed) would have to query three tables
   and merge the results, and every future feature that touches "a habit log" has to handle three
   shapes structurally, not just three cases of one shape.
3. **One table, three nullable typed columns** (`valueBoolean Boolean?`, `valueNumeric Float?`,
   `valueDurationMinutes Int?`), with application code enforcing that exactly the one matching the
   parent habit's `type` is populated and the other two are left `null`. **This is what was
   built.** It keeps `HabitLog` a single table (one query for "all this user's habit logs," same
   as every other log type), keeps each value typed at the database level (a numeric aggregate is
   a plain SQL `AVG(value_numeric)`, not a JSON-extraction expression), and its one real cost — the
   "exactly one of three is set" rule isn't something Postgres or Prisma can express declaratively
   as a constraint referencing a *different* table's row — is paid once, centrally, in the
   `habit-logs` route's validation code (the next task), not scattered across every future
   consumer of this table the way option 1's "know how to interpret this column" cost would be.

Option 3 was chosen because it's the same trade-off direction the codebase already leans: business
rules that depend on cross-row context (e.g. "you can't edit someone else's mood log") are already
enforced in route handlers, not attempted as database constraints — extending that same pattern to
"you can't set the wrong value column for this habit's type" is consistent, not a new kind of
compromise.

#### `HabitType` as a Prisma `enum`, not a plain `String`

- `type (boolean | numeric | duration)` is a fixed, small, known set of values — a Prisma `enum`
  (`BOOLEAN | NUMERIC | DURATION`) maps to a real Postgres `ENUM` type, so the database itself
  rejects an invalid value like `"weekly"` at the `INSERT`/`UPDATE` level, not just whatever the
  application layer happens to check. A plain `String` column would accept anything and rely
  entirely on Zod validation in the route layer (still needed regardless, since Zod runs before
  the database ever sees the request) — the enum is a second, structural line of defense, the same
  reasoning that justified the foreign-key constraint on `userId` back in the `MoodLog` entry.

#### Cascading deletes, one level deeper than `MoodLog` needed

- `MoodLog` only needed `onDelete: Cascade` from `User`. `HabitLog` needs it from **both** `User`
  *and* `Habit`: deleting a user should remove their habits and habit logs (same as every other
  log type), but deleting a single `Habit` (without deleting the user) should also remove that
  habit's logs — a `HabitLog` whose parent `Habit` no longer exists has no `type` left to interpret
  its `value*` columns against, so an orphaned log in that state isn't meaningful data worth
  preserving. Both relations are declared with `onDelete: Cascade` for that reason.

#### Two indexes on `HabitLog`, not one

- `@@index([userId, loggedAt])` mirrors `MoodLog`'s composite index — every "this user's recent
  activity" query filters by user and ranges by time together.
- `@@index([habitId, loggedAt])` is new: a future per-habit view ("show me this specific habit's
  history/trend over time") filters by `habitId`, not `userId`, and still ranges by `loggedAt` —
  a query pattern `MoodLog` never had, since there's no equivalent of "one specific habit" to
  drill into for mood.
- `Habit` itself gets a single-column `@@index([userId])` (no second dimension) since "list this
  user's habits" has no secondary sort/range axis the way the log tables do.

### What was done

1. **`backend/prisma/schema.prisma`.** Added the `HabitType` enum, the `Habit` model, and the
   `HabitLog` model as described above, plus the reciprocal `habits`/`habitLogs` fields on `User`.
2. **First migration attempt caught a real naming-convention bug before it shipped.** The first
   `npx prisma migrate dev --name add_habit_and_habit_log` run applied successfully, but manually
   inspecting the resulting table with `psql \d habit_logs` (the same "verify directly against
   Postgres, not just trust the migration output" habit the `MoodLog` entry established) showed
   the three value columns landed as `valueBoolean`, `valueNumeric`, `valueDurationMinutes` —
   camelCase, unlike every other column in the schema (`user_id`, `logged_at`, etc.), because they
   were missing the `@map(...)` snake_case override every other field already has. Since this
   database is a throwaway local instance created solely for this task with zero real data in it,
   the fix was to add the missing `@map` calls, manually drop just the two new tables and the new
   enum type via `psql` (not a full `prisma migrate reset` — Prisma's own safety guard correctly
   refused that command without explicit interactive user consent, and a full reset was overkill
   for undoing two empty tables anyway), delete the one now-stale row from `_prisma_migrations`,
   and re-run `migrate dev` to produce a clean, correctly-named migration on the first real attempt
   that will ever reach a shared or production database.
3. **Migration.** `20260816193218_add_habit_and_habit_log`, applied against the isolated local
   database (`welltrack_habit` — this vertical slice is being built in a separate git worktree
   from any concurrently-running symptom/medication-logging work, each pointed at its own database
   and backend port specifically so local `migrate dev` runs never collide).
4. **`npm run build`** — compiled cleanly (also regenerates the Prisma Client, making
   `prisma.habit.create(...)` / `prisma.habitLog.create(...)` available with full types for the
   next task).
5. **`npm test`** — 38/38 passing, unchanged from before this task (schema-only change, no new
   application code yet).
6. **Manual verification directly against Postgres**: `psql \d habits` and `psql \d habit_logs`,
   confirming exact column names/types (including the corrected `value_boolean` /
   `value_numeric` / `value_duration_minutes` snake_case names, and `logged_at` as
   `timestamp(3) with time zone`), both indexes, the `habit_type` enum, and both cascading foreign
   keys on `habit_logs` (to `users` and to `habits`) all exist for real in the running database.
7. **Lint/format.** `npx eslint .` and `npx prettier --check .` — both clean (no application code
   changed, but run as part of this task's own verification regardless).

### Why it's needed

The habit-logs endpoint (next task) needs somewhere to store data with the right shape and
constraints already in place — including the specific "exactly one value column per type" rule
this schema deliberately leaves for the application layer to enforce, exactly where the next task
picks up.

### Decisions

- **Three nullable typed columns over a single `Json` value column or per-type tables.** Covered
  in detail above — chosen to keep `HabitLog` a single, typed, uniformly-queryable table.
- **`type` immutable after creation, planned for the next task, not this one.** Not yet enforced
  in code (there's no route yet), but noted here since it shapes why the value-column approach
  above is safe: if `type` could change after logs already reference a habit, existing logs'
  populated value column could become mismatched with the (now different) type with no way to
  reconcile old data. Deferred to the next task's PATCH `/api/habits/:id` implementation, but the
  schema decision here assumes it.
- **No `createdAt` on `HabitLog`**, matching `MoodLog`'s precedent — `logged_at` already captures
  the moment that matters (including backfilled past dates); a separate "row inserted at" column
  isn't read by anything planned.
- **Manually corrected the migration rather than shipping the camelCase-column version and fixing
  it in a follow-up migration.** Since nothing had been pushed or merged yet and the local database
  had no real rows, regenerating a single correct migration was strictly better than committing a
  bug and a fix-up migration on top of it — the second option would be the right call once a
  migration has actually reached a shared database (as the earlier "Prisma migration checksum
  mismatch" entry describes for a different scenario), but that constraint didn't apply here yet.

### State at end of this step

`habits` and `habit_logs` exist in this slice's isolated local database with the correct shape,
constraints, and indexes. No API endpoint reads or writes either table yet — that's the next
task, stacked on this branch.

### Verification

- `npm run build` — compiled cleanly.
- `npm test` — 38/38 passing (unchanged).
- `npx eslint .` / `npx prettier --check .` — both clean.
- `psql \d habits` and `psql \d habit_logs` against the real local database — confirmed column
  names/types, both indexes, the enum type, and both cascading foreign keys directly, not
  inferred from the migration file alone.

---

## 2026-08-16 — Phase 3: `GET/POST/PATCH/DELETE /api/habits` and `/api/habit-logs`

**Task:** [Tasks.md](Tasks.md) → Phase 3 → Habits → "`GET/POST/PATCH/DELETE /api/habits` —
manage user-defined habits, including `type`." and "`GET/POST/PATCH/DELETE /api/habit-logs` —
record a value appropriate to the habit's type; validate the value shape server-side based on
`type`."

**Delivered via branch:** `feature/3.6-habits-and-habit-logs-endpoints` (stacked on
`feature/1.5-habit-models`) — where the previous task's schema actually gets used for the first
time, the same relationship the mood-logging slice's model → endpoint pair had.

### Background / concepts

#### Two routers, one shared piece of type-aware validation logic

- `habits.ts` manages the parent resource (a user's list of habits and their `type`).
  `habitLogs.ts` manages entries against those habits, and is where the interesting new logic
  lives: **the value shape a request is allowed to submit depends on data read from a different
  table**, not on anything Zod alone can check from the request body in isolation. Zod validates
  *shape* (is `valueNumeric`, if present, actually a finite number?) but has no way to know "this
  particular request's `habitId` refers to a `NUMERIC` habit, so `valueNumeric` is the only field
  allowed to be present" — that's a database read plus a hand-written check
  (`extractTypedValue` in `habitLogs.ts`), run *after* Zod's structural validation succeeds and
  *after* the habit's ownership is confirmed, immediately before anything reaches Prisma.
- The exact rule `extractTypedValue` enforces: **exactly one** of `valueBoolean` /
  `valueNumeric` / `valueDurationMinutes` may be present in the request, and it must be the one
  matching the referenced habit's `type` — zero fields, two-or-more fields, or the "wrong" single
  field are all rejected with `400 VALIDATION_ERROR` and a message naming exactly what went
  wrong. This is the application-level half of the previous task's schema decision: the database
  can't declare "these three columns are mutually exclusive based on a different table's row" as
  a constraint, so this function is where that rule actually lives, and it's covered by nine
  dedicated tests (one per type's happy path, one per type's wrong-field rejection, plus
  no-fields, two-fields, and the duration-specific negative/fractional-minutes rejections).

#### The cross-cutting requirement: `habitId` is never trusted at face value

- This is the single most important check in `habitLogs.ts`, called out explicitly in the task
  brief as "the key defense against ID-tampering," and it's worth being precise about what it
  actually prevents: without it, a logged-in User A could submit `POST /api/habit-logs` with
  `habitId` set to a habit that actually belongs to User B (guessed, enumerated, or leaked some
  other way) — and if the server only checked "does a habit with this ID exist," User A's log
  would silently attach itself to User B's habit, corrupting B's data with A's entries.
- The fix is the same `findFirst({ where: { id, userId } })` pattern already established for
  ownership checks throughout this codebase (`moodLogs.ts`, and this task's own `habits.ts`) —
  applied here on the `POST /api/habit-logs` **create** path specifically, which is new: every
  prior use of this pattern was on `PATCH`/`DELETE` of a row the caller already owned by
  definition of "found via their own `userId`." Here, the habit being referenced is a *different*
  row than the one being created, so this is the first place in the app a foreign key from the
  request body — not the URL's `:id` — gets the same ownership check. `PATCH /api/habit-logs/:id`
  needs no equivalent re-check of `habitId`, because that field isn't editable after creation
  (see below) — the ownership check on the log itself, done once at creation time, is sufficient
  for its entire lifetime.
- Tested directly: registering two users, creating a habit as the first, and attempting to log
  against it as the second returns `404 HABIT_NOT_FOUND` (not `403` - the same "don't confirm the
  resource exists" reasoning as every other ownership check in this app) with zero rows created,
  confirmed by querying the database directly afterward rather than trusting the status code
  alone. Also manually reproduced against the real running server via `curl` with two real
  registered users, not just in the automated test.

#### Why `habitId` is immutable on a `HabitLog`, and why `type` is immutable on a `Habit`

- **`HabitLog.habitId`** isn't in `updateSchema` at all — there's no route for "move this log
  onto a different habit." Allowing it would immediately raise the same type-mismatch question
  `extractTypedValue` exists to prevent (a log's already-stored value might no longer match the
  new habit's type), for a feature nothing in the requirements calls for. Simpler to not offer it.
- **`Habit.type`** isn't in `habits.ts`'s `updateSchema` either — only `name` can be changed after
  a habit is created. This was an explicit judgment call the task brief flagged as worth making
  deliberately: once any `HabitLog` rows reference a habit, their `value*` columns were validated
  and stored *at that time* against the habit's *then-current* type. If `type` could change
  afterward, every existing log for that habit would become silently inconsistent with its new
  type — a `NUMERIC` habit retroactively turned `BOOLEAN` would leave old rows with a populated
  `value_numeric` and a `null` `value_boolean`, which nothing currently reads as invalid but which
  no longer means what the (new) type claims it should. Immutable-after-creation avoids the
  question entirely rather than trying to migrate or invalidate old logs on a type change, which
  requirements.md doesn't call for and would be a much larger feature (e.g. "what does a partial
  data migration even mean here?"). Tested directly: `PATCH /api/habits/:id` with `{ name, type }`
  in the body updates the name and silently ignores the `type` field (Zod's default behavior for
  keys absent from a schema - not an error, just dropped), confirmed by re-reading the habit
  afterward and asserting its `type` is unchanged.

#### Translating between the database's `HabitType` enum and the API's lowercase strings

- The Prisma schema's enum values are `BOOLEAN` / `NUMERIC` / `DURATION` (Prisma's own SCREAMING_
  CASE convention for generated enums). The JSON API instead accepts and returns lowercase
  `"boolean"` / `"numeric"` / `"duration"` — matching the exact casing `Tasks.md` and
  `requirements.md` already use, and reading more naturally as a TypeScript string-literal union
  on the frontend (`"boolean" | "numeric" | "duration"`) than the database's convention would.
  `backend/src/lib/habitType.ts` is the one place this translation happens (`toPrismaHabitType`
  going in, `toApiHabitType`/`serializeHabit` coming out) - every route imports from there rather
  than each hand-rolling its own mapping, so there's exactly one place to look if the mapping
  ever needs to change.

#### Why `GET /api/habit-logs` doesn't embed the parent habit's name/type in each row

- A frontend rendering a list of habit logs needs to know each log's habit's `name` (to display
  "Exercise: done" rather than a bare UUID) and `type` (to know how to format the value). This
  endpoint deliberately returns bare log rows instead of embedding that via a Prisma `include` -
  the frontend is expected to have already loaded `GET /api/habits` (needed regardless, to power
  the "log against which habit?" picker) and cross-reference by `habitId` client-side. This
  avoids sending the same habit name/type repeated on every one of that habit's log rows, at the
  cost of the frontend needing to join the two lists itself - a reasonable trade for how small
  a user's habit list is expected to stay (a handful of user-defined habits, not hundreds).

### What was done

1. **`backend/src/lib/habitType.ts` (new).** The lowercase-API ↔ uppercase-Prisma-enum
   translation helpers described above.
2. **`backend/src/routes/habits.ts` (new).** Four routes: `GET /` (list, oldest-created-first),
   `POST /` (create, `name` + `type` required), `PATCH /:id` (rename only - `type` silently
   ignored if sent), `DELETE /:id` (cascades to the habit's logs via the schema's `onDelete:
   Cascade`). Ownership enforced throughout via the established `findFirst({ where: { id,
   userId } })` → `404` pattern.
3. **`backend/src/routes/habitLogs.ts` (new).** `GET /` (list, most-recent-first),
   `POST /` (validates `habitId` ownership, then the type-aware value shape, defaults `loggedAt`
   to now or accepts an explicit backfilled value), `PATCH /:id` (value fields all optional as a
   whole - omit them entirely to only change `notes`/`loggedAt`; if any is present, validated
   against the log's already-established habit type), `DELETE /:id`.
4. **`backend/src/app.ts`.** Mounted both routers behind `requireAuth`, matching the mood-logs
   mount point's shape: `app.use("/api/habits", requireAuth, habitsRouter)` and
   `app.use("/api/habit-logs", requireAuth, habitLogsRouter)`.
5. **Tests.** `habits.test.ts` (13 tests: auth-required, create-per-type, validation rejections,
   scoped listing, rename, type-immutability, 404s for missing/foreign habits, cascading delete)
   and `habitLogs.test.ts` (21 tests: auth-required, one create-happy-path per type, one
   wrong-field-rejection per type, no-value/two-values rejections, negative/fractional-duration
   rejections, the cross-user `habitId`-tampering test, a nonexistent-`habitId` test, backfill
   defaulting, scoped listing, value+notes update, value-shape-mismatch-on-update rejection,
   notes-only update leaving the value untouched, 404s for missing/foreign logs, delete).
6. **`npm test`** — 67/67 passing (38 pre-existing, 29 new).
7. **`npm run build`** — compiled cleanly.
8. **`npx eslint .`** — clean. **`npx prettier --check .`** — clean (after one `--write` pass
   over the new files to match the project's line-wrapping conventions).
9. **Manual end-to-end verification against the compiled, running server** (`npm start`, port
   4103 - this vertical slice's own isolated port, chosen to avoid colliding with other
   concurrently-running local work), via `curl`: registered and logged in a real user, created
   one habit of each type, logged against each (boolean, numeric, and a backfilled duration
   entry with an explicit past `loggedAt`), confirmed a type-mismatched value (`valueNumeric`
   against the boolean habit) is rejected with `400`, updated a log's value and notes, deleted a
   habit and confirmed via a second `GET` that its log was gone too (the cascade, exercised for
   real, not just inferred from the schema). Registered a second real user and confirmed,
   against the live server, that submitting the first user's habit ID returns `404
   HABIT_NOT_FOUND` rather than succeeding. Cleaned up both manually-created test users
   afterward via `psql` and stopped the manually-started server.

### Why it's needed

This is the point the habit-logging vertical slice's storage layer (previous task) becomes a
real, usable API - the same significance the mood-logs endpoint task had for that slice. It also
delivers the phase's explicitly-called-out ID-tampering defense for habits specifically, and is
the first endpoint in the app where a request body's foreign key (not just its own URL `:id`)
needs its own ownership check.

### Decisions

- **Value shape as three exclusive optional fields, not a single polymorphic `value` field
  in the request body.** Chosen to mirror the database's three-nullable-columns representation
  exactly (see the previous task's entry) - the request body's shape and the stored row's shape
  are the same, so there's no separate "how does the wire format map onto the columns" mapping
  to get wrong, on top of the type-validation logic that already has to exist.
- **`type` immutable on `Habit`, `habitId` immutable on `HabitLog`.** Both covered in detail
  above - chosen to sidestep data-integrity questions requirements.md doesn't ask this task to
  solve.
- **Lowercase `type` strings in the JSON API, translated from Prisma's SCREAMING_CASE enum.**
  Covered above - an explicit choice to prioritize how the API reads for a frontend consumer over
  minimizing internal translation code.
- **`GET /api/habit-logs` returns bare rows, no embedded habit name/type.** Covered above - the
  frontend is expected to already have `GET /api/habits` loaded and join client-side.
- **Not building the centralized error-handling middleware or the shared `symptom_id`/
  `medication_id`/`habit_id` cross-cutting Tasks.md checklist item in this task.** Same reasoning
  as the mood-logs endpoint entry: this task's own error responses match the established
  `{ error: { message, code } }` shape by hand, and the *centralized* version - plus confirming
  the equivalent check exists for symptoms/medications, which this vertical slice doesn't touch -
  is left to whichever task actually closes out that phase-wide checklist item, since those other
  log types are out of this slice's scope entirely (built independently, per the task brief).

### State at end of this step

A real, working, tested, auth-protected, type-validating CRUD API for habits and habit logs
exists locally, including the ID-tampering defense the phase specifically calls for. Nothing on
the frontend calls it yet - that's the next task, stacked on this branch.

### Verification

- `npm test` (`vitest run`) — 67/67 passing (38 pre-existing, 29 new).
- `npm run build` — compiled cleanly.
- `npx eslint .` / `npx prettier --check .` — both clean.
- Manual `curl` round-trip against the compiled, running server: created one habit per type,
  logged against each, rejected a type-mismatched value, updated and deleted logs/habits
  (confirming the cascade), and confirmed the cross-user `habitId`-tampering defense with two
  real registered users - not just in the automated test suite.

---

## 2026-08-16 — Phase 7: Habit entry form, wired into the Dashboard

**Task:** [Tasks.md](Tasks.md) → Phase 7 → "Habit entry form: input control adapts to habit
type (toggle for boolean, number input for numeric, duration input for duration), date/time
picker."

**Delivered via branch:** `feature/7.4-habit-entry-form` (stacked on
`feature/3.6-habits-and-habit-logs-endpoints`) — the last piece of the habit-logging vertical
slice, where the model and endpoint built in the previous two tasks finally become something a
real person can see and use, the same significance the mood entry form task had for that slice.

### Background / concepts

#### The one real UX problem this task has that mood logging never did: you can't log a habit that doesn't exist yet

- Mood logging has no setup step — every user can immediately record a mood the moment they
  land on the Dashboard. Habits are different: `requirements.md` §6.4 and this task's own brief
  are explicit that a habit is user-defined first, then logged against — so the very first time
  a new user clicks `+ Habit`, there is nothing yet to log against. This is the actual design
  problem this task's UI has to solve that the mood form's simpler "always ready to log" case
  never faced.
- The solution built here is a small state machine on `DashboardPage`, not inside either form
  component: `habitFormMode: "closed" | "log" | "create-habit"`. Clicking `+ Habit` checks
  `habits.length` and picks `"create-habit"` (no habits yet) or `"log"` (at least one exists)
  — the same button does either thing depending on what's actually possible right now, rather
  than the user needing to discover a separate "manage habits" screen before they can use the
  headline feature at all.
- Once `HabitCreateForm` succeeds, its new habit is appended to `habits` state *and* the
  Dashboard immediately switches to `"log"` mode with that new habit pre-selected
  (`habitToPreselect`) — so "define a habit" chains straight into "log against it" in one
  continuous flow, rather than dropping the user back at an empty screen to click `+ Habit` a
  second time. This chaining is what makes the empty-state genuinely usable end to end, not just
  technically unblocked.
- A second, smaller path into the same create flow: a "+ Add a new habit" link inside
  `HabitEntryForm` itself, for a user who already has habits but wants to define one more without
  backing out of the log form first. Both paths land on the exact same `HabitCreateForm`
  component — there's only one way habits actually get created, just two entry points into it.

#### Why the habit type's input control is three genuinely different components, not one form field that adapts its `type` attribute

- A boolean habit needs a binary choice (rendered as the same `role="radiogroup"`/`role="radio"`
  Yes/No buttons `MoodEntryForm` already established for its rating rows - reused for
  accessibility consistency, not reinvented). A numeric habit needs a free-form number (`<input
  type="number" step="any">`, allowing decimals - water intake in liters, for instance, isn't
  always a whole number). A duration habit also uses `<input type="number">`, but constrained to
  non-negative integers only (`min={0} step={1}`) - **minutes, not a separate hours/minutes
  picker**, the simplest reasonable choice for "how long," matching the backend's own
  `valueDurationMinutes` column and avoiding a genuinely more complex custom duration-picker
  widget the requirements don't call for.
- All three are conditionally rendered based on `selectedHabit.type`, and switching the habit
  picker's `<select>` resets every value field back to empty - without that reset, picking a
  different habit after starting to type a numeric value could otherwise submit a stale value
  against the wrong habit's now-different control.
- Client-side validation mirrors the backend's `extractTypedValue` logic from the previous task
  almost exactly (a boolean choice is required, a numeric value must parse to a finite number, a
  duration must be a non-negative integer) - deliberately duplicated rather than shared, since
  one is browser-side UX (fail fast, no round trip) and the other is the actual server-side
  source of truth that can't be bypassed by a modified client; the server still re-validates
  independently regardless of what the form already checked.

#### Extracting `toDateTimeLocalValue` into a shared module

- `MoodEntryForm.tsx` already had a private helper converting a `Date` into the exact string
  format `<input type="datetime-local">` expects (documented in that task's own
  IMPLEMENTATION_LOG.md entry). `HabitEntryForm` needed the identical logic for its own date/time
  picker - copying it a second time would mean two places to keep in sync if the format ever
  needed to change. Moved to `frontend/src/lib/dateTimeLocal.ts` and imported by both forms
  instead; `MoodEntryForm.tsx` itself changed only to import the moved function, no behavior
  difference. This is the first shared utility module in `frontend/src/lib/` - a natural home for
  whatever the next form (symptoms/medications) will inevitably need too.

#### Why `GET /api/habit-logs`'s bare rows (no embedded habit name/type, per the previous task's decision) work fine here

- `DashboardPage` already fetches `GET /api/habits` in parallel with `GET /api/habit-logs` on
  mount (`Promise.all`, matching the loading-state shape the mood section already established)
  and builds a `Map<habitId, Habit>` (`habitsById`, via `useMemo` so it isn't rebuilt on every
  render) purely client-side. `formatHabitValue(log, habit)` then looks up each log's habit
  through that map to decide both what to label the value ("Done"/"Not done" vs. a bare number vs.
  "N min") and to display the habit's `name` instead of a bare UUID. This is exactly the
  client-side join the previous task's entry anticipated when it chose not to embed habit data in
  every log row server-side.

### What was done

1. **`frontend/src/lib/dateTimeLocal.ts` (new).** The extracted `toDateTimeLocalValue` helper,
   described above.
2. **`frontend/src/components/MoodEntryForm.tsx` (small refactor).** Now imports
   `toDateTimeLocalValue` from the new shared module instead of defining its own copy - no
   behavior change, confirmed by the existing `MoodEntryForm.test.tsx` suite still passing
   unmodified.
3. **`frontend/src/components/HabitCreateForm.tsx` (new).** Name field (`TextField`, reused as-
   is) plus a three-option type picker (Yes/No, Number, Duration, each with a one-line example
   hint), Create/Cancel buttons. Submits `POST /api/habits` and calls `onCreated(habit)`.
4. **`frontend/src/components/HabitEntryForm.tsx` (new).** Habit `<select>`, the type-adaptive
   value control described above, optional notes, a `datetime-local` field defaulting to "now"
   (same pattern as `MoodEntryForm`), a "+ Add a new habit" link, Save/Cancel. Submits `POST
   /api/habit-logs` and calls `onSaved(log)`.
5. **`frontend/src/pages/DashboardPage.tsx` (extended, not rewritten).** Added the
   `habits`/`habitLogs` state, the parallel fetch-on-mount effect, the three-mode state machine
   described above, and a second "Recent habit entries" section mirroring the mood section's
   shape (loading/error/empty states, a list with per-entry Delete using the same optimistic-
   removal-with-rollback pattern `handleDelete` already established for mood logs). The empty
   state is split into two distinct messages depending on *why* the list is empty - "you haven't
   created any habits yet" (points at the `+ Habit` button) versus "nothing logged yet" (habits
   exist, just no entries) - since those are different situations needing different guidance,
   unlike mood logging where "empty" only ever means one thing.
6. **Tests.** `HabitCreateForm.test.tsx` (4 tests: required-field validation, a full create
   round-trip asserting the exact request body, a failed-save error message, Cancel) and
   `HabitEntryForm.test.tsx` (7 tests: one happy-path submission per habit type asserting the
   exact value field sent, the corresponding rejection for each type's invalid input, switching
   habits swaps the visible value control, the "+ Add a new habit" link, Cancel).
7. **`npm test`** (frontend) — 35/35 passing (24 pre-existing, 11 new).
8. **`npm run build`** (frontend) — compiled cleanly.
9. **`npx eslint .`** — clean (one pre-existing, unrelated warning in `AuthContext.tsx`, not
   touched by this task). **`npx prettier --check .`** — clean (after one `--write` pass).
10. **Real browser verification**, per the project's UI-change testing rule. Started the actual
    compiled backend (`npm start`, port 4103) and the frontend dev server, then drove a real
    headless Chromium browser through the full flow with a throwaway Playwright script: register
    → land on Dashboard → click `+ Habit` with zero habits defined → confirm the "Create your
    first habit" empty-state form appears → create a boolean habit ("Exercise") → confirm the
    log form opens automatically with it pre-selected → log it as "Yes" with a note → confirm it
    appears in the list as "Exercise: Done" → click `+ Habit` again (now with one habit) → use
    "+ Add a new habit" to create a second, numeric habit ("Water intake") → confirm the log form
    re-opens with the *new* habit pre-selected and a numeric input control (not the boolean
    toggle) → log `2.5` → confirm both entries are listed with correctly-typed values ("Water
    intake: 2.5", most-recent-first) → delete the most recent entry → confirm exactly that one
    disappears and the other remains. Screenshots taken at each step and visually reviewed, not
    just asserted programmatically. Zero browser console errors at any point. Cleaned up the two
    browser-created test users afterward via `psql`, and had to track down and force-stop one
    orphaned `node` process left listening on port 4103 from an earlier manual-verification step
    whose background task tracking had lost it (confirmed via `Get-NetTCPConnection` and
    `Stop-Process`) before the frontend dev server was also stopped.

### Why it's needed

This closes out the habit-logging vertical slice: a real user can now define a habit of any of
the three supported types and log against it, entirely through the UI, with the same rigor
(tests, build, lint, format, and real-browser verification) every other slice in this codebase
has been held to.

### Decisions

- **A Dashboard-level state machine (`"closed" | "log" | "create-habit"`) rather than baking
  "no habits yet" handling into `HabitEntryForm` itself.** Keeps `HabitEntryForm` focused on one
  job (logging against an already-known list of habits) and `HabitCreateForm` focused on a
  different one (defining a habit) - `DashboardPage` is the one place that knows *when* each is
  appropriate, the same separation of concerns `MoodEntryForm` already has relative to
  `DashboardPage`'s mood-log fetching/list-rendering responsibilities.
- **Minutes as a plain number field for duration, not a separate hours/minutes picker.** Matches
  the backend's `valueDurationMinutes` column exactly and is the simplest control that satisfies
  "duration input for duration" - a richer picker is a plausible future enhancement but not
  something the requirements or this task ask for.
- **Client-side value validation duplicated from (not shared with) the backend's
  `extractTypedValue`.** Deliberate - one is a same-process TypeScript function callable directly
  from a route handler, the other is a separate browser-side check with a different job (fail
  fast without a network round trip) that can never be the actual source of truth regardless of
  how it's implemented.
- **Extracting `toDateTimeLocalValue` now, rather than after a third form needs it too.** Two
  real, identical copies was already enough duplication to justify the extraction - waiting for a
  third to "prove the pattern" would mean carrying a known-duplicated bug fix across two files in
  the meantime if the format logic ever needed a fix.

### State at end of this step

A real user can register or log in, land on the Dashboard, define a habit of any of the three
types (from a genuine empty state, without leaving the Dashboard), log against it with a value
appropriate to its type, see it appear immediately with the right formatting, and delete it - all
verified directly in a real browser, not just via tests. This closes out the habit-logging
vertical slice: Phase 1.5 (models) → Phase 3.6 (endpoints) → Phase 7.4 (this task) are each their
own PR, stacked in that order, and need merging in that same order once reviewed - the same shape
the mood-logging slice's own three-PR stack took.

### Verification

- `npm test` (frontend, `vitest run`) — 35/35 passing (24 pre-existing, 11 new).
- `npm run build` (frontend) — compiled cleanly.
- `npx eslint .` / `npx prettier --check .` — both clean.
- Real headless-browser walkthrough (Playwright) against the actual running backend and frontend
  dev servers: full register → empty-state → create-habit → log → create-a-second-habit → log →
  delete cycle across two different habit types, screenshots reviewed at each step, zero browser
  console errors.

---

## 2026-08-16 — Building three features at once with parallel AI agents

**Task:** Not a [Tasks.md](Tasks.md) checklist item — this entry explains a *process* decision
rather than a code change: Symptom logging, Medication logging, and Habit logging (the three
remaining log types from Phase 3/7) were each handed to a separate, independent AI agent,
running **at the same time**, rather than built one after another the way Mood logging was.
Worth explaining properly, since this is a genuinely different way of working than everything
else in this log so far, and the reasoning behind *when* it's safe is more interesting than the
mechanics.

### Background / concepts

#### Why these three specific tasks were safe to parallelize

- Not every set of tasks can be split across independent workers safely — the whole reason
  this was viable here is that **Symptom, Medication, and Habit logging have zero code
  dependency on each other.** Each is its own Prisma model(s), its own API routes, its own
  frontend form — none of them import, extend, or rely on anything the other two produce. This
  is the same "vertical slice" shape used for Mood logging, just three of them built
  simultaneously instead of one at a time.
- **Contrast this with why Mood logging's own four pieces (auth middleware → model → endpoint →
  form) were *not* parallelized.** Each of those genuinely needed the previous one's code to
  exist first — the endpoint imports the model, the form calls the endpoint. That's a *real*
  dependency chain, not just a convenient ordering, and trying to parallelize genuinely
  dependent work would just mean each worker sitting idle waiting for the others, or worse,
  building against code that doesn't exist yet. Recognizing "these are independent" versus
  "these depend on each other" is the actual judgment call that makes parallelizing safe or not
  — not something to do reflexively just because multiple tasks exist.

#### The isolation mechanism: git worktrees, explained from scratch

- Every git command so far in this project has operated on **one working copy** of the
  repository at a time — checking out a different branch changes what files are sitting on
  disk in that same one folder. That's completely fine for one person or one AI agent working
  sequentially, but it breaks immediately the moment two things try to work at once: if a
  second process checked out a different branch in that same folder while the first was
  mid-edit, they'd be corrupting each other's work by writing to the exact same files.
- **A git "worktree" solves this by giving each parallel task its own separate folder on disk,
  checked out to its own branch, while all of them still share the same underlying repository
  history** (commits, branches, tags — the actual `.git` data). Think of the normal repository
  folder as the original, and each worktree as an independent, fully-functional copy sitting
  next to it — separate files a process can freely edit without any risk of interfering with
  the original or any other worktree, but all still pushing to and pulling from the exact same
  GitHub repository underneath. This is precisely what let three agents each run their own
  `npm test`, `npm run build`, and `git commit` simultaneously without any risk of one
  overwriting another's in-progress files.
- **One real hiccup while setting this up, worth recording honestly:** the very first attempt
  to create a worktree failed outright with a git error about a "core.worktree redirect" — a
  worktree from an earlier, aborted attempt had been left in a broken, locked state
  (`git worktree list` showed it clearly once looked for). Fixed with the ordinary, undramatic
  cleanup sequence: `git worktree unlock`, `git worktree remove --force`, then deleting the
  leftover branch that attempt had created. Worth a mention mainly because it's a completely
  normal, low-stakes thing to hit when working with worktrees — not a sign anything deeper was
  wrong, just needing the same "check what's actually there before assuming" habit this log has
  applied to every other unexpected error.

#### What else had to be kept separate, beyond just files

- A worktree solves file collisions, but three agents doing real backend work also needed to
  run their own local Postgres database and their own local backend server at the same time —
  and those aren't isolated by a worktree at all, since they talk to the *outside* world
  (a database port, a network port), not just the filesystem. Each agent was explicitly given:
  - **Its own database** inside the same running Postgres container (`welltrack_symptom`,
    `welltrack_medication`, `welltrack_habit`) — so three concurrent `prisma migrate dev` runs
    couldn't collide or race against each other's migration history.
  - **Its own backend port** (4101/4102/4103) — so three concurrently-running `npm start`
    processes couldn't fight over the same port.
  - Its own `.env` files with real secrets (worktrees don't share gitignored files any more
    than they share tracked ones needing separate values) and its own fresh `npm install` in
    each project (worktrees don't share `node_modules` either).

#### What was deliberately *not* isolated, and why that's fine

- All three agents still shared several files that describe the *whole* app rather than one
  slice of it: `backend/prisma/schema.prisma`, `backend/src/app.ts` (where each new router gets
  mounted), `frontend/src/pages/DashboardPage.tsx` (where each new "+ X" button and list gets
  added), `Tasks.md`, and this log. There was no way to avoid this — three independent features
  genuinely do all need to register themselves in the same handful of central files.
- **This was an accepted, expected trade-off, not an oversight.** Each agent branched from and
  built against `main` independently, meaning their edits to those shared files can't
  auto-merge cleanly against each other — normal, expected git conflicts were anticipated when
  their PRs came in, to be resolved by hand the same way every other multi-branch conflict in
  this log has been (the earlier "why deleting a merged branch is safe" and stacked-PR entries
  cover that exact skill). Parallelizing the *thinking and typing* was the goal; parallelizing
  the final merge into one shared `main` was never going to be possible, nor was it attempted.

### Why it's needed

Three independent, same-shaped features that would otherwise have taken three sequential rounds
of the same back-and-forth (build → verify → document → PR → review) instead happened at the
same time, with no reduction in the rigor applied to any one of them — each slice still got its
own full build/test/lint/format verification, real browser and `curl` checks, and complete
teaching-style log entries, exactly as if it had been built alone.

### Decisions

- **Parallelized only because the three tasks were genuinely independent** — the judgment call
  described above, not a default. A future set of tasks with real dependencies between them
  should go back to the sequential, stacked-branch approach already used successfully for Mood
  logging and the auth flow.
- **Isolated everything that could collide silently (files, database, network port) and
  accepted the conflicts that couldn't be avoided (shared central files)**, rather than trying
  to prevent every possible conflict — the second kind is cheap to resolve by hand at merge
  time; the first kind (a genuinely corrupted file, a migration race, two processes fighting
  over one port) would have been much harder to untangle after the fact.

### State at end of this step

The Symptom logging slice (one of the three) is complete, reviewed, and merged — three clean
PRs, each built and verified with the same rigor as any sequentially-built task in this log.
Medication logging and Habit logging were still running at the time this entry was written;
this entry describes the *approach*, independent of any one slice's specific outcome.

### Verification

- The Symptom logging slice's own three PRs (models/migration, endpoints, frontend form) each
  passed their full build/test/lint/format checks and real-environment verification
  independently, and merged cleanly in the correct order — concrete evidence the isolation
  approach worked, not just a theoretical description of intent.

---

## 2026-08-16 — A real account lockout, a manual database recovery, and why "forgot password" specifically needs email

**Task:** Not a [Tasks.md](Tasks.md) checklist item — a real user of the live app changed their
password via the new Settings page, then couldn't log back in with it. With no self-service
recovery path built yet (forgot-password is still on the checklist, unbuilt), the only way back
in was a direct, manual database edit. Worth documenting both the recovery itself and, properly
this time, exactly why the *real* fix for this situation is a bigger piece of work than it might
first appear.

### Background / concepts

#### The manual recovery: writing a password hash directly, not a password

- The `users` table never stores a password — only `password_hash`, and the two are not
  interchangeable. Simply running `UPDATE users SET password_hash = 'Password123' ...` would
  not have worked: the login route compares whatever a user types against this column using
  `bcrypt.compare()`, which expects the stored value to already be a bcrypt hash in bcrypt's own
  specific format (`$2b$12$...` — the algorithm version, the cost factor, then the actual hash),
  not plain text. Setting the column to literal `Password123` would make login **always fail**,
  since `bcrypt.compare("Password123", "Password123")` treats the second argument as an
  (invalid) hash to check against, not a password to match directly.
- **The fix:** generate the *hash* locally, using the exact same library and cost factor the
  app itself uses (`bcryptjs`, 12 rounds — matching `SALT_ROUNDS` in `routes/auth.ts`), then
  write that hash into the database directly:
  ```js
  const bcrypt = require("bcryptjs");
  console.log(bcrypt.hashSync("Password123", 12));
  // => $2b$12$oGwv7eT7g69M1/HrDn6H4eeMFBeCSZxuOM/ZdsMfmIYUs/vgn5gbW
  ```
  ```sql
  UPDATE users SET password_hash = '$2b$12$oGwv...' WHERE email = 'wheelyk@gmail.com';
  ```
  Run directly against the production database via Railway's Postgres **Data** tab (the same
  tool used for cleanup queries earlier in this project's deployment work) — logging in
  afterward with that known password worked immediately.
- **Why this is a "hack," worth naming plainly rather than treating as a normal feature.** This
  bypassed every layer of the app's own logic entirely — no endpoint was called, no request was
  validated, nothing was logged anywhere in the application. It only worked because whoever ran
  it already had direct administrative access to the production database (via Railway's own
  login) — which is a completely different, much stronger form of proof than "this person knows
  the account's email," the level of proof `forgot-password` will eventually need to work with
  for anyone who isn't a project administrator with database access.

#### What "forgot password" actually requires, and why it can't be built the same way `change-password` was

- `change-password` (built two entries ago) proves identity using something the user already
  has: their *current* password. `forgot-password` starts from the opposite situation — the
  user doesn't have a working password at all, which is the entire reason the feature needs to
  exist. Something else has to stand in as proof of identity instead.
- **The standard answer: prove control of the email address on file**, via a one-time,
  time-limited link. Concretely, the pattern (not yet built) looks like:
  1. `POST /api/auth/forgot-password` — given an email, generate a random, unguessable token,
     store it (or encode it as a short-lived signed JWT, similar to the access/refresh tokens
     already in this app — either is a defensible choice), and email the user a link containing
     it (e.g. `https://wellbeing-blue.vercel.app/reset-password?token=...`).
  2. `POST /api/auth/reset-password` — given that token and a new password, verify the token is
     genuine and not expired, then update `password_hash` exactly the way the manual recovery
     above did by hand, just driven by a real request instead of a person with database access.
  3. **Critically, this endpoint must respond identically whether or not the email actually
     matches an account** — the same "don't leak which case it is" principle already applied to
     login's `INVALID_CREDENTIALS` and the symptom/mood-log ownership checks. Confirming
     "yes, that email has an account here" to an anonymous caller is itself a small privacy leak
     for a health app specifically.
- **Why this genuinely cannot work without a real email-sending service**, restated plainly
  since it's the actual blocker: step 1 has to deliver a real email to an inbox this project's
  backend doesn't control. A personal email account (Gmail, etc.) can't be wired up to send
  these automatically and reliably — mainstream mail providers actively restrict and often
  block automated sending through personal accounts specifically because it's indistinguishable
  from spam at scale, and even where technically possible, a personal account's sending
  reputation isn't built for it. This is exactly what **transactional email providers** exist to
  solve (Resend, Postmark, SendGrid, AWS SES, and others) — services built specifically to send
  automated, one-to-one emails (password resets, receipts, confirmations) reliably and land in
  the inbox rather than spam, each requiring its own account, API key, and — for anything beyond
  a small free tier or a sandbox/testing mode — a verified sending domain.
- **What actually needs deciding before this can be built**, not just coded: which provider, a
  free-tier-suitable choice for an app this size, and where its API key gets stored (a new
  Railway environment variable, following exactly the same pattern `JWT_ACCESS_SECRET` and the
  database credentials already use). None of that is a coding decision — it's a product/infra
  decision this log has deliberately left open rather than picking unilaterally, the same way
  the Railway/Vercel hosting choice was made together earlier in this project rather than
  assumed.

### Why it's needed

This wasn't a hypothetical gap — it was a real user, locked out of the real app, with the only
way back in being a manual intervention only someone with direct production database access
could perform. That is precisely the situation `forgot-password` exists to make self-service.

### Decisions

- **Fixed the immediate lockout with a direct, manual database write** rather than rushing a
  half-built reset flow — the right call for an urgent, one-off situation, but explicitly not a
  substitute for the real feature, and not something that scales past "the one person who
  already has database access."
- **Generated the replacement hash locally with the app's own hashing library and cost
  factor**, rather than approximating it by hand, so the recovered account's password is stored
  exactly as if it had gone through a normal `register`/`change-password` call.
- **Left the email-provider choice as an open decision**, not picked automatically — a step that
  costs real money or account setup beyond a free tier eventually, and ties this app to a
  specific third party, both worth a deliberate choice rather than defaulting to whichever
  provider happened to be mentioned first.

### State at end of this step

The locked-out account is recovered and working again with a known temporary password.
`forgot-password`/`reset-password` remain unbuilt, tracked in `Tasks.md` (Phase 2) as before —
this entry adds the *reasoning* for why they need a real email provider, as context for
whenever that decision gets made.

### Verification

- The generated bcrypt hash was verified locally (`bcrypt.compareSync("Password123", hash) ===
  true`) before being written to production, so the recovery's correctness was confirmed before
  the user ever attempted to log in with it — not discovered by trial and error against the
  live account.
- Confirmed directly by the user successfully logging back in with the temporary password
  after running the `UPDATE` in Railway's Data tab.

---

## 2026-08-16 — Turning on "automatically delete head branches," so this stops happening

**Task:** Not a [Tasks.md](Tasks.md) checklist item — the exact stranded-PR bug (a merged PR
whose base branch survives, so the *next* PR in the stack never gets retargeted to `main`) had
now happened twice in this project. Rather than relying purely on remembering to delete each
branch by hand after every merge, GitHub has a repository setting that does it automatically.

### Background / concepts

#### What was actually turned on, and how

- **Settings → General → Pull Requests → "Automatically delete head branches"** in the GitHub
  UI — or, exactly equivalently, `gh repo edit wheelyk/Wellbeing --delete-branch-on-merge` from
  the command line, which is what was actually run here. Confirmed directly afterward (not just
  assumed from the command exiting successfully) via `gh api repos/wheelyk/Wellbeing --jq
  '.delete_branch_on_merge'`, which returned `true`.
- **What it actually does:** the instant a PR is merged through GitHub (the button in the PR's
  UI, or `gh pr merge`), GitHub deletes that PR's head branch itself, automatically, with no
  further action needed. This is the exact manual step ("delete each branch after it merges")
  that's been repeated as advice several times in this log — now enforced by the platform
  itself rather than depending on a person remembering to click the extra button or run the
  extra command every single time.
- **Why this directly prevents the bug that keeps recurring.** The earlier "why deleting a
  merged branch is safe" entry already explained the mechanism: GitHub's stacked-PR
  auto-retargeting is specifically triggered by the base branch's *deletion*, not by the merge
  itself. A branch that merges but is left alive still looks, to GitHub, like a valid, ongoing
  place the next PR in a stack is based on — nothing tells it "this is done, move on" except the
  branch actually disappearing. With this setting on, that disappearance now happens
  unconditionally, every time, without needing to be remembered.

#### The one real downside, and why it's smaller than it sounds

- **If a branch is deleted the moment its PR merges, it's gone — there's no "let me quickly
  check that branch again" a few minutes later without recreating it.** This is the concern
  worth naming plainly, and it's real in the sense that the *convenience* of an existing branch
  name pointing at that exact spot is gone.
- **But nothing about the actual work is at risk.** The "why deleting a merged branch is safe"
  entry covers this in depth: a branch is just a movable label pointing at a commit, not a
  container that owns it. Once merged, every commit that branch ever held is permanently part
  of `main`'s history — reachable by `git log`, `git blame`, `git checkout <commit-sha>`, or
  simply recreating a branch with the same name pointing at the same commit
  (`git checkout -b old-name <sha>`) if the name itself is genuinely missed. What's lost is a
  label of convenience, not the code.

#### Smaller, genuinely worth-naming disadvantages beyond that one

- **This only affects merges from now on — it does nothing retroactively.** Branches that were
  already stranded before this setting was turned on (exactly the two recovered earlier today)
  still needed the same manual `git merge-base --is-ancestor` / cherry-pick recovery process;
  turning this on doesn't reach into the past and fix history that already happened.
- **Local clones can end up with stale remote-tracking references.** When a branch is deleted
  on GitHub, anyone who already had it fetched locally will still see `origin/<branch-name>` in
  `git branch -r` until they run `git fetch --prune` (or `git fetch -p`), which clears out
  local references to branches that no longer exist on the remote. Harmless — those stale
  references don't cause incorrect behavior, they're just clutter — but worth knowing the
  command for, rather than being confused by a locally-visible branch that's actually gone.
- **If this project ever switched to "squash and merge" or "rebase and merge"** (it hasn't —
  every merge so far has been an ordinary merge commit, preserving each branch's individual
  commits), the deleted branch's *exact original commits* would only be reachable through the
  new squashed/rebased commit(s) on `main`, not as themselves. Not a real concern under this
  project's current merge strategy, but worth knowing as a reason some teams intentionally keep
  branches around longer when using those other strategies specifically.

### Why it's needed

The exact same bug — a merged PR whose base branch survived, silently breaking the next PR in
its stack — had now been hit and manually recovered from **twice** in this project. Turning the
recurring manual fix into an automatic platform setting is a direct, permanent response to a
problem that had already proven itself likely to happen again otherwise.

### Decisions

- **Enabled repository-wide, not applied selectively.** There's no meaningful case for wanting
  a merged branch to survive under this project's current workflow — every branch so far has
  existed solely to become a PR, and every PR's purpose ends once it's merged.

### State at end of this step

Every future PR merge on this repository will automatically delete its head branch — the
stacked-PR retargeting mechanism this project relies on will now fire reliably every time,
without depending on anyone remembering the extra step.

### Verification

- `gh api repos/wheelyk/Wellbeing --jq '.delete_branch_on_merge'` — confirmed `true` directly
  against the repository's actual current settings, not assumed from the `gh repo edit` command
  simply exiting without error.

---

## 2026-08-16 — Retrospective: why PRs, stacking, and parallel agents kept colliding, and what to actually do about it

**Task:** Not a [Tasks.md](Tasks.md) checklist item — a step back, after resolving the same
handful of conflict types repeatedly across the three parallel-agent vertical slices, to name
the pattern plainly and think through real structural fixes rather than just continuing to
pay the same tax by hand each time.

### Background / concepts

#### The pattern, named directly

Three distinct problems kept showing up, and they're worth telling apart because they don't
share the same fix:

1. **Stranded PRs** (the `postinstall`/PR #19 incident, then PR #45, recovered the same way
   twice) — a stacked PR's base branch survives its own merge, so GitHub never retargets the
   next PR onto `main`, and it silently merges into an orphaned branch instead. **This one is
   now actually fixed**, not just documented around: `delete_branch_on_merge` (enabled a few
   entries back) removes the human "remember to delete it" step entirely.
2. **Cascading conflicts through a stack.** Every time one PR in a chain merges, the *next*
   one needs `main` merged back into it before it can merge cleanly — normal, expected, and
   explained back in the very first stacked-PR entry. What changed today is the *volume*: three
   independent vertical slices, each its own 3-deep stack, all open at once, meant this
   happened **six separate times** in one sitting (once per link, per stack) rather than the
   occasional single occurrence it was earlier in the project.
3. **The same handful of files being the conflict every single time.** Not random — a small,
   consistent set of "hot" files: `IMPLEMENTATION_LOG.md` (every task appends to the same
   growing file — pure-append conflicts, but *guaranteed* whenever two branches are open on the
   same day), `backend/prisma/schema.prisma` (every new model touches the shared `User`
   relations block and gets appended near the end), `backend/src/app.ts` (every new router
   touches the shared import/mount blocks), and worst of all `frontend/src/pages/
   DashboardPage.tsx` (genuine multi-hunk structural conflicts mixing state, effects, handlers,
   and JSX — not just appends, real interleaved code that needed careful manual reconciliation
   each time).

#### Why this got sharply worse with parallel agents specifically, not just "more work happening"

- Sequential work (one task, branch, merge, next task) naturally keeps the window between
  "branch created" and "branch merged" small — `main` hasn't moved far by the time a PR is
  ready, so conflicts are rare and small when they happen.
- Three agents working **simultaneously**, each building a genuine 3-PR stack, inverted that:
  by the time any one slice's PRs were ready for review, `main` had already moved forward
  significantly from the *other two* slices' work landing first. The three slices never
  touched each other's actual business logic (routes, models, forms) — but they all touched
  the same small set of shared "front door" files, and elapsed time is exactly what turns
  "touches the same file" into "produces a conflict."
- **This is a genuine, honest trade-off, not a mistake to regret.** Three full vertical slices
  (new Prisma models, full CRUD APIs with ID-tampering defenses, frontend forms, all fully
  tested) landed in roughly the time sequential work would have taken for one, maybe one and a
  half. The cost was a bounded, fixable amount of conflict-resolution work paid afterward —
  worth naming plainly as the actual price of that speedup, not hidden or glossed over.

### Why it's needed

Paying the same conflict-resolution tax by hand, the same way, every time this pattern repeats
is a real, recurring cost — worth spending some effort *reducing the collision surface itself*
rather than only getting faster at resolving conflicts once they happen.

### Decisions — options considered, and what's actually recommended

- **Split `IMPLEMENTATION_LOG.md` into multiple files (highest-leverage, lowest-risk option).**
  This single file has been the *most consistent* conflict of the entire session — it conflicts
  essentially every time two branches are both open on the same day, because every task appends
  to the same growing tail. A natural split: one file per phase (or per major feature) under a
  `docs/log/` directory, with a short `IMPLEMENTATION_LOG.md` remaining at the root as an index
  linking to each. Two branches adding entries to *different* feature files would never conflict
  at all; two adding to the *same* feature file would still occasionally conflict, but far less
  often than the current single-file-forever design. **Recommended as the first thing to
  actually do** — it's a pure reorganization (no content changes), low-risk, and would have
  prevented the large majority of today's log conflicts specifically.
- **Decompose `DashboardPage.tsx` into one component per log type, each in its own file.**
  Today, adding a new log type means editing the *same* function body's state, effects,
  handlers, and JSX all at once — exactly the shape that produces multi-hunk structural
  conflicts. If each log type instead exported its own self-contained `<MoodSection />`,
  `<HabitSection />`, etc. (each owning its own state/effects/handlers internally), adding a new
  one would mean creating a new file (no conflict possible on a file that didn't exist before)
  plus one line adding it to a list in `DashboardPage.tsx` itself (a small, mechanical,
  easy-to-auto-merge addition instead of a large structural one). **Recommended as the second
  priority** — Phase 8 (the real Dashboard build-out) is going to touch this file heavily
  regardless, so this is worth doing as groundwork before that phase starts, not just as a
  conflict-avoidance measure.
- **`schema.prisma` and `app.ts` — considered, not recommended yet.** Prisma does support
  splitting a schema across multiple files (a preview feature), and `app.ts`'s router
  registration could be made more automatic (e.g. auto-discovering route modules instead of a
  hand-written import/mount per router). Both are real options, but with only seven models and
  seven routers so far, the conflicts they've produced have been small and mechanical (a few
  lines, quick to resolve) rather than genuinely costly — the added complexity of either change
  isn't clearly worth it yet at this scale. Worth revisiting if this phase's growth continues
  and these conflicts start costing more than a couple of minutes each.
- **Process discipline, regardless of any structural change:** when running multiple parallel
  stacks again, resolve and merge each stack's conflicts as soon as it's ready rather than
  letting several sit open at once — the *volume* problem (six cascade-resolutions in one
  sitting) is a direct function of how many stacks were simultaneously in flight, independent
  of any file-structure fix.

### State at end of this step

Nothing implemented yet in this entry — this is the analysis and recommendation, written down
before deciding whether/when to act on it, the same way the very first stacked-PR entry was
written *before* acting, back when that pattern was new. `delete_branch_on_merge` (already
enabled) is the one concrete fix already in place from this whole retrospective.

### Verification

N/A — this entry is analysis, not a code or configuration change.

---
