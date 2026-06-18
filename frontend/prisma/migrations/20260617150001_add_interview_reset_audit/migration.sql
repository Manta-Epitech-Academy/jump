-- CreateTable
CREATE TABLE "InterviewReset" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "conductedByStaffId" TEXT,
    "conductedAt" TIMESTAMP(3) NOT NULL,
    "resetByStaffId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewReset_talentId_createdAt_idx" ON "InterviewReset"("talentId", "createdAt");

-- AddForeignKey
ALTER TABLE "InterviewReset" ADD CONSTRAINT "InterviewReset_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewReset" ADD CONSTRAINT "InterviewReset_resetByStaffId_fkey" FOREIGN KEY ("resetByStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
