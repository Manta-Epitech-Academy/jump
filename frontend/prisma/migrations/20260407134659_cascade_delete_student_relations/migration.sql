-- DropForeignKey
ALTER TABLE "Participation" DROP CONSTRAINT "Participation_studentProfileId_fkey";

-- DropForeignKey
ALTER TABLE "PortfolioItem" DROP CONSTRAINT "PortfolioItem_studentProfileId_fkey";

-- DropForeignKey
ALTER TABLE "StepsProgress" DROP CONSTRAINT "StepsProgress_studentProfileId_fkey";

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepsProgress" ADD CONSTRAINT "StepsProgress_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
