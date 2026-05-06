-- DropForeignKey
ALTER TABLE "Interest" DROP CONSTRAINT "Interest_categoryId_fkey";

-- DropIndex
DROP INDEX "Interest_categoryId_idx";
DROP INDEX "Interest_categoryId_nom_key";

-- AlterTable
ALTER TABLE "Interest" DROP COLUMN "categoryId";

-- Add unique constraint on nom
CREATE UNIQUE INDEX "Interest_nom_key" ON "Interest"("nom");

-- DropTable
DROP TABLE "InterestCategory";
