-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('admin', 'superdev', 'dev', 'peda', 'manta');

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "staffRole" "StaffRole";
