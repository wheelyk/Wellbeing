# Unify Scale Categories to 1-7

## 2026-08-27 — Standardizing every built-in scale category onto a common 1-7 range

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item - a direct follow-up question after
fixing the mobile-clipping bug on wide scale categories (see
[docs/log/20-scale-rating-mobile-wrap.md](20-scale-rating-mobile-wrap.md)): now that a 1-10 scale
_can_ wrap onto two rows on mobile, should it - or should every scale category be brought onto one
common range instead? Two options were put directly to the project owner (which range, and how
wide the change should reach) before doing anything, since this touches real logged history for
every affected category - see _Decisions_ below for both answers.

### Background / concepts

#### Why this question came up again, and why the answer wasn't "just leave it, it's fixed now"

This project already faced almost this exact question once before, for Energy/Stress specifically

- see [docs/log/03-mood-logging.md](03-mood-logging.md)'s "Widening energy/stress from 1-5 to 1-7"
  entry. That earlier discussion rejected 1-10 in favor of 1-7 for two independent reasons: a mobile
  _layout_ argument (10 buttons didn't fit one row), and a **genuine midpoint** argument (an
  odd-sized scale like 1-7 has a true center value - 4 - which an even-sized one like 1-10 doesn't;
  7-point Likert-style scales (a Likert scale is the standard "rate this on a fixed numbered scale"
  survey format - e.g. "1 = strongly disagree" through "5/7 = strongly agree" - widely used and
  studied for reliably measuring subjective things like opinions or mood) are a standard, validated
  choice for subjective self-ratings for exactly this reason). The mobile-wrap fix in the entry just
  before this one only addresses the
  first reason - the midpoint argument is completely independent of screen space, and still favors
  7 over 10 on its own merits. That's why this was worth re-raising rather than treating the wrap
  fix as the end of the story.

#### What was actually inconsistent before this change

Three different ranges existed among the app's own built-in scale categories:

- **Mood**: 1-5 (never touched since its original design).
- **Energy, Stress**: 1-7 (widened from 1-5 in the entry referenced above).
- **The 8 seeded system severity categories** (Headache, Fatigue, Nausea, Joint pain, Brain fog,
  Insomnia, Anxiety, Depression): 1-10 (inherited from the original `Symptom` model's fixed
  severity scale, carried over as-is when Symptom unified into Category - see
  [docs/log/17-unify-mood-symptom-habit.md](17-unify-mood-symptom-habit.md)).

A user moving between, say, logging Mood (1-5) and Headache (1-10) in the same session was working
with three genuinely different scales with three different meanings for "the maximum," despite
every one of them being presented with the exact same UI (`RatingScale`/`CategoryEntryForm`).

#### Why the rescale needed the same rigor as the one that already went wrong once

[docs/LESSONS-LEARNED.md](../LESSONS-LEARNED.md) has an entry titled "A rescale migration's own
safety claim was wrong - caught by testing it twice," from the Energy/Stress 1-5 -> 1-7 migration:
the first version of that migration's own comment claimed it was safe to run more than once, and
that claim was wrong - re-running it corrupted already-migrated values, because some of the
mapping's own _outputs_ were also valid _inputs_ to the same mapping. Anything that rescales real
logged history has to be tested with exactly that failure mode in mind, not just "does it produce
the right answer once."

### What was done

1. **New migration** (`20260827180000_unify_scale_categories_to_1_7`, hand-written, matching this
   project's own established pattern for data-migrating changes):
   - Rescales every `category_logs.value_numeric` row against the Mood category (fixed id, from
     the `mood_to_category` migration) using the already-proven `1->1, 2->3, 3->4, 4->6, 5->7`
     mapping - the exact same one already verified for Energy/Stress, reused as-is since it's the
     same source and destination range.
   - Rescales every `category_logs.value_numeric` row against the 8 seeded severity categories
     (matched by `user_id IS NULL` + name, exactly like `seed.ts`'s own existence check, since -
     unlike Mood/Energy/Stress - these were never given fixed ids) using a new
     `1->1, 2->2, 3->2, 4->3, 5->4, 6->4, 7->5, 8->6, 9->6, 10->7` mapping (see _Decisions_ below
     for its derivation).
   - Updates each affected category's own `scale_max` to `7` (Mood was `5`, the severity
     categories were `10`; Energy and Stress are already `7` and untouched).
   - **Built to be naturally idempotent this time** (see the [Glossary](../GLOSSARY.md)'s
     "Idempotent" entry - it means running something more than once produces the same end result
     as running it once), unlike the migration that prompted the Lessons Learned entry above: each
     rescale `UPDATE` is gated in its own `WHERE` clause on the
     category's _current_ `scale_max` (`5` for Mood, `10` for the severities) - once the second
     half of the migration flips that to `7`, the exact same gate makes an accidental second run
     of the whole file a genuine no-op, rather than silently re-interpreting an already-rescaled
     value as if it were still on the old scale. Verified directly (see _Verification_), not just
     reasoned about - the same discipline the earlier bug was found with.
2. **`backend/prisma/seed.ts`**: the 8 seeded severity categories now seed directly at `1-7`
   instead of `1-10` - a brand-new database must start at the current standard, since the
   migration above only ever rescales rows that already existed at the time it ran, not ones
   seeded afterward.
3. **`frontend/src/components/CategoryCreateForm.tsx`**: a brand-new custom "scale" category now
   defaults to `1-7` (was `1-5`) - both its `scaleMin`/`scaleMax` initial state and the type
   picker's own hint text ("e.g. Energy level, 1-7"). A user can still freely choose their own
   range; only the suggested starting point changed, matching the same house standard every
   built-in scale category now uses.
4. **`backend/prisma/schema.prisma`**: updated `Category`'s own doc comment, which previously
   described three different per-category ranges, to state the unified 1-7 standard (and that a
   user's own custom scale category may still use any range they choose).
5. **Tests**: `CategoryCreateForm.test.tsx`'s "creates a scale category with its bounds" test
   updated to expect the new `1-7` default rather than `1-5`.

### Why it's needed

Closes the inconsistency directly: every built-in scale category (Mood, Energy, Stress, and all 8
severity categories) now shares one common, meaningful range, with a genuine midpoint, instead of
three different ranges that happened to share the same UI.

### Decisions

- **7, not 10.** Confirmed directly with the project owner before implementing: the midpoint
  argument from the original Energy/Stress discussion applies just as much to the severity
  categories and Mood as it did to Energy/Stress at the time - a validated, well-established scale
  size for subjective self-ratings, independent of whatever screen space happens to be available.
- **Everything, including Mood - not just the 8 severity categories.** Confirmed directly: rather
  than leaving Mood as a fourth, still-different range (1-5) alongside a newly-unified 1-7 for
  everything else, all of it moves onto the same standard in one pass.
- **Existing logged history is rescaled, not left as-is.** Same reasoning as the original
  Energy/Stress migration: an old "10/10, worst headache" entry should still read as the maximum
  today, not silently become "10/7" (out of bounds) or ambiguously "read as a 10 out of some
  unstated older scale." Preserving relative position matters more here than preserving the
  literal old digit.
- **A linear 1-10 -> 1-7 mapping, rounded to the nearest integer** - "linear" here just means each
  old value is stretched or compressed onto the new range by the same fixed proportion throughout,
  the way you'd evenly compress a 10cm ruler's markings onto a 7cm one, rather than compressing some
  parts of the range more than others (`1 + (old-1) * 6/9`, rounded). Endpoints land exactly
  (`1->1`, `10->7`); every intermediate value's fractional part is either `.333` or `.667`, never
  exactly `.5`, so - unlike the original 1-5 -> 1-7 mapping - this one has no round-half tie-break
  ambiguity (a case where a fraction lands exactly halfway between two whole numbers, e.g. `2.5`,
  so "round up" vs. "round down" both seem equally reasonable and the choice has to be made
  explicit) to get wrong in the first place. Still verified against real data rather than trusted
  by inspection (see _Verification_).
- **Gate each rescale `UPDATE` on the category's current bounds, making the whole migration
  naturally idempotent**, rather than repeating the earlier migration's approach of documenting
  non-idempotency as an accepted risk. A small amount of extra care in the `WHERE` clause converts
  the exact failure mode from the Lessons Learned entry into something that can't happen by
  construction, not just something that's been warned about.
- **A user's own personal scale category is untouched.** This migration only reaches the app's own
  built-in categories (matched by a fixed id for Mood, or by `user_id IS NULL` + name for the
  severity categories) - it does not touch any user-defined custom scale category, whatever range
  they chose for it.

### Verification

- **Real before/after values, hand-verified against actual inserted data** - not just reading the
  SQL: inserted one `category_logs` row per possible input value (`1` through `10` against
  Headache, `1` through `5` against Mood) directly into the local dev database, ran the actual
  migration file, and confirmed every single output matched the intended mapping table exactly
  (`Headache: 1,2,2,3,4,4,5,6,6,7`; `Mood: 1,3,4,6,7`) - not a subset, not "looked right."
- **Idempotency, actually tested by re-running the migration a second time** - the same way the
  original bug in the Lessons Learned entry was actually found, not assumed away: ran the exact
  same migration file again by hand immediately after the first run. All four `UPDATE` statements
  reported `0` rows affected the second time, confirming the current-bounds gating works as
  designed - no double-shift occurred.
- Test fixtures (one throwaway user and its category logs) were fully cleaned up afterward via a
  cascading delete of the test user (see the [Glossary](../GLOSSARY.md)'s "Cascading delete" entry -
  deleting the user row automatically deleted every `category_logs` row that referenced it too, with
  no separate manual cleanup step needed).
- `npm test` (backend): full suite green - 202 tests across 19 files.
- `npx vitest run` (frontend): full suite green - 195 tests across 30 files (1 updated for the new
  default).
- `npx tsc --noEmit`/`npx tsc -b`, `npm run build` (both projects), `npx eslint .`/`npm run lint`
  (oxlint), `npx prettier --check .` (both projects): all clean, no new warnings introduced.
- Manual, real-browser verification via a temporary Playwright script (not committed) against the
  actual running dev servers (backend on :4000, frontend on :5173, real Postgres): registered a
  brand-new account (proving `seed.ts`'s new default independently of the migration, which only
  ever touches pre-existing rows) and confirmed both Headache and Mood render exactly seven rating
  options (`1` through `7`), with Headache's own caption reading "1 = Low - 7 = High." Screenshot
  confirms Headache renders as a single, unwrapped row of seven, fully visible.
- This branch was originally built directly off `main`, independently of the previous entry's own
  mobile-wrap fix, and at that point didn't contain that fix's `columns`/grid-wrap code - Headache
  rendered correctly even then, simply because 7 values already fit comfortably on one plain row
  without it (the same conclusion the original Energy/Stress design discussion reached for its own
  1-7 range). Both branches have since merged to `main` in the intended order (mobile-wrap fix
  first), and this branch was updated to include it - a user-defined custom scale category wider
  than 7 still gets that separate fix's two-row wrap; this migration doesn't depend on it and
  doesn't provide it on its own, they simply coexist now.

---
