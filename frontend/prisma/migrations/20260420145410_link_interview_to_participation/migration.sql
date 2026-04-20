-- AlterTable
ALTER TABLE "Interview" ADD COLUMN "participationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Interview_participationId_key" ON "Interview"("participationId");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
