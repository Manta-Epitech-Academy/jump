-- Activities become data: a CTFd instance is a row, an event offers some, and a
-- talent's progress on one is mirrored back.
--
-- Until now Jump and the CTFd instances carrying the `workshop_platform` plugin
-- ignored each other: a talent signed in twice with credentials handed out some
-- other way, and the XP of the last stage were granted by running a script on the
-- production database with a spreadsheet of CTFd results beside it.
--
-- Three tables, and each of the three shapes is a decision.
--
-- `Workshop_Instance` is curation and nothing else: no title, no step count, no
-- description, because those live in CTFd and are read from it, exactly as
-- `MinigameConfig` refuses to keep the jump-games catalogue by hand. `baseUrl` is
-- a column rather than an environment variable because there are eleven hosts and
-- one jump-games backend.
--
-- `EventConfig_Workshop` carries `durationMinutes`, which is the scale parameter:
-- the same subject runs 2 h at a Coding Club and 3 h at a camp. It is prefixed for
-- event configuration and not for workshops because the prefix names the context
-- that owns the write path.
--
-- `Workshop_Participation` is a polled external mirror, the `TalentSfImport`
-- shape, not an append-only log: `solvedSteps` and `totalSteps` are CTFd's claim.
-- It keys on `(talentId, instanceId)`, which encodes the product rule that an
-- activity is worth its XP once per talent for life, because CTFd holds one
-- account per talent per instance and cannot say which event a validation belongs
-- to. `eventId` and `campusId` are snapshots with `ON DELETE SET NULL` and no
-- composite key back to `Event(id, campusId)`: the Salesforce sync hard-deletes
-- the enrolments a payload omits, so a talent can lose the enrolment mid-activity
-- and these columns are what survives it. `budgetMinutes` snapshots the link row
-- at first entry, which is what lets a duration be replayed later without taking
-- XP back off anybody who has already started.
--
-- No backfill is owed: every table is new, and `XpGrantSource.workshop` cannot
-- describe a row that predates it.

-- AlterEnum
ALTER TYPE "XpGrantSource" ADD VALUE 'workshop';

-- CreateTable
CREATE TABLE "Workshop_Instance" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_Instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventConfig_Workshop" (
    "eventId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "labelOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventConfig_Workshop_pkey" PRIMARY KEY ("eventId","instanceId")
);

-- CreateTable
CREATE TABLE "Workshop_Participation" (
    "talentId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "eventId" TEXT,
    "campusId" TEXT,
    "budgetMinutes" INTEGER NOT NULL,
    "solvedSteps" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "xpPending" INTEGER NOT NULL DEFAULT 0,
    "firstEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "xpSeenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_Participation_pkey" PRIMARY KEY ("talentId","instanceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_Instance_slug_key" ON "Workshop_Instance"("slug");

-- CreateIndex
CREATE INDEX "EventConfig_Workshop_instanceId_idx" ON "EventConfig_Workshop"("instanceId");

-- CreateIndex
CREATE INDEX "Workshop_Participation_instanceId_idx" ON "Workshop_Participation"("instanceId");

-- CreateIndex
CREATE INDEX "Workshop_Participation_eventId_idx" ON "Workshop_Participation"("eventId");

-- CreateIndex
CREATE INDEX "Workshop_Participation_campusId_idx" ON "Workshop_Participation"("campusId");

-- AddForeignKey
ALTER TABLE "EventConfig_Workshop" ADD CONSTRAINT "EventConfig_Workshop_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_Workshop" ADD CONSTRAINT "EventConfig_Workshop_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Workshop_Instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop_Participation" ADD CONSTRAINT "Workshop_Participation_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop_Participation" ADD CONSTRAINT "Workshop_Participation_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Workshop_Instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop_Participation" ADD CONSTRAINT "Workshop_Participation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop_Participation" ADD CONSTRAINT "Workshop_Participation_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

