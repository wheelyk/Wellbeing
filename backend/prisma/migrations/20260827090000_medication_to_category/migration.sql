-- Medication -> Category unification (Phase 19, Task 1). Hand-written (like the earlier
-- generalize_reminders, habit_to_category, symptom_to_category, and mood_to_category migrations),
-- since this interleaves real data migration with schema changes in an order the tool can't infer
-- on its own. Structurally closest to habit_to_category: a clean 1:1 row mapping that reuses each
-- source row's own id directly (medications.id never collides with categories.id, since both are
-- independently-generated UUIDs) - but, unlike Habit/Symptom's own removal, this one *also* remaps
-- any existing reminder (Medication had a real, meaningful per-medication reminder target), the
-- same as mood_to_category's own remap, since a medication-to-category id reuse makes the mapping
-- completely unambiguous (simpler even than Mood's own one-to-many case).

-- Step 1: copy every medication definition into categories, reusing the exact same id. Every
-- medication becomes a BOOLEAN category (taken/not taken is the only value MedicationLog ever
-- recorded); dosage moves into the new, generically-named `description` column (see schema.prisma's
-- own comment on Category.description) rather than being dropped.
INSERT INTO "categories" ("id", "user_id", "name", "icon", "description", "value_type", "scale_min", "scale_max", "archived_at", "created_at")
SELECT "id", "user_id", "name", NULL, "dosage", 'BOOLEAN', NULL, NULL, NULL, "created_at"
FROM "medications";

-- Step 2: copy every medication log into category_logs - `taken` maps directly onto
-- value_boolean, with category_id set to the same id Step 1 gave the new category (= the original
-- medication_id).
INSERT INTO "category_logs" ("id", "user_id", "category_id", "value_boolean", "value_numeric", "value_duration_minutes", "notes", "logged_at")
SELECT "id", "user_id", "medication_id", "taken", NULL, NULL, "notes", "logged_at"
FROM "medication_logs";

-- Step 3: unlike HABIT/SYMPTOM's own removal (no single unambiguous destination category existed
-- for either), remap any existing MEDICATION-target reminder to a CATEGORY-target reminder
-- pointing at the same id Step 1 gave that medication's new category - a clean one-to-one mapping,
-- not even the one-to-many case MOOD's own remap had to handle. Must run before Step 5 drops the
-- medication_id column and Step 6 removes MEDICATION from the enum below.
UPDATE "reminders"
SET "target" = 'CATEGORY', "category_id" = "medication_id"
WHERE "target" = 'MEDICATION';

-- Step 4: drop the now-fully-migrated old tables. medication_logs first (it holds the FK into
-- medications); reminders.medication_id's own FK into medications is dropped along with the column
-- itself in Step 5, so medications can be dropped afterward without a dangling reference.
DROP TABLE "medication_logs";
ALTER TABLE "reminders" DROP COLUMN "medication_id";
DROP TABLE "medications";

-- Step 5: remove MEDICATION from the reminder_target enum - Postgres has no direct
-- ALTER TYPE ... DROP VALUE, so the standard workaround is: rename the old type out of the way,
-- create a new type under the original name without the unwanted value, repoint the column at the
-- new type via a USING cast (Step 3's UPDATE above already guarantees no row still holds
-- 'MEDICATION' by this point), then drop the renamed-away old type.
ALTER TYPE "reminder_target" RENAME TO "reminder_target_old";
CREATE TYPE "reminder_target" AS ENUM ('GENERAL', 'CATEGORY');
ALTER TABLE "reminders" ALTER COLUMN "target" TYPE "reminder_target" USING ("target"::text::"reminder_target");
DROP TYPE "reminder_target_old";

-- Step 6: drop the User.medication_enabled toggle - a former medication is an ordinary personal
-- category now, individually archivable, so no whole-type toggle applies to it anymore (same
-- reasoning as habit_to_category's own removal of habit_enabled).
ALTER TABLE "users" DROP COLUMN "medication_enabled";
