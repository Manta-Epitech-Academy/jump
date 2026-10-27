-- A campus's département (#440): the one fact the campus calendar needs to show
-- its school holidays (the zone comes from the académie) and its public holidays
-- (Alsace-Moselle and each overseas département add their own).
--
-- Nullable, and no campus is backfilled: the production campus names are not in
-- this repository, so a guessed UPDATE could only match by luck. An admin sets
-- it in /staff/admin/campuses; until then the calendar shows no holidays rather
-- than another zone's.

-- AlterTable
ALTER TABLE "Campus" ADD COLUMN     "departement" TEXT;
