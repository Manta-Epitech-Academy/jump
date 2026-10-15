-- What the dashboard owes a celebration after an activity is now derived from
-- the ledger: the workshop grant minus `xpCelebrated`, the amount already shown.
--
-- It was `xpPending`, a counter of its own, raised by the difference each
-- callback made to the grant and zeroed whole by the acknowledgement. Nothing
-- kept it in step with the grant, so concurrent copies of one callback each
-- added the same difference, a progress that fell and climbed back was counted
-- for its climb twice, and the toast announced more XP than the profile gained.
--
-- `xpSeenAt` goes with it: it was written by the acknowledgement and read by
-- nothing.
--
-- Backfill: what is owed today stays owed, wherever the counter had not drifted
-- past the grant. A row whose grant is missing (an activity entered and never
-- reported) keeps the default, and owes nothing either way.

-- AlterTable
ALTER TABLE "Workshop_Participation" ADD COLUMN "xpCelebrated" INTEGER NOT NULL DEFAULT 0;

UPDATE "Workshop_Participation" AS p
SET "xpCelebrated" = GREATEST(0, g."amount" - p."xpPending")
FROM "Workshop_Instance" AS i, "XpGrant" AS g
WHERE i."id" = p."instanceId"
  AND g."source" = 'workshop'
  AND g."sourceId" = i."slug" || ':' || p."talentId";

ALTER TABLE "Workshop_Participation" DROP COLUMN "xpPending",
DROP COLUMN "xpSeenAt";
