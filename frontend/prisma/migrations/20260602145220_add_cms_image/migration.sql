-- CreateTable
CREATE TABLE "CmsImage" (
    "id" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmsImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmsImage_s3Key_key" ON "CmsImage"("s3Key");

-- CreateIndex
CREATE INDEX "CmsImage_uploadedById_idx" ON "CmsImage"("uploadedById");

-- AddForeignKey
ALTER TABLE "CmsImage" ADD CONSTRAINT "CmsImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
