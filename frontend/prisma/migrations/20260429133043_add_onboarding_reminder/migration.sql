-- CreateTable
CREATE TABLE "OnboardingReminder" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentBy" TEXT NOT NULL,

    CONSTRAINT "OnboardingReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingReminder_talentId_idx" ON "OnboardingReminder"("talentId");

-- AddForeignKey
ALTER TABLE "OnboardingReminder" ADD CONSTRAINT "OnboardingReminder_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
