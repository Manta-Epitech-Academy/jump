-- AlterTable
ALTER TABLE "Interview" DROP COLUMN "satisfactionContent",
DROP COLUMN "weekFavorite";

-- DropEnum
DROP TYPE "SatisfactionContent";

-- DropEnum
DROP TYPE "WeekDomain";
