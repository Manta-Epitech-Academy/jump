-- Add kind column to Interest
ALTER TABLE "Interest" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'general';

-- Rename interestsValidatedAt to techInterestsValidatedAt
ALTER TABLE "Talent" RENAME COLUMN "interestsValidatedAt" TO "techInterestsValidatedAt";

-- Add generalInterestsValidatedAt
ALTER TABLE "Talent" ADD COLUMN "generalInterestsValidatedAt" TIMESTAMP(3);

-- Copy techInterestsValidatedAt to generalInterestsValidatedAt for existing talents
UPDATE "Talent" SET "generalInterestsValidatedAt" = "techInterestsValidatedAt" WHERE "techInterestsValidatedAt" IS NOT NULL;
