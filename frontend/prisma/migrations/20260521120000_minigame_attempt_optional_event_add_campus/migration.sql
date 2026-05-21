-- Make MinigameAttempt.eventId optional and add an optional campusId snapshot.
-- Minigames are now an intrinsic, event-independent feature: a play no longer
-- requires an event. The talent-facing leaderboard scopes by the snapshotted
-- campusId (global fallback when null); the staff per-event board still uses eventId.

-- DropForeignKey (eventId was NOT NULL with ON DELETE CASCADE)
ALTER TABLE "MinigameAttempt" DROP CONSTRAINT "MinigameAttempt_eventId_fkey";

-- AlterTable: eventId nullable, add campusId
ALTER TABLE "MinigameAttempt" ALTER COLUMN "eventId" DROP NOT NULL;
ALTER TABLE "MinigameAttempt" ADD COLUMN "campusId" TEXT;

-- Backfill campusId from the linked event so historical leaderboards stay campus-scoped
UPDATE "MinigameAttempt" ma
SET "campusId" = e."campusId"
FROM "Event" e
WHERE ma."eventId" = e."id" AND ma."campusId" IS NULL;

-- CreateIndex
CREATE INDEX "MinigameAttempt_campusId_publicationId_idx" ON "MinigameAttempt"("campusId", "publicationId");

-- AddForeignKey (re-add eventId with ON DELETE SET NULL so deleting an event preserves play history)
ALTER TABLE "MinigameAttempt" ADD CONSTRAINT "MinigameAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinigameAttempt" ADD CONSTRAINT "MinigameAttempt_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop orphaned per-campus minigames feature-flag overrides (flag removed)
DELETE FROM "CampusFeatureFlag" WHERE "flagKey" = 'minigames';
