-- Makes explicit the rule that used to be hard-coded in the scheduler: logging a reminder's target
-- silences it for the rest of the day.
--
-- DEFAULT true is the backfill. Every reminder that already exists behaved exactly this way, so
-- the existing rows are not being given a new behaviour - they are being given a name for the one
-- they already had. Nothing changes for any of them.
ALTER TABLE "reminders" ADD COLUMN "stops_when_logged" BOOLEAN NOT NULL DEFAULT true;
