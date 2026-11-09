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
);

-- The event an XP grant was earned at (#491): what the event home's « Top
-- acquisition XP » sums. Only an activity names one.

-- AlterTable
ALTER TABLE "XpGrant" ADD COLUMN "eventId" TEXT;

-- CreateIndex
CREATE INDEX "XpGrant_eventId_idx" ON "XpGrant"("eventId");

-- AddForeignKey
ALTER TABLE "XpGrant" ADD CONSTRAINT "XpGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An activity's grant is keyed `${activitySlug}:${talentId}`
-- (`workshopGrantSourceId`), one per talent and activity, and the activity's
-- participation is pinned to the event the talent walked it at: that event.
UPDATE "XpGrant" g
SET "eventId" = w."eventId"
FROM "Workshop_Participation" w
JOIN "Workshop_Activity" a ON a."id" = w."activityId"
WHERE g."source" = 'workshop'
  AND g."sourceId" = a."slug" || ':' || w."talentId";

-- A tech interest's short label (#491): the word a roster chip shows where the
-- name is the choice a talent read at onboarding.

-- AlterTable
ALTER TABLE "Interest" ADD COLUMN "shortLabel" TEXT;

-- The catalogue's tech interests get the words the PO's mockup reads them by;
-- one added since over the admin API keeps its name until the PO gives it one
-- (write_interest), so no row breaks the CHECK below.
UPDATE "Interest" SET "shortLabel" = CASE "nom"
  WHEN 'Créer des sites web' THEN 'Web'
  WHEN 'Créer des apps' THEN 'Apps'
  WHEN 'Créer des jeux vidéo' THEN 'Jeux vidéo'
  WHEN 'Programmation' THEN 'Code'
  WHEN 'Intelligence artificielle' THEN 'IA'
  WHEN 'Robotique' THEN 'Robotique'
  WHEN 'Data science / Analyse de données' THEN 'Data'
  WHEN 'Cloud / Infrastructure' THEN 'Cloud'
  WHEN 'Cybersécurité / Hacking' THEN 'Cyber'
  ELSE "nom"
END
WHERE "kind" = 'tech';

ALTER TABLE "Interest"
    ADD CONSTRAINT "Interest_tech_has_short_label"
    CHECK ("kind" <> 'tech' OR "shortLabel" IS NOT NULL);
