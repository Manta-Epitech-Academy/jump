-- What an activity's subject says about itself, read back from its CTFd
-- instance so the talent dashboard can lead with it.
--
-- The headline, the cover, its still and the mascot are authored once, in the
-- subject repo, and synced onto the instance by the plugin. Jump now asks the
-- instance for them (`GET <baseUrl>/jump/meta`) whenever an admin declares or
-- re-declares it, instead of having them typed in a second time, and keeps a
-- copy: the text here, the pictures in storage.
--
-- A polled external mirror, apart from the curation row (`Workshop_Instance`),
-- in the `TalentSfImport` shape. The pictures are a child table rather than
-- nullable columns so that a cover can never hold half an image.
--
-- No backfill: an instance with no row has simply never been read, and the
-- dashboard renders it with its label alone until it is.

-- CreateEnum
CREATE TYPE "WorkshopCoverKind" AS ENUM ('media', 'poster', 'mascot');

-- CreateTable
CREATE TABLE "Workshop_Cover" (
    "instanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "tagline" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_Cover_pkey" PRIMARY KEY ("instanceId")
);

-- CreateTable
CREATE TABLE "Workshop_CoverImage" (
    "instanceId" TEXT NOT NULL,
    "kind" "WorkshopCoverKind" NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "Workshop_CoverImage_pkey" PRIMARY KEY ("instanceId","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_CoverImage_key_key" ON "Workshop_CoverImage"("key");

-- AddForeignKey
ALTER TABLE "Workshop_Cover" ADD CONSTRAINT "Workshop_Cover_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Workshop_Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop_CoverImage" ADD CONSTRAINT "Workshop_CoverImage_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Workshop_Cover"("instanceId") ON DELETE CASCADE ON UPDATE CASCADE;

