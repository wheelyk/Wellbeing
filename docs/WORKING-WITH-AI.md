# Working With AI — Habits Worth Building

This project has been built almost entirely through an AI coding assistant (Claude Code) working
alongside a human directing it. That's a different skill from writing code yourself, and it has
its own good and bad habits — most of which only become visible in hindsight, after watching a
long session go well or go sideways.

This is a **living document, not a one-time writeup**. Add to it whenever something notably good
or bad happens in a session — a moment where context management, delegation, or verification
mattered. Keep entries short and concrete: what happened, why it mattered, what to do differently
(or keep doing) next time. This page collects the pattern; it isn't trying to be a complete theory
of AI collaboration, just an honest, growing record of what's actually been observed working on
this specific project.

For beginners: none of this requires understanding how the AI works internally. It's about the
same kind of judgment you'd use directing a very fast, very literal, very confident junior
engineer who has no memory between sessions unless you give it one.

---

## Managing context: `/clear` and `/compact`

An AI coding session has a limited "context window" — everything said and done in the
conversation so far. Once it fills up, older material gets automatically summarized
(**compacted**) to make room. That's a safety net, not a strategy: letting it happen by accident,
mid-task, is worse than choosing the moment yourself.

- **`/clear`** wipes the conversation and starts fresh. Use it once a unit of work is genuinely
  done and merged (a PR opened, a spike concluded) — there's no reason to keep carrying a long
  transcript of _how_ something got built once it's built and verified. Starting the next task
  clean also stops old context from quietly biasing new decisions.
- **`/compact`** summarizes what's happened so far but keeps going in the same session. Better
  than `/clear` when you're mid-task and need the AI to remember specific details (a design
  decision, a bug already ruled out) but the transcript itself has gotten long with intermediate
  noise (full test output, verbose tool logs).

**Observed in this project:** a single session ran two substantial, back-to-back features (the
category-groups implementation, then a follow-up admin/backfill task) without a break between
them, and hit an _automatic_ compaction partway through — right in the middle of debugging a test
failure, not at a clean boundary. A better habit would have been to `/clear` right after the first
PR was opened and merged, before starting the unrelated follow-up task. The two tasks shared
almost no context that was worth paying to carry forward; starting the second one fresh would have
been both cheaper and less likely to drag stale assumptions into a different task.

**Rule of thumb:** if you can describe the next thing you're about to ask for without referring
back to _how_ the current thing got built — only to _what_ got built — that's a `/clear` point.

---

## Delegating to subagents

A subagent (`Explore`, `general-purpose`, etc.) runs its own investigation in its own context and
reports back a summary — the raw exploration (file reads, grep results, trial-and-error) never
enters the main conversation, only the conclusion does.

**Good candidates for delegation:**

- Open-ended searches ("where does X happen," "what calls Y") across a codebase you don't already
  know the shape of.
- Anything that will produce a lot of raw output you don't need to keep around afterward — a wide
  grep, a large data dump, a long build log — where only the _conclusion_ matters going forward.
- Independent, parallelizable checks (e.g., "run the backend suite" and "run the frontend suite"
  don't depend on each other and can run at the same time in the background).

**Not good candidates:** a single targeted lookup you already know how to do directly (reading one
known file, grepping for one known symbol) — spinning up a subagent for that is slower and adds
nothing. Delegation is for offloading _volume_ or _uncertainty_, not for avoiding a two-line tool
call.

**Observed in this project:** a database investigation to check which categories still needed a
"group" assignment returned a raw table dump of **126 rows** directly into the main conversation,
just to answer "how many, and which ones look like real matches." That entire investigation —
run the query, summarize the pattern, report back counts — was exactly the shape of task the
`Explore` or `general-purpose` agent exists for. Doing it inline meant the full row-by-row dump sat
in context for the rest of the session, paid for on every subsequent turn, when only a two-sentence
summary was ever actually needed afterward.

A second missed opportunity: iterating on a browser-automation script (fixing one broken element
selector at a time, rerunning, reading a fresh stack trace, fixing the next one) happened directly
in the main session, several rounds in a row. That kind of "run, fail, adjust, run again" loop is
a good fit for a subagent too — hand it the goal and the constraints, let it iterate privately, and
only bring back the finished, working script plus a result summary.

**Rule of thumb:** if the next few tool calls are going to produce output you'll want to
_summarize_ rather than _read line by line_, that's a sign to delegate rather than do it inline.

### How delegation actually works, mechanically

A subagent isn't a shortcut or a different "mode" of the same conversation — it's a genuinely
separate context window with its own tool calls, its own reads, its own trial-and-error. The
_parent_ session never sees any of that. It only ever sees the one final report the subagent
chooses to write at the end. That's the entire mechanism, and it's what makes the context savings
real rather than cosmetic: a subagent can read fifteen files, run a query five different ways
after getting it wrong the first four times, and churn through a hundred lines of failed test
output — and the parent conversation pays for none of that. It pays only for the summary.

Concretely, replaying the two missed opportunities above as if they'd been delegated:

- **The database investigation**, properly delegated, would have looked like: _"Query the dev
  database for categories with no group assigned. Design a reasonable keyword-based heuristic for
  guessing a group from each category's name. Report back: how many are ungrouped, how many the
  heuristic would confidently match (grouped by which group), and a list of the ones that don't
  match anything recognizable."_ The agent runs whatever queries it needs — possibly several
  attempts — entirely on its own. What comes back to the parent session is a paragraph, not a
  126-row table.
- **The browser-automation script**, properly delegated, would have looked like: _"Write a
  Playwright script that registers a test account, exercises [the specific flow], and confirms
  [the specific assertions]. Iterate on it yourself — including fixing any broken selectors by
  reading the actual component source — until it runs cleanly with zero console errors. Report
  back what you verified and whether anything looked wrong."_ Every failed run, every corrected
  selector, every stack trace stays inside the subagent's own context. The parent session sees
  only "script passes, verified A/B/C, zero console errors" — the same conclusion, at a fraction
  of the token cost.

Because a briefed subagent runs independently, genuinely **independent** pieces of work can also
run in parallel rather than one after another — e.g., "run the backend test suite" and "run the
frontend test suite" don't depend on each other's outcome, so both could be launched as separate
agent calls in the same turn instead of waited on sequentially. That saves wall-clock time on top
of the context savings.

None of this is free, though — spawning a subagent means it starts with no memory of the current
conversation and has to be briefed from scratch, like handing a task to a colleague who just
walked in. For a single lookup you already know how to do in one tool call, that briefing overhead
costs more than it saves. Delegation pays off when the _work_ is large or uncertain, not just
because the _goal_ sounds like it could be described in one sentence.

---

## Turn off MCP servers that aren't relevant to this project

**MCP** (Model Context Protocol) is a standard way to give an AI assistant access to external
systems — GitHub, Gmail, Google Drive, Slack, a database, an internal API. Each connected MCP
server contributes its tool definitions to the session, and **those definitions occupy context
before you've said a single word.** A server with thirty tools, each with a description and a full
parameter schema, is thirty tool schemas the model carries for the entire session whether or not
any of them ever gets used.

That's the cost. The benefit is obvious when a server is relevant and pure overhead when it isn't.

**Observed in this project:** a session working on WellTrack — a self-contained monorepo whose
entire workflow is local files, a local Postgres, and GitHub — had connectors for Gmail, Google
Calendar, Google Drive, and Slack all enabled alongside GitHub. Between them, that's on the order
of **eighty-plus tool definitions** loaded into every single session, for a project that will
never send an email, read a calendar, or post to Slack. GitHub genuinely earns its place (PRs get
opened constantly). The rest were pure carrying cost.

### How to actually turn them off

MCP servers are configured at three different levels, and which one you edit depends on where the
server came from:

- **Project-scoped** — a `.mcp.json` file committed at the repo root. Anyone who opens this repo
  gets these servers. Edit or remove entries here to change what the project itself brings along.
  (This repo doesn't have one, which is fine — it doesn't need any project-specific servers.)
- **User-scoped (local CLI)** — servers added via `claude mcp add ...`, stored in your user config
  and available across all your projects. List them with `claude mcp list`, and remove one with
  `claude mcp remove <name>`.
- **Account-level connectors** — servers connected through your claude.ai account settings (this
  is where GitHub/Gmail/Google Drive/Slack live for this setup). These follow your account rather
  than any particular repo, so they're toggled in claude.ai's own connector settings, **not** by
  anything in this repository.

Inside a session, `/mcp` shows what's currently connected and lets you inspect/authenticate
servers interactively. The practical habit: before starting a long session on a focused
codebase, glance at what's connected and disable anything the work genuinely can't touch. Turning
a connector back on takes seconds; carrying it unused costs you on every turn of a long session.

### Skills as a lighter-weight alternative to an MCP server

A **skill** is a folder with a `SKILL.md` (instructions, plus optionally scripts and reference
files) that teaches the assistant how to do something — often by telling it which _existing_ tools
to run and in what order, rather than by exposing a new set of tools of its own.

The context difference is the important part:

- An **MCP server** loads all of its tool schemas up front, for the whole session, used or not.
- A **skill** is listed by name and one-line description only. Its full instructions load _when
  it's actually invoked_ — so ten available skills cost roughly ten lines of context, not ten
  full toolsets.

This makes skills the better fit whenever the underlying capability is already reachable through
tools you have (usually: running a command). Some real examples of where that line falls:

- **Database access.** A Postgres MCP server would add query/schema/introspection tools to every
  session. But this project's database is reachable with one shell command
  (`docker exec wellbeing-postgres-1 psql -U welltrack -d welltrack -c "..."`), so a short skill
  documenting that command, the connection details, and the handful of useful queries gives the
  same capability at a fraction of the cost. This project has effectively been doing that
  informally already — the connection details live in `backend/.env` and get used through plain
  `Bash` calls.
- **Git and GitHub.** The `gh` CLI is already installed and authenticated here, and every PR in
  this project has been opened with `gh pr create` through a plain shell call. That's a real case
  where the CLI route covers the common workflow directly. The GitHub MCP server still earns its
  place when you want _structured_ results rather than parsed CLI text — reading review threads,
  paginating issues, or anything where the tool's typed response is genuinely easier to work with
  than scraping terminal output. Worth keeping for that; not worth assuming it's mandatory.
- **Project-specific workflows.** "How to run this app end to end," "how to verify a migration
  against the real database," "the conventions for opening a PR here" — all of that is
  instructions, not new capabilities. It belongs in a skill (or in `CLAUDE.md`), never in a server.

**Where an MCP server genuinely wins:** when there's no CLI equivalent, when authentication is
complex enough that you don't want it re-derived from scratch each time (OAuth flows against a
third-party API), or when you specifically want typed, structured responses rather than text
output that has to be parsed. Gmail, Slack, and Google Drive are all fair examples — there simply
isn't a clean shell equivalent. The point isn't "skills good, MCP bad," it's **match the mechanism
to the need, and don't carry a whole toolset for a capability one documented shell command already
covers.**

---

## Verify, don't trust — especially with AI

An AI assistant can be fluent and confident while being wrong, which makes the habit of verifying
claims _more_ important than with a human collaborator, not less — a wrong answer doesn't sound
tentative just because it's wrong.

- **A "green checkmark" (tests pass, build succeeds, PR shows "Merged") proves less than it looks
  like.** Read the actual response body. Check the real database state. Check `git log
main..<branch>` actually shows what you expect, not just that a command exited 0.
- **A migration "running without erroring" isn't the same as "correct."** For anything with real
  logic (data backfills, calculations), check actual before/after values against what you'd expect
  by hand — not just that the command finished.
- **Don't assume a tool, plugin, or feature isn't available just because it's unfamiliar** — check
  what's actually installed/enabled in the current environment before concluding something doesn't
  exist. (Concretely: an early guess in this project that a certain workflow pattern was purely an
  informal community trick turned out to be wrong — it existed as an actual installable plugin, just
  not enabled in the environment being used at the time. The fix wasn't "know more facts up front,"
  it was "check the actual environment before asserting an absence.")
- **Real end-to-end verification catches what unit tests can't.** A mocked test suite can't catch a
  bug that only exists in the interaction between two real running pieces. Where practical, actually
  run the thing — start the real servers, drive a real browser, read the real output.

---

## Read before you guess

When something doesn't work the way you expect from an AI-generated script or test (a selector
that can't find an element, a mock that doesn't cover a request), the efficient move is almost
always to **read the actual source of the thing you're driving** before iterating blindly.

**Observed in this project:** a verification script assumed a heading (`"Create a new category"`)
would appear on a particular screen, based on a similar-sounding flow used elsewhere in the app —
but that specific screen never rendered that text at all. One read of the actual component would
have caught this immediately; instead it took a failed run and a stack trace to notice. This is a
minor example, but the pattern generalizes: a guess dressed as a script is still a guess. Reading
the real render output (or component source) first is almost always faster than a
run-fail-adjust-run loop, even though the loop _feels_ more like "doing something."

---

## Ask, don't guess, on ambiguous product decisions

An AI assistant can make a _plausible_ call on an ambiguous product question and be wrong about
what was actually wanted — and because it's plausible, the wrongness might not get caught until
much later. For anything with more than one reasonable answer and real product consequences
(what "delete" should mean for real user data, whether an action is available on system-owned vs.
personal records), it's worth stating the reasoning out loud and getting explicit confirmation
before building — not asking about everything, just the calls that are genuinely a coin flip.

This project's own CLAUDE.md already encodes a version of this ("Not provided" and "explicitly
cleared" are different things; test clearing a field explicitly, not just setting one) — the same
instinct applies one level up, to the product decision itself, not just its implementation.

---

## Process hygiene

Small, easy-to-ignore habits that compound over a long-running project:

- **Clean up background processes you started.** A dev server left running across sessions is easy
  to forget about — and a second one started later, on a different port, can silently break things
  that depend on a fixed port (CORS allow-lists being the concrete example hit in this project: a
  frontend dev server that started on the "wrong" port because 7 stale servers from earlier
  sessions were still holding the expected one).
- **`git status` before anything that could discard work**, and stash or commit first if there's
  anything there you don't recognize.
- **One feature branch per task, atomic commits, real PRs** — not because it's bureaucratic, but
  because it's what makes "what actually changed, and why" answerable later, by a human or another
  AI session picking the project back up cold.

---

## Quick reference

| Situation                                                | What to do                                            |
| -------------------------------------------------------- | ----------------------------------------------------- |
| A task is done, merged, and the next task is unrelated   | `/clear`                                              |
| Mid-task, transcript is noisy but you need continuity    | `/compact`                                            |
| An open-ended search across unfamiliar code              | Delegate to `Explore`                                 |
| A task that will produce a lot of disposable raw output  | Delegate to a subagent                                |
| A single known file/symbol lookup                        | Just do it directly — don't delegate                  |
| Two genuinely independent checks (e.g. two test suites)  | Launch both as parallel subagents                     |
| Starting a long session on a focused codebase            | Check `/mcp`, disable connectors the work can't touch |
| A capability one documented shell command already covers | Write a skill, don't add an MCP server                |
| A capability with no CLI equivalent / complex auth       | An MCP server genuinely earns its place               |
| Tests pass / build succeeds / PR shows "Merged"          | Verify the actual state before trusting it            |
| A script or test behaves unexpectedly                    | Read the real source before iterating blindly         |
| A product decision with more than one reasonable answer  | Ask explicitly, don't guess silently                  |
| Finished with a dev server / background process          | Stop it, don't leave it running                       |

---

## Log of entries

Add new observations below, newest first. Keep each one short: what happened, why it mattered,
what to do differently.

### 2026-08-28 — First pass, written retrospectively

Everything above was written after noticing, across one long session building the category-groups
feature and its follow-up admin/backfill task, that context management and subagent delegation
were both under-used relative to how useful they'd have been — a session ran long enough to hit an
automatic compaction mid-task, and a large raw data dump (126 database rows) and an iterative
script-debugging loop both happened inline in the main conversation when either would have been a
good fit for a subagent. The same session also ran with Gmail, Google Calendar, Google Drive, and
Slack connectors all enabled, on a project that touches none of them.

Nothing here was a serious mistake — the actual features shipped correctly, verified end-to-end —
but the session was noisier and more expensive than it needed to be. Written up here so the next
session (human or AI) starts from an explicit checklist instead of re-learning the same pattern
from scratch.
