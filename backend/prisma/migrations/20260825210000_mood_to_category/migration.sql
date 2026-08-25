-- Mood -> Category unification (Phase 17, Task 6). Hand-written (like the earlier
-- generalize_reminders, habit_to_category, and symptom_to_category migrations), since this
-- interleaves real data migration with schema changes in an order the tool can't infer on its
-- own. Unlike those two earlier migrations, Mood has no existing per-user "definition" row to
-- copy - Mood/Energy/Stress become three brand-new *system* categories (userId NULL), created
-- here with fixed ids so the rest of this migration can reference them directly.

-- Step 1: create the three new system categories. Mood keeps its original 1-5 range; Energy and
-- Stress keep their original 1-7 range (see mood_logs.ts's own createSchema, now deleted) - all
-- three become SCALE categories with those ranges as scaleMin/scaleMax.
INSERT INTO "categories" ("id", "user_id", "name", "icon", "description", "value_type", "scale_min", "scale_max", "archived_at", "created_at")
VALUES
  ('fa29404f-ad4e-4866-b18e-22149c38214f', NULL, 'Mood', NULL, NULL, 'SCALE', 1, 5, NULL, now()),
  ('16ed42bd-4451-4826-b373-4d2dcdacd544', NULL, 'Energy', NULL, NULL, 'SCALE', 1, 7, NULL, now()),
  ('e76ae50d-0095-4119-bdd7-528d0860c1f0', NULL, 'Stress', NULL, NULL, 'SCALE', 1, 7, NULL, now());

-- Step 2: split every mood_logs row into up to three category_logs rows sharing the same
-- logged_at - unlike habit_to_category/symptom_to_category (a clean 1:1 row mapping that could
-- reuse the source row's own id directly), one mood_logs row can produce up to three destination
-- rows here, so each needs its own freshly generated id instead. `notes` is carried only onto the
-- Mood-value row, not duplicated across all three - a deliberate choice (see this task's own
-- docs/log entry) that keeps a single logged note attached to one row rather than reading like it
-- was written three times.
INSERT INTO "category_logs" ("id", "user_id", "category_id", "value_boolean", "value_numeric", "value_duration_minutes", "notes", "logged_at")
SELECT gen_random_uuid(), "user_id", 'fa29404f-ad4e-4866-b18e-22149c38214f', NULL, "mood"::float, NULL, "notes", "logged_at"
FROM "mood_logs";

INSERT INTO "category_logs" ("id", "user_id", "category_id", "value_boolean", "value_numeric", "value_duration_minutes", "notes", "logged_at")
SELECT gen_random_uuid(), "user_id", '16ed42bd-4451-4826-b373-4d2dcdacd544', NULL, "energy"::float, NULL, NULL, "logged_at"
FROM "mood_logs"
WHERE "energy" IS NOT NULL;

INSERT INTO "category_logs" ("id", "user_id", "category_id", "value_boolean", "value_numeric", "value_duration_minutes", "notes", "logged_at")
SELECT gen_random_uuid(), "user_id", 'e76ae50d-0095-4119-bdd7-528d0860c1f0', NULL, "stress"::float, NULL, NULL, "logged_at"
FROM "mood_logs"
WHERE "stress" IS NOT NULL;

-- Step 3: unlike HABIT/SYMPTOM's own removal (each dropped any existing reminder targeting it -
-- no single unambiguous destination category existed for either), MOOD had at most one reminder
-- per user and exactly one obvious destination now that Mood is a category: remap any existing
-- MOOD-target reminder to a CATEGORY-target reminder pointing at the new Mood category above,
-- rather than deleting it. Must run before Step 4 removes MOOD from the enum below - no row may
-- still hold that value once the column is cast onto the narrower replacement type.
UPDATE "reminders"
SET "target" = 'CATEGORY', "category_id" = 'fa29404f-ad4e-4866-b18e-22149c38214f'
WHERE "target" = 'MOOD';

-- Step 4: remove MOOD from the reminder_target enum - Postgres has no direct
-- ALTER TYPE ... DROP VALUE, so the standard workaround is: rename the old type out of the way,
-- create a new type under the original name without the unwanted value, repoint the column at the
-- new type via a USING cast, then drop the renamed-away old type.
ALTER TYPE "reminder_target" RENAME TO "reminder_target_old";
CREATE TYPE "reminder_target" AS ENUM ('GENERAL', 'MEDICATION', 'CATEGORY');
ALTER TABLE "reminders" ALTER COLUMN "target" TYPE "reminder_target" USING ("target"::text::"reminder_target");
DROP TYPE "reminder_target_old";

-- Step 5: drop the now-fully-migrated old table, and the User.mood_enabled toggle - Mood is a
-- system category now, hidden per-row (HiddenCategory) rather than gated by one whole-type toggle,
-- same as Symptom before it.
DROP TABLE "mood_logs";
ALTER TABLE "users" DROP COLUMN "mood_enabled";
