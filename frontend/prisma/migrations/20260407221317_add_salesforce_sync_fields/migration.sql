/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `StudentProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_externalId_key" ON "StudentProfile"("externalId");
