# History Redesign: Bringing the Second Most-Used Page in Line with the First

## 2026-08-31 — Splitting a pre-joined label so a value can finally be a pill

**Task:** Direct feedback after [task 52](52-timeline-sync.md): History still looked like an
older screen next to Home's Timeline redesign - bold text day headers, trailing timestamps, two
boxy icon buttons per row. Designed a mockup (published as an artifact, before/after against the
same real data from the user's own screenshots, plus general UI notes on the app), got it
approved, and implemented both halves - the backend field split it needed, and the frontend
restyle. The design record itself, including the mockup source and real screenshots of the
result, lives in [`docs/design/history-redesign/`](../design/history-redesign/README.md).

### Background / concepts

#### The one string that was blocking the whole redesign

`GET /api/history` returned one pre-joined field per entry: `label: "Sertraline: Done"`. This
page's own code already flagged the gap this caused - a comment on the old per-day
`CollapsibleSection` said splitting that string to recover the category name "is the kind of
fragile parsing that breaks the first time a category name contains a colon. It wants a real
field on the response instead" - but nothing had acted on it. Rendering a value as its own pill,
the way a Timeline row's "Logged"/"Done" state already does, needs the name and the value apart;
concatenated, there's no way to style one without the other.

Split into `categoryName`, `categoryIcon`, and `value` - three separate fields, mirroring exactly
how `formatCategoryLogValue` already computed the value half; the only change is that
`history.ts` stops concatenating it onto the category name before sending it. `categoryIcon` is a
genuinely new field (the `category` select never included `icon` before), added for the same
reason Timeline already shows one on a reminder row.

#### A collapsible divider, not a straight copy of Timeline's

Timeline's own day divider (thin rule, centered pill, thin rule) has no reason to collapse - it
only ever shows one day at a time, the default "Today" view. History spans weeks, so per-day
collapse (a real, already-tested feature - see `HistoryPage.test.tsx`'s "collapses one date group
without affecting another") was worth keeping rather than dropping to match Timeline exactly.

`CollapsibleSection` itself couldn't render this directly - its header is always icon-title-badge
-subtitle-meta-chevron, left to right, and there's no prop combination that produces two `flex-1`
rules either side of a centered pill. Rather than duplicate `useCollapsedState`'s own logic (the
hook that gives every disclosure in this app its "collapse all" broadcast and localStorage
persistence), the new `DayGroupDivider` component calls that hook directly - the same one
`CollapsibleSection` itself uses internally - so History's day groups still participate in the
exact same collapse-all behaviour as everything else, just under a differently-shaped header.
`Chevron`, previously private to `CollapsibleSection.tsx`, is now exported for this to reuse
rather than duplicating the svg.

### What was done

- **`backend/src/routes/history.ts`**: `HistoryEntry`'s `label: string` field replaced with
  `categoryName: string`, `categoryIcon: string | null`, `value: string`. The category `select`
  gained `icon: true`. `formatCategoryLogValue`'s own output now goes straight into `value`,
  unconcatenated.
- **`frontend/src/pages/history/historyLogApi.ts`**: `categoryLabel` (the concatenating helper)
  removed - `categoryValueLabel` (already returning just the value half) is now used directly.
- **`frontend/src/pages/history/HistoryEditModal.tsx`**: its local, no-refetch-needed
  `onSaved` callback now builds `categoryName`/`categoryIcon`/`value` directly instead of calling
  the now-removed `categoryLabel`.
- **`frontend/src/components/CollapsibleSection.tsx`**: `Chevron` exported.
- **`frontend/src/pages/HistoryPage.tsx`**: `HistoryEntry` type updated to match. New
  `DayGroupDivider` (the collapsible thin-rule-plus-pill header described above) replaces the
  per-day `CollapsibleSection`. New `HistoryRow` replaces the old two-line card: leading
  tabular-nums time, category icon (when present) plus name as the primary line, notes as a
  truncated detail line, a value pill, then two small 28px circular Edit/Delete buttons as
  trailing siblings - the same restrained icon-button sizing Timeline's own row-level "+" and
  checkbox already use, rather than the previous full `Button`/`ActionButton` pair.
  `historyValueTone` colors a value pill success-green only for `"Done"` - every other value
  (`"Not done"`, a bare number, a scale fraction, a duration) stays neutral.

### Decisions

- **Green means outcome, not "is a pill."** Every value renders as a pill now, but only `"Done"`
  gets Home's success-green tone. An explicit `"Not done"`, or a plain recorded number, is a real
  answer, not a failure the way a missed reminder is - coloring it red or green just because it's
  now a pill would imply a good/bad reading a raw recorded value doesn't actually have.
- **Collapsibility survives the redesign; the header shape doesn't try to be identical to
  Timeline's.** Timeline's divider is deliberately non-interactive because it never needs to be
  anything else; History's borrows the same visual language and adds exactly what History's own
  multi-week view needs (a count, a chevron, a click target) rather than either dropping a real
  feature or forcing Timeline's own component to grow a capability it doesn't need.
- **Edit/Delete lose their `sm:`-and-up text label.** `ActionButton` (icon on narrow, label from
  `sm:` up) stays exactly as it is for `CategoriesPage.tsx`, which still uses it - History's own
  two actions switch to icon-only at every width instead, matching how Timeline's own icon
  buttons work (no responsive label swap there either). The accessible name is unchanged either
  way, so this is a visual restyle, not a functional or accessibility change.

### Verification

- **Backend: 431 tests across 29 files, green.** One new test (`categoryIcon` returned when set,
  `null` when it isn't); five existing tests updated from `label` assertions to
  `categoryName`/`value` assertions (or a locally-rejoined `${categoryName}: ${value}` string,
  purely for a concise `arrayContaining` check - not because the route itself still concatenates
  anything).
- **Frontend: 352 tests across 40 files, green.** `tsc -b`, `oxlint`, `prettier --check` all
  clean. `HistoryPage.test.tsx` fully rewritten for the new fixture shape and split name/value
  assertions - including one regression this rewrite itself caught: a test supplying a real
  `/api/categories` response collided on `getByText("⚡ Energy level")` against the Category
  filter's own `<option>` rendering the identical string, fixed by scoping the query to a `span`
  selector. `historyLogApi.test.ts` lost its one `categoryLabel` test (function removed) and kept
  all five `categoryValueLabel` tests, unchanged.
- **The two e2e specs asserting History's old combined `"Name: value"` text**
  (`edit-and-delete.spec.ts`, `quick-add-and-dashboard.spec.ts`) updated to check the name and the
  value pill as separate elements - a bare category name (e.g. `"Mood"`) isn't unique on this page
  once the redesign is in (the Category filter's own `<option>` renders it too), and a bare value
  like `"Done"` isn't unique across two different boolean categories, so name-specific assertions
  are scoped to the containing `<li>`.
- **Driven end-to-end in a real browser**, mobile (412px, light) and desktop (1280px, dark),
  against live dev servers and a real Postgres database, on fresh, unused ports so no
  already-running dev server elsewhere in this repo (several independent ones were found running,
  none started by this task) was touched: registered a fresh account; created four categories
  covering every value type (boolean with an icon, scale with an icon, a bare numeric with no
  icon, duration with an icon) across two days; confirmed the green "Done" pill, three neutral
  pills (`"Not done"`, a scale fraction, a duration), the icon-prefixed and bare-name rows, and
  day-group collapse (collapsing "Monday" correctly hid only that day's three rows, both by count
  and by screenshot, while "Sunday" stayed open); opened and closed both the real edit dialog and
  the real delete confirmation dialog. Screenshots in
  [`docs/design/history-redesign/screenshots/`](../design/history-redesign/README.md).

### Known limitations and follow-ups

- **The two hand-copied pill-tone palettes this redesign's own mockup flagged
  (`PILL_TONE`/`TASK_PILL_TONE` in `TimelinePanel.tsx`, now a third convention in
  `HistoryPage.tsx`'s `HISTORY_VALUE_TONE`) are still three separate copies**, not one shared
  `StatusPill`/token map - noted as the highest-priority follow-up in the design record, not done
  as part of this task.
- **Filters keeps its existing `CollapsibleSection`-based styling untouched** - only the per-day
  entry list and its rows were in scope for this pass.
