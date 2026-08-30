-- Column defaults, so a brand-new account gets the same window every existing account was given by
-- the previous migration's backfill.
--
-- A separate migration rather than an edit to that one, which has already been applied: Prisma
-- checksums applied migrations, so changing one after the fact breaks every environment that ran
-- it. Appending is always the safe move.
--
-- Without this the backfill would have been a one-off - existing users quiet, everyone who signed
-- up afterwards not. That is the kind of split that surfaces months later, on one account, and is
-- very hard to explain.
ALTER TABLE "users" ALTER COLUMN "quiet_hours_start" SET DEFAULT '22:00';
ALTER TABLE "users" ALTER COLUMN "quiet_hours_end" SET DEFAULT '08:00';
