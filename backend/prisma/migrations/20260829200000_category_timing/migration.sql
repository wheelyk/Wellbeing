-- Per-user "what happens around logging this category" settings.
--
-- Nothing to backfill: no category has any timing today, and the absence of a row is exactly what
-- that means. Existing behaviour is unchanged for every user and every category.
CREATE TYPE "category_timing_mode" AS ENUM ('REMINDER', 'COOLDOWN', 'STOPWATCH');

CREATE TABLE "category_timings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "mode" "category_timing_mode" NOT NULL,
    "interval_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_timings_pkey" PRIMARY KEY ("id")
);

-- One setting per user per category: the three modes are alternatives, not a set to combine. This
-- also serves the "what is my timing for these categories" lookup that GET /api/categories makes
-- on every load, so no separate user_id index is needed.
CREATE UNIQUE INDEX "category_timings_user_id_category_id_key"
    ON "category_timings" ("user_id", "category_id");

-- Cascade from both sides, unlike CategoryLog's Restrict on category: this is a preference about
-- how someone tracks a thing, not a record of anything that happened, so it has nothing worth
-- protecting from a delete.
ALTER TABLE "category_timings" ADD CONSTRAINT "category_timings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_timings" ADD CONSTRAINT "category_timings_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
