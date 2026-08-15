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
