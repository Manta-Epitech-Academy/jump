-- A talent's run of consecutive days in Jump (#447), the one fact the series
-- badges need: its length and the day it last grew. Two values, no history.
--
-- No backfill is owed: nothing recorded a day per talent before this, and
-- `lastActiveAt` is throttled over a rolling 24 hours, so it cannot tell two
-- calendar days apart. Every talent starts with no run.

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "streakDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakLastDay" DATE;
