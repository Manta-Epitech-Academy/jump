-- AlterEnum
ALTER TYPE "XpGrantSource" ADD VALUE 'reward';

-- CreateTable
CREATE TABLE "XpReward" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "xpAmount" INTEGER,
    "campusId" TEXT,
    "awardedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "XpReward_key_key" ON "XpReward"("key");

-- CreateIndex
CREATE INDEX "XpReward_campusId_idx" ON "XpReward"("campusId");

-- AddForeignKey
ALTER TABLE "XpReward" ADD CONSTRAINT "XpReward_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
