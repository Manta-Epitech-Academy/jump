-- AlterTable
ALTER TABLE "Participation" ADD COLUMN     "sfMemberStatus" TEXT;

-- CreateIndex
CREATE INDEX "Participation_eventId_sfMemberStatus_idx" ON "Participation"("eventId", "sfMemberStatus");
