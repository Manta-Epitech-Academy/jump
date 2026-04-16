-- RenameTable
ALTER TABLE "StudentProfile" RENAME TO "Talent";

-- RenameColumns
ALTER TABLE "Participation" RENAME COLUMN "studentProfileId" TO "talentId";
ALTER TABLE "StepsProgress" RENAME COLUMN "studentProfileId" TO "talentId";
ALTER TABLE "PortfolioItem" RENAME COLUMN "studentProfileId" TO "talentId";

-- RenameIndexes on Talent (ex-StudentProfile)
ALTER INDEX "StudentProfile_pkey" RENAME TO "Talent_pkey";
ALTER INDEX "StudentProfile_userId_key" RENAME TO "Talent_userId_key";
ALTER INDEX "StudentProfile_email_key" RENAME TO "Talent_email_key";
ALTER INDEX "StudentProfile_salesforceId_key" RENAME TO "Talent_externalId_key";
ALTER INDEX "StudentProfile_discordId_key" RENAME TO "Talent_discordId_key";
ALTER INDEX "StudentProfile_campusId_idx" RENAME TO "Talent_campusId_idx";

-- RenameConstraints on Talent (ex-StudentProfile)
ALTER TABLE "Talent" RENAME CONSTRAINT "StudentProfile_userId_fkey" TO "Talent_userId_fkey";
ALTER TABLE "Talent" RENAME CONSTRAINT "StudentProfile_campusId_fkey" TO "Talent_campusId_fkey";

-- RenameIndexes referencing talentId (ex-studentProfileId)
ALTER INDEX "Participation_studentProfileId_eventId_key" RENAME TO "Participation_talentId_eventId_key";
ALTER INDEX "Participation_studentProfileId_idx" RENAME TO "Participation_talentId_idx";
ALTER INDEX "StepsProgress_studentProfileId_activityId_key" RENAME TO "StepsProgress_talentId_activityId_key";
ALTER INDEX "StepsProgress_studentProfileId_idx" RENAME TO "StepsProgress_talentId_idx";
ALTER INDEX "PortfolioItem_studentProfileId_idx" RENAME TO "PortfolioItem_talentId_idx";

-- RenameConstraints referencing talentId (ex-studentProfileId)
ALTER TABLE "Participation" RENAME CONSTRAINT "Participation_studentProfileId_fkey" TO "Participation_talentId_fkey";
ALTER TABLE "StepsProgress" RENAME CONSTRAINT "StepsProgress_studentProfileId_fkey" TO "StepsProgress_talentId_fkey";
ALTER TABLE "PortfolioItem" RENAME CONSTRAINT "PortfolioItem_studentProfileId_fkey" TO "PortfolioItem_talentId_fkey";
