-- AlterTable: change CmsPage scope from Campus to Event

-- Drop existing campus-scoped index and unique index
DROP INDEX IF EXISTS "CmsPage_slug_campusId_key";
DROP INDEX IF EXISTS "CmsPage_campusId_idx";

-- Drop the foreign key to Campus
ALTER TABLE "CmsPage" DROP CONSTRAINT "CmsPage_campusId_fkey";

-- Remove campusId column, add eventId column
ALTER TABLE "CmsPage" DROP COLUMN "campusId";
ALTER TABLE "CmsPage" ADD COLUMN "eventId" TEXT NOT NULL;

-- Add event-scoped unique constraint and index
CREATE UNIQUE INDEX "CmsPage_slug_eventId_key" ON "CmsPage"("slug", "eventId");
CREATE INDEX "CmsPage_eventId_idx" ON "CmsPage"("eventId");

-- Add foreign key to Event
ALTER TABLE "CmsPage" ADD CONSTRAINT "CmsPage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
