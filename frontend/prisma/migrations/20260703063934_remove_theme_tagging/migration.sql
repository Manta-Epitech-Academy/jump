/*
  Warnings:

  - You are about to drop the column `themeId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the `ActivityTheme` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Theme` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ActivityTheme" DROP CONSTRAINT "ActivityTheme_activityId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTheme" DROP CONSTRAINT "ActivityTheme_themeId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_themeId_fkey";

-- DropForeignKey
ALTER TABLE "Theme" DROP CONSTRAINT "Theme_campusId_fkey";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "themeId";

-- DropTable
DROP TABLE "ActivityTheme";

-- DropTable
DROP TABLE "Theme";
