-- CreateEnum
CREATE TYPE "ParticipationVerdict" AS ENUM ('comfortable', 'progressing', 'struggling');

-- CreateEnum
CREATE TYPE "ParticipationContextTag" AS ENUM ('helped_others', 'disengaged');

-- DropForeignKey
ALTER TABLE "Participation" DROP CONSTRAINT "Participation_noteAuthorId_fkey";

-- AlterTable
ALTER TABLE "Participation" DROP COLUMN "note",
DROP COLUMN "noteAuthorId";

-- AlterTable
ALTER TABLE "ParticipationActivity" ADD COLUMN "verdict" "ParticipationVerdict",
ADD COLUMN "contextTag" "ParticipationContextTag",
ADD COLUMN "verdictAuthorId" TEXT,
ADD COLUMN "verdictAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ParticipationActivity" ADD CONSTRAINT "ParticipationActivity_verdictAuthorId_fkey" FOREIGN KEY ("verdictAuthorId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ParticipationActivity_verdictAuthorId_idx" ON "ParticipationActivity"("verdictAuthorId");
