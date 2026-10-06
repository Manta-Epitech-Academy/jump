-- What a campus puts on its talents' home besides their own enrolments: « le
-- mot du campus » (free Markdown, in the Actualités card) and one event to
-- sign up for (title, short text, day, outside form, and an optional picture,
-- in the home's blue hero).
--
-- Both are authored over the admin API, campus by campus, so they are current
-- state and one row per campus; the history of who changed what lives in
-- `AdminApi_Call`. Separate tables rather than nullable columns, because the
-- note and the highlight exist independently, a highlight is all of its fields
-- or none, and its picture is all of its own fields or none. The picture is
-- copied into storage, never linked to.
--
-- No backfill: no campus has either today, and no row means nothing shown.

-- CreateTable
CREATE TABLE "TalentHome_Note" (
    "campusId" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentHome_Note_pkey" PRIMARY KEY ("campusId")
);

-- CreateTable
CREATE TABLE "TalentHome_Highlight" (
    "campusId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "url" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentHome_Highlight_pkey" PRIMARY KEY ("campusId")
);

-- CreateTable
CREATE TABLE "TalentHome_HighlightImage" (
    "campusId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "TalentHome_HighlightImage_pkey" PRIMARY KEY ("campusId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TalentHome_HighlightImage_key_key" ON "TalentHome_HighlightImage"("key");

-- AddForeignKey
ALTER TABLE "TalentHome_Note" ADD CONSTRAINT "TalentHome_Note_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentHome_Highlight" ADD CONSTRAINT "TalentHome_Highlight_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentHome_HighlightImage" ADD CONSTRAINT "TalentHome_HighlightImage_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "TalentHome_Highlight"("campusId") ON DELETE CASCADE ON UPDATE CASCADE;
