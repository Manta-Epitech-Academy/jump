/*
  Warnings:

  - You are about to drop the column `eventType` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `forEventType` on the `EventConfig_Template` table. All the data in the column will be lost.
  - You are about to drop the column `defaultForEventType` on the `Feedback_Form` table. All the data in the column will be lost.

*/
-- Backfill the stage window as concrete data BEFORE dropping the type it was
-- synthesised from: every existing stage keeps its ~2-week window, now carried
-- by `endDate` (what the app used to derive from `eventType = 'stage_seconde'`).
UPDATE "Event"
SET "endDate" = "date" + interval '14 days'
WHERE "eventType" = 'stage_seconde' AND "endDate" IS NULL;

-- Materialise the feedback-form binding that used to resolve through
-- `Feedback_Form.defaultForEventType`: an event with no explicit `feedbackFormId`
-- inherited the form marked default for its type (only 'stage_seconde' ever had
-- one). That resolution path is removed with the column below, so pin the default
-- onto every event that relied on it BEFORE dropping the type it keyed off -
-- otherwise those events (every existing stage) silently lose their Bilan
-- surface. Mirrors the `endDate` backfill above. Unconditional (not gated on the
-- form's published state) to reproduce today's behaviour exactly; the live-ness
-- gate stays in app code.
UPDATE "Event" e
SET "feedbackFormId" = ff."id"
FROM "Feedback_Form" ff
WHERE ff."defaultForEventType" = e."eventType"
  AND e."feedbackFormId" IS NULL;

-- DropIndex
DROP INDEX "EventConfig_Template_forEventType_idx";

-- DropIndex
DROP INDEX "Feedback_Form_defaultForEventType_key";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "eventType";

-- AlterTable
ALTER TABLE "EventConfig_Template" DROP COLUMN "forEventType";

-- AlterTable
ALTER TABLE "Feedback_Form" DROP COLUMN "defaultForEventType";
