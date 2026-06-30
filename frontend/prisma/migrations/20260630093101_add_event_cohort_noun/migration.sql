-- AlterTable: nullable, no default. NULL means "cohort not named yet" (an
-- unconfigured event); the UI falls back to the neutral "participant" so the
-- column never asserts a choice nobody made.
ALTER TABLE "Event" ADD COLUMN     "cohortNoun" TEXT;

-- AlterTable
ALTER TABLE "EventConfig_Template" ADD COLUMN     "cohortNoun" TEXT;

-- Backfill ONLY the historical fact: existing stage-de-seconde events (and
-- stage-typed presets) named their cohort "stagiaire" everywhere in the old
-- dev UI, so materialise that. Every other (unconfigured) event stays NULL and
-- reads "participant" via the fallback. The column is Jump-owned from here on
-- (set in the config wizard); this one-shot read of eventType/forEventType only
-- seeds those historical rows.
UPDATE "Event" SET "cohortNoun" = 'stagiaire' WHERE "eventType" = 'stage_seconde';
UPDATE "EventConfig_Template" SET "cohortNoun" = 'stagiaire' WHERE "forEventType" = 'stage_seconde';
