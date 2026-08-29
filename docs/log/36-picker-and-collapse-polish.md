# Picker and Collapse-All Polish

## 2026-08-29 — A button that told the truth, and one chip fewer

**Task:** Three observations from using the deployed Categories page:

1. With groups expanded, the bulk control still said **"Expand all"** — it never noticed a group
   being toggled by hand.
2. It should use an up/down icon on mobile, like the other row actions.
3. **"Every hour"** wasn't useful sitting alongside a day selection; hourly could live in the cron
   box instead.

### Background / concepts

#### Why the button went stale, and what that cost

When the bulk control shipped it tracked a single flag — _what it did last time_ — rather than what
the sections actually were. That was a deliberate choice, made to preserve the decoupling the
broadcast design gives: sections own their own collapsed state, and the page never needed to know
how many existed.

The report is the bill for that decision. Toggle one group by hand and the flag is immediately
wrong: the page can be fully expanded while the button offers to expand it again.

The fix keeps the decoupling but reverses one direction of the conversation. `useCollapsedState`
now **announces** when its state changes (`dispatchCollapsedChanged`), and the page listens and
counts. Sections still don't know the page exists; the page still doesn't know which sections do.
The button derives its label from `anyExpanded` rather than remembering anything.

Initial state comes from a new `readCollapsedState(key)` export rather than the page reading
localStorage itself — the page shouldn't need to know where a section keeps its state, only how to
ask.

#### The React bug this surfaced

The first version dispatched from _inside_ the `setCollapsed` updater. React may run an updater
during render, and dispatching synchronously calls listeners — so a listening parent set state
while a child was mid-render, and React said so:

> Cannot update a component (`CategoriesBody`) while rendering a different component
> (`GroupSection`)

It only appeared because the browser check asserts **zero console errors**; every assertion in that
script passed regardless. Both side effects — persisting and announcing — now sit in the event
handler, where they run once, after the click.

### What was done

- **The bulk control derives its label** from what the sections report, so it always offers the
  action that would actually happen.
- **It's an `ActionButton`** now, so it shows `⌃`/`⌄` on a phone and "Collapse all"/"Expand all"
  from `sm:` up, consistent with every other row action.
- **"Every hour" removed** from the repeat chips, and with it the `hourly` mode in `ScheduleRule`.
  The rule model is now simply days plus times.
- **`groupCollapseKey()`** is a single helper both the page and the section use, so the two can't
  drift on a storage key they now share.

### Decisions

- **Hourly is still fully supported — just not through the chips.** Typing `0 * * * *` into the
  cron box works exactly as before, and the row still reads **"Every hour, daily"** rather than
  degrading to "Custom schedule": `describeHourly` recognises the pattern for _display_ even though
  the controls no longer _edit_ it. Editing stays honest (raw text, with the "can't be shown as
  controls" note) while the list stays readable. That split is the whole point.
- **Removing the mode rather than just hiding the chip.** Leaving `hourly` in the model with no way
  to reach it would have meant an existing hourly reminder rendering as day toggles with no times
  and no explanation — worse than showing the expression.
- **Two chips have now been removed for the same underlying reason.** "Custom" and "Every hour"
  both looked like modes but weren't: the day toggles are always visible and are the real control.
  Worth naming as a pattern, since the remaining three are genuinely just shortcuts for a day
  selection.
- **The page seeds nothing on mount.** It reads stored state lazily per section and only tracks
  what has changed since. Announcing on mount would have raced React's child-effects-first
  ordering — the page's listener isn't registered until after its children have already mounted.

### Verification

- `npx vitest run`: **258 tests across 36 files, green.** The schedule tests were updated rather
  than deleted — the hourly cases now assert that hourly _parses as raw text_ and _describes
  readably_, which is the new intended behaviour, not the absence of behaviour.
- `npx tsc -b`, lint, `format:check`, `build`: clean.
- **Real browser, 412×915, zero console errors** — the reported bug specifically:

  | Action                                | Button says                           |
  | ------------------------------------- | ------------------------------------- |
  | Start (all expanded)                  | `Collapse all`                        |
  | After Collapse all                    | `Expand all`                          |
  | **After expanding one group by hand** | **`Collapse all`** ← was stale before |
  | After Collapse all again              | `Expand all`                          |
  | After Expand all                      | `Collapse all`                        |

  Plus: repeat chips are exactly `["Every day", "Weekdays", "Weekends"]`; typing `0 * * * *`
  previewed `Next: today at 14:00` and the saved row read `Every hour, daily`; the button shows `⌃`
  at 412px and `Collapse all` at 900px.

- Not proven: behaviour with a very large number of groups. The page now holds one map entry per
  toggled group, which is trivially small at any realistic count, but it has only been exercised
  against the seven groups a seeded account has.

### Known follow-ups

- **A "just for today" repeater** — the other half of the third observation: a temporary reminder
  that fires every N minutes or hours for the rest of today only. Deliberately not built here,
  because it isn't a variation on the existing controls: every reminder in the system today is a
  standing schedule with no end, whereas this one would need to expire. That's a data-model
  question (does a reminder gain an end date, or is this a different kind of object?) worth
  answering before any UI is drawn.

---
