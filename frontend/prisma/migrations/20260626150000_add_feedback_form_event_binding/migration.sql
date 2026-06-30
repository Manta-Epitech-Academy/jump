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

-- NOTE: this migration only adds the feedback-form binding; it deliberately does
-- not touch event modules. The module set for existing events is seeded once, by
-- 20260625120000, from each campus's effective surface flags (so `bilan` stays
-- off unless that campus had it on). Enabling `bilan` for everyone here would
-- diverge from that "keep today's surfaces" rule, so it is left to the modules
-- migration alone.
