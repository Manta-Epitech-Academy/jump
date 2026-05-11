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

-- CreateIndex
CREATE UNIQUE INDEX "Lycee_nom_key" ON "Lycee"("nom");

-- CreateIndex
CREATE INDEX "Talent_lyceeId_idx" ON "Talent"("lyceeId");

-- AddForeignKey
ALTER TABLE "Talent" ADD CONSTRAINT "Talent_lyceeId_fkey" FOREIGN KEY ("lyceeId") REFERENCES "Lycee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
