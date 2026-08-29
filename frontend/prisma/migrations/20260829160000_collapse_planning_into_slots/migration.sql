-- One table for an event's programme, replacing three.
--
-- Warnings: `Planning`, `TimeSlot` and `Activity` are dropped. No data is lost -
-- every row they held is copied into `Planning_Slot` by the INSERT below, in the
-- same migration, before the drops run.
--
-- Why: `Planning` carried an eventId and two timestamps and nothing else,
-- auto-created empty for every synced event (286 of 292 rows held no slot);
-- `Activity` carried `nom` and `activityType` against a unique `timeSlotId`, at
-- exactly the same row count as `TimeSlot` and with not one slot lacking one. The
-- price was paid in `db/scoped.ts`, where campus scoping walked
-- activity -> timeSlot -> planning -> event -> campusId at every level: about 288
-- of 707 lines, 41 % of the layer that cloisters a campus's data, half of it
-- guarding write paths the application does not have.
--
-- `nom` and `activityType` are NOT NULL: verified against the restored production
-- snapshot, zero slots lacked an activity, and one that did rendered as nothing
-- at all because the viewer skipped it.

CREATE TABLE "Planning_Slot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "nom" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Planning_Slot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Planning_Slot_eventId_startTime_idx" ON "Planning_Slot"("eventId", "startTime");

ALTER TABLE "Planning_Slot" ADD CONSTRAINT "Planning_Slot_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry every slot over, keeping the slot's own id so anything holding one still
-- resolves. The join is inner on Activity on purpose: a slot with no activity is
-- an invisible row, and there are none.
INSERT INTO "Planning_Slot" ("id", "eventId", "startTime", "endTime", "nom", "activityType", "createdAt", "updatedAt")
SELECT t."id", p."eventId", t."startTime", t."endTime", a."nom", a."activityType", t."createdAt", t."updatedAt"
FROM "TimeSlot" t
JOIN "Planning" p ON p."id" = t."planningId"
JOIN "Activity" a ON a."timeSlotId" = t."id";

DROP TABLE "Activity";
DROP TABLE "TimeSlot";
DROP TABLE "Planning";
