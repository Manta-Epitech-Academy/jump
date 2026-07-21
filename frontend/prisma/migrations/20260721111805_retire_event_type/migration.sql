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
