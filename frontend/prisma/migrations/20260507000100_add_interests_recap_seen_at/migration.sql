-- AlterTable
ALTER TABLE "Talent" ADD COLUMN "interestsRecapSeenAt" TIMESTAMP(3);

-- Backfill for existing talents who completed interests
UPDATE "Talent" SET "interestsRecapSeenAt" = "generalInterestsValidatedAt" WHERE "generalInterestsValidatedAt" IS NOT NULL;
