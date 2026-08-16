# Project Setup & Tooling

## 2026-08-14 — Phase 0: Initialize the git repository and folder layout

**Task:** [Tasks.md](../../Tasks.md) → Phase 0 → "Initialize a git repository and monorepo
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
3. Wrote [README.md](../../README.md) explaining the monorepo layout and the local dev steps
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

**Task:** [Tasks.md](../../Tasks.md) → Phase 0 → "Scaffold backend: Node.js + Express +
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
[Tasks.md](../../Tasks.md) (register, login, save a symptom log, fetch the dashboard, etc.) is
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

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item directly — this is the "get the code
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

Concretely, for each task from [Tasks.md](../../Tasks.md):

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

**Task:** [Tasks.md](../../Tasks.md) → Phase 0 → "Scaffold frontend: React + TypeScript project
(Vite recommended) with Tailwind CSS configured."

**Delivered via branch:** `frontend/scaffold` (see *Branch & PR* section below — this is the
first task done under the new branch-per-task workflow).

### Background / concepts

- **React** is a JavaScript library for building user interfaces out of reusable
  **components** — small, self-contained pieces of UI (e.g. a button, a mood-picker, an
  entire page) written as functions that return what should appear on screen. Almost every
  screen in [Tasks.md](../../Tasks.md) (Dashboard, History, Trends, Quick Add forms) will be one
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

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a workflow change requested partway
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

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — running Claude Code's built-in `/init`
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

**Task:** Prerequisite for [Tasks.md](../../Tasks.md) → Phase 0 → "Set up PostgreSQL locally
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

## 2026-08-16 — Phase 0: ESLint + Prettier for both projects (and an unexpected TypeScript downgrade)

**Task:** [Tasks.md](../../Tasks.md) → Phase 0 → "Set up ESLint + Prettier for both projects for
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
