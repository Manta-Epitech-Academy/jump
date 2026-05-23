-- CreateEnum
CREATE TYPE "XpGrantSource" AS ENUM ('onboarding', 'minigame', 'activity_presence', 'admin_adjustment');

-- AlterTable
ALTER TABLE "Talent" DROP COLUMN "level";

-- CreateTable
CREATE TABLE "XpGrant" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "campusId" TEXT,
    "source" "XpGrantSource" NOT NULL,
    "sourceId" TEXT,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XpGrant_talentId_idx" ON "XpGrant"("talentId");

-- CreateIndex
CREATE INDEX "XpGrant_campusId_idx" ON "XpGrant"("campusId");

-- CreateIndex
CREATE INDEX "XpGrant_source_idx" ON "XpGrant"("source");

-- CreateIndex
CREATE UNIQUE INDEX "XpGrant_source_sourceId_key" ON "XpGrant"("source", "sourceId");

-- CreateIndex
CREATE INDEX "Talent_xp_idx" ON "Talent"("xp");

-- AddForeignKey
ALTER TABLE "XpGrant" ADD CONSTRAINT "XpGrant_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpGrant" ADD CONSTRAINT "XpGrant_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

