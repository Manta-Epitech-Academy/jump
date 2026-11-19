-- Mon parcours (#445).
--
-- « Événement clé »: a category whose events weigh in a journey, marked by a
-- star in the talent's parcours. Display only, like the colour. No backfill:
-- the PO marks a category over `write_event_category`.
ALTER TABLE "EventConfig_Category" ADD COLUMN "keyEvent" BOOLEAN NOT NULL DEFAULT false;

-- Retire the `talent_events_view` usage key: `/events` now sends the talent to
-- Mon parcours, which lists every event, so the screen it measured is gone
-- (`.claude/rules/usage.md`: a key retires with its rows, from both stores).
--
-- /!\ Warnings: this deletes every row carrying that key, from the raw table
-- and from the monthly cube. The data loss is intended and no backfill is owed:
-- the views of a list that no longer exists cannot be carried over to the page
-- that replaced it without saying something they did not measure, and
-- `seed --check` refuses a feature the catalogue no longer declares.
DELETE FROM "Usage_FeatureUse" WHERE "feature" = 'talent_events_view';
DELETE FROM "Usage_FeatureMonthly" WHERE "feature" = 'talent_events_view';
