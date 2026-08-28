-- Best-effort backfill: assigns a group to every existing category (system or personal) that
-- still has none, by matching common keywords against its name. See
-- docs/log/24-admin-group-assignment-and-backfill.md for the full reasoning - this exists because
-- the original category_groups migration (20260828061220_category_groups) only had exact-name
-- matches available for the categories seed.ts itself created; everything a real user later
-- created on their own stayed ungrouped indefinitely, with no way back into a group except
-- reassigning it by hand, one at a time.
--
-- Deliberately a *guess*, not a guarantee: keyword matching against a free-text name can't know
-- what a category actually means (a boolean called "Med" is almost certainly a medication, but
-- there's no way to be certain from the name alone). Anything that doesn't match a recognized
-- keyword is deliberately left as Uncategorized - a normal, supported state (see
-- CategoryCreateForm.tsx's own Category.groupId comment) - rather than force-assigning a guess with
-- no real signal behind it. Any category can be moved to a different group afterward through the
-- normal edit flow (Settings' own CategoriesSection, or - now - the admin category list), so a
-- wrong guess here is always correctable, never a one-way trip.
--
-- Each UPDATE only touches rows still `group_id IS NULL`, so the six run in a fixed priority order
-- (Medicine, Symptom, Drink, Food, Activity, Mind & Mood) with no row ever matched twice - once a
-- category picks up a group_id from an earlier statement, later statements' own `WHERE group_id IS
-- NULL` clause skips it automatically. Never touches an already-archived category (nothing to
-- backfill for a category that's no longer offered for logging anyway).

-- Medicine (💊) - id 453de5ac-52fa-40b6-bbc6-be5c7985aaf1
UPDATE "categories"
SET "group_id" = '453de5ac-52fa-40b6-bbc6-be5c7985aaf1'
WHERE "group_id" IS NULL
  AND "archived_at" IS NULL
  AND (
    "name" ILIKE '%medication%' OR "name" ILIKE '%medicine%' OR "name" ILIKE '%prescription%'
    OR "name" ILIKE '%dosage%' OR "name" ILIKE '%tablet%' OR "name" ILIKE '%pill%'
    OR "name" ILIKE '%vitamin%' OR "name" ILIKE '%supplement%' OR "name" ILIKE '%antibiotic%'
    OR "name" ILIKE '%ibuprofen%' OR "name" ILIKE '%paracetamol%' OR "name" ILIKE '%acetaminophen%'
    OR "name" ILIKE '%aspirin%' OR "name" ILIKE '%diazepam%' OR "name" ILIKE '%metformin%'
    OR "name" ILIKE '%insulin%' OR "name" ILIKE '%omeprazole%' OR "name" ILIKE '%sertraline%'
    OR "name" ILIKE '%med%'
  );

-- Symptom (🩺) - id a8ecb699-3990-4f1d-909a-13a6d122d1c1
UPDATE "categories"
SET "group_id" = 'a8ecb699-3990-4f1d-909a-13a6d122d1c1'
WHERE "group_id" IS NULL
  AND "archived_at" IS NULL
  AND (
    "name" ILIKE '%symptom%' OR "name" ILIKE '%pain%' OR "name" ILIKE '%ache%'
    OR "name" ILIKE '%headache%' OR "name" ILIKE '%migraine%' OR "name" ILIKE '%nausea%'
    OR "name" ILIKE '%fatigue%' OR "name" ILIKE '%dizz%' OR "name" ILIKE '%anxiety%'
    OR "name" ILIKE '%flare%' OR "name" ILIKE '%insomnia%' OR "name" ILIKE '%rash%'
    OR "name" ILIKE '%cramp%' OR "name" ILIKE '%cough%' OR "name" ILIKE '%fever%'
  );

-- Drink (🥤) - id 9e3bee16-b661-46a5-9850-8cbb896e66f5
UPDATE "categories"
SET "group_id" = '9e3bee16-b661-46a5-9850-8cbb896e66f5'
WHERE "group_id" IS NULL
  AND "archived_at" IS NULL
  AND (
    "name" ILIKE '%water%' OR "name" ILIKE '%coffee%' OR "name" ILIKE '%alcohol%'
    OR "name" ILIKE '%wine%' OR "name" ILIKE '%beer%' OR "name" ILIKE '%juice%'
    OR "name" ILIKE '%drink%' OR "name" ILIKE '%hydration%' OR "name" ILIKE '%caffeine%'
  );

-- Food (🍽️) - id affc1f6e-8774-40dd-a3d4-b4d155cafff7
UPDATE "categories"
SET "group_id" = 'affc1f6e-8774-40dd-a3d4-b4d155cafff7'
WHERE "group_id" IS NULL
  AND "archived_at" IS NULL
  AND (
    "name" ILIKE '%meal%' OR "name" ILIKE '%food%' OR "name" ILIKE '%diet%'
    OR "name" ILIKE '%snack%' OR "name" ILIKE '%breakfast%' OR "name" ILIKE '%lunch%'
    OR "name" ILIKE '%dinner%' OR "name" ILIKE '%calorie%' OR "name" ILIKE '%sugar%'
    OR "name" ILIKE '%protein%' OR "name" ILIKE '%nutrition%'
  );

-- Activity (🏃) - id 8cde180b-6f58-4496-bffd-e3d9e9d8a081
UPDATE "categories"
SET "group_id" = '8cde180b-6f58-4496-bffd-e3d9e9d8a081'
WHERE "group_id" IS NULL
  AND "archived_at" IS NULL
  AND (
    "name" ILIKE '%walk%' OR "name" ILIKE '%run%' OR "name" ILIKE '%exercise%'
    OR "name" ILIKE '%gym%' OR "name" ILIKE '%yoga%' OR "name" ILIKE '%steps%'
    OR "name" ILIKE '%activity%' OR "name" ILIKE '%stretch%' OR "name" ILIKE '%cycle%'
    OR "name" ILIKE '%swim%' OR "name" ILIKE '%screen time%' OR "name" ILIKE '%workout%'
    OR "name" ILIKE '%sport%'
  );

-- Mind & Mood (🧠) - id 384db550-03d6-4f47-8ce4-0a61a582c6cf
UPDATE "categories"
SET "group_id" = '384db550-03d6-4f47-8ce4-0a61a582c6cf'
WHERE "group_id" IS NULL
  AND "archived_at" IS NULL
  AND (
    "name" ILIKE '%mood%' OR "name" ILIKE '%stress%' OR "name" ILIKE '%energy%'
    OR "name" ILIKE '%sleep%' OR "name" ILIKE '%meditat%' OR "name" ILIKE '%mindful%'
    OR "name" ILIKE '%gratitude%' OR "name" ILIKE '%journal%' OR "name" ILIKE '%relax%'
  );
