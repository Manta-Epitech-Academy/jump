-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "cohortNoun" TEXT NOT NULL DEFAULT 'participant';

-- AlterTable
ALTER TABLE "EventConfig_Template" ADD COLUMN     "cohortNoun" TEXT NOT NULL DEFAULT 'participant';

-- Backfill: existing stage-de-seconde events (and stage-typed presets) named their
-- cohort "stagiaire"; keep that. The neutral 'participant' default covers every
-- other type. The column is Jump-owned from here on (set in the config wizard);
-- this one-shot read of eventType/forEventType is only to seed the historical rows.
UPDATE "Event" SET "cohortNoun" = 'stagiaire' WHERE "eventType" = 'stage_seconde';
UPDATE "EventConfig_Template" SET "cohortNoun" = 'stagiaire' WHERE "forEventType" = 'stage_seconde';
