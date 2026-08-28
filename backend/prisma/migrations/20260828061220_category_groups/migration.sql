-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "category_groups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hidden_groups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hidden_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_groups_user_id_idx" ON "category_groups"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "hidden_groups_user_id_group_id_key" ON "hidden_groups"("user_id", "group_id");

-- CreateIndex
CREATE INDEX "categories_group_id_idx" ON "categories"("group_id");

-- AddForeignKey
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hidden_groups" ADD CONSTRAINT "hidden_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hidden_groups" ADD CONSTRAINT "hidden_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "category_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "category_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the 6 built-in groups (see docs/log/23-category-groups.md) with fixed ids, the same
-- "create with a known id so later statements can reference it directly" pattern the
-- mood_to_category migration already established for Mood/Energy/Stress.
INSERT INTO "category_groups" ("id", "user_id", "name", "icon", "created_at")
VALUES
  ('453de5ac-52fa-40b6-bbc6-be5c7985aaf1', NULL, 'Medicine', '💊', now()),
  ('a8ecb699-3990-4f1d-909a-13a6d122d1c1', NULL, 'Symptom', '🩺', now()),
  ('384db550-03d6-4f47-8ce4-0a61a582c6cf', NULL, 'Mind & Mood', '🧠', now()),
  ('8cde180b-6f58-4496-bffd-e3d9e9d8a081', NULL, 'Activity', '🏃', now()),
  ('9e3bee16-b661-46a5-9850-8cbb896e66f5', NULL, 'Drink', '🥤', now()),
  ('affc1f6e-8774-40dd-a3d4-b4d155cafff7', NULL, 'Food', '🍽️', now());

-- Assign the 8 seeded severity categories (see backend/prisma/seed.ts) to Symptom - matched by
-- user_id IS NULL + name, exactly like seed.ts's own existence check and the unify_scale_categories
-- migration before this one, since these were never given fixed ids of their own.
UPDATE "categories"
SET "group_id" = 'a8ecb699-3990-4f1d-909a-13a6d122d1c1'
WHERE "user_id" IS NULL
  AND "name" IN ('Headache', 'Fatigue', 'Nausea', 'Joint pain', 'Brain fog', 'Insomnia', 'Anxiety', 'Depression')
  AND "value_type" = 'SCALE';

-- Assign Mood/Energy/Stress to Mind & Mood - these do have fixed ids, from the mood_to_category
-- migration (20260825210000_mood_to_category/migration.sql).
UPDATE "categories"
SET "group_id" = '384db550-03d6-4f47-8ce4-0a61a582c6cf'
WHERE "id" IN (
  'fa29404f-ad4e-4866-b18e-22149c38214f',
  '16ed42bd-4451-4826-b373-4d2dcdacd544',
  'e76ae50d-0095-4119-bdd7-528d0860c1f0'
);

-- Every other existing category (every personal one, with no reliable way to guess which group a
-- user would want) is deliberately left with group_id NULL - it shows under the frontend's own
-- synthetic "Uncategorized" bucket until its owner assigns it a group themselves.
