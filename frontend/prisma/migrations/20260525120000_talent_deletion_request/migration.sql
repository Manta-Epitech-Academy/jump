-- CreateEnum
CREATE TYPE "TalentDeletionRequestStatus" AS ENUM ('pending', 'fulfilled', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "TalentDeletionRequest" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "status" "TalentDeletionRequestStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "TalentDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TalentDeletionRequest_status_requestedAt_idx" ON "TalentDeletionRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "TalentDeletionRequest_talentId_idx" ON "TalentDeletionRequest"("talentId");

-- AddForeignKey
ALTER TABLE "TalentDeletionRequest" ADD CONSTRAINT "TalentDeletionRequest_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
