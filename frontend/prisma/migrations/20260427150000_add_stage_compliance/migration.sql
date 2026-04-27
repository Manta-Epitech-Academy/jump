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

-- AddForeignKey
ALTER TABLE "StageCompliance" ADD CONSTRAINT "StageCompliance_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (Activity.timeSlotId unique constraint from schema drift)
CREATE UNIQUE INDEX IF NOT EXISTS "Activity_timeSlotId_key" ON "Activity"("timeSlotId");
