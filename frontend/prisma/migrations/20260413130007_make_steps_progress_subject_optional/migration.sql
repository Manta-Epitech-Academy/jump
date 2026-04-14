-- DropForeignKey
ALTER TABLE "StepsProgress" DROP CONSTRAINT "StepsProgress_subjectId_fkey";

-- AlterTable
ALTER TABLE "StepsProgress" ALTER COLUMN "subjectId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "StepsProgress" ADD CONSTRAINT "StepsProgress_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
