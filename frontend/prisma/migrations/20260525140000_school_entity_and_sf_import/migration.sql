-- Structural DDL is Prisma-generated (prisma migrate diff); the only hand-edits
-- are (a) resequencing so new structures exist before the backfill and the old
-- columns are dropped after it, and (b) the backfill block itself. Postgres runs
-- the whole migration in one transaction, so it is all-or-nothing.

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "uai" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "postalCode" TEXT,
    "inseeCode" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentSfImport" (
    "talentId" TEXT NOT NULL,
    "nom" TEXT,
    "prenom" TEXT,
    "phone" TEXT,
    "civilite" TEXT,
    "niveau" TEXT,
    "sfSchoolId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TalentSfImport_pkey" PRIMARY KEY ("talentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_uai_key" ON "School"("uai");

-- CreateIndex
CREATE INDEX "TalentSfImport_sfSchoolId_idx" ON "TalentSfImport"("sfSchoolId");

-- AlterTable: add the new columns (the old high-school columns are dropped below,
-- after their data has been moved into the new structures).
ALTER TABLE "Talent" ADD COLUMN     "highSchoolNameManual" TEXT,
ADD COLUMN     "schoolId" TEXT;

-- ─── Backfill (hand-written) ──────────────────────────────────────────────
-- One canonical School per distinct non-empty UAI already on record. name/city
-- come from existing talent data (annuaire-sourced at capture); resolvedAt is
-- stamped so the lazy resolver treats these rows as already enriched.
INSERT INTO "School" ("id", "uai", "name", "city", "resolvedAt", "createdAt", "updatedAt")
SELECT
    'sch_' || md5(t."highSchoolUai"),
    t."highSchoolUai",
    (array_agg(t."highSchoolName" ORDER BY t."updatedAt" DESC))[1],
    (array_agg(NULLIF(t."highSchoolCity", '') ORDER BY t."updatedAt" DESC))[1],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Talent" t
WHERE t."highSchoolUai" IS NOT NULL AND t."highSchoolUai" <> ''
  AND t."highSchoolName" IS NOT NULL
GROUP BY t."highSchoolUai";

-- Link talents that had a UAI to their canonical School.
UPDATE "Talent" t
SET "schoolId" = s."id"
FROM "School" s
WHERE s."uai" = t."highSchoolUai";

-- Talents whose lycée had no UAI keep the name in the free-text fallback.
UPDATE "Talent"
SET "highSchoolNameManual" = "highSchoolName"
WHERE ("highSchoolUai" IS NULL OR "highSchoolUai" = '')
  AND "highSchoolName" IS NOT NULL;
-- ──────────────────────────────────────────────────────────────────────────

-- AlterTable: drop the now-migrated columns.
ALTER TABLE "Talent" DROP COLUMN "highSchoolCity",
DROP COLUMN "highSchoolName",
DROP COLUMN "highSchoolUai";

-- CreateIndex
CREATE INDEX "Talent_schoolId_idx" ON "Talent"("schoolId");

-- AddForeignKey
ALTER TABLE "Talent" ADD CONSTRAINT "Talent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentSfImport" ADD CONSTRAINT "TalentSfImport_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentSfImport" ADD CONSTRAINT "TalentSfImport_sfSchoolId_fkey" FOREIGN KEY ("sfSchoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
