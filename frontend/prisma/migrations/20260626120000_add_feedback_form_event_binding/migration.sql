-- AlterTable: a per-event feedback form override (null = use the type default).
ALTER TABLE "Event" ADD COLUMN "feedbackFormId" TEXT;

-- AlterTable: marks a form as the default for an event type (at most one each).
ALTER TABLE "Feedback_Form" ADD COLUMN "defaultForEventType" TEXT;

-- CreateIndex
CREATE INDEX "Event_feedbackFormId_idx" ON "Event"("feedbackFormId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_Form_defaultForEventType_key" ON "Feedback_Form"("defaultForEventType");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_feedbackFormId_fkey" FOREIGN KEY ("feedbackFormId") REFERENCES "Feedback_Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the canonical "stage" form becomes the default for every
-- stage_seconde event, reproducing today's behaviour (the dev Bilan tab used to
-- resolve this form by its slug) without any per-event row. Guarded on existence
-- so a DB that never seeded the form is a no-op.
UPDATE "Feedback_Form" SET "defaultForEventType" = 'stage_seconde' WHERE "slug" = 'stage';

-- Backfill: enable the `bilan` module on every existing stage_seconde event.
-- The earlier add_event_config_module migration only seeded bilan where the
-- campus flag happened to be on (default off), but feedback is now part of the
-- stage baseline (see EVENT_TYPE_PRESETS), so every stage exposes it.
INSERT INTO "EventConfig_Module" ("eventId", "moduleKey")
SELECT e."id", 'bilan'
FROM "Event" e
WHERE e."eventType" = 'stage_seconde'
ON CONFLICT DO NOTHING;
