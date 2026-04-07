/*
  Warnings:

  - The `niveau` column on the `StudentProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `niveauDifficulte` column on the `StudentProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `level` column on the `StudentProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `difficulte` on the `Subject` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "StudentProfile" DROP COLUMN "niveau",
ADD COLUMN     "niveau" TEXT,
DROP COLUMN "niveauDifficulte",
ADD COLUMN     "niveauDifficulte" TEXT,
DROP COLUMN "level",
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'Novice';

-- AlterTable
ALTER TABLE "Subject" DROP COLUMN "difficulte",
ADD COLUMN     "difficulte" TEXT NOT NULL;

-- DropEnum
DROP TYPE "Difficulty";

-- DropEnum
DROP TYPE "Niveau";

-- DropEnum
DROP TYPE "StudentLevel";
