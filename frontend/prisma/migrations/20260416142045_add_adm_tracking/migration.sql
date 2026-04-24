-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('planned', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "eventType" TEXT NOT NULL DEFAULT 'coding_club';

-- CreateTable
CREATE TABLE "StageCompliance" (
    "participationId" TEXT NOT NULL,
    "charteSigned" BOOLEAN NOT NULL DEFAULT false,
    "conventionSigned" BOOLEAN NOT NULL DEFAULT false,
    "imageRightsSigned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageCompliance_pkey" PRIMARY KEY ("participationId")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'planned',
    "discoveryReason" TEXT,
    "motivation" TEXT,
    "nextEventInterest" TEXT,
    "influencers" TEXT,
    "platforms" TEXT,
    "specialties" TEXT,
    "interests" TEXT,
    "otherJobs" TEXT,
    "satisfaction" TEXT,
    "globalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interview_talentId_idx" ON "Interview"("talentId");

-- CreateIndex
CREATE INDEX "Interview_staffId_idx" ON "Interview"("staffId");

-- CreateIndex
CREATE INDEX "Interview_campusId_idx" ON "Interview"("campusId");

-- AddForeignKey
ALTER TABLE "StageCompliance" ADD CONSTRAINT "StageCompliance_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
