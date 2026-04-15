/*
  Warnings:

  - You are about to drop the column `campusId` on the `Talent` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Talent" DROP CONSTRAINT "Talent_campusId_fkey";

-- DropIndex
DROP INDEX "Participation_talentId_idx";

-- DropIndex
DROP INDEX "Talent_campusId_idx";

-- AlterTable
ALTER TABLE "Talent" DROP COLUMN "campusId";

-- CreateIndex
CREATE INDEX "Participation_talentId_campusId_idx" ON "Participation"("talentId", "campusId");
