-- Image rights become an explicit three-state decision (accepted / refused /
-- undecided=NULL) instead of a bare "signed-at" timestamp that could only ever
-- mean acceptance. The timestamp is repurposed (and renamed) to record *when a
-- decision was made*, whichever way it went.

-- CreateEnum
CREATE TYPE "ImageRightsDecision" AS ENUM ('accepted', 'refused');

-- AlterTable: repurpose the signature timestamp as a neutral "decided-at".
ALTER TABLE "Talent" RENAME COLUMN "imageRightsSignedAt" TO "imageRightsDecidedAt";
ALTER TABLE "Talent" ADD COLUMN "imageRightsDecision" "ImageRightsDecision";

-- Backfill: every pre-existing decision was an acceptance — refusal had no way
-- to be expressed before this migration. Keep the timestamp and label it.
UPDATE "Talent"
SET "imageRightsDecision" = 'accepted'
WHERE "imageRightsDecidedAt" IS NOT NULL;

-- DropColumn: the per-participation manual mirror is superseded by the
-- authoritative talent-level decision (it was never synced with what parents
-- actually signed online, so it carried no trustworthy signal).
ALTER TABLE "StageCompliance" DROP COLUMN "imageRightsSigned";
