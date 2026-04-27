-- CreateTable
CREATE TABLE "CampusFeatureFlag" (
    "campusId" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampusFeatureFlag_pkey" PRIMARY KEY ("campusId","flagKey")
);

-- CreateIndex
CREATE INDEX "CampusFeatureFlag_flagKey_idx" ON "CampusFeatureFlag"("flagKey");

-- AddForeignKey
ALTER TABLE "CampusFeatureFlag" ADD CONSTRAINT "CampusFeatureFlag_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No backfill: registry defaults apply (stage_seconde on, coding_club off) for minimalist stage-only release.
-- Admins grant coding_club per-campus via /staff/admin/campuses.
