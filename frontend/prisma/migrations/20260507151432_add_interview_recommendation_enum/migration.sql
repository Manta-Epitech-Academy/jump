-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('epitech_orientation_forte', 'a_explorer', 'autre_filiere', 'a_determiner');

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "recommendation" "InterviewRecommendation";
