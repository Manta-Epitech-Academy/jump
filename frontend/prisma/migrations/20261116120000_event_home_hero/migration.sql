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
