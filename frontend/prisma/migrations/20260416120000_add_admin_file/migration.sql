-- CreateTable
CREATE TABLE "AdminFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminFile_s3Key_key" ON "AdminFile"("s3Key");

-- CreateIndex
CREATE INDEX "AdminFile_uploadedById_idx" ON "AdminFile"("uploadedById");

-- AddForeignKey
ALTER TABLE "AdminFile" ADD CONSTRAINT "AdminFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
