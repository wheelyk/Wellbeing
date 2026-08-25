-- Habit -> Category unification (Phase 17, Task 2). Hand-written (like the original
-- generalize_reminders migration) rather than `prisma migrate dev` output, since this interleaves
-- real data migration with schema changes in an order the tool can't infer on its own.

-- Step 1: copy every habit definition into categories, reusing the exact same id - habits.id and
-- categories.id never collide (both are independently-generated UUIDs), so no id remapping is
-- needed, which also means Step 2 below can carry category_id = habit_id directly with no join.
-- HabitType's three labels (BOOLEAN/NUMERIC/DURATION) are a strict subset of CategoryValueType's
-- four, with identical spelling, so the enum cast is a safe, lossless text round-trip.
INSERT INTO "categories" ("id", "user_id", "name", "icon", "description", "value_type", "scale_min", "scale_max", "archived_at", "created_at")
SELECT "id", "user_id", "name", NULL, NULL, ("type"::text)::"category_value_type", NULL, NULL, NULL, "created_at"
FROM "habits";

-- Step 2: copy every habit log into category_logs - column-for-column identical shape already
-- (value_boolean/value_numeric/value_duration_minutes/notes/logged_at), so this is a direct copy,
-- with category_id set to the same id Step 1 gave the new category row (= the original habit_id).
INSERT INTO "category_logs" ("id", "user_id", "category_id", "value_boolean", "value_numeric", "value_duration_minutes", "notes", "logged_at")
SELECT "id", "user_id", "habit_id", "value_boolean", "value_numeric", "value_duration_minutes", "notes", "logged_at"
FROM "habit_logs";

-- Step 3: any existing HABIT-target reminder is deleted, not migrated - confirmed precedent from
-- Phase 16 (drop and let the user reconfigure) - there's no single unambiguous destination
-- category to remap a whole-type "any habit" reminder onto, unlike MOOD's later one-to-one case.
DELETE FROM "reminders" WHERE "target" = 'HABIT';

-- Step 4: remove HABIT from the reminder_target enum. Postgres has no ALTER TYPE ... DROP VALUE -
-- the standard workaround is rename-recreate-swap: rename the old type out of the way, create a
-- new type under the original name without the removed value, repoint the column at it (the
-- DELETE above already guarantees no row still holds 'HABIT' by this point, so the cast can't
-- fail), then drop the renamed-away old type.
ALTER TYPE "reminder_target" RENAME TO "reminder_target_old";
CREATE TYPE "reminder_target" AS ENUM ('GENERAL', 'MOOD', 'SYMPTOM', 'MEDICATION', 'CATEGORY');
ALTER TABLE "reminders" ALTER COLUMN "target" TYPE "reminder_target" USING ("target"::text::"reminder_target");
DROP TYPE "reminder_target_old";

-- Step 5: drop the now-fully-migrated old tables/enum, and the User.habit_enabled toggle - a
-- former habit is now an ordinary personal category, individually archivable, so no whole-type
-- toggle applies to it anymore (see schema.prisma's own comment on User.moodEnabled and friends).
DROP TABLE "habit_logs";
DROP TABLE "habits";
DROP TYPE "habit_type";
ALTER TABLE "users" DROP COLUMN "habit_enabled";
