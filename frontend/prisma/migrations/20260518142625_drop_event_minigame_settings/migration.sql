/*
  Warnings:

  - You are about to drop the `EventMinigameSettings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EventMinigameSettings" DROP CONSTRAINT "EventMinigameSettings_eventId_fkey";

-- DropTable
DROP TABLE "EventMinigameSettings";
