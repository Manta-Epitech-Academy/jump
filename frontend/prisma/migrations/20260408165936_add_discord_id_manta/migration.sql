/*
  Warnings:

  - A unique constraint covering the columns `[discordId]` on the table `StaffProfile` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[discordId]` on the table `StudentProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "discordId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_discordId_key" ON "StaffProfile"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_discordId_key" ON "StudentProfile"("discordId");
