-- CreateTable
CREATE TABLE "InterestCategory" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "InterestCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interest" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "emoji" TEXT,
    "order" INTEGER NOT NULL,
    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentInterest" (
    "talentId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,
    CONSTRAINT "TalentInterest_pkey" PRIMARY KEY ("talentId","interestId")
);

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN "interestsValidatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "InterestCategory_nom_key" ON "InterestCategory"("nom");

-- CreateIndex
CREATE INDEX "Interest_categoryId_idx" ON "Interest"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Interest_categoryId_nom_key" ON "Interest"("categoryId", "nom");

-- CreateIndex
CREATE INDEX "TalentInterest_interestId_idx" ON "TalentInterest"("interestId");

-- AddForeignKey
ALTER TABLE "Interest" ADD CONSTRAINT "Interest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InterestCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentInterest" ADD CONSTRAINT "TalentInterest_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentInterest" ADD CONSTRAINT "TalentInterest_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "Interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
