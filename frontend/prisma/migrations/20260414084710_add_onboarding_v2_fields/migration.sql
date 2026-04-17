-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "charterFilePath" TEXT,
ADD COLUMN     "imageRightsFilePath" TEXT,
ADD COLUMN     "infoValidatedAt" TIMESTAMP(3),
ADD COLUMN     "parentNom" TEXT,
ADD COLUMN     "parentPrenom" TEXT,
ADD COLUMN     "rulesFilePath" TEXT;

-- CreateTable
CREATE TABLE "ParentAccessCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentAccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentAccessCode_code_key" ON "ParentAccessCode"("code");

-- AddForeignKey
ALTER TABLE "ParentAccessCode" ADD CONSTRAINT "ParentAccessCode_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
