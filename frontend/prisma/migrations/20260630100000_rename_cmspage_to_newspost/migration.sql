-- Rename CmsPage -> NewsPost and reshape for multi-post news feed.

-- 1. Rename table
ALTER TABLE "CmsPage" RENAME TO "NewsPost";

-- 2. Add new columns (nullable initially for backfill)
ALTER TABLE "NewsPost" ADD COLUMN "campusId" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN "authorId" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN "title" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "NewsPost" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "NewsPost" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. Backfill from existing data
-- campusId from the linked event
UPDATE "NewsPost" n
SET "campusId" = e."campusId"
FROM "Event" e
WHERE n."eventId" = e."id";

-- authorId from updatedBy -> bauth_user -> StaffProfile
UPDATE "NewsPost" n
SET "authorId" = sp."id"
FROM "bauth_user" u
JOIN "StaffProfile" sp ON sp."userId" = u."id"
WHERE n."updatedBy" = u."id";

-- title for all migrated rows
UPDATE "NewsPost" SET "title" = 'Message de bienvenue' WHERE "title" IS NULL;

-- createdAt from updatedAt (best proxy)
UPDATE "NewsPost" SET "createdAt" = "updatedAt";

-- publishedAt from updatedAt
UPDATE "NewsPost" SET "publishedAt" = "updatedAt";

-- expiresAt stays NULL for migrated rows (no expiration)

-- 4. Drop old constraints and recreate
ALTER TABLE "NewsPost" DROP CONSTRAINT IF EXISTS "CmsPage_pkey";
ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id");

DROP INDEX IF EXISTS "CmsPage_slug_eventId_key";
DROP INDEX IF EXISTS "CmsPage_eventId_idx";

ALTER TABLE "NewsPost" DROP COLUMN "slug";
ALTER TABLE "NewsPost" DROP COLUMN "updatedBy";

-- 5. Make eventId nullable (was required, now optional for global posts)
ALTER TABLE "NewsPost" ALTER COLUMN "eventId" DROP NOT NULL;

-- 6. Make title NOT NULL (after backfill)
ALTER TABLE "NewsPost" ALTER COLUMN "title" SET NOT NULL;

-- 7. Rename FK constraints
ALTER TABLE "NewsPost" DROP CONSTRAINT IF EXISTS "CmsPage_eventId_fkey";
ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NewsPost" DROP CONSTRAINT IF EXISTS "CmsPage_updatedBy_fkey";

-- 8. Add new FK constraints
ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_campusId_fkey"
  FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 9. Add new indexes
CREATE INDEX "NewsPost_campusId_publishedAt_idx" ON "NewsPost"("campusId", "publishedAt");
CREATE INDEX "NewsPost_eventId_idx" ON "NewsPost"("eventId");
