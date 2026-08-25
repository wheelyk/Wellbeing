-- Symptom -> Category unification (Phase 17, Task 4). Hand-written (like the original
-- generalize_reminders and habit_to_category migrations) rather than `prisma migrate dev` output,
-- since this interleaves real data migration with schema changes in an order the tool can't infer
-- on its own.

-- Step 1: copy every symptom definition into categories, reusing the exact same id (so
-- symptom_logs.symptom_id maps directly onto the new categories.id with no join needed).
-- Every migrated symptom becomes a SCALE category with scaleMin/scaleMax fixed at 1/10, matching
-- the hardcoded severity range symptomLogs.ts's own createSchema enforced today. userId is copied
-- as-is (already nullable on both sides), so a system symptom becomes a system category and a
-- personal symptom becomes a personal category, with no change in who can see what.
INSERT INTO "categories" ("id", "user_id", "name", "icon", "description", "value_type", "scale_min", "scale_max", "archived_at", "created_at")
SELECT "id", "user_id", "name", NULL, "description", 'SCALE', 1, 10, NULL, "created_at"
FROM "symptoms";

-- Step 2: copy every symptom log into category_logs - severity (Int) casts directly onto
-- valueNumeric (Float), the same column every other SCALE category log populates.
INSERT INTO "category_logs" ("id", "user_id", "category_id", "value_boolean", "value_numeric", "value_duration_minutes", "notes", "logged_at")
SELECT "id", "user_id", "symptom_id", NULL, "severity"::float, NULL, "notes", "logged_at"
FROM "symptom_logs";

-- Step 3: any existing SYMPTOM-target reminder is deleted, not migrated - same drop-and-
-- reconfigure precedent as HABIT's own removal (Task 2): a user with several symptoms has no
-- single unambiguous destination category for an old symptom-level reminder.
DELETE FROM "reminders" WHERE "target" = 'SYMPTOM';

-- Step 4: remove SYMPTOM from the reminder_target enum - Postgres has no direct
-- ALTER TYPE ... DROP VALUE, so the standard workaround is: rename the old type out of the way,
-- create a new type under the original name without the unwanted value, repoint the column at the
-- new type via a USING cast, then drop the renamed-away old type.
ALTER TYPE "reminder_target" RENAME TO "reminder_target_old";
CREATE TYPE "reminder_target" AS ENUM ('GENERAL', 'MOOD', 'MEDICATION', 'CATEGORY');
ALTER TABLE "reminders" ALTER COLUMN "target" TYPE "reminder_target" USING ("target"::text::"reminder_target");
DROP TYPE "reminder_target_old";

-- Step 5: drop the now-fully-migrated old tables, and the User.symptom_enabled toggle - a former
-- symptom is a system-or-personal category now, hidden per-row (HiddenCategory) or archived
-- individually rather than gated by one whole-type toggle.
DROP TABLE "symptom_logs";
DROP TABLE "symptoms";
ALTER TABLE "users" DROP COLUMN "symptom_enabled";
