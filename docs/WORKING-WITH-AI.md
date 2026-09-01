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

## What makes it "agentic": the tool loop

Everything else in this document rests on this, so it's worth understanding first.

A plain chatbot only produces **text**. You paste your code in, it suggests something back, you
copy the result out and run it yourself. It never sees whether its suggestion actually worked.

An **agentic** assistant has **tools** — it can read files, edit them, run commands, search the
web — and it works in a loop:

```
goal → pick a tool → use it → look at what came back → adjust → repeat → report
```

That loop is the entire difference. It's what separates _suggesting_ a fix from _making_ one,
running the tests, seeing them fail, and fixing it again before you ever see the result.

### Why tools matter more than the model's knowledge

Three things follow from having tools, and each one changes how you should work:

**1. Grounding — it can check instead of guessing.** Without tools, an assistant answers about your
codebase from memory and inference, which is a polite way of saying it guesses. With tools it opens
the actual file. Nearly every failure described later in this document traces back to acting on a
guess when a tool call was available.

Real example from this project: while documenting the `CLAUDE.md` commands, the choice was between
writing what the scripts _probably_ were and reading `package.json`. Reading it revealed the project
has `npm run format:check` and `npm run test:e2e` scripts — so the documentation names the real
commands rather than clumsier `npx` equivalents that would have looked plausible and been subtly
wrong.

**2. Feedback — it finds out it was wrong, instead of you finding out later.** Running the test
suite means a mistake surfaces immediately, inside the loop, while the assistant is still working.
Without that, errors surface days later, in your lap.

Real example: after a large refactor here, running the frontend suite returned 12 failing tests. That
failure _was_ the useful information — it led to diagnosing a missing mock, fixing it, and re-running
to confirm all 205 passed. None of that is possible in a suggest-only workflow.

**3. Completion — the work actually gets done.** Editing the files, running the migration, opening
the PR. Not a description of the change: the change.

### What this means for you

- **Tool results are evidence. Model claims are not.** "The tests pass" alongside real output you
  can read is a fact. The same sentence with nothing behind it is a prediction. This distinction is
  the foundation of _Verify, don't trust_ below.
- **If nothing was run, nothing was verified.** When an assistant says it fixed something but never
  executed anything, it has asserted a fix, not demonstrated one. Ask what it ran.
- **The loop is only as good as the feedback available to it.** A project with fast, meaningful
  tests lets an assistant catch its own mistakes; a project without them can only produce
  confident-looking code that nobody has checked. Investing in tests and lint isn't just good
  practice — it's what makes agentic work self-correcting.
- **Approvals are the safety boundary.** Tools that modify files or run commands are exactly why
  permission prompts exist. They're the point at which you decide what this thing is allowed to do,
  so they deserve reading rather than reflexive approval.
- **Better tool access produces better work.** An assistant that can run your test suite will fix
  its own errors. One that can't will hand them to you, phrased just as confidently.

### The categories of tool

| Kind                 | Examples                       | What it buys                                     |
| -------------------- | ------------------------------ | ------------------------------------------------ |
| **Read / search**    | reading a file, grep, glob     | Grounding — working from the real code           |
| **Write / edit**     | editing or creating files      | The change itself                                |
| **Execute**          | running tests, git, migrations | Feedback, and real completion                    |
| **Web**              | search, fetching a page        | Current information beyond training data         |
| **Delegate**         | subagents (see below)          | Isolating big or uncertain work in its own space |
| **External systems** | MCP servers (see below)        | Reaching things outside the codebase entirely    |

The rest of this document is, in one way or another, about using these well: keeping the loop's
context clean, delegating the noisy parts, not carrying tools you don't need, and treating what
comes back as evidence to check rather than conclusions to accept.

---

## The tools that actually did the work here

The table above is the shape; this is what actually filled it in, task by task, across the real
work behind this project — a new Task feature, a production bug in Timeline, a History-page
redesign, and a second production bug that followed it. Naming the real tools (not just the
category) matters, because "it can run commands" undersells what that turns into once you see it
applied to an actual bug.

**Read / search — `Read`, `Grep`, `Glob`.** Every change started by opening the real file, not
recalling it from a filename. Concrete case: tracing why Timeline never noticed a reminder had
changed meant reading `CategoriesPage.tsx` and `SettingsPage.tsx` in full to find every place a
reminder gets created, edited, or deleted — grepping for the event-dispatch call that was
*supposed* to be there would have found nothing, since the bug was precisely that those handlers
never called it. Search only finds what's present; reading finds what's missing.

**Write / edit — `Edit`, `Write`.** `Edit` requires the target file to have already been read in
the same conversation — a small, mechanical guardrail against editing blind. It earned its keep
directly: mid-branch-surgery (moving a commit that had landed on the wrong branch), a `git stash`
silently reverted several files to their last-committed content, and the harness's own
"this file changed on disk since you last read it" notice caught it immediately, rather than the
next edit landing on stale content without anyone noticing.

**Execute — `Bash`, `PowerShell`.** The workhorse, and the tool most responsible for turning
"should work" into "does work":

- Real regressions were confirmed with a probe, not assumed: hitting the auth rate limiter
  mid-verification was confirmed with a direct `curl -X POST /api/auth/register` returning
  `429 RATE_LIMITED`, before ever deciding to restart a dev server on the strength of it.
- `gh pr create`, `gh pr checks --watch`, `gh pr view --json mergeable`, and
  `gh run view --log-failed` carried every PR in this project from open to green — including
  diagnosing *why* CI failed (a stale Playwright selector after a UI redesign) directly from the
  terminal, not by guessing from the failure's headline.
- `PowerShell`'s `Get-CimInstance Win32_Process` answered a genuinely load-bearing question before
  ever running `Stop-Process`: is this dev-server process actually mine? Checking a candidate
  PID's `CreationDate`, `CommandLine`, and `ParentProcessId` against exactly when and how a
  session had started its own servers — and finding *several* independent backend processes
  running against the same repo, none of them started by the current session — is what kept a
  previously-real mistake (killing another session's process) from repeating. When ownership
  couldn't be confirmed, the tool wasn't used at all — a fresh, unused port stood in instead.
- Long-running work (a 400-plus-test backend suite, routinely 7+ minutes) ran via
  `run_in_background: true` rather than blocking the whole turn on it — other useful work (writing
  docs, checking a different test file) continued in the meantime, with a notification on
  completion rather than an idle wait.

**Web / external systems — MCP tools, e.g. Google Drive's `search_files` and `create_file`.**
Asked to save a design record to "the Wellbeing folder" in Google Drive, `search_files` was run
*first*, against the actual connected account — which turned out to hold a different project's
content entirely, no "Wellbeing" folder anywhere. That's a fact only a real tool call could
surface; guessing would have either silently created a duplicate in the wrong place or claimed
success over nothing. Once confirmed (see `AskUserQuestion` below) and authorized, `create_file`
created the real folder and a real Doc in it, without the user needing to leave the conversation
to do either by hand.

**`AskUserQuestion` — pausing on a genuine fork, not a trivial one.** Used exactly where a
plausible guess would have risked being *confidently* wrong: once `search_files` came back empty,
the choice ("create a new folder here" vs. "skip Drive, this is the wrong account") was put to the
user directly rather than picked unilaterally. A second real case: an intermittent
"couldn't load Timeline" error had at least three plausible next steps (read browser DevTools
output, guess a fix from the stack trace alone, or make a live, authenticated request against the
production backend to actually confirm it) — each with a real trade-off in speed, certainty, and
what it touches, which is exactly the shape of decision worth surfacing rather than picking
silently. Both are consistent with the "ask, don't guess, on ambiguous product decisions" habit
covered later in this document — the mechanism is the same, just applied to a tooling/process
choice instead of a product one.

**Producing something visual — the `Artifact` tool.** A redesign of the History page started as a
design conversation, not code: an HTML mockup (built from this app's own real design tokens —
actual hex values pulled from `index.css`, not approximations) was published as a live, shareable
page showing the current design next to the proposed one, side by side, before a single line of
the real component changed. That let the actual product decision — "should this row look more
like Timeline's?" — get made by looking at it, not by reading a text description of it and
imagining the result.

**Delegate — subagents.** See the dedicated section below; not used in every task in this
project, but exactly the right shape for the "run this whole test suite while I do something else"
and "iterate on this browser script until it's clean" cases described there.

The common thread across all of it: each tool call is small, but a claim built on real tool
output ("the rate limiter is confirmed active," "this process was started nine minutes before I
touched anything," "the connected Drive account has no such folder") is categorically different
from the same sentence asserted from confidence alone. That difference is the entire subject of
_Verify, don't trust_, further down.

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

## Check what's actually using your context window

The advice above ("clear at a clean boundary") is hard to follow if you have no idea how full the
context window actually is, or what's filling it. Most people only find out when the assistant
suddenly announces it's compacting, or when a usage warning appears at the bottom of the screen —
both of which are the _symptom_, arriving too late to do much about the _cause_.

**`/context` shows the breakdown**: how much of the window is currently consumed, and by what.
It's worth running at two moments in particular:

- **Early in a session, before you've done anything.** This shows your _baseline_ — the cost you
  pay before typing a single word. That number is not zero, and it's often surprisingly large.
- **When a session starts feeling sluggish, or before starting a big task.** Knowing you're at 40%
  vs. 85% completely changes whether you should start that task here or in a fresh session.

### What's actually taking up the space

Roughly, in order of how often people are surprised by it:

1. **Tool definitions — especially from MCP servers.** Loaded up front, every session, used or
   not. This is the single biggest "invisible" cost, and the reason the MCP section below matters.
2. **`CLAUDE.md` and other memory files.** Loaded into every session automatically (see the
   `CLAUDE.md` section below). Useful — but it's a standing cost, so a bloated one is a tax on
   every conversation.
3. **The conversation itself** — every message, every file read, every tool result. This is the
   part that grows as you work, and the part `/clear` and `/compact` address.
4. **Large individual tool outputs.** A single unbounded command can cost more than an hour of
   conversation. The 126-row database dump described below is a small example; a full build log,
   an unfiltered `git log`, or reading a 2,000-line file wholesale are bigger ones.

### Why this matters more than it sounds

Checking is what turns context from something that happens _to_ you into something you manage.
Concretely, the fix is different depending on what the breakdown actually shows:

- Baseline already high before you start? → the problem is **standing cost**: disable MCP servers
  you don't need, trim `CLAUDE.md`. Clearing won't help — it's there again on the next session.
- Baseline fine, but it filled up fast during work? → the problem is **flow**: you're reading whole
  files instead of ranges, or pulling large outputs inline instead of delegating them.
- Filled up because you did three unrelated tasks in one sitting? → the problem is **boundaries**:
  `/clear` between them.

Three habits that keep the growth slow, once you know where it's coming from:

- **Read line ranges, not whole files**, when you already know roughly where the relevant code is.
- **Filter before you print.** `grep` for the thing you need rather than dumping the file; pipe
  long command output through `head`/`tail`; add `--stat` or `-n 5` to git commands rather than
  printing everything.
- **Delegate high-output work** (see below) so the raw output lands in a subagent's context, not
  yours.

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

### The different kinds of subagent

"Subagent" isn't one generic thing — there are several types, and they differ in **what tools they
have** and therefore **what they're safe and sensible to use for**. The names vary a little by
setup, but the shape is consistent:

| Agent               | Can it change files? | Best for                                                                        | Don't use it for                                       |
| ------------------- | -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Explore**         | No — read-only       | Finding things. "Where is X defined?", "What calls Y?", "Which files handle Z?" | Anything needing complete coverage — it reads excerpts |
| **Plan**            | No — read-only       | Deciding things. Designing an approach before you build it                      | Small, obvious changes you can already describe        |
| **general-purpose** | **Yes** — full tools | Doing things. Multi-step work carried through to a finished result              | A single lookup you could do in one tool call          |
| Specialised agents  | Varies               | Narrow jobs (e.g. questions about the AI tooling itself)                        | Anything outside their specific remit                  |

The read-only/read-write split is the important one. `Explore` and `Plan` **cannot modify your
repository**, which makes them safe to launch speculatively — worst case you've spent some time and
learned nothing. `general-purpose` can edit files and run commands, so it deserves a clearer brief
and more attention to what it reports back.

#### `Explore` — finding things in the codebase

A fast, read-only search agent. Its job is answering **"where is it?"** questions about code you
don't already know your way around:

- "Where is `groupId` validated on the backend?"
- "Which files reference `CategoryGroup`?"
- "Where does the app decide whether a category is hidden?"

It's the right tool when you'd otherwise burn several rounds of `grep`, guessing at naming
conventions, and opening files that turn out to be irrelevant — all of which lands in your context
if you do it inline, and none of which does if you delegate it.

It's worth saying what breadth you want, because it changes how hard the agent looks: a **quick**
lookup for one targeted thing, **medium** for moderate exploration, or **very thorough** when the
thing might be named several different ways or live in several places.

**Its real limitation, worth knowing before you trust it:** `Explore` reads _excerpts_, not whole
files. That makes it fast, but it means it can genuinely miss things past its read window. So it's
excellent for "find me the places that mention X" and **wrong** for anything needing complete
coverage of a file or a judgment across many files — code review, checking a design doc against the
implementation, cross-file consistency checks, or open-ended "is this codebase doing anything
odd?" analysis. For those, either read the files properly yourself or use `general-purpose`, which
isn't constrained the same way.

**On web searching:** `Explore` is aimed at your codebase, not the internet. Agents generally _can_
reach web search and fetch tools, but "search the web for how library X handles Y" isn't what
`Explore` is designed around — that's a research task, better given to `general-purpose` (or, for
questions specifically about the AI tooling itself, a specialised agent like `claude-code-guide`,
which is built to consult the official documentation).

#### `Plan` — deciding an approach before you build it

A read-only software-architect agent. You give it a goal; it investigates the codebase and returns
a **step-by-step implementation plan** — which files matter, what order to do things in, and the
architectural trade-offs it considered.

The value is that planning and building are genuinely different modes of thinking, and doing them
in one pass tends to mean committing to the first approach that occurs to you. A separate planning
step surfaces the "we could do it this way or that way, and here's the difference" decision _before_
any code exists to be attached to.

Good candidates: a feature touching several layers (the category-groups work in this repo would
have qualified — schema, migration, routes, and a substantial UI restructure), anything where you
suspect there's a structural decision you haven't spotted yet, or a task you're not sure how to
break down.

Not worth it for: a small, obvious change. If you can already describe the steps in a sentence,
planning it formally is overhead.

Note that a plan is a **proposal, not a verdict** — read it, disagree with the parts you disagree
with, and use it as a starting point rather than a script to follow blindly.

#### `general-purpose` — doing the whole thing

Full tool access: it can read, search, edit files, run commands, and iterate. This is the agent for
**multi-step work carried through to a finished result**, rather than a single question answered.

Given a goal, it runs its own loop — read the relevant code, make a change, run the tests, read the
failure, adjust, run again — as many rounds as it takes, then reports back. That's exactly the
shape of the script-debugging grind described above: the value isn't only fewer tokens in your
context, it's that the whole business of converging on something that works happens elsewhere, and
you receive the outcome instead of every intermediate step.

It's also the fallback for research and search tasks that don't fit `Explore` — either because they
need complete coverage rather than excerpts, or because they need genuine analysis rather than
location.

Because it **can change your repository**, it earns more care than the read-only agents: brief it
clearly about what's in and out of scope, and actually read what it reports rather than assuming
the work is done (the same "verify, don't trust" habit as everywhere else in this document — a
subagent's summary is a claim, and claims get checked).

#### Specialised agents

Beyond the general three, setups often include narrow agents for specific jobs — for example one
that answers questions about the AI tooling itself by consulting its official documentation, or one
that configures a particular setting. They're worth knowing exist so you don't hand a niche
question to a general agent that will guess at it. (Earlier in this project's history, exactly that
happened: a question about an unfamiliar plugin got a confident, partly-wrong answer from general
knowledge when a documentation-consulting agent would have been the right route — see _Verify,
don't trust_ below.)

**Pick the narrowest agent that can do the job.** Use `Explore` when you only need to _find_
something, `Plan` when you need to _decide_ something, and `general-purpose` when you need
something actually _done_. Reaching for the most capable one by default gives up the safety of the
read-only ones for no benefit — and reaching for `Explore` when you need completeness gives up
correctness for speed.

**Brief them properly — they start cold.** A subagent has none of your conversation's context. A
good brief states the goal, the constraints that matter (conventions to follow, things not to
touch), and explicitly what to report back. "Find where categories are validated" gets a worse
answer than "Find every place a category's `groupId` is validated on the backend, and report the
file, function, and what each one rejects."

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

## MCP servers: what they are, how to connect one, and when to turn it off

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

### MCP vs. built-in tools vs. skills — three different things with "tool" in the description

Easy to blur together when you're new to this, so worth pinning down before going further, since
the rest of this document (and this section in particular) leans on the distinction:

| Thing              | What it actually is                                             | When it loads                        | Can add a genuinely new capability? |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| **A built-in tool**  | Ships with the assistant itself — `Read`, `Edit`, `Bash`, and so on | Always available, no setup            | N/A — this is the baseline           |
| **A skill**          | A folder of instructions for using the tools you already have    | Name + description always; full body only when the task matches | No — it's a smarter recipe for existing tools, not a new one |
| **An MCP server**    | A separate program the assistant connects to over a defined protocol | Every tool it exposes loads for the whole session, once connected | **Yes** — this is the only one of the three that adds tools that didn't exist before |

The practical version: if the assistant can already do something (read a file, run a shell
command) but you want it done a specific, repeatable *way*, that's a skill — see the dedicated
section on skills below. If it genuinely **cannot** do something at all — post to Slack, query a
database it has no client for, call an internal API — that's what MCP is for. Reaching for an MCP
server to teach the assistant a *procedure* it could already carry out with tools it has is the
same mistake as writing a skill to grant a capability it doesn't have; the skills section below
covers the reverse case (a CLI-shaped capability that doesn't need a whole server) in detail.

Concretely, this is *why* a skill is so often just "run this CLI tool, this specific way, in this
order" — `git`, `gh`, `docker`, `psql`, a project's own scripts. Wherever a command-line tool
already reaches the external system you need, a skill documenting how to drive it is the lighter
option every time; an MCP server only earns its place once there's genuinely no CLI to reach for.

### How MCP servers connect: stdio vs. HTTP, local vs. remote

An MCP server is a **program that has to run somewhere**, and the assistant has to talk to it
somehow. That "somehow" is the **transport**, and there are two — worth understanding, because they
differ in where your data goes, what the server can reach, and how they fail.

#### `stdio` — a local program, no network involved

The server is launched **on your own machine** as a child process, and the two talk over pipes
(standard input and output — hence `stdio`). Configuration is a command to run:

```json
{ "command": "npx", "args": ["-y", "@example/postgres-mcp-server"] }
```

What follows from that:

- **It's local by definition.** Nothing listens on a port; nothing leaves your machine.
- **It runs as you**, with your file permissions and your credentials. That's what makes it capable
  — and what makes it worth knowing exactly what you're installing, since `npx` will happily
  download and execute someone else's code with your access.
- **It lives and dies with your session**, started when the client starts.
- **Secrets are usually environment variables** in the config.
- **It fails at launch** — "command not found", a wrong path, a missing runtime.

Good fit for: filesystem access, a local database, local git — anything genuinely on your machine.

#### HTTP — a server reached at a URL

The server is reachable over the network, and configuration is a URL rather than a command. The
current standard is **streamable HTTP**; you may still meet **SSE** (Server-Sent Events), the
earlier transport it replaced.

- **Usually remote** — run by a vendor, so there's nothing to install and it updates without you.
- **Can also be local**, if you run something yourself listening on `localhost`.
- **Authentication is a real step**, typically OAuth or a token, rather than an env var.
- **It fails over the network** — timeouts, `401 Unauthorized`, an expired login.

Good fit for: SaaS APIs — GitHub, Slack, Google Drive — where there's no sensible local equivalent.

#### The two axes are separate

"stdio vs. HTTP" is _how_ it's reached; "local vs. remote" is _where it runs_. They're related but
not the same question:

|           | Local                               | Remote                       |
| --------- | ----------------------------------- | ---------------------------- |
| **stdio** | Always — this is the normal case    | Not possible                 |
| **HTTP**  | Possible — something on `localhost` | Typical — a hosted connector |

#### Why the difference actually matters

- **Where your data goes.** A stdio server keeps everything on your machine. A remote HTTP server
  means whatever you send it leaves your machine and reaches a third party. For a project handling
  real user health data, that's a decision worth making deliberately rather than by default.
- **What it can reach.** A stdio server has your local access — which is exactly why a filesystem
  or database server is useful, and exactly why you should know what you're running.
- **Setup burden.** stdio needs the runtime installed (Node, Python, Docker). Remote HTTP needs
  only credentials — but needs them to be valid.
- **Auth can block you outright, and it did here.** This project's own connectors (GitHub, Gmail,
  Drive, Calendar, Slack) are account-level remote ones, authorised through claude.ai rather than
  anything in this repo. During one session, Slack reported that it needed authorisation before its
  tools could be used — and because that session was non-interactive, the OAuth flow simply couldn't
  be completed there. That's a purely remote-transport failure mode: a stdio server reading an env
  var has nothing equivalent to get stuck on.

**The context cost is the same either way** — tool schemas load regardless of transport, so the
"turn off what you don't need" advice below applies to both. What changes with transport is the
_risk_ profile, not the price.

### Adding one: the CLI, and the three real scopes

`claude mcp add` is the command, run from a terminal (not inside a session). The shape differs by
transport:

```bash
# A local stdio server - note the "--" before the command being run
claude mcp add <name> -- <command> [args...]
claude mcp add playwright -- npx -y @playwright/mcp@latest

# A remote HTTP server - a URL, not a command
claude mcp add --transport http <name> <url>
claude mcp add --transport http notion https://mcp.notion.com/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

(SSE, the transport HTTP replaced, still works with `--transport sse`, but the official docs mark
it deprecated — reach for HTTP unless a server genuinely only offers SSE.)

Every add takes a `--scope` flag, and this is where "user vs. local vs. project" — genuinely three
different things, not two — actually lives:

| Scope       | Who gets it                          | Where it's stored                          | Command                                     |
| ----------- | ------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| `local`     | Just you, just **this** project       | Your user config, scoped to this project's path | `claude mcp add <name> ...` (the **default** — no flag needed) |
| `user`      | Just you, **every** project you open  | Your user config (`~/.claude.json`), global | `claude mcp add --scope user <name> ...`     |
| `project`   | **Anyone** who opens this repo        | `.mcp.json`, committed at the repo root     | `claude mcp add --scope project <name> ...`  |

The distinction that trips people up: **`local` is not the same as `user`.** Both are private to
you — neither is shared with anyone else — but `local` only applies while you're in this one
project, while `user` follows you into every project you open. If a server is genuinely something
you always want (a personal filesystem helper, say), `user` is the right choice; `local` is the
right default for "I'm trying this out here" or "this only makes sense for this one codebase, and
I don't want to commit it for my teammates." `project`, in turn, is the only one of the three that
puts the server in version control and hands it to anyone else who clones the repo — use it
deliberately, the same way you'd think before committing a dependency.

A minimal `.mcp.json` (the file `--scope project` writes to) looks like this:

```json
{
  "mcpServers": {
    "playwright": { "type": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"] },
    "notion": { "type": "http", "url": "https://mcp.notion.com/mcp" }
  }
}
```

(This repo has no `.mcp.json` of its own, which is fine — nothing about WellTrack needs a
project-wide server everyone who clones it is forced to carry.)

**Account-level connectors are a fourth, different thing entirely.** GitHub, Gmail, Google Drive,
and Slack in this setup aren't added with `claude mcp add` at all — they're connected through a
browser, at **claude.ai/customize/connectors**, tied to your claude.ai account rather than any
scope above. Once connected there, they're available automatically in every session signed into
that account, CLI included. There's no repo-local or per-project equivalent for this kind — see
_Why the difference actually matters_ above for what that means for a project handling sensitive
data (a stdio server never leaves your machine; an account-level connector always does).

### Removing one, and checking what's connected

- **`claude mcp list`** — shows every server currently configured, at every scope, and its
  connection status.
- **`claude mcp remove <name>`** — removes one. Add `--scope local` or `--scope user` if the same
  name exists at more than one scope and you need to be specific about which copy goes.
- **Editing `.mcp.json` directly** (or removing its entry) is exactly equivalent to `--scope
  project` add/remove — it's a plain file, not a black box.
- **Account-level connectors** are toggled the same place they're added: claude.ai's own connector
  settings, not by anything in this repository.

Inside a session, **`/mcp`** shows the same connected/status view as `claude mcp list`, plus lets
you inspect a server's own tools and authenticate/reconnect one interactively — without leaving
the conversation. The practical habit either way: before starting a long session on a focused
codebase, glance at what's connected and disable anything the work genuinely can't touch. Turning
a connector back on takes seconds; carrying it unused costs you on every turn of a long session.

### Skills as a lighter-weight alternative to an MCP server

A **skill** is a folder with a `SKILL.md` (instructions, plus optionally scripts and reference
files) that teaches the assistant how to do something — often by telling it which _existing_ tools
to run and in what order, rather than by exposing a new set of tools of its own.

The context difference is the important part:

- An **MCP server** loads all of its tool schemas up front, for the whole session, used or not.
- A **skill** is listed by name and one-line description only. Its full instructions load _only in
  the sessions where that description matches the task_ — automatically, without you asking — so
  ten available skills cost roughly ten lines of context, not ten full toolsets.

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

## `CLAUDE.md` — the project's memory between sessions

An AI assistant starts every session knowing nothing about your project's conventions. It can
_read_ the code, but it can't infer the things that aren't in the code: that you never commit
straight to `main`, that every task ends with a documented log entry, that "done" here means
"actually ran it in a browser," not "it compiles."

`CLAUDE.md` is a file at the repository root that gets loaded into **every** session
automatically, before you say anything. It's how those conventions survive between sessions — the
project's persistent memory, written once and applied every time.

**This project's own `CLAUDE.md` is the reason the work has a consistent shape at all.** Every
task in this repo followed the same sequence — branch off `main`, atomic commits, build and run it
for real, tick the task list, write the log entry, open a PR but never merge it — not because it
was re-explained each session, but because it's written down there once.

### Start with the technology stack and your preferences

The first thing a fresh session needs is orientation: **what am I working with, and how does this
person want it done?** Put that at the very top, before workflow rules or architecture notes —
it's the highest-value, most-referenced information in the file, and everything else is
situational by comparison.

Concretely, a strong opening is a few lines covering:

- **The stack and versions that matter.** "React 19 + TypeScript + Vite 8, Tailwind CSS v4,
  Express + Prisma + PostgreSQL." Versions are worth naming wherever a major version genuinely
  changed how something works — Tailwind v4 and v3 are configured completely differently, and an
  assistant working from v3-era habits will confidently add a `tailwind.config.js` this project
  deliberately doesn't have.
- **Package manager and runtime**, if there's any ambiguity (npm vs. pnpm vs. yarn).
- **Your standing preferences** — the things you'd otherwise have to repeat every session.
  "Explain concepts the first time they appear." "Never merge PRs, I review them myself." "Ask
  before adding a dependency." These are cheap to write and save a correction every single time.

The reason this goes first is practical: everything else in the file is conditional on it. A rule
about how to write tests means something different depending on whether the stack is Vitest or
Jest, and an assistant that reads the stack first interprets the rest correctly.

### What belongs in it

Things that are **true across sessions** and **not derivable from the code**:

- **Workflow rules** — branch naming, commit prefixes, "never merge your own PR," what a PR body
  must contain.
- **Definition of done** — this project's "build it and run it to prove it works, not just that it
  compiles" is a genuine instruction, not a platitude, and it changed how every task was verified.
- **Commands** — how to run, build, test, and lint each project, since these are rarely guessable
  and constantly needed.
- **Architecture direction and boundaries** — which layer may depend on which, naming conventions
  for folders, what _not_ to create.
- **Hard-won gotchas** — this repo's note that Tailwind v4 deliberately has no `tailwind.config.js`
  (so don't "helpfully" add one), and that only `VITE_`-prefixed env vars reach browser code, are
  both there because getting them wrong is easy and costly.

### What doesn't belong

- **Anything the code already says.** Don't list every file and its purpose — that's what reading
  the code is for, and it goes stale instantly.
- **One-off task detail.** "Currently working on the category groups feature" belongs in a task
  list or a branch, not in a file loaded into every future session forever.
- **Long explanations.** It's loaded every session, so it's a standing context cost (see the
  context-window section above). Aim for dense and rule-shaped, not essay-shaped. Detail belongs
  in the implementation log, linked from `CLAUDE.md` rather than inlined into it.

### The staleness trap — a real example from this repo

This is the failure mode to actually watch for, because it's silent and it gets worse over time:
`CLAUDE.md` is written early, the project moves on, and the file quietly starts describing a
project that no longer exists. Nothing errors. The assistant simply believes it and acts on it.

**Found while writing this document**, this repo's own `CLAUDE.md` still says:

> No test runner is configured yet (Phase 13 in `Tasks.md` adds backend tests, likely Jest/Vitest
>
> - Supertest). No linter is configured yet either (a later Phase 0 task adds ESLint/Prettier).

...and the same for the frontend. Both statements are now simply wrong: the backend has a full
Vitest suite (229 tests across 21 files) plus ESLint, and the frontend has 205 tests across 30
files plus oxlint. All of them have been run routinely for many tasks.

That's not a harmless typo. A fresh session reading that file is being told, authoritatively, that
this project has no tests — which could lead it to skip running them, or to "helpfully" start
setting up test tooling that already exists. It happened to cause no damage here only because each
session independently discovered the real `npm test` script; nothing about the setup guaranteed
that.

**The habit:** when a task changes how the project is built, run, or verified, ask whether
`CLAUDE.md` still tells the truth — and fix it in the same PR. It's a five-second check that
prevents a class of confidently-wrong behaviour in every session afterward. Treat outdated
instructions as a bug, because functionally that's what they are.

### `CLAUDE.md` is a hierarchy, not a single file

This is the part most people miss at first: `CLAUDE.md` isn't one file in one place. Several can
apply at once, at different levels, and they **combine** — a session working in this repo loads
all the ones that apply to it, not just the nearest. From broadest to narrowest:

| Level            | Where it lives                 | Applies to                         | Committed?              |
| ---------------- | ------------------------------ | ---------------------------------- | ----------------------- |
| **Enterprise**   | a managed system-wide location | everyone in an organisation        | by IT, not you          |
| **User**         | `~/.claude/CLAUDE.md`          | every project _you_ work on        | no — it's yours         |
| **Project**      | `<repo>/CLAUDE.md`             | anyone working in this repo        | **yes** — like any file |
| **Subdirectory** | `<repo>/frontend/CLAUDE.md`    | work happening inside that subtree | **yes**                 |

The narrower the level, the more specific it should be. Broader levels set defaults; narrower ones
add detail or override for their scope. A personal preference ("explain concepts as you go") lives
at the user level so it follows you between projects without being imposed on everyone who clones
the repo. A project convention ("never merge your own PR") lives in the repo, gets committed, and
gets reviewed like any other file — because it applies to whoever is working, not just you.

**The rule of thumb:** if it's true for this project regardless of _who_ is working on it → repo.
If it's true for you regardless of _which project_ you're in → user level.

#### What wins when two levels disagree

Precedence runs top-down in one direction and bottom-up in the other, which sounds contradictory
until you separate the two things it's doing:

- **Enterprise/managed policy sits at the top and is not yours to override.** It exists so an
  organisation can enforce security and compliance rules that hold no matter what any individual
  or project prefers. If it forbids something, nothing further down re-permits it.
- **Below that, the more specific level wins for its own scope.** A `frontend/CLAUDE.md` rule beats
  the root `CLAUDE.md` for work inside `frontend/`; a project convention beats your personal
  preference while you're in that project. That's what makes the arrangement useful — a repo can
  say "this project uses tabs" without you having to change your own defaults everywhere else.

**But treat that override behaviour as a safety net, not a design tool.** If two levels actively
contradict each other, someone reading either file in isolation is being told something untrue, and
you're now relying on a resolution rule to save you. It's much better to write rules that don't
collide in the first place — keep personal preferences about _how you like to work_ at the user
level, and project facts about _how this codebase works_ in the repo, and the two rarely have
anything to argue about.

#### Choosing a level: put it at the broadest level where it's still universally true

That single principle answers most placement questions:

| Level            | Put here                                                                | Because                                                               |
| ---------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Enterprise**   | Security and compliance rules that must hold everywhere                 | They can't be left to individual discretion                           |
| **User**         | How _you_ like to work — tone, explanation depth, "always ask before X" | True across all your projects; nobody else should inherit it          |
| **Project**      | Workflow, definition of done, architecture rules, the stack             | True for anyone touching this repo, so it gets committed and reviewed |
| **Subdirectory** | Stack detail specific to one area of a monorepo                         | Only relevant to work in that subtree — and only loaded there         |

The two failure modes are symmetrical. **Too broad** and the rule is wrong somewhere: a personal
"always explain concepts in detail" pushed into a project file imposes your learning preference on
teammates who don't want it. **Too narrow** and it doesn't apply where it should: a git convention
buried in `frontend/CLAUDE.md` silently stops applying the moment someone works on the backend.

When you're unsure, ask _"where is the widest circle of situations in which this is still
unambiguously true?"_ — and put it there.

**Where the subdirectory level earns its keep: monorepos.** This repository is a good example of
the problem it solves. Everything currently lives in one root `CLAUDE.md`, including
backend-specific gotchas (Prisma, `moduleResolution: "Bundler"`, the app/index split) and
frontend-specific ones (Tailwind v4 has no config file, only `VITE_`-prefixed env vars reach the
browser). A session working purely on frontend styling loads all the backend detail too, and vice
versa — it's all standing context cost, paid on every turn, for information that isn't relevant to
the task at hand.

Splitting it — a lean root `CLAUDE.md` for what's true project-wide (workflow, git conventions,
definition of done), plus `frontend/CLAUDE.md` and `backend/CLAUDE.md` for their own stack detail —
means each session only carries what its actual work needs. That's a worthwhile refactor for this
repo, and a good default for any monorepo where the two halves have genuinely different toolchains.
It's noted here rather than done, since it's a change to how the project is set up rather than a
documentation fix.

---

## Hooks: instructions that are guaranteed to run

Everything so far — `CLAUDE.md`, skills — is the assistant reading something and *deciding* to
follow it. That's usually enough, but it has a real limit worth naming plainly: **a `CLAUDE.md`
line is a suggestion, not a guarantee.** "Always run `prettier` after editing a file" in
`CLAUDE.md` is genuinely followed most of the time — but "most of the time" means there's a real
session, on a real day, where a big edit, a compacted context, or a distracted turn means it just
doesn't happen. Nothing enforces it. The model has to remember, every single time, on its own.

A **hook** is the fix for exactly that gap. It's a shell command *the harness itself* runs at a
defined point in the loop — not something the model reads and chooses to act on, but something
that happens whether or not the model ever thinks about it. Configure a hook to run `prettier`
after every file edit, and it runs after every file edit — not "usually," not "when Claude
remembers," **every time**, the same way a Git pre-commit hook runs whether or not you remembered
to run the linter yourself.

That's the whole distinction, and it's worth being precise about because the two are easy to
blur: `CLAUDE.md` (and a skill) are **read by the model** and followed by judgment. A **hook is
read by Claude Code itself**, before the model is even in the loop for that step — the model
doesn't get a vote.

**The practical rule, stated plainly: if something has to happen without fail, it doesn't belong
in a prompt — it belongs in a hook.** `CLAUDE.md` is the right home for things that are true and
worth knowing; a hook is the right home for things that must occur, every time, with nothing left
to the model's judgment or memory. "Please always run the formatter" is a `CLAUDE.md` line. "The
formatter runs, full stop" is a hook.

### How they're set up: the `hooks` key in `settings.json`

Hooks live in the same kind of file permissions and other settings already live in, at the same
three scopes MCP servers use (see above) — `.claude/settings.json` (project, committed, the whole
team gets it), `.claude/settings.local.json` (project, gitignored, just you), or
`~/.claude/settings.json` (every project you open). The top-level key is `"hooks"`, and this repo
currently has none configured — its own `.claude/settings.local.json` only has a `permissions`
block, which is a genuine, concrete gap: this project runs `prettier --check` on every task by
hand, and a `PostToolUse` hook is exactly the mechanism that would make "every edit gets
formatted" true by construction instead of by discipline.

A minimal example — reformat a file with `prettier` immediately after `Edit` or `Write` touches
it:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

Reading that structure outward: `"hooks"` → the **event** (`PostToolUse`, fired right after a
tool call succeeds) → a **matcher** (`"Edit|Write"` — only these two tools trigger this group;
an empty string or omitted matcher means "every tool") → the actual **command** to run
(`"type": "command"`), which receives the tool call as JSON on stdin — `jq` pulls out
`tool_input.file_path`, and pipes it straight into `prettier --write`.

### The two events that matter for almost everything: `PreToolUse` and `PostToolUse`

Claude Code has a genuinely long list of hookable moments (session start/end, compaction, a
subagent finishing, and several more specialised ones) — but for the "make sure X always happens"
use case this document cares about, two cover nearly every real case:

- **`PreToolUse`** — fires *before* a tool call runs, and can **block it**. A hook here that exits
  with status `2` (writing its reason to stderr) stops the tool call entirely — Claude Code
  never runs it, and the model sees why. This is the mechanism for "never let this happen at all,"
  not just "clean up after it."
- **`PostToolUse`** — fires *after* a tool call has already succeeded. Can't undo the call, but is
  exactly right for "and now do this too" — format the file that was just written, log what
  changed, re-run a check.

**A second real example — refusing to touch specific files at all, not just cleaning up after
touching them:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"
          }
        ]
      }
    ]
  }
}
```

where `protect-files.sh` reads the same `tool_input.file_path` JSON from stdin, checks it against
a list like `.env`, `package-lock.json`, `.git/`, and exits `2` (blocking the edit, with a reason
on stderr) the moment one matches — otherwise exits `0` and the edit proceeds untouched. The
difference from the `prettier` example is the event: `PreToolUse` gets a real veto; `PostToolUse`
only ever gets to react.

**A third, very common one: refusing to run a destructive command at all, not just asking nicely
not to.** Same `PreToolUse`/exit-`2` mechanics, matched against the `Bash` tool instead of
`Edit`/`Write`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-rm-rf.sh"
          }
        ]
      }
    ]
  }
}
```

where `block-rm-rf.sh` reads `tool_input.command` (the exact shell command about to run, this
time — not a file path) from the same stdin JSON, and denies anything matching a
dangerous-looking pattern:

```bash
#!/bin/bash
COMMAND=$(cat | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE 'rm\s+(-\S*r\S*f|-\S*f\S*r)\b'; then
  echo "Blocked: '$COMMAND' looks like a recursive, forced delete." >&2
  exit 2
fi

exit 0
```

This is a genuinely popular first hook for exactly the reason you'd guess: an assistant that can
run arbitrary shell commands can, in principle, run `rm -rf` somewhere you didn't mean, and a
`CLAUDE.md` line saying "be careful with destructive commands" is a request, not a wall. A
`PreToolUse` guardrail like this one is the actual wall — it runs before the command executes, on
every single Bash call, regardless of how the request to run it was phrased or whether the model
was being careful that particular turn. Treat it as a floor, not a substitute for the normal
permission prompts and approval settings already in place — a narrow pattern match will never
catch every dangerous command, and shouldn't be trusted to.

### Worth knowing before you write one

- **The matcher filters by tool name**, and follows the same shape as everywhere else in this
  ecosystem: `"Bash"` for one tool, `"Edit|Write"` for a few, a regex like `"mcp__github__.*"`
  for every tool a particular MCP server exposes, or empty/omitted for "all of them."
- **Exit code is the whole contract.** `0` means proceed normally; `2` means block, with the
  reason on stderr; anything else is treated as non-blocking. A hook that wants finer control than
  a bare exit code (choosing `"allow"`/`"deny"`/`"ask"` explicitly, say) can print structured JSON
  to stdout instead — the reference docs cover that shape in full.
- **Multiple hooks on the same event run in parallel**, and any single one blocking is enough to
  block the whole group — don't design two hooks on the same event to depend on each other's side
  effects.
- **A hook is a script you're choosing to auto-execute on every matching event, in every session
  in its scope**, the same as any other executable code you'd commit to a repo — worth the same
  glance of scrutiny as anything else that runs automatically, especially one added at `user`
  scope, since that one follows you into every project you open.
- **Inside a session, `/hooks` shows what's configured** — every event, how many hooks are on it,
  and each one's matcher, type, source file, and command. Useful for checking what's actually
  active without leaving the conversation. Unlike `/mcp`, though, `/hooks` is **read-only** — it
  won't add, edit, or remove anything for you. Changing a hook still means editing the real
  `settings.json` yourself (or asking Claude to make the edit, which is itself just an `Edit` tool
  call against a plain file, not a special hooks-editing mechanism).

---

## If you're repeating yourself, you're missing an artifact

This is the habit that's easiest to miss, because repeating an instruction doesn't _feel_ like a
problem. It feels like normal conversation. But the third time you type some version of the same
sentence, you've stopped giving an instruction and started **doing a job that a file should be
doing for you**.

The tell is simple: **you're explaining the same expectation again in a new session or a new task.**
Not clarifying something specific to this task — restating a standing preference that was equally
true last time.

### Where a repeated instruction should live

There are two homes, and picking the right one matters:

| Home            | Loaded                                  | Best for                                                        |
| --------------- | --------------------------------------- | --------------------------------------------------------------- |
| **`CLAUDE.md`** | Every session, automatically            | Short, always-true **rules**. "Never merge your own PR."        |
| **A skill**     | Automatically, when the task matches it | Longer **procedures** — steps, templates, checklists, examples. |

> **Clearing up the most common misconception: skills are automatic. You do not have to type a
> slash command to use one.**
>
> A skill's one-line description sits in context, and when the task at hand matches it, the skill
> gets loaded and followed on its own — no `/command`, no prompting, no remembering. Typing
> `/skill-name` is available if you want to force one deliberately, but it's an override, not the
> normal path and not a requirement.
>
> This matters because a skill you had to remember to invoke would solve nothing. The entire point
> of writing one down is that you _stop_ having to remember — if it only worked when summoned by
> hand, you'd just be swapping "type the instructions again" for "type the command again."

Both homes load without you doing anything, then. The real difference is **when** and **how much**:
`CLAUDE.md` loads in full, every session, unconditionally — so it has to stay short, which makes it
good at stating **what** to do and bad at specifying **how**. A skill loads only in the sessions
where it's relevant, so it can carry a full template, a worked example, and a checklist without
taxing every unrelated conversation.

So: **a rule goes in `CLAUDE.md`; a procedure goes in a skill.** And when you find yourself
repeatedly correcting the _how_ rather than the _what_, the rule isn't the problem — the missing
procedure is.

### The worked example: this document's own history

This project's `CLAUDE.md` already says every task must add a log entry, "written as a training
manual for someone new to web development: explain tools/concepts the first time they appear."
That's a good rule, correctly placed. It's genuinely been followed.

And yet, across the sessions that produced this very document, the same guidance kept being
re-issued by hand — write this for beginners; explain the concepts, not just the steps; cover the
alternative approach too, not only what we chose; ground it in real examples from this codebase
rather than generic advice. None of that contradicted `CLAUDE.md`. All of it was _elaborating_ it,
because the one-line rule doesn't carry enough specificity to produce consistent output on its own.

That is exactly the signature of a missing skill. The rule ("write beginner-facing documentation")
belongs in `CLAUDE.md` and is already there. The **procedure** — what sections a good entry has,
how deep to explain a concept, the expectation to name the realistic alternative and say why it
wasn't chosen, the requirement to cite real code from this repo instead of inventing examples —
is too long for `CLAUDE.md` and shouldn't be paid for on every unrelated session. It belongs in a
skill, invoked when documentation is actually being written.

The cost of not having done that isn't dramatic — the documentation got written, and it's good. The
cost is that its quality depended on the same instructions being given again each time, which means
it depended on the person remembering to give them. That's the fragile part.

### What a skill actually is: a folder, not a file

Worth being concrete, because "skill" sounds more abstract than it is. **A skill is a folder** —
one required file plus whatever supporting material the procedure needs:

```
.claude/skills/
  documentation-entry/
    SKILL.md            ← required: the instructions
    template.md         ← a file to copy and fill in
    reference.md        ← detail needed only occasionally
    examples/
      good-entry.md     ← a worked example of the output
    scripts/
      check-links.sh    ← code to run, not read
```

`SKILL.md` is the only required file. It opens with a small frontmatter block — the **name** and
the all-important **description** — followed by the instructions themselves:

```markdown
---
name: documentation-entry
description:
  Use when writing or updating an entry in docs/log/ or IMPLEMENTATION_LOG.md — the
  required structure, depth of explanation, and beginner-facing conventions for this project.
---

When writing a log entry for a completed task, follow this structure…
```

#### Why the folder matters: things load in three stages

This is the mechanic that makes the whole arrangement efficient. Not everything loads at once:

| Stage | What loads              | When                                               |
| ----- | ----------------------- | -------------------------------------------------- |
| 1     | Name + description only | Always — this is the near-zero standing cost       |
| 2     | The `SKILL.md` body     | When the skill is actually used                    |
| 3     | The supporting files    | Only when `SKILL.md` points at one and it's needed |

So a skill can carry a large amount of material while costing almost nothing most of the time.
**The practical consequence: keep `SKILL.md` itself tight, and push bulk into supporting files**,
because `SKILL.md` loads in full every time the skill is used, while a reference file it links to
loads only when that detail is genuinely required.

#### What goes in which file

- **`SKILL.md`** — the procedure: when this applies, the steps, the rules, the checklist. If it's
  needed _every_ time the skill runs, it belongs here.
- **Reference files** (`reference.md`, `conventions.md`) — detail needed only sometimes. Link them
  from `SKILL.md` with a note about when to read them ("for the full list of section headings, see
  `reference.md`").
- **Templates** — a file meant to be copied and filled in. Better as its own file than pasted into
  `SKILL.md`: it can be copied literally, and it doesn't inflate what loads on every use.
- **Scripts** — code that gets **run rather than read**, and the most context-efficient thing a
  skill can contain. A validation script costs you its _output_ ("3 links broken"), not its source.
  Anything deterministic and checkable is better as a script than as prose instructions asking for
  the same check to be performed by hand.
- **Examples** — worked samples of good output. Genuinely useful for a "match this style" task, and
  exactly the sort of bulky material that should sit in its own file rather than inline.

#### Where skills live

Skills follow the same hierarchy as `CLAUDE.md`, and the same placement principle — **put it at the
broadest level where it's still universally true**:

| Where                      | Scope                             | Put here                                                      |
| -------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `.claude/skills/<name>/`   | This repo, everyone working on it | Project procedures — how _this_ codebase wants something done |
| `~/.claude/skills/<name>/` | Every project you work on         | Your own reusable workflows, not tied to any one codebase     |
| Bundled in a plugin        | Wherever the plugin is enabled    | Someone else's published workflow you've installed            |

The precedence works the same way too: **the more specific level wins for its scope.** If a project
skill and a personal skill share a name, the project's copy is the one that applies while you're in
that repo — which is what you want, since the project's version was written for that codebase and
reviewed by whoever works on it.

And the same caution applies: don't lean on that. Two same-named skills doing different things is
confusing to everyone including you. If a project genuinely needs a different procedure, give it a
name that says so rather than shadowing a personal one.

### How a skill gets used _without_ you asking

This is the part that makes skills worth the effort, and it's easy to miss: **you don't have to
remember to invoke one — and you don't need a slash command at all.**

Recall from the section above that a skill costs almost nothing until it's used, because only its
**name and one-line description** sit in context. That listing isn't just a menu for you — it's
what the assistant itself reads. When a task in front of it looks like one a listed skill covers,
it loads that skill and follows it, unprompted. Typing `/skill-name` yourself is the manual
override, not the normal path.

Specifically, it's the **`description:` field in `SKILL.md`'s frontmatter** doing that work — not
the folder name, not a heading in the body, not anything else. Which leads to the single
highest-leverage fact about writing a skill:

> **The `description:` is not a label. It's the matching rule — it states _when_ to use the skill,
> and that sentence is the whole reason the skill ever gets picked up.**

A skill described as _"Documentation helper"_ will sit there unused, because nothing about a
request like "write up what we just built" obviously matches it. The same skill described as _"Use
when writing or updating an entry in `docs/log/` or `IMPLEMENTATION_LOG.md` — the required
structure, depth of explanation, and beginner-facing conventions for this project"_ fires reliably,
because it names the actual situation and the concrete nouns that show up in real requests.

So a skill has two audiences, and they want different things:

- **The description** is read to decide _whether this applies right now_. Write it in terms of
  **when to use it**, and include the words that would appear in a real request — file names, task
  names, the vocabulary you actually use.
- **The body** is read only after that decision. This is where the full procedure, template,
  checklist, and examples go, and it can be as long as it needs to be.

**How to check it actually works:** start a fresh session, ask for the task in your own natural
words — without naming the skill — and see whether it gets picked up. If it doesn't, **fix the
description, not the body.** The body was never the problem; it was never reached.

This failure mode is worth naming because it's silent. A skill with a vague description doesn't
error or warn. It just quietly never fires, and you drift back to typing the same instructions by
hand — the exact problem it was written to solve — without any obvious signal telling you why.

**The trade-off against `CLAUDE.md`, stated plainly:** a rule in `CLAUDE.md` **always** applies,
because it's loaded every time and nothing has to match. A skill applies **only if its description
matches the task**. That's the real reason to keep genuinely non-negotiable rules ("never commit
straight to `main`", "never merge your own PR") in `CLAUDE.md` even though they're short enough to
live anywhere: you don't want them contingent on a matcher firing. Procedures can afford to be
matched; guardrails can't.

### The practical rule

**Said it twice? Notice. Said it three times? Write it down.**

And when you do, write it where it'll actually be found: a rule in `CLAUDE.md`, a procedure in a
skill. Then the next session starts from your standard instead of rediscovering it — which is the
whole point of everything else in this document.

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

| Situation                                                | What to do                                               |
| -------------------------------------------------------- | -------------------------------------------------------- |
| A task is done, merged, and the next task is unrelated   | `/clear`                                                 |
| Mid-task, transcript is noisy but you need continuity    | `/compact`                                               |
| Starting a session, or about to start something big      | `/context` — learn your baseline and what's eating it    |
| Baseline already high before you've typed anything       | Standing cost — trim MCP servers and `CLAUDE.md`         |
| You need part of a big file, or part of a long output    | Read a line range / `grep` / `head` — don't dump it      |
| A task changed how the project is built, run, or tested  | Check `CLAUDE.md` is still true; fix it in that PR       |
| You've given the same instruction three times            | Stop and write it down — that's a missing artifact       |
| A short rule that's always true                          | `CLAUDE.md` (loaded every session, so keep it brief)     |
| A longer procedure — steps, template, checklist          | A skill (fires automatically, so it can be full-length)  |
| Worrying you'll have to remember to invoke a skill       | You won't — matching is automatic; `/name` is optional   |
| Writing a skill's description                            | Describe _when it applies_ — that's what makes it fire   |
| Bulky material a skill needs only sometimes              | A supporting file it links to, not `SKILL.md` itself     |
| A check that's deterministic and repeatable              | A script in the skill — costs its output, not its source |
| A skill you wrote never seems to get used                | Fix the description, not the body — it was never reached |
| A non-negotiable guardrail, not just a procedure         | `CLAUDE.md` — always applies, never depends on matching  |
| Something that must happen every time, no exceptions     | A hook — `CLAUDE.md`/skills are read; a hook is enforced |
| Auto-format a file right after it's edited or written    | `PostToolUse` hook, `matcher: "Edit\|Write"`              |
| Block a tool call outright before it runs                | `PreToolUse` hook, exit code `2` to deny it               |
| Stopping a destructive command like `rm -rf` outright     | `PreToolUse` hook matched on `Bash`, not a `CLAUDE.md` line |
| Checking what hooks are actually configured               | `/hooks` in-session — view only, can't edit from there    |
| Deciding where to configure a hook                       | Same 3 scopes as MCP: project/local/user `settings.json` |
| Deciding which level a rule or skill belongs at          | The broadest level where it's still universally true     |
| Two levels contradicting each other                      | Rewrite so they don't — don't rely on override order     |
| A convention true for everyone on the project            | Project `CLAUDE.md` (committed, reviewed)                |
| A preference true for you across all projects            | Personal `~/.claude/CLAUDE.md`                           |
| Stack detail only relevant inside one part of a monorepo | A `CLAUDE.md` in that subdirectory                       |
| Writing a `CLAUDE.md` from scratch                       | Open with the stack, versions, and your preferences      |
| "Where is X?" across unfamiliar code                     | Delegate to `Explore` (read-only, safe to run)           |
| A check needing _every_ occurrence, not just some        | Not `Explore` — it reads excerpts and can miss things    |
| Deciding an approach before building it                  | Delegate to `Plan` (read-only)                           |
| A whole multi-step task, carried through to done         | Delegate to `general-purpose` (can edit — brief it well) |
| A question about the AI tooling itself                   | A docs-consulting agent, not general knowledge           |
| A task that will produce a lot of disposable raw output  | Delegate to a subagent                                   |
| A single known file/symbol lookup                        | Just do it directly — don't delegate                     |
| Two genuinely independent checks (e.g. two test suites)  | Launch both as parallel subagents                        |
| Starting a long session on a focused codebase            | Check `/mcp`, disable connectors the work can't touch    |
| The assistant can already do it, just not the way you want | A skill — a recipe for tools it already has            |
| The assistant genuinely cannot do it at all               | An MCP server — the only one of the three that adds tools |
| Adding an MCP server just for yourself, just here          | `claude mcp add <name> -- <cmd>` (scope defaults to `local`) |
| Adding one you want in every project you open              | `claude mcp add --scope user <name> -- <cmd>`            |
| Adding one the whole team should get from cloning the repo | `claude mcp add --scope project <name> -- <cmd>`         |
| Adding Gmail/Slack/Drive/GitHub-style account connectors   | claude.ai/customize/connectors — not `claude mcp add`    |
| An MCP server touching sensitive data                    | Prefer stdio (local) over remote — data never leaves     |
| An MCP server that won't connect                         | stdio fails at launch; HTTP fails on network/auth        |
| A capability one documented shell command already covers | Write a skill, don't add an MCP server                   |
| A capability with no CLI equivalent / complex auth       | An MCP server genuinely earns its place                  |
| A claim with no tool call behind it                      | Not verified — ask what was actually run                 |
| Tests pass / build succeeds / PR shows "Merged"          | Verify the actual state before trusting it               |
| A script or test behaves unexpectedly                    | Read the real source before iterating blindly            |
| A product decision with more than one reasonable answer  | Ask explicitly, don't guess silently                     |
| Finished with a dev server / background process          | Stop it, don't leave it running                          |

---

## Log of entries

Add new observations below, newest first. Keep each one short: what happened, why it mattered,
what to do differently.

### 2026-09-01 — A follow-up pass on the Hooks section: a canonical example, and the rule stated outright

The first Hooks pass explained the mechanism (`PreToolUse`/`PostToolUse`, `settings.json`, exit
codes) but skipped the single most common reason people reach for a `PreToolUse` hook in the first
place: refusing to run a destructive shell command at all, not just being asked nicely not to.
Added that as a third worked example (`rm -rf` and similar, matched against the `Bash` tool),
alongside the underlying rule stated as its own plain sentence rather than left implicit: **if
something has to happen without fail, it belongs in a hook, not a prompt.**

Also checked, rather than assumed, whether a `/hooks` slash command exists the way `/mcp` does for
MCP servers — it does, but it's **read-only** (view configured hooks and their detail; editing
still means touching `settings.json` directly), which is a real and non-obvious difference from
`/mcp`'s own more interactive behaviour, worth stating precisely rather than assuming parity by
analogy.

### 2026-09-01 — Hooks were never in this document at all

Every mechanism covered so far for shaping the assistant's behaviour — `CLAUDE.md`, a skill — has
the same underlying limit: the model has to *read it and choose to act on it*. That's fine for
almost everything, but it quietly breaks down for the one class of instruction where "almost
always" isn't good enough — "always run the formatter after an edit" is exactly that shape, and
this document had no answer for it beyond "write it in `CLAUDE.md` and hope."

Added a new section explaining hooks as the actual answer: a command the harness itself runs at a
defined point (`PreToolUse`, `PostToolUse`, and others), enforced regardless of whether the model
ever reasons about it. Verified the real `settings.json` schema, event names, matcher syntax, and
exit-code semantics against the official documentation first (the same `claude-code-guide`
subagent used for the MCP CLI syntax below) rather than writing plausible JSON from memory. Also
checked this project's own `.claude/settings.local.json` directly, which turned up a genuine,
concrete gap worth naming in the section itself: this repo runs `prettier --check` as a matter of
discipline on every task, with no hook actually enforcing it — precisely the example the section
opens with.

### 2026-09-01 — MCP had a cost story but no "how do I actually connect one" story

The MCP section (by then already substantial — transports, scoping-for-removal, the skills
trade-off) had a real gap once someone actually tried to *use* it rather than read about it: there
was no beginner framing of "MCP vs. a built-in tool vs. a skill" as three distinct things, and no
instructions for *adding* a server at all — only for turning one off. The scoping explanation had
the same shape problem underneath it: it named "project-scoped" and "user-scoped (local CLI)" as
if those were the only two options, when the CLI genuinely has three real scopes
(`local`/`user`/`project`), and `local` — the *default* — was never mentioned as its own thing.

Fixed by consulting the real Claude Code documentation first (via a specialised
documentation-consulting agent, not from memory — the same discipline the "Verify, don't trust"
section already argues for) to get the exact `claude mcp add` syntax, the exact `--scope` flag and
its three values, and the exact file locations, rather than writing plausible-sounding command
syntax and letting it be subtly wrong. Retitled the section, added a three-way MCP/tool/skill
comparison table up front, and rewrote the scoping subsection to cover adding *and* removing at
all three real scopes plus the separate, fourth case (account-level connectors, added through
claude.ai's own browser UI, not the CLI at all).

### 2026-09-01 — Naming the actual tools, not just the categories

The "categories of tool" table (Read/search, Write/edit, Execute, and so on) had sat there since
the first pass, correct but abstract — it never said *which* real tool did the work, or showed it
doing anything. Meanwhile several real sessions since then had piled up genuinely concrete
material: a rate limiter confirmed with a direct `curl` probe rather than assumed; a stray dev
server process checked against its own `CreationDate`/`CommandLine` before ever being stopped,
which is what caught that it belonged to a different session entirely; a Google Drive search that
came back empty and got surfaced as a real decision instead of quietly papered over; a design
mockup published as a live, comparable page before any component code changed. None of that had
made it into this document — it lived only in the sessions that produced it.

Added "The tools that actually did the work here" directly under the tool-loop introduction,
naming the real tool for each category and pinning it to one of those concrete cases. The
underlying point isn't new — it's the same "grounding, feedback, completion" argument the tool-loop
section already makes — but a category name ("Execute") doesn't carry that argument on its own the
way a specific, verifiable instance of it does. This is the same lesson the document's own "If
you're repeating yourself" section describes: an abstract rule was already correctly stated, and
what was missing was the concrete procedure/example layer underneath it.

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

The document then produced an observation about its own creation, which became the "If you're
repeating yourself" section: the guidance for _how_ to write this project's beginner-facing
documentation had been given by hand, session after session, on top of the one-line rule already in
`CLAUDE.md`. The rule was right and correctly placed; what was missing was the longer procedure
underneath it, which belongs in a skill. Worth noticing that the signal was there for a while
before anyone named it — repetition doesn't announce itself.

Writing the `CLAUDE.md` section then turned up a live example of the staleness trap it describes:
this repo's own `CLAUDE.md` still claimed neither project had a test runner or a linter
configured, long after both had full Vitest suites and working linters that were being run on
every task. Fixed in the same PR as this document — and a reminder that the check is worth making
deliberately, since nothing surfaces it on its own.
