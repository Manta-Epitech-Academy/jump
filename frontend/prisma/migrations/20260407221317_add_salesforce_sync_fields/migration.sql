/*
  Warnings:

  - A unique constraint covering the columns `[salesforceId]` on the table `StudentProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "salesforceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_salesforceId_key" ON "StudentProfile"("salesforceId");
