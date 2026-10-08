-- An animated GIF is now accepted for every copied picture, and Jump derives
-- its still (the first frame, as a WebP) for talents who asked for reduced
-- motion. Nullable: every row stored so far is a still or a GIF media whose
-- cover names its own poster.

-- AlterTable
ALTER TABLE "TalentHome_HighlightImage" ADD COLUMN "stillKey" TEXT;

-- AlterTable
ALTER TABLE "Workshop_CoverImage" ADD COLUMN "stillKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TalentHome_HighlightImage_stillKey_key" ON "TalentHome_HighlightImage"("stillKey");

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_CoverImage_stillKey_key" ON "Workshop_CoverImage"("stillKey");
