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

-- Data Backfill: Populate Schooling_YearRecord for existing talents with a niveau or schoolId
INSERT INTO "Schooling_YearRecord" ("id", "talentId", "schoolYear", "niveau", "schoolId", "source", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "id",
  CASE 
    WHEN EXTRACT(month FROM CURRENT_DATE) >= 8 OR (EXTRACT(month FROM CURRENT_DATE) = 7 AND EXTRACT(day FROM CURRENT_DATE) >= 31)
    THEN EXTRACT(year FROM CURRENT_DATE)::text || '-' || (EXTRACT(year FROM CURRENT_DATE) + 1)::text
    ELSE (EXTRACT(year FROM CURRENT_DATE) - 1)::text || '-' || EXTRACT(year FROM CURRENT_DATE)::text
  END AS "schoolYear",
  "niveau",
  "schoolId",
  'sync',
  NOW(),
  NOW()
FROM "Talent"
WHERE "niveau" IS NOT NULL OR "schoolId" IS NOT NULL
ON CONFLICT ("talentId", "schoolYear") DO NOTHING;
