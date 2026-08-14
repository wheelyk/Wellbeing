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
