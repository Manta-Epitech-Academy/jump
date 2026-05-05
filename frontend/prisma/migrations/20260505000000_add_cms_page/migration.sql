-- CreateTable
CREATE TABLE "CmsPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CmsPage_campusId_idx" ON "CmsPage"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "CmsPage_slug_campusId_key" ON "CmsPage"("slug", "campusId");

-- AddForeignKey
ALTER TABLE "CmsPage" ADD CONSTRAINT "CmsPage_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsPage" ADD CONSTRAINT "CmsPage_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "bauth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
