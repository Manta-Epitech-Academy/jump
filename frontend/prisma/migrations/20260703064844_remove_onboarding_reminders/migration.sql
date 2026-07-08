/*
  Warnings:

  - You are about to drop the `OnboardingReminder` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OnboardingReminder" DROP CONSTRAINT "OnboardingReminder_talentId_fkey";

-- DropTable
DROP TABLE "OnboardingReminder";
