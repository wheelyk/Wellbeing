-- Rescales historical energy/stress values (recorded on the old 1-5 scale) onto the new 1-7
-- scale, preserving relative position: 1->1, 2->3, 3->4, 4->6, 5->7 (rounded to the nearest
-- whole number - the two ranges don't divide evenly). Endpoints and the midpoint land exactly
-- (1->1, 3->4, 5->7); only 2 and 4 need rounding, and both round up per standard
-- round-half-away-from-zero.
--
-- This only ever touches rows that already exist at the moment this migration runs. Any row
-- created after this point already uses the new 1-7 range directly (enforced by the API's
-- updated validation).
--
-- NOT safe to run a second time by hand: 3 and 4 are valid *outputs* of this mapping that are
-- also valid *inputs* (they're still <=5), so a second pass would shift an already-migrated 3
-- to 4, and an already-migrated 4 to 6 - tested directly while writing this migration, which is
-- exactly how that got caught. Prisma's own migration tracking (the `_prisma_migrations` table)
-- is what actually keeps this to a single run in normal use - `prisma migrate deploy` records a
-- migration once applied and never re-runs it, which this relies on rather than the SQL itself
-- being idempotent.
UPDATE "mood_logs" SET "energy" = CASE "energy"
  WHEN 1 THEN 1
  WHEN 2 THEN 3
  WHEN 3 THEN 4
  WHEN 4 THEN 6
  WHEN 5 THEN 7
  ELSE "energy"
END
WHERE "energy" IS NOT NULL;

UPDATE "mood_logs" SET "stress" = CASE "stress"
  WHEN 1 THEN 1
  WHEN 2 THEN 3
  WHEN 3 THEN 4
  WHEN 4 THEN 6
  WHEN 5 THEN 7
  ELSE "stress"
END
WHERE "stress" IS NOT NULL;
