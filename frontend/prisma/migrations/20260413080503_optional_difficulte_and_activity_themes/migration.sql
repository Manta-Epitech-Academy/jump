-- AlterTable
ALTER TABLE "Activity" ALTER COLUMN "difficulte" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ActivityTemplate" ALTER COLUMN "difficulte" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ActivityTheme" (
    "activityId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,

    CONSTRAINT "ActivityTheme_pkey" PRIMARY KEY ("activityId","themeId")
);

-- AddForeignKey
ALTER TABLE "ActivityTheme" ADD CONSTRAINT "ActivityTheme_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTheme" ADD CONSTRAINT "ActivityTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
