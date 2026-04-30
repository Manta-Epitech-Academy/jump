/*
  Warnings:

  - You are about to drop the column `skillLevelId` on the `Observable` table. All the data in the column will be lost.
  - Added the required column `skillLevelId` to the `SubjectObservable` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Observable" DROP CONSTRAINT "Observable_skillLevelId_fkey";

-- AlterTable
ALTER TABLE "Observable" DROP COLUMN "skillLevelId";

-- AlterTable
ALTER TABLE "SubjectObservable" ADD COLUMN     "skillLevelId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "SubjectObservable_skillLevelId_idx" ON "SubjectObservable"("skillLevelId");

-- AddForeignKey
ALTER TABLE "SubjectObservable" ADD CONSTRAINT "SubjectObservable_skillLevelId_fkey" FOREIGN KEY ("skillLevelId") REFERENCES "SkillLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
