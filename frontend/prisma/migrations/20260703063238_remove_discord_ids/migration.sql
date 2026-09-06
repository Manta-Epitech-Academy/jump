/*
  Warnings:

  - You are about to drop the column `discordId` on the `StaffProfile` table. All the data in the column will be lost.
  - You are about to drop the column `discordId` on the `Talent` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "StaffProfile_discordId_key";

-- DropIndex
DROP INDEX "Talent_discordId_key";

-- AlterTable
ALTER TABLE "StaffProfile" DROP COLUMN "discordId";

-- AlterTable
ALTER TABLE "Talent" DROP COLUMN "discordId";
