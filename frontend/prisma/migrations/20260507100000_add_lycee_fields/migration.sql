-- AlterTable
ALTER TABLE "Talent" ADD COLUMN "highSchoolName" TEXT;
ALTER TABLE "Talent" ADD COLUMN "highSchoolCity" TEXT;
ALTER TABLE "Talent" ADD COLUMN "highSchoolValidatedAt" TIMESTAMP(3);

-- Backfill for existing talents who completed onboarding
UPDATE "Talent" SET "highSchoolValidatedAt" = "infoValidatedAt" WHERE "infoValidatedAt" IS NOT NULL;
