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

-- Data Backfill: Populate Schooling_YearRecord for existing talents with a niveau or schoolId.
-- Hardcoded to '2025-2026', NOT derived from CURRENT_DATE: this migration is a one-shot
-- snapshot of data that has never been through an automated rollover, so it is always
-- last completed school year's truth regardless of which day the migration actually runs
-- on. Deriving it from CURRENT_DATE would mislabel it as the *new* year on any deploy
-- that lands on or after the 31 July cutover (e.g. a mid-August rollout), which would make
-- rolloverSchoolYear see a current-year record already present for every talent and skip
-- the real advancement entirely. Run rolloverSchoolYear once after this migration lands to
-- perform the actual 2025-2026 -> 2026-2027 advance.
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
