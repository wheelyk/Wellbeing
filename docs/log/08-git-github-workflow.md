# Git & GitHub Workflow (branches, PRs, subagents)

## 2026-08-15 — Tooling: stacked PRs, auto-retargeting, and rebasing (#7 → #8 → #9)

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — explains the branch/PR shape that
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

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — closes a gap the user noticed: GitHub
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

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the user asked "where are we, is
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

## 2026-08-15 — Debugging a broken image delivery, then automating PR screenshots via CI

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — two related pieces: (1) diagnosing why
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

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — refines the CI screenshot workflow per
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

## 2026-08-15 — The real bug: `postinstall` never reached `main` at all (a stacked-PR gotcha), plus a more robust fix

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — Railway's rebuild failed with the
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

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — after PR #20 was confirmed merged, the
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

## 2026-08-15 — Why deleting a merged branch is safe (and why keeping it around actively causes bugs here)

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — while resolving a real merge conflict
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

## 2026-08-16 — The exact stranded-PR bug happened again, on PR #45 — recovered the same way

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — while resolving a routine-looking merge
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

## 2026-08-16 — Building three features at once with parallel AI agents

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — this entry explains a *process* decision
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

## 2026-08-16 — Turning on "automatically delete head branches," so this stops happening

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — the exact stranded-PR bug (a merged PR
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

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a step back, after resolving the same
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
enabled) is the one concrete fix already in place from this whole retrospective. **Update:**
the top recommendation (splitting this log) was acted on immediately after — see the next
entry for how, and confirmed working the very next time a conflict on this exact chain needed
resolving.

### Verification

N/A — this entry is analysis, not a code or configuration change.

---

## 2026-08-16 — Actually splitting `IMPLEMENTATION_LOG.md` into topic files

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — acting on the previous entry's
top recommendation, immediately, after this exact log file caused its *fourth* conflict on
one PR chain in a single session.

### Background / concepts

#### The approach: split mechanically, verify by direct comparison, then fix what breaks

- The risk with reorganizing a single 8,300-line file by hand is obvious: copy-paste a
  boundary wrong, and an entry silently vanishes or gets duplicated, in a document whose whole
  purpose is being a trustworthy record. So this wasn't done by hand — a small script read
  every `## <date> — <title>` heading's exact line number (using the same `grep -n "^## "`
  approach already used throughout this project to inspect the file), sliced the file into
  chunks at those boundaries, and grouped the chunks into ten topic files.
- **Verified by literal string comparison, not by eye.** After slicing, a second script
  reassembled every chunk *in its original order* (ignoring the new topic groupings) and
  compared that reconstruction against the original file's content character-for-character.
  The first attempt reported a difference — investigated directly with `diff` rather than
  assumed to be a bug in the splitting logic, and turned out to be a single missing trailing
  newline at the very end of the file (the original had none; the reconstruction, built with
  `Array.join("\n")`, added one). A real difference, but a meaningless one — confirmed by
  reading what `diff` actually reported, not by hoping the one-character mismatch didn't
  matter. Every line of actual entry content was confirmed present, in the right file, with
  nothing lost or duplicated, *before* the original single file was replaced with anything.
- **A real bug caught by this process, not just risk avoided in the abstract:** the first
  pass left every new topic file starting with a doubled blank line after its `# Title`
  heading — cosmetic, not data loss, but still a mistake worth fixing rather than shipping,
  found by actually reading the output rather than trusting the script ran correctly.

#### The part that would have broken silently: relative links

- Several entries link to `Tasks.md` and `README.md` using a relative path (`[Tasks.md]
  (Tasks.md)`) that was correct when the log lived at the repository root — but every entry
  just moved two directories deeper, into `docs/log/`. A relative link that used to mean "the
  same folder" now means `docs/log/Tasks.md`, a file that doesn't exist. This is exactly the
  kind of break that's invisible until someone actually clicks the link — grepped for every
  `].(...\.md...)` pattern across the new files first, confirmed only `Tasks.md` and
  `README.md` were affected (any mention of `IMPLEMENTATION_LOG.md` itself turned out to
  always be plain backtick-quoted text, never an actual hyperlink, so nothing needed fixing
  there), then rewrote just those two link targets to `../../Tasks.md` and `../../README.md`
  across every affected file in one pass.
- **Links pointing *into* the log from elsewhere needed no change at all.** `README.md`,
  `Tasks.md`, `CLAUDE.md`, and a few backend/frontend source comments all link to
  `IMPLEMENTATION_LOG.md` — and since that file still exists at the repository root (now as
  an index instead of the full log), every one of those links still resolves correctly,
  landing the reader on the index, which then links onward to the right topic file. Nothing
  outside the log itself needed to change.

#### Why headlines are listed as plain text, not individually clickable

- The new root `IMPLEMENTATION_LOG.md` links to each topic file and lists every entry's
  headline underneath it, so someone can scan what exists without opening ten files one at a
  time. Each *headline* isn't its own clickable link to that exact spot in the target file,
  though — GitHub (and other Markdown renderers) auto-generate heading anchors using their own
  slug rules (lowercasing, stripping punctuation, handling duplicates), and precisely
  replicating that algorithm by hand for headlines full of backticks, em dashes, and quotation
  marks is exactly the kind of fragile, easy-to-get-subtly-wrong text-processing that produces
  dead links nobody notices until they click one. A file-level link plus a plain-text preview
  list gets the real value (browse without opening everything, click through to read more)
  without betting on correctly guessing a third party's slug algorithm.

### What was done

1. Wrote a script to slice the original `IMPLEMENTATION_LOG.md` at every entry heading and
   group the pieces into ten topic files under `docs/log/`: project setup & tooling, auth
   (backend), auth (frontend), and one file per log type (mood, symptom, medication, habit),
   plus deployment, git/GitHub workflow, and housekeeping.
2. Verified the split was lossless via direct string reconstruction and comparison against
   the original, before deleting anything.
3. Fixed the resulting doubled-blank-line cosmetic issue and the broken relative links
   described above.
4. Rewrote the root `IMPLEMENTATION_LOG.md` as a short, evergreen index: the existing "what
   this document is" and "big picture" sections stay, followed by a new "how this log is
   organized" section explaining the split (written the same beginner-facing way as
   everything else in this document — future readers deserve to know *why* the structure
   changed, not just find it changed), followed by one section per topic file, each a link
   plus its entries' headlines listed underneath.
5. Confirmed both projects still build cleanly (`npm run build` in each) — a docs-only
   change, but checked directly rather than assumed safe.

### Why it's needed

Directly and immediately: this exact log file had just caused four separate conflicts on one
PR chain (#47, #48, #51, and this PR itself) in a single session, each requiring the same
manual reconstruction-and-merge process. Splitting it doesn't make conflicts impossible, but
it makes the overwhelmingly common case — two branches working on *different* things on the
same day — stop colliding at all.

### Decisions

- **File-level links with plain-text headline previews, not per-headline anchor links** —
  covered above; correctness and robustness over a marginally nicer click target.
- **Grouped by topic/feature, not by date-chunk.** A pure chronological split (e.g. "entries
  1–20," "entries 21–40") would have been simpler to script but wouldn't reduce conflicts
  nearly as well — two branches both landing in "the current chunk" would still collide. A
  topic split means two branches touching *different* features essentially never conflict on
  this file again, which is the actual problem being solved.

### State at end of this step

`IMPLEMENTATION_LOG.md` is now a short index; the full history lives in `docs/log/*.md`,
organized by topic. All 62 existing entries accounted for, verified present exactly once each,
in the correct file, with working links throughout.

### Verification

- Scripted reconstruction of the original file from the split pieces, compared
  character-for-character against the source — one meaningless trailing-newline difference,
  confirmed via `diff` rather than assumed.
- Per-file entry counts (`grep -c "^## 2026-"` in each topic file) summed back to exactly 62,
  matching the original file's total entry count.
- Grepped every relative Markdown link across the new files to confirm none pointed at a
  now-incorrect path after the move.
- `npm run build` in both `backend` and `frontend` — clean, confirming this docs-only change
  didn't somehow affect application code.

---

## 2026-08-17 — Decomposing `DashboardPage.tsx` into one section component per log type

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — acting on the retrospective's
*second* recommendation (the log split above was the first): `DashboardPage.tsx` was named as
the worst single conflict source of the whole parallel-agent session, and this splits it apart
before Phase 8's real Dashboard build-out starts touching it even more.

### Background / concepts

#### Why one file per log type, specifically, is the fix

- The retrospective diagnosed *why* `DashboardPage.tsx` conflicted so badly: every log type's
  state (`useState`), data loading (`useEffect`), event handlers, and JSX all lived inside the
  same single `DashboardPage()` function body. Adding a fifth log type (say, a future "sleep"
  tracker) would mean editing that same function in four or five different places at once —
  exactly the shape of edit that produces a real, multi-hunk structural conflict when another
  branch is doing the same thing to the same function around the same time, as opposed to a
  clean append.
- **The fix is a standard React pattern: extraction into self-contained components.** Each log
  type (Mood, Habit, Medication, Symptom) now gets its own component file under
  `frontend/src/components/dashboard/` — `MoodSection.tsx`, `HabitSection.tsx`, etc. — each one
  owning *all* of that log type's state, data-fetching effect, and handlers internally, and
  rendering its own complete UI (both the "+ X" button/form and the "Recent X entries" list).
  `DashboardPage.tsx` itself shrinks down to just the shared welcome header plus a list of
  `<MoodSection />`, `<HabitSection />`, etc. — a thin **composition layer** with almost nothing
  left in it to conflict over.
- **Why this actually reduces conflicts, concretely:** a future fifth log type now means
  *creating a new file* (`SleepSection.tsx`) — which can never conflict with anything, since no
  other branch can simultaneously be creating a file with that exact name and content — plus
  adding one import line and one `<SleepSection />` line to `DashboardPage.tsx`. Two branches
  each adding a different new section would still each touch `DashboardPage.tsx`, but as two
  independent one-line-each additions near the same spot, which git resolves automatically far
  more often than it can with genuinely interleaved logic.

### What was done

1. Read the original `DashboardPage.tsx` (500 lines) in full to identify exactly which state,
   effect, and handlers belonged to each of the four log types.
2. Created four new components under `frontend/src/components/dashboard/`: `MoodSection.tsx`,
   `HabitSection.tsx`, `MedicationSection.tsx`, `SymptomSection.tsx` — each a direct, behavior-
   preserving extraction of that log type's slice of the original file (its own `useState`
   calls, its own `useEffect` fetch, its own save/delete handlers, its own JSX for both the
   entry-form toggle and the recent-entries list).
3. Rewrote `DashboardPage.tsx` down to roughly 25 lines: the shared welcome header plus the four
   section components rendered in sequence. No log-type-specific logic remains in it at all.
4. Added a dedicated test file per new section (`MoodSection.test.tsx`, `HabitSection.test.tsx`,
   `MedicationSection.test.tsx`, `SymptomSection.test.tsx`), each covering the loading state, the
   empty state, the error state, and rendering a fetched entry — genuinely new coverage, since
   this logic previously lived inline in `DashboardPage.tsx`, which had no test file of its own
   at all.
5. Ran the full frontend test suite and hit five failures, all `TypeError: Cannot read
   properties of null (reading 'length')`, every one inside a section that fetches two things at
   once via `Promise.all` (Habit, Medication, Symptom — Mood only fires a single fetch and was
   unaffected). Diagnosed and fixed — see the dedicated explanation below.
6. Ran `npm run build`, `npm run lint`, and `npx prettier --check .` — all clean after the test
   fix and one formatting pass (`prettier --write` on the three files it flagged).
7. **Verified in a real browser**, not just via the mocked test suite (per this project's
   build-and-run-first habit): started Postgres, the backend, and the frontend dev server for
   real, registered a fresh throwaway user via Playwright, and drove the actual UI flow —
   logged one real entry of each of the four types (mood, a newly-created habit, a newly-created
   medication, a symptom picked from the seeded system list) — then screenshotted the resulting
   dashboard. All four sections rendered correctly, in the same order and style as before the
   decomposition, with zero browser console errors logged during the entire flow.

### A real test-only bug, found and fixed: reusing one mocked `Response` across two `fetch` calls

- Each of the three `Promise.all`-based sections' tests originally mocked `fetch` with
  `vi.fn().mockResolvedValue(jsonResponse(200, []))` — `mockResolvedValue` (not
  `mockImplementation`) configures the mock to resolve to the **exact same** `Response` object
  instance on every call, no matter how many times the mock is invoked.
- **Why that broke specifically here and not elsewhere in this project:** a `Response` object's
  body can only be read *once* — calling `.json()` on it a second time throws, because the
  underlying stream has already been consumed. Every earlier component in this project only ever
  fires one `fetch` call per load, so this was never an issue before. `HabitSection`,
  `MedicationSection`, and `SymptomSection` all fire *two* simultaneous `fetch` calls via
  `Promise.all` (e.g. medications + medication-logs together, so the log list can resolve each
  log's medication name without a loading flicker) — and with the mock returning the same
  instance both times, the second `.json()` call hit an already-consumed body.
- **Why the failure showed up as `null`, not a thrown error, at first glance.** This project's
  shared `apiFetch` helper wraps its `.json()` call in `.catch(() => null)`, specifically so a
  malformed or empty response body doesn't crash the whole app — a reasonable defensive choice
  in general, but it meant the real cause (a consumed stream throwing inside `.json()`) was
  silently swallowed and turned into a plain `null` return value instead of a visible error.
  The actual crash only surfaced one layer up, where the component called `.length` on what it
  assumed would always be an array.
- **The fix:** switched the affected tests from `.mockResolvedValue(...)` to
  `.mockImplementation(() => Promise.resolve(jsonResponse(...)))` — `mockImplementation` runs
  the given function fresh on *every* call, so each of the two simultaneous `fetch` calls gets
  its own brand-new `Response` object with its own independently-readable body.
- **The general lesson, worth remembering for any future component that fetches more than one
  thing at once:** `mockResolvedValue`/`mockReturnValue` share one fixed value across every
  call; `mockImplementation` (or `.mockResolvedValueOnce()` chained per call) produces a fresh
  value each time. The two are interchangeable for a mock that's only ever called once, and
  silently *not* interchangeable the moment a component starts calling it concurrently — worth
  defaulting to `mockImplementation` for any endpoint a component might call more than once in
  the same render, rather than only reaching for it after hitting this exact bug again.

### Why it's needed

`DashboardPage.tsx` was named directly in the retrospective as the single worst conflict source
of the whole parallel-agent session — every one of PR #46's and PR #53's conflicts came from
this exact file, and Phase 8 (the real Dashboard build-out, still ahead) was only ever going to
make that worse by adding more to the same function. Splitting it now, before that phase starts,
means Phase 8's work lands in new or narrowly-scoped files instead of deepening the same
structural problem.

### Decisions

- **One component per log type, not one component for "all logging sections" together.** A
  single combined component would still have the same interleaved-logic problem this change is
  meant to solve, just moved one file over. Separate files per log type is what actually gives
  each type its own independent, non-conflicting surface area.
- **Each section owns its own data fetching, rather than `DashboardPage` fetching everything
  once and passing it down as props.** This does mean four independent network round-trips on
  page load instead of one combined one — a real, deliberate tradeoff of a little request
  overhead in exchange for genuine independence: a future new section needs zero changes to any
  existing section's code or `DashboardPage`'s props, since it manages its own data end to end.
- **Added test files for the new sections now, rather than waiting for Phase 13.** This mirrors
  the project's standing testing rule (light tests alongside any new testable logic, not held
  back for the dedicated test-focused phase) — and this logic was previously *only* covered
  implicitly, inline in an untested page component, so extracting it was a natural moment to add
  real coverage for it for the first time.
- **Verified with a real browser flow, not just the (now-passing) mocked test suite,** since a
  decomposition this size is exactly the kind of change where "the mocks all pass" can still
  hide a real integration break (a prop mismatch, a missing import, a form that silently doesn't
  wire up to its parent) that only shows up when the actual pieces run together against a real
  backend.

### State at end of this step

`DashboardPage.tsx` is now roughly 25 lines, purely composing four independent section
components. Each log type's logic lives in its own file under
`frontend/src/components/dashboard/`, each with its own dedicated tests. All 62 frontend tests
pass, the build is clean, lint is clean, and a real end-to-end browser flow logging one entry of
each type confirmed the decomposition preserved behavior exactly.

### Verification

- `npm run build` (frontend) — clean.
- `npm run lint` (frontend) — clean (one pre-existing, unrelated `AuthContext.tsx` warning).
- `npx prettier --check .` — clean, after fixing the three files it initially flagged.
- `npm test` (frontend) — all 62 tests passing, including four new section test files, after
  fixing the `Promise.all`/mock-reuse bug described above.
- **Real browser verification**, driven with Playwright against genuinely running Postgres,
  backend, and frontend dev servers: registered a fresh user, logged one real entry of each of
  the four types (including creating a brand-new habit and a brand-new medication inline, the
  same first-time-user path a real user would hit), and screenshotted the resulting dashboard —
  all four sections rendered correctly, in the original order and styling, with zero console
  errors during the entire flow.

---
