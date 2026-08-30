-- Quiet hours, and the per-reminder permission to ignore them.

ALTER TABLE "users" ADD COLUMN "quiet_hours_start" TEXT;
ALTER TABLE "users" ADD COLUMN "quiet_hours_end" TEXT;

-- Every existing account gets the default window. A real behaviour change for them, and a
-- deliberate one: "don't wake me at 3am" is the safer default to be wrong about in either
-- direction, and it can be switched off.
UPDATE "users" SET "quiet_hours_start" = '22:00', "quiet_hours_end" = '08:00';

-- Defaults false, because a computed time - a follow-up, or a cooldown's "you can have another
-- now" - must not wake anyone.
ALTER TABLE "reminders" ADD COLUMN "allow_during_quiet_hours" BOOLEAN NOT NULL DEFAULT false;

-- ...but every reminder that already exists was scheduled by hand, at a time its owner chose. Quiet
-- hours must not retroactively silence a 06:00 wake-up somebody set on purpose, so the backfill is
-- deliberately the opposite of the column default. Without this line the migration would quietly
-- change what existing reminders do - precisely the "it ran, so it must be right" class of bug
-- docs/LESSONS-LEARNED.md records.
UPDATE "reminders" SET "allow_during_quiet_hours" = true;
