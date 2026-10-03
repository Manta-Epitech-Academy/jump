-- Which Salesforce member statuses the dev space shows becomes configuration,
-- per event, instead of a rule in code (#371, replacing #368's AC7).
--
-- Three pieces:
--   - `Sync_MemberStatus`, the vocabulary Jump knows. A word missing from it is
--     unrecognised: masked everywhere and reported, as before. It ships with the
--     four words Salesforce sends today; `write_sync_member_status` adds the next.
--   - `EventConfig_ShownStatus`, one row per status an event shows (presence =
--     shown, like `EventConfig_Module`), and its template mirror.
--   - `Participation.shownInDevSpace`, the projection every dev count and list
--     filters on, because a Prisma `where` cannot compare a column with the
--     event's rows.
--
-- The backfill reproduces the rule this replaces exactly: every event and every
-- template shows READY and MET, and an enrolment is shown when its status is one
-- of them or when it has none. Nothing changes on screen the day it ships. No
-- data is lost.

-- AlterTable
ALTER TABLE "Participation" ADD COLUMN     "shownInDevSpace" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EventConfig_ShownStatus" (
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "EventConfig_ShownStatus_pkey" PRIMARY KEY ("eventId","status")
);

-- CreateTable
CREATE TABLE "EventConfig_TemplateShownStatus" (
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "EventConfig_TemplateShownStatus_pkey" PRIMARY KEY ("templateId","status")
);

-- CreateTable
CREATE TABLE "Sync_MemberStatus" (
    "status" TEXT NOT NULL,
    "shownByDefault" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sync_MemberStatus_pkey" PRIMARY KEY ("status")
);

-- CreateIndex
CREATE INDEX "EventConfig_ShownStatus_status_idx" ON "EventConfig_ShownStatus"("status");

-- CreateIndex
CREATE INDEX "EventConfig_TemplateShownStatus_status_idx" ON "EventConfig_TemplateShownStatus"("status");

-- CreateIndex
CREATE INDEX "Participation_eventId_shownInDevSpace_idx" ON "Participation"("eventId", "shownInDevSpace");

-- AddForeignKey
ALTER TABLE "EventConfig_ShownStatus" ADD CONSTRAINT "EventConfig_ShownStatus_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_ShownStatus" ADD CONSTRAINT "EventConfig_ShownStatus_status_fkey" FOREIGN KEY ("status") REFERENCES "Sync_MemberStatus"("status") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_TemplateShownStatus" ADD CONSTRAINT "EventConfig_TemplateShownStatus_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventConfig_Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_TemplateShownStatus" ADD CONSTRAINT "EventConfig_TemplateShownStatus_status_fkey" FOREIGN KEY ("status") REFERENCES "Sync_MemberStatus"("status") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The vocabulary at the time of the switch. READY (confirmed) and MET (attended)
-- are what a new event shows; CONNECTED (a lead who never confirmed) and
-- DESISTED (a withdrawal) are known and masked.
INSERT INTO "Sync_MemberStatus" ("status", "shownByDefault", "updatedAt") VALUES
    ('READY', true, CURRENT_TIMESTAMP),
    ('MET', true, CURRENT_TIMESTAMP),
    ('CONNECTED', false, CURRENT_TIMESTAMP),
    ('DESISTED', false, CURRENT_TIMESTAMP);

INSERT INTO "EventConfig_ShownStatus" ("eventId", "status")
SELECT e."id", s."status"
FROM "Event" e
CROSS JOIN (VALUES ('READY'), ('MET')) AS s("status");

-- Templates too: a preset saved before this carried no policy, and applying it
-- must not leave an event showing nobody.
INSERT INTO "EventConfig_TemplateShownStatus" ("templateId", "status")
SELECT t."id", s."status"
FROM "EventConfig_Template" t
CROSS JOIN (VALUES ('READY'), ('MET')) AS s("status");

UPDATE "Participation"
SET "shownInDevSpace" = ("sfMemberStatus" IS NULL OR "sfMemberStatus" IN ('READY', 'MET'));

-- An enrolment with no status is a row synced before the column existed, and it
-- is always shown: no event policy can name the absence of a word.
ALTER TABLE "Participation"
    ADD CONSTRAINT "Participation_unstatused_is_shown"
    CHECK ("sfMemberStatus" IS NOT NULL OR "shownInDevSpace");
