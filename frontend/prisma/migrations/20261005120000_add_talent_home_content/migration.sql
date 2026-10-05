-- What a campus puts on its talents' home besides their own enrolments: « le
-- mot du campus » (free Markdown, in the Actualités card) and one event to
-- sign up for (title, short text, day, outside form, in « Planning à venir »).
--
-- Both are authored over the admin API, campus by campus, so they are current
-- state and one row per campus; the history of who changed what lives in
-- `AdminApi_Call`. Two tables rather than one with nullable columns, because
-- the two exist independently and a highlight is all of its fields or none.
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

-- AddForeignKey
ALTER TABLE "TalentHome_Note" ADD CONSTRAINT "TalentHome_Note_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentHome_Highlight" ADD CONSTRAINT "TalentHome_Highlight_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
