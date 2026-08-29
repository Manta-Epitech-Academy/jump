-- A closing is keyed on (talentId, eventId), not on a Participation row.
--
-- Warnings:
--   - `Closing_Record.participationId` is dropped, and it holds a value on every
--     one of the existing rows. No backfill is owed: `eventId` below is filled
--     FROM that column before it goes, and (talentId, eventId) is Participation's
--     own natural key, so nothing the dropped column said is lost.
--   - A unique constraint is added on (talentId, eventId). Verified against the
--     restored production snapshot before writing this: zero duplicates.
--
-- Why: the Salesforce sync hard-deletes every Participation missing from a
-- campaign's payload, and Closing_Record cascaded from it, so the CRM could
-- destroy a conducted closing - answers, verdict, testimonial - with none of the
-- trace Closing_ResetEvent exists to guarantee. Every sibling artifact keyed on
-- the pair already (EventPresence, Note_TalentNote, Feedback_Submission); this
-- brings the last one into line.

-- Step 1: carry the event over from the participation about to be dropped.
ALTER TABLE "Closing_Record" ADD COLUMN "eventId" TEXT;

UPDATE "Closing_Record" c
SET "eventId" = p."eventId"
FROM "Participation" p
WHERE p."id" = c."participationId";

ALTER TABLE "Closing_Record" ALTER COLUMN "eventId" SET NOT NULL;

-- Step 2: cut the Salesforce-owned link.
ALTER TABLE "Closing_Record" DROP CONSTRAINT "Closing_Record_participationId_fkey";
DROP INDEX "Closing_Record_participationId_key";
ALTER TABLE "Closing_Record" DROP COLUMN "participationId";

-- Step 3: the new key, and a FK to something the sync never deletes.
CREATE UNIQUE INDEX "Closing_Record_talentId_eventId_key" ON "Closing_Record"("talentId", "eventId");
CREATE INDEX "Closing_Record_eventId_idx" ON "Closing_Record"("eventId");

ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
