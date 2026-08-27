-- Unify every built-in SCALE category onto one common 1-7 range (project decision, following the
-- same reasoning already used once for Energy/Stress - see docs/log/03-mood-logging.md's "Widening
-- energy/stress from 1-5 to 1-7" entry: an odd-sized scale has a genuine midpoint, which a 1-5 or
-- 1-10 range doesn't). Energy and Stress are already 1-7 and untouched here. This affects two other
-- groups only:
--   - Mood (fixed id, created by the mood_to_category migration): 1-5 -> 1-7.
--   - The 8 seeded system severity categories (Headache, Fatigue, Nausea, Joint pain, Brain fog,
--     Insomnia, Anxiety, Depression), matched by name + user_id IS NULL exactly like seed.ts's own
--     idempotency check does, since (unlike Mood/Energy/Stress) these were never given fixed ids -
--     they're found-or-created by name: 1-10 -> 1-7.
-- A user's own personal "scale" category (any name, any range) is deliberately untouched - this
-- migration only unifies the app's own built-in categories, not user-defined content.

-- Step 1: rescale existing category_logs.value_numeric values BEFORE changing any category's own
-- scale_min/scale_max below - each CASE mapping is a fixed, hand-verified table (see this task's
-- own docs/log entry for the derivation and the real before/after values it was checked against),
-- not a formula that reads the category's current bounds, so this step must run against the
-- *original* bounds.
--
-- Both UPDATEs below are gated on the category's *current* scale_max in their own WHERE clause
-- (5 for Mood, 10 for the severity categories) - unlike the earlier Energy/Stress rescale migration
-- (which was explicitly documented as NOT safe to run twice), this makes the whole migration
-- naturally idempotent: once Step 2 below flips a category's scale_max to 7, that same gate makes
-- both UPDATEs into genuine no-ops on any accidental second run, rather than silently
-- misinterpreting an already-migrated value as if it were still on the old scale and shifting it
-- again. Verified directly, not just reasoned about - see Verification in the docs/log entry.

-- Mood: 1->1, 2->3, 3->4, 4->6, 5->7 (the exact mapping already proven correct for Energy/Stress's
-- own 1-5 -> 1-7 migration - reused as-is here since it's the same source and destination range).
UPDATE "category_logs"
SET "value_numeric" = CASE "value_numeric"
  WHEN 1 THEN 1
  WHEN 2 THEN 3
  WHEN 3 THEN 4
  WHEN 4 THEN 6
  WHEN 5 THEN 7
  ELSE "value_numeric"
END
WHERE "category_id" IN (
  SELECT "id" FROM "categories"
  WHERE "id" = 'fa29404f-ad4e-4866-b18e-22149c38214f' AND "scale_max" = 5
);

-- The 8 severity categories: 1->1, 2->2, 3->2, 4->3, 5->4, 6->4, 7->5, 8->6, 9->6, 10->7 (linear
-- 1-10 -> 1-7 mapping, rounded to the nearest integer - endpoints land exactly; every intermediate
-- value's fractional part is either .333 or .667, never exactly .5, so no round-half tie-break
-- ambiguity exists here the way the original 1-5 -> 1-7 mapping had).
UPDATE "category_logs"
SET "value_numeric" = CASE "value_numeric"
  WHEN 1 THEN 1
  WHEN 2 THEN 2
  WHEN 3 THEN 2
  WHEN 4 THEN 3
  WHEN 5 THEN 4
  WHEN 6 THEN 4
  WHEN 7 THEN 5
  WHEN 8 THEN 6
  WHEN 9 THEN 6
  WHEN 10 THEN 7
  ELSE "value_numeric"
END
WHERE "category_id" IN (
  SELECT "id" FROM "categories"
  WHERE "user_id" IS NULL
    AND "name" IN ('Headache', 'Fatigue', 'Nausea', 'Joint pain', 'Brain fog', 'Insomnia', 'Anxiety', 'Depression')
    AND "value_type" = 'SCALE'
    AND "scale_max" = 10
);

-- Step 2: now that every affected log has been rescaled, update each category's own bounds to
-- match. Both are gated the same way Step 1's own selection was, for the same reason.
UPDATE "categories"
SET "scale_max" = 7
WHERE "id" = 'fa29404f-ad4e-4866-b18e-22149c38214f' AND "scale_max" = 5;

UPDATE "categories"
SET "scale_max" = 7
WHERE "user_id" IS NULL
  AND "name" IN ('Headache', 'Fatigue', 'Nausea', 'Joint pain', 'Brain fog', 'Insomnia', 'Anxiety', 'Depression')
  AND "value_type" = 'SCALE'
  AND "scale_max" = 10;
