-- « Événement clé » (#445): a category whose events weigh in a journey, marked
-- by a star in the talent's parcours. Display only, like the colour. No
-- backfill: the PO marks a category over `write_event_category`.
ALTER TABLE "EventConfig_Category" ADD COLUMN "keyEvent" BOOLEAN NOT NULL DEFAULT false;
