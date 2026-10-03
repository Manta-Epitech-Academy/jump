-- A full pass that cannot prove a deletion now holds it instead of refusing the
-- roster.
--
-- `syncParticipations` used to refuse a full roster that was empty while the
-- event still had enrolments, or whose members Jump resolved none of. The
-- refusal failed the call, the worker closed the run in error, and since a
-- failed run moves no watermark the identical pass was replayed at every tick:
-- on 2026-10-01 one campaign with one unresolvable member stopped the sync of
-- all 46 campaigns, the incremental included, because a due full pass outranks
-- it.
--
-- The rule is now that a full pass prunes only from a COMPLETE roster
-- (non-empty, every member resolved). Otherwise the enrolments it carries are
-- still written, the removals are recorded here, and the call succeeds. A row
-- lives while the last full pass that carried the event held removals from it;
-- `releasedAt` lets an admin confirm a campaign genuinely emptied in Salesforce,
-- and the next full pass then applies the removals if its roster is still
-- empty.
--
-- No backfill: the table starts empty, and the first full pass after deploy
-- fills it with whatever it holds.

-- CreateTable
CREATE TABLE "Sync_PruneHold" (
    "eventId" TEXT NOT NULL,
    "pendingRemovals" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL,
    "resolvedCount" INTEGER NOT NULL,
    "firstHeldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeldAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "Sync_PruneHold_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "Sync_PruneHold_lastHeldAt_idx" ON "Sync_PruneHold"("lastHeldAt");

-- AddForeignKey
ALTER TABLE "Sync_PruneHold" ADD CONSTRAINT "Sync_PruneHold_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot express a CHECK constraint, so this one is hand-written. A hold
-- with nothing to remove is not a hold (that pass prunes nothing and clears the
-- row), and a hold over a complete roster is not one either: either shape would
-- be a row the read side reports as a held deletion that does not exist. And
-- only an empty roster is released: a release confirms that the campaign is
-- empty, and over unresolved members it would let the next pass take the
-- enrolment of a talent Salesforce still lists under an id Jump has not matched.
ALTER TABLE "Sync_PruneHold" ADD CONSTRAINT "Sync_PruneHold_counts_check"
  CHECK (
    "pendingRemovals" > 0
    AND "resolvedCount" >= 0
    AND ("resolvedCount" < "sentCount" OR ("sentCount" = 0 AND "resolvedCount" = 0))
    AND ("releasedAt" IS NULL OR "sentCount" = 0)
  );
