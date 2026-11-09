-- « Venu » (#491): which Salesforce statuses an event counts as attended, the
-- catalogue's default for new events, and the projection every dev screen
-- reads to say « Déjà venu 3 fois ».

-- AlterTable
ALTER TABLE "EventConfig_ShownStatus" ADD COLUMN "attestsAttendance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EventConfig_TemplateShownStatus" ADD COLUMN "attestsAttendance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Participation" ADD COLUMN "attendanceAttested" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Sync_MemberStatus" ADD COLUMN "attestsByDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Participation_talentId_attendanceAttested_idx" ON "Participation"("talentId", "attendanceAttested");

-- A word counts as attended on a new event only if a new event shows it: an
-- attending status is a shown one, on the catalogue as on each event.
ALTER TABLE "Sync_MemberStatus"
    ADD CONSTRAINT "Sync_MemberStatus_attests_only_if_shown"
    CHECK (NOT "attestsByDefault" OR "shownByDefault");

-- MET is Salesforce's word for a member who came, on every event that uses it
-- (#368). It attests by default, and on every event and template that shows it.
-- A stage's own words (« 3 - Convention validée », « 4 - En stage »...) are the
-- PO's to set over the admin API, event by event.
UPDATE "Sync_MemberStatus" SET "attestsByDefault" = true
WHERE "status" = 'MET' AND "shownByDefault";

UPDATE "EventConfig_ShownStatus" SET "attestsAttendance" = true
WHERE "status" = 'MET';

UPDATE "EventConfig_TemplateShownStatus" SET "attestsAttendance" = true
WHERE "status" = 'MET';

-- The projection, with the statement `services/attendance.ts` recomputes it
-- with (`ATTENDANCE_PROOF_SQL` in `domain/attendance.ts`).
UPDATE "Participation" p
SET "attendanceAttested" = (
  EXISTS (
    SELECT 1 FROM "EventConfig_ShownStatus" s
    WHERE s."eventId" = p."eventId"
      AND s."status" = p."sfMemberStatus"
      AND s."attestsAttendance"
  )
  OR EXISTS (
    SELECT 1 FROM "EventPresence" e
    WHERE e."eventId" = p."eventId"
      AND e."talentId" = p."talentId"
      AND e."status" IN ('present', 'late')
  )
  OR EXISTS (
    SELECT 1 FROM "Closing_Record" c
    WHERE c."eventId" = p."eventId" AND c."talentId" = p."talentId"
  )
  OR EXISTS (
    SELECT 1 FROM "Workshop_Participation" w
    WHERE w."eventId" = p."eventId" AND w."talentId" = p."talentId"
  )
);
