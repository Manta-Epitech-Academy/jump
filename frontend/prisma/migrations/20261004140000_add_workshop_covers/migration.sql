-- How an activity presents itself on the talent dashboard: one line of its own
-- (`Workshop_Instance.tagline`) and up to three pictures (`Workshop_CoverImage`).
--
-- Authored over the API (`write_workshop_cover`), never read from the CTFd
-- instance: the people who configure an activity's look are not the ones who
-- deploy its instance, so the copy they hold is the one source. A picture is
-- given as an https address and copied into storage, never linked to.
--
-- The pictures are a child table rather than nullable columns so that a cover
-- can never hold half an image. No backfill: an instance with no tagline and no
-- picture renders with its label alone, which is the state every existing one
-- is in.

-- AlterTable
ALTER TABLE "Workshop_Instance" ADD COLUMN "tagline" TEXT;

-- CreateEnum
CREATE TYPE "WorkshopCoverKind" AS ENUM ('media', 'poster', 'mascot');

-- CreateTable
CREATE TABLE "Workshop_CoverImage" (
    "instanceId" TEXT NOT NULL,
    "kind" "WorkshopCoverKind" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "Workshop_CoverImage_pkey" PRIMARY KEY ("instanceId","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_CoverImage_key_key" ON "Workshop_CoverImage"("key");

-- AddForeignKey
ALTER TABLE "Workshop_CoverImage" ADD CONSTRAINT "Workshop_CoverImage_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Workshop_Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
