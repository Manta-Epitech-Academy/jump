-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "lyceeId" TEXT;

-- CreateTable
CREATE TABLE "Lycee" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ville" TEXT,
    "departement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lycee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interest" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentInterest" (
    "talentId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,

    CONSTRAINT "TalentInterest_pkey" PRIMARY KEY ("talentId","interestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lycee_nom_key" ON "Lycee"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "Interest_label_key" ON "Interest"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Interest_slug_key" ON "Interest"("slug");

-- CreateIndex
CREATE INDEX "TalentInterest_interestId_idx" ON "TalentInterest"("interestId");

-- CreateIndex
CREATE INDEX "Talent_lyceeId_idx" ON "Talent"("lyceeId");

-- AddForeignKey
ALTER TABLE "Talent" ADD CONSTRAINT "Talent_lyceeId_fkey" FOREIGN KEY ("lyceeId") REFERENCES "Lycee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentInterest" ADD CONSTRAINT "TalentInterest_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentInterest" ADD CONSTRAINT "TalentInterest_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "Interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
