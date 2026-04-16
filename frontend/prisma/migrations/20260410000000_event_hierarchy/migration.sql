-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('atelier', 'conference', 'quiz', 'orga', 'special');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "salesforceCampaignId" TEXT;

-- AlterTable
ALTER TABLE "PortfolioItem" ADD COLUMN     "activityId" TEXT;

-- AlterTable
ALTER TABLE "StepsProgress" ADD COLUMN     "activityId" TEXT;

-- CreateTable
CREATE TABLE "ActivityTemplate" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "difficulte" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "isDynamic" BOOLEAN NOT NULL DEFAULT false,
    "campusId" TEXT,
    "link" TEXT,
    "contentStructure" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTemplateTheme" (
    "activityTemplateId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,

    CONSTRAINT "ActivityTemplateTheme_pkey" PRIMARY KEY ("activityTemplateId","themeId")
);

-- CreateTable
CREATE TABLE "Planning" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Planning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "planningId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "difficulte" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "isDynamic" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "contentStructure" JSONB,
    "timeSlotId" TEXT NOT NULL,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationActivity" (
    "participationId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "ParticipationActivity_pkey" PRIMARY KEY ("participationId","activityId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Planning_eventId_key" ON "Planning"("eventId");

-- CreateIndex
CREATE INDEX "TimeSlot_planningId_idx" ON "TimeSlot"("planningId");

-- CreateIndex
CREATE INDEX "Activity_timeSlotId_idx" ON "Activity"("timeSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_salesforceCampaignId_key" ON "Event"("salesforceCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "StepsProgress_studentProfileId_activityId_key" ON "StepsProgress"("studentProfileId", "activityId");

-- AddForeignKey
ALTER TABLE "ActivityTemplate" ADD CONSTRAINT "ActivityTemplate_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTemplateTheme" ADD CONSTRAINT "ActivityTemplateTheme_activityTemplateId_fkey" FOREIGN KEY ("activityTemplateId") REFERENCES "ActivityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTemplateTheme" ADD CONSTRAINT "ActivityTemplateTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planning" ADD CONSTRAINT "Planning_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "Planning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationActivity" ADD CONSTRAINT "ParticipationActivity_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationActivity" ADD CONSTRAINT "ParticipationActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepsProgress" ADD CONSTRAINT "StepsProgress_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
