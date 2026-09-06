/*
  Warnings:

  - You are about to drop the `CampusFeatureFlag` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CampusFeatureFlag" DROP CONSTRAINT "CampusFeatureFlag_campusId_fkey";

-- DropTable
DROP TABLE "CampusFeatureFlag";
