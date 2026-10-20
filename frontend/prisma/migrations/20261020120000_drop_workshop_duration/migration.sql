-- An online activity no longer earns XP by the minute (#427). It grants the
-- points CTFd pays for the steps a talent validated, which every progress
-- callback now carries, so the duration an event declared for an activity and
-- the copy a participation took of it at first entry have no reader left: they
-- were the scale and nothing else, no planning or screen ever showed them.
--
-- Warnings: both columns are dropped with no backfill. No real talent had
-- earned activity XP in production when the scale changed, so no grant was
-- computed from them that would need recomputing.

-- AlterTable
ALTER TABLE "EventConfig_Workshop" DROP COLUMN "durationMinutes";

-- AlterTable
ALTER TABLE "Workshop_Participation" DROP COLUMN "budgetMinutes";
