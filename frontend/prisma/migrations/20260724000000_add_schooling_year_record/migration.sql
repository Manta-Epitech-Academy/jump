-- CreateTable
CREATE TABLE "Schooling_YearRecord" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "niveau" TEXT,
    "schoolId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schooling_YearRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Schooling_YearRecord_schoolYear_schoolId_idx" ON "Schooling_YearRecord"("schoolYear", "schoolId");

-- CreateIndex
CREATE INDEX "Schooling_YearRecord_schoolYear_niveau_idx" ON "Schooling_YearRecord"("schoolYear", "niveau");

-- CreateIndex
CREATE UNIQUE INDEX "Schooling_YearRecord_talentId_schoolYear_key" ON "Schooling_YearRecord"("talentId", "schoolYear");

-- AddForeignKey
ALTER TABLE "Schooling_YearRecord" ADD CONSTRAINT "Schooling_YearRecord_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schooling_YearRecord" ADD CONSTRAINT "Schooling_YearRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data Backfill: snapshot each existing talent's niveau/schoolId into a
-- Schooling_YearRecord so the ledger captures this year's schooling before a later
-- change (a school correction, or Salesforce advancing class_level) moves
-- Talent.niveau/schoolId forward and overwrites it - without this row that prior
-- year would be lost the moment a talent advances.
-- Hardcoded to '2025-2026' (the last completed school year), NOT derived from
-- CURRENT_DATE: this is pre-feature data that belongs to the year that produced it
-- and must be labelled as history, not as the new year that opens on the 31 July
-- cutover (a mid-August deploy still lands last year's data). From here the record
-- is maintained by the normal write paths (sync, onboarding, staff), not a job.
INSERT INTO "Schooling_YearRecord" ("id", "talentId", "schoolYear", "niveau", "schoolId", "source", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "id",
  '2025-2026',
  "niveau",
  "schoolId",
  'sync',
  NOW(),
  NOW()
FROM "Talent"
WHERE "niveau" IS NOT NULL OR "schoolId" IS NOT NULL
ON CONFLICT ("talentId", "schoolYear") DO NOTHING;
