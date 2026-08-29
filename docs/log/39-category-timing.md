# Category Timing: Reminder, Cooldown, or Stopwatch (Backend)

## 2026-08-29 — "A timer or a reminder" turns out to be three questions

**Task:** From a real phone, looking at the log form: _"when logging we should allow to set a timer
or a reminder, in fact we should have categories either define a reminder or timer."_

This entry covers the backend: the model, the API, and why the setting lives where it does. The
three controls it enables follow in their own task.

### Background / concepts

#### One word, three different things

"Timer" turned out to mean two unrelated things depending on which category you had in mind, and
neither is a reminder. Asked directly, the answer was _both_ — so the setting has three modes:

| Mode        | What it says                                         | Example               |
| ----------- | ---------------------------------------------------- | --------------------- |
| `reminder`  | _Do this again later._ Offers a nudge after logging. | Water, every 2 hours  |
| `cooldown`  | _Not yet._ A minimum gap before the next one.        | Diazepam, 6 hours     |
| `stopwatch` | _This one has a duration; measure it._               | Screen time, Exercise |

A cooldown is the **opposite instruction** to a reminder — one prompts you to act, the other tells
you not to yet — which is exactly why they can't be one setting with a flag. And a stopwatch isn't
about the future at all: it produces the value being logged.

There is no `none` member, because the absence of a row already means that. Two representations of
"no timing" would be two things to keep in step.

#### Why this is a per-user row, not a column on the category

The obvious move is columns on `Category`. It's wrong, for two reasons that only show up on
built-in categories:

1. A system category (`userId: null`) is **shared**. One person's six-hour gap is not a property of
   Diazepam; it's a property of how they've chosen to track it. A column would apply it to
   everyone.
2. A system category is also the one kind a user **cannot edit at all** — they only get Hide. So a
   column would make the feature unavailable on exactly the categories where a per-user setting
   earns its keep.

`Reminder` and `HiddenCategory` already solve this the same way: a row keyed by
`(userId, categoryId)`. `CategoryTiming` follows them, and `GET /api/categories` scopes the include
to the caller exactly as it already does for `hiddenBy`.

#### A cooldown needs no new state at all

This is the part worth noticing. A countdown is "last log + gap", and `GET /api/categories` already
returns `lastLoggedAt` for every category — it was added for the logged-today markers. So the
countdown is derived entirely on the client from two values it already has. Nothing ticks on the
server, nothing is stored, and there is no job to get wrong.

### What was done

- **`CategoryTiming`** — `(userId, categoryId)` unique, `mode`, optional `intervalMinutes`.
  Cascades from both user and category (it's a preference, not a record of anything that happened).
- **`PUT /api/categories/:id/timing`** and **`DELETE /api/categories/:id/timing`**, sitting beside
  the hide/unhide routes they mirror.
- **`GET /api/categories`** now returns `timing` per category — `null` when unset.
- **`lib/categoryTiming.ts`** — the API↔Prisma enum translation, and `timingIntervalError`, which
  holds the per-mode rules.

### Decisions

- **`PUT`, not `POST`.** There is at most one per `(user, category)`, and setting it twice is
  setting it, not creating two.

- **The update replaces every field rather than merging.** Switching a category from a six-hour
  cooldown to a stopwatch must not leave the six hours behind as the stopwatch's interval. It has
  its own test, because a stale field surviving a mode change is precisely how a setting ends up
  meaning something nobody chose.

- **The interval rules differ per mode, and live in a named function rather than zod refinements.**
  The rule depends on the _category_ as well as the request (a stopwatch needs a `DURATION`
  category), which a schema can't see:

  - `cooldown` — interval **required**; it _is_ the setting. 5 minutes to 24 hours.
  - `stopwatch` — interval **forbidden**, and only on a `DURATION` category. Offering it on a 1–7
    scale would be measuring something with nowhere to put the answer.
  - `reminder` — interval **optional**, since "offer me the usual choices and I'll pick each time"
    is a good answer. Bounded to 15 minutes–12 hours, **matching `POST /api/reminders/follow-up`
    exactly**, because that value is handed straight to it. Anything this accepted that the
    follow-up refused would be a setting that fails only when used.

- **A cooldown may be longer than a reminder may be.** It schedules nothing — it's a countdown
  drawn on screen — so it isn't bound by what the scheduler can do. A day is the ceiling; past that,
  "gap since last time" stops being a timer and becomes a habit, which is what a reminder is for.

### How a request actually travels

`PUT /api/categories/<id>/timing` with `{ mode: "cooldown", intervalMinutes: 360 }`:

1. **Express → `categoriesRouter`**, behind the auth middleware.
2. **Zod** checks the shape only — `mode` is one of three, `intervalMinutes` is an optional
   nullable integer. It deliberately does not try to express the three-way rule.
3. **The category is looked up scoped to the caller** — their own, or any system one. A tampered id
   404s rather than confirming the row exists.
4. **`timingIntervalError`** applies the rule for this mode against this category's `valueType`,
   returning a message rather than throwing so it can be attached to the field it belongs to.
5. **Prisma upserts** on the `(userId, categoryId)` unique constraint, replacing both fields.
6. Later, **`GET /api/categories`** includes `timings` filtered to the caller, and emits
   `timing: { mode, intervalMinutes } | null` alongside the `lastLoggedAt` a countdown needs.

### Verification

- **Full backend suite: 309 tests across 23 files, green.** `tsc --noEmit`, eslint, prettier clean.
- **14 new tests**, and every new rule mutation-checked — each mutation reverted straight after:

  | Mutation                                          | Caught by                                                         |
  | ------------------------------------------------- | ----------------------------------------------------------------- |
  | `update` merges instead of replacing              | `replaces the whole setting when the mode changes`                |
  | Drop the `userId` scope on the `timings` include  | `can be set on a built-in category without affecting anyone else` |
  | Remove the `DURATION` check for a stopwatch       | `refuses a stopwatch on anything not measured in minutes`         |
  | Remove the required-interval check for a cooldown | `requires a gap for a cooldown`                                   |

- **A real bug in the tests themselves, found by that mutation pass.** The first mutation run
  reported _all tests passing_ — which is impossible if the tests exercise the code. They didn't:
  the whole new `describe` block had been inserted **inside `afterAll`**, so its 14 tests never ran
  at all, and the "31 passed" was the pre-existing suite alone.

  Moving the block to the top level took the file from 31 tests to 45, and the mutations then
  failed exactly as they should. Worth recording plainly: a passing suite said nothing here, and
  the only reason that surfaced is that a deliberate break _didn't_ fail. Without the mutation
  pass this would have shipped as fourteen tests that never ran.

- **Driven against the really running server** (`npm run dev`, port 4000, real Postgres):

  ```
  cooldown 6h  : {"mode":"cooldown","intervalMinutes":360}
  stopwatch    : {"mode":"stopwatch","intervalMinutes":null}
  reminder 2h  : {"mode":"reminder","intervalMinutes":120}
  stopwatch on a numeric category: 400 {"intervalMinutes":["A stopwatch only works on a category measured in minutes"]}

  Diazepam     timing={"mode":"cooldown","intervalMinutes":360} lastLoggedAt=2026-08-29T21:04:19.404Z
  Screen time  timing={"mode":"stopwatch","intervalMinutes":null} lastLoggedAt=null
  Screen time  timing=null                                       lastLoggedAt=null
  Water        timing={"mode":"reminder","intervalMinutes":120}   lastLoggedAt=null
  after DELETE : null
  ```

  The two `Screen time` rows are the point, not a bug: one is the seeded system category, one is
  the test account's own. Only the account's own carries the stopwatch — which is the per-user
  isolation the whole model exists for, visible in one line.

- **The migration was checked against the real database**, not just "it ran": `\d category_timings`
  shows the columns, the `(user_id, category_id)` unique index and both cascading foreign keys.
  Nothing was backfilled, because no category has any timing and the absence of a row is exactly
  what that means.

**What this does not prove.** None of the three modes does anything yet — this is the model and the
API only. A cooldown has no countdown drawn, a stopwatch measures nothing, and a reminder mode
changes nothing about what the log form offers. All of that is the next task.

### Known limitations and follow-ups

- **The frontend half**: setting the mode on a category, the live countdown on a card, the
  stopwatch in the log form, and pre-selecting a reminder's interval when offering a follow-up.
- **A cooldown notifies nobody.** It's a countdown you look at. "Ping me when the gap is up" is
  expressible with the existing follow-up machinery and would be a natural addition, but it is a
  different thing from displaying a countdown and shouldn't be assumed.
- **A stopwatch will need somewhere to keep a running timer.** Almost certainly `localStorage`,
  per device — which means starting one on a phone and stopping it on a laptop won't work. Worth
  deciding deliberately when that UI is built rather than discovering it.
- **`intervalMinutes` bounds are duplicated in spirit with `reminders.ts`.** They're matched
  deliberately and the reasoning is commented at both ends, but nothing enforces that they stay in
  step. If a third caller ever appears, the bounds should move somewhere shared.

---
