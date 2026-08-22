-- CreateTable
CREATE TABLE "Onboarding_Record" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "infoValidatedAt" TIMESTAMP(3),
    "highSchoolValidatedAt" TIMESTAMP(3),
    "parentsValidatedAt" TIMESTAMP(3),
    "techInterestsValidatedAt" TIMESTAMP(3),
    "generalInterestsValidatedAt" TIMESTAMP(3),
    "interestsRecapSeenAt" TIMESTAMP(3),
    "equipmentValidatedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "rulesSignedAt" TIMESTAMP(3),
    "rulesFilePath" TEXT,
    "rulesSignedCity" TEXT,
    "reglementVersion" TEXT,
    "parentRulesSignedAt" TIMESTAMP(3),
    "parentRulesSignerPrenom" TEXT,
    "parentRulesSignerNom" TEXT,
    "parentRulesRelationship" TEXT,
    "parentRulesSignedCity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Onboarding_Record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Onboarding_Record_talentId_schoolYear_key" ON "Onboarding_Record"("talentId", "schoolYear");

-- AddForeignKey
ALTER TABLE "Onboarding_Record" ADD CONSTRAINT "Onboarding_Record_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "onboardingSchoolYear" TEXT;

-- AlterTable: which dossier a `rules` PDF job renders. Left NULL on existing
-- rows on purpose, and the worker reads NULL as "the talent's most recent
-- dossier": every job predating this migration was enqueued when a talent had
-- exactly one dossier, the one backfilled below, so the fallback resolves to the
-- same row a backfilled value would have named.
ALTER TABLE "OnboardingPdfJob" ADD COLUMN     "schoolYear" TEXT;

-- Data Backfill: give every talent who ever started onboarding the dossier row
-- their flat columns are now a projection of. Without it the first wizard step
-- they take would create an empty dossier and the projection refresh would wipe
-- every gate they had already cleared.
--
-- The school year is DERIVED per talent, not hardcoded the way the
-- Schooling_YearRecord backfill was, and the difference is load-bearing rather
-- than cosmetic: this stamp decides who has to re-onboard. Pinning everyone to
-- 2025-2026 would send the cohort that signed up after the 31 July cutover back
-- through a wizard they have just finished; pinning everyone to 2026-2027 would
-- tell last year's cohort their dossier is current and they would never be asked
-- again. The timestamps already say which year each dossier belongs to.
--
-- The year of a dossier is the year it was OPENED, from the earliest step it
-- recorded: one that starts in June and is signed in September is still June's,
-- which is how the wizard itself treated it (one uninterrupted walk).
-- `LEAST` ignores NULLs in Postgres, so a partial dossier resolves on whatever
-- it did record.
--
-- The 31 July cutoff mirrors `schoolYearOf` in src/lib/domain/schoolYear.ts. It
-- is restated here rather than reused because this runs once, in SQL, before any
-- application code can: it is a one-shot transcription, not a second live
-- implementation. Columns are TIMESTAMP(3) holding UTC, hence the double
-- `AT TIME ZONE` to read them as Paris wall-clock before comparing to the cutoff.
INSERT INTO "Onboarding_Record" (
  "id", "talentId", "schoolYear",
  "infoValidatedAt", "highSchoolValidatedAt", "parentsValidatedAt",
  "techInterestsValidatedAt", "generalInterestsValidatedAt", "interestsRecapSeenAt",
  "equipmentValidatedAt", "processingCompletedAt", "rulesSignedAt",
  "rulesFilePath", "rulesSignedCity", "reglementVersion",
  "parentRulesSignedAt", "parentRulesSignerPrenom", "parentRulesSignerNom",
  "parentRulesRelationship", "parentRulesSignedCity",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  d."id",
  d."startYear"::text || '-' || (d."startYear" + 1)::text,
  d."infoValidatedAt", d."highSchoolValidatedAt", d."parentsValidatedAt",
  d."techInterestsValidatedAt", d."generalInterestsValidatedAt", d."interestsRecapSeenAt",
  d."equipmentValidatedAt", d."processingCompletedAt", d."rulesSignedAt",
  -- The existing render moves onto the dossier it attests. Copied, not
  -- recomputed: the S3 key it holds is the pre-annual `rules.pdf` one, and it
  -- must keep resolving. Only a regeneration writes the year-keyed name, so no
  -- object has to be moved in the bucket for this to be correct.
  d."rulesFilePath", d."rulesSignedCity", d."reglementVersion",
  d."parentRulesSignedAt", d."parentRulesSignerPrenom", d."parentRulesSignerNom",
  d."parentRulesRelationship", d."parentRulesSignedCity",
  NOW(), NOW()
FROM (
  SELECT
    o.*,
    CASE
      WHEN EXTRACT(MONTH FROM o."openedParis") > 7
        OR (EXTRACT(MONTH FROM o."openedParis") = 7
            AND EXTRACT(DAY FROM o."openedParis") >= 31)
      THEN EXTRACT(YEAR FROM o."openedParis")::int
      ELSE EXTRACT(YEAR FROM o."openedParis")::int - 1
    END AS "startYear"
  FROM (
    SELECT
      t.*,
      (LEAST(
        t."infoValidatedAt", t."highSchoolValidatedAt", t."parentsValidatedAt",
        t."techInterestsValidatedAt", t."generalInterestsValidatedAt",
        t."interestsRecapSeenAt", t."equipmentValidatedAt",
        t."processingCompletedAt", t."rulesSignedAt", t."parentRulesSignedAt"
      ) AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris') AS "openedParis"
    FROM "Talent" t
  ) o
  WHERE o."openedParis" IS NOT NULL
) d
ON CONFLICT ("talentId", "schoolYear") DO NOTHING;

-- Stamp the projection with the year the row it mirrors was filed under, read
-- back from that row so the two cannot disagree. A talent with no dossier keeps
-- a NULL stamp, which is what "never started" reads as.
UPDATE "Talent" t
SET "onboardingSchoolYear" = r."schoolYear"
FROM "Onboarding_Record" r
WHERE r."talentId" = t."id";
