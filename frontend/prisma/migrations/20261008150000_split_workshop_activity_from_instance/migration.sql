-- A CTFd host serves one content after another, so what a talent walks is no
-- longer the instance but a `Workshop_Activity`, the content deployed on it.
-- The participation, the XP grant, the event link and the cover all move from
-- the host to the activity; the host keeps its slug (the ticket audience) and
-- its address.
--
-- Backfill: until now an instance served exactly one content, so each one
-- becomes that content's activity with the SAME id and the SAME slug. The
-- renamed columns therefore keep their values, every cover storage key
-- (`workshops/<id>/...`) stays where it is, and every workshop
-- `XpGrant.sourceId` (`<slug>:<talentId>`) still names its activity: nothing in
-- storage or in the ledger moves.
--
-- Warnings: `Workshop_Instance.label`, `.tagline` and `.enabled` are dropped
-- after being copied into `Workshop_Activity`, so nothing is lost.

-- CreateTable
CREATE TABLE "Workshop_Activity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tagline" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_Activity_slug_key" ON "Workshop_Activity"("slug");

-- CreateIndex
CREATE INDEX "Workshop_Activity_instanceId_idx" ON "Workshop_Activity"("instanceId");

-- AddForeignKey
ALTER TABLE "Workshop_Activity" ADD CONSTRAINT "Workshop_Activity_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Workshop_Instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one activity per instance, same id, same slug.
INSERT INTO "Workshop_Activity" ("id", "slug", "instanceId", "label", "tagline", "enabled", "createdAt", "updatedAt")
SELECT "id", "slug", "id", "label", "tagline", "enabled", "createdAt", "updatedAt"
FROM "Workshop_Instance";

-- Workshop_CoverImage: instanceId -> activityId
ALTER TABLE "Workshop_CoverImage" DROP CONSTRAINT "Workshop_CoverImage_instanceId_fkey";
ALTER TABLE "Workshop_CoverImage" RENAME COLUMN "instanceId" TO "activityId";
ALTER TABLE "Workshop_CoverImage" ADD CONSTRAINT "Workshop_CoverImage_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Workshop_Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EventConfig_Workshop: instanceId -> activityId
ALTER TABLE "EventConfig_Workshop" DROP CONSTRAINT "EventConfig_Workshop_instanceId_fkey";
ALTER TABLE "EventConfig_Workshop" RENAME COLUMN "instanceId" TO "activityId";
ALTER INDEX "EventConfig_Workshop_instanceId_idx" RENAME TO "EventConfig_Workshop_activityId_idx";
ALTER TABLE "EventConfig_Workshop" ADD CONSTRAINT "EventConfig_Workshop_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Workshop_Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Workshop_Participation: instanceId -> activityId
ALTER TABLE "Workshop_Participation" DROP CONSTRAINT "Workshop_Participation_instanceId_fkey";
ALTER TABLE "Workshop_Participation" RENAME COLUMN "instanceId" TO "activityId";
ALTER INDEX "Workshop_Participation_instanceId_idx" RENAME TO "Workshop_Participation_activityId_idx";
ALTER TABLE "Workshop_Participation" ADD CONSTRAINT "Workshop_Participation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Workshop_Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The host keeps its slug and its address only.
ALTER TABLE "Workshop_Instance" DROP COLUMN "label",
DROP COLUMN "tagline",
DROP COLUMN "enabled";
