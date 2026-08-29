-- The mirror of expires_at: a moment a reminder must not fire before.
--
-- Nullable with no backfill, and for the same reason expires_at was: every reminder that exists
-- today should fire from now on, and NULL is exactly what that means. Nothing changes for any of
-- them.
ALTER TABLE "reminders" ADD COLUMN "starts_at" TIMESTAMP(3);
