-- A campus note may now carry pictures, each copied from the address its
-- Markdown names. No backfill: until now a note with a picture was refused.

-- CreateTable
CREATE TABLE "TalentHome_NoteImage" (
    "key" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "stillKey" TEXT,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "TalentHome_NoteImage_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "TalentHome_NoteImage_stillKey_key" ON "TalentHome_NoteImage"("stillKey");

-- CreateIndex
CREATE UNIQUE INDEX "TalentHome_NoteImage_campusId_sourceUrl_key" ON "TalentHome_NoteImage"("campusId", "sourceUrl");

-- AddForeignKey
ALTER TABLE "TalentHome_NoteImage" ADD CONSTRAINT "TalentHome_NoteImage_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "TalentHome_Note"("campusId") ON DELETE CASCADE ON UPDATE CASCADE;
