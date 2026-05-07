-- AlterTable
ALTER TABLE "Talent" ADD COLUMN "lyceeNom" TEXT;
ALTER TABLE "Talent" ADD COLUMN "lyceeVille" TEXT;
ALTER TABLE "Talent" ADD COLUMN "lyceeValidatedAt" TIMESTAMP(3);

-- Backfill for existing talents who completed onboarding
UPDATE "Talent" SET "lyceeValidatedAt" = "infoValidatedAt" WHERE "infoValidatedAt" IS NOT NULL;
