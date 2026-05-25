-- CreateTable
CREATE TABLE "OnboardingPdfJob" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filePath" TEXT,
    "errorMessage" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingPdfJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingPdfJob_status_createdAt_idx" ON "OnboardingPdfJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OnboardingPdfJob_talentId_idx" ON "OnboardingPdfJob"("talentId");

-- AddForeignKey
ALTER TABLE "OnboardingPdfJob" ADD CONSTRAINT "OnboardingPdfJob_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
