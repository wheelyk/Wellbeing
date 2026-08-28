-- Replaces Reminder.times (fixed "HH:mm" strings) with Reminder.schedules (five-field cron
-- expressions). See docs/log/25-cron-reminder-schedules.md.
--
-- Hand-written rather than generated: `prisma migrate dev` refuses to scaffold this
-- non-interactively because it drops a column holding real data, and the whole point here is that
-- the data is *carried across* rather than dropped. Same precedent as this project's other
-- data-carrying migrations (see the category_groups and mood_to_category migrations).
--
-- The conversion is exact, not approximate. "09:00" becomes "00 09 * * *", which fires at
-- precisely the same moments it always did - every day, at 09:00 local. No existing reminder
-- changes behaviour as a result of this migration. Leading zeros are deliberately left in place:
-- the parser reads each field with Number(), so "00 09" and "0 9" are the same expression, and
-- keeping the zero-padded form makes the migrated rows trivially recognisable as machine-written.

ALTER TABLE "reminders" ADD COLUMN "schedules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "reminders" r
SET "schedules" = COALESCE(
  (
    SELECT array_agg(
      split_part(t, ':', 2) || ' ' || split_part(t, ':', 1) || ' * * *'
      ORDER BY t
    )
    FROM unnest(r."times") AS t
  ),
  ARRAY[]::TEXT[]
);

ALTER TABLE "reminders" DROP COLUMN "times";

-- The default existed only so the column could be added NOT NULL to rows that already existed.
-- Dropped afterwards so the application is required to supply schedules explicitly on insert,
-- rather than silently creating a reminder that never fires.
ALTER TABLE "reminders" ALTER COLUMN "schedules" DROP DEFAULT;
