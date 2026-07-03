/*
  Warnings:

  - You are about to drop the column `content` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `difficulte` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `link` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `templateId` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `pin` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `badges` on the `Talent` table. All the data in the column will be lost.
  - You are about to drop the column `charterFilePath` on the `Talent` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncedAt` on the `Talent` table. All the data in the column will be lost.
  - You are about to drop the column `note` on the `XpGrant` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Activity_templateId_idx";

-- AlterTable
ALTER TABLE "Activity" DROP COLUMN "content",
DROP COLUMN "description",
DROP COLUMN "difficulte",
DROP COLUMN "link",
DROP COLUMN "templateId";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "pin";

-- AlterTable
ALTER TABLE "Talent" DROP COLUMN "badges",
DROP COLUMN "charterFilePath",
DROP COLUMN "lastSyncedAt";

-- AlterTable
ALTER TABLE "XpGrant" DROP COLUMN "note";
