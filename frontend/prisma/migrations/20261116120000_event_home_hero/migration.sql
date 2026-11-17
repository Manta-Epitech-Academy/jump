-- An event's activity can be offered on one of its days, or one half-day of
-- it, instead of the whole event (#501): a stage de seconde gives some mornings
-- three subjects to choose from. Null keeps today's behaviour, so no existing
-- row changes.
ALTER TABLE "EventConfig_Workshop" ADD COLUMN "day" DATE,
ADD COLUMN "slot" "PresenceSlot";

-- A half-day is a half of a day: without the day it names no moment at all.
-- Hand-written, Prisma cannot express a CHECK.
ALTER TABLE "EventConfig_Workshop"
    ADD CONSTRAINT "EventConfig_Workshop_slot_needs_day"
    CHECK ("slot" IS NULL OR "day" IS NOT NULL);

-- An event's own sign-up form (#501), Jump-owned: the Salesforce sync never
-- writes it. Null on every existing event, which no campus points at yet.
ALTER TABLE "Event" ADD COLUMN "signupUrl" TEXT;

-- What one event says on the talent home's hero at each stage, and the
-- picture of the two stages before it (#501, the PO call of 13/10/2026).
CREATE TYPE "EventConfig_HeroStage" AS ENUM ('invitation', 'enrolled', 'live');

CREATE TABLE "EventConfig_Hero" (
    "eventId" TEXT NOT NULL,
    "stage" "EventConfig_HeroStage" NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "buttonLabel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventConfig_Hero_pkey" PRIMARY KEY ("eventId","stage")
);

CREATE TABLE "EventConfig_HeroImage" (
    "eventId" TEXT NOT NULL,
    "stage" "EventConfig_HeroStage" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "stillKey" TEXT,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "EventConfig_HeroImage_pkey" PRIMARY KEY ("eventId","stage")
);

CREATE UNIQUE INDEX "EventConfig_HeroImage_key_key" ON "EventConfig_HeroImage"("key");

CREATE UNIQUE INDEX "EventConfig_HeroImage_stillKey_key" ON "EventConfig_HeroImage"("stillKey");

ALTER TABLE "EventConfig_Hero" ADD CONSTRAINT "EventConfig_Hero_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventConfig_HeroImage" ADD CONSTRAINT "EventConfig_HeroImage_eventId_stage_fkey" FOREIGN KEY ("eventId", "stage") REFERENCES "EventConfig_Hero"("eventId", "stage") ON DELETE CASCADE ON UPDATE CASCADE;

-- The mockup draws no picture while the event runs: the live stage heads the
-- subjects, which carry their own. Hand-written, Prisma cannot express a CHECK.
ALTER TABLE "EventConfig_HeroImage"
    ADD CONSTRAINT "EventConfig_HeroImage_not_live"
    CHECK ("stage" <> 'live');

-- What a campus puts forward on its talents' home (#501) becomes an event it
-- points at and/or a generic invitation, the standing fallback once the event
-- is over. Every row in production on 16/11/2026 was a generic invitation
-- (15 campuses, read through config_talent_home), so every row keeps its words
-- and becomes the generic half: the summary is renamed, not copied.
ALTER TABLE "TalentHome_Highlight" RENAME COLUMN "summary" TO "text";
ALTER TABLE "TalentHome_Highlight" ALTER COLUMN "title" DROP NOT NULL,
ALTER COLUMN "text" DROP NOT NULL,
ALTER COLUMN "url" DROP NOT NULL,
ADD COLUMN "buttonLabel" TEXT,
ADD COLUMN "eventId" TEXT;

-- Warnings:
--   The column `date` is dropped, with its data. No backfill is owed: all 15
--   production rows held `date = NULL` on 16/11/2026 (read through
--   config_talent_home), the undated « toute l'année » invitation. A dated
--   invitation was an invitation to one event, which is now the event itself
--   (`eventId`), shown until the end of its first day.
ALTER TABLE "TalentHome_Highlight" DROP COLUMN "date";

CREATE INDEX "TalentHome_Highlight_eventId_idx" ON "TalentHome_Highlight"("eventId");

-- SetNull, so the generic invitation outlives an event Salesforce deletes.
ALTER TABLE "TalentHome_Highlight" ADD CONSTRAINT "TalentHome_Highlight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The generic invitation is whole or absent: an invitation with no link
-- invites to nothing, and a link with no words says nothing. Hand-written,
-- Prisma cannot express a CHECK. No "at least one half" check: SetNull on
-- `eventId` would break it, so the write deletes a row left with neither.
ALTER TABLE "TalentHome_Highlight"
    ADD CONSTRAINT "TalentHome_Highlight_invitation_whole"
    CHECK (
        ("title" IS NULL AND "text" IS NULL AND "url" IS NULL)
        OR ("title" IS NOT NULL AND "text" IS NOT NULL AND "url" IS NOT NULL)
    );
