# Scale Rating Wraps on Mobile

## 2026-08-27 — Bug fix: wide scale categories overflowed and got clipped on mobile

**Reported directly on the live app**: a screenshot of the "Log an entry" form for a 1-10 scale
category (Headache) on a mobile-width screen showed the rating buttons (1 through 10) cut off and
clipped, rather than fully visible. Asked to fix it so a wide range like this wraps onto two rows
instead.

### Background / concepts

#### Why this only affects some scale categories, not all of them

`Category`'s `valueType: "scale"` is generic - `scaleMin`/`scaleMax` are whatever the category (a
seeded system one, or a user's own custom one) was defined with. Every value in that range renders
as one `role="radio"` button in `RatingScale.tsx` (`role="radio"` is an ARIA attribute - metadata
that tells assistive technology like a screen reader "treat this plain `<button>` as if it were one
option in a group of radio buttons," since it isn't a native HTML `<input type="radio">`). Two very
different ranges exist among the seeded categories today: Mood (1-5) and Energy/Stress (1-7) - both
narrow enough to fit on one line at a typical mobile width (the visible width of a phone's browser
window, roughly 360-412px for common phones) - and every former-Symptom severity category,
including Headache (1-10) - too wide for one line without wrapping.

#### `RatingScale` already had the mechanism this needed - it just wasn't wired up

`RatingScale.tsx` has carried a `columns` prop since it was first pulled out as a shared component
(see its own top-of-file comment, referencing the Phase 5 checklist): passing a number switches its
container from an unwrapped `flex` row (CSS Flexbox - lays elements out in a single line, and by
default keeps cramming them onto that one line rather than wrapping) to a CSS grid with that many
fixed columns (CSS Grid - lays elements out into a fixed number of columns, automatically wrapping
onto a new row once a row's columns fill up), which wraps onto additional rows once the value count
exceeds the column count. The bug wasn't in `RatingScale`
itself - it was that `CategoryEntryForm.tsx` (the only real caller of `RatingScale` for logging a
category's value, used by both the shared discovery picker and every `CategoryLogCard`'s own "+")
never actually passed `columns` for any category, regardless of how wide its range was. A 1-10
scale therefore always rendered as one 10-button `flex` row with no wrapping, which is exactly what
overflows a ~360-412px mobile viewport and gets visually clipped.

### What was done

- **`frontend/src/components/CategoryEntryForm.tsx`**: added a `SINGLE_ROW_MAX_VALUES = 7` module
  constant (matches the widest range - Energy/Stress's 1-7 - that's already confirmed to fit on one
  line) and now passes
  `columns={scaleValues.length > SINGLE_ROW_MAX_VALUES ? Math.ceil(scaleValues.length / 2) : undefined}`
  to `RatingScale`. A range at or under 7 values keeps rendering as a plain single `flex` row,
  unchanged; a wider range (10, for every severity-style category; or any custom category a user
  defines with a wide scale) now renders as a grid split into exactly two even rows.
- **Tests** (`CategoryEntryForm.test.tsx`): new test asserting a 1-10 scale category's radiogroup
  renders with `gridTemplateColumns: repeat(5, minmax(0, 1fr))` (the two-row grid layout); new test
  asserting a 1-5 scale category's radiogroup has no `gridTemplateColumns` style at all (still the
  plain single-row layout, unaffected).

### Why it's needed

Closes the exact problem reported: a wide scale category's rating buttons no longer overflow and
clip on a mobile-width screen.

### Decisions

- **Split into exactly two even rows (`Math.ceil(values.length / 2)` columns), not a fixed column
  count like 5.** A fixed `columns={5}` happens to produce two even rows for the seeded 1-10 range,
  but `Category` is generic - a user can define their own scale with any `scaleMin`/`scaleMax`. A
  fixed count of 5 would leave, say, an 11-value custom range as a lopsided 5-then-6 (or 5-then-5-
  then-1, needing a third row) instead of a clean two-row split. Deriving the column count from the
  actual range length keeps this correct for any custom category, not just the ones known about
  today.
- **Threshold of 7, not some other number.** Matches the widest range already confirmed (by
  `RatingScale.tsx`'s own original design comment) to fit on one line without wrapping -
  Energy/Stress's 1-7. Anything at or under that stays exactly as it already rendered; only ranges
  that exceed it switch to the two-row grid.

### Verification

- `npx vitest run` (frontend): full suite green - 197 tests across 30 files (2 new in
  `CategoryEntryForm.test.tsx`).
- `npx tsc -b`, `npm run build`, `npm run lint` (oxlint), `npx prettier --check`: all clean, no new
  warnings introduced.
- Manual, real-browser verification via a temporary Playwright script (not committed) against the
  actual running dev servers (backend on :4000, frontend on :5173, real Postgres) at a 412x915
  mobile viewport: opened the Log an entry form for Headache (1-10) and confirmed its radiogroup's
  computed `grid-template-columns` is five equal columns and its bounding box is 330px wide by 88px
  tall (two 40px rows plus the 8px gap between them) - fully within the viewport, not clipped.
  Screenshot confirms all ten buttons fully visible across two rows. Separately opened the form for
  Energy (1-7) and confirmed its radiogroup's bounding box is still a single 40px-tall row,
  unchanged.

---
