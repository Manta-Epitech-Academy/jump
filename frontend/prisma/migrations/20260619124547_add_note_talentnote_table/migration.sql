-- CreateEnum
CREATE TYPE "Note_TalentNoteCategory" AS ENUM ('general', 'pedagogical', 'administrative');

-- CreateTable
CREATE TABLE "Note_TalentNote" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "authorId" TEXT,
    "editedById" TEXT,
    "category" "Note_TalentNoteCategory" NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_TalentNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_TalentNote_talentId_createdAt_idx" ON "Note_TalentNote"("talentId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_TalentNote_eventId_idx" ON "Note_TalentNote"("eventId");

-- AddForeignKey
ALTER TABLE "Note_TalentNote" ADD CONSTRAINT "Note_TalentNote_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note_TalentNote" ADD CONSTRAINT "Note_TalentNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note_TalentNote" ADD CONSTRAINT "Note_TalentNote_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note_TalentNote" ADD CONSTRAINT "Note_TalentNote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
