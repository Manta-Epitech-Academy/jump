-- The admin pages the admin API replaced (#483).
--
-- 1. A preset and an interest are archived rather than deleted, as an event
--    category is. Every preset name and every interest id is readable over the
--    admin API, so a delete would be one a model could aim on its own; and an
--    interest's delete cascaded it off every talent who had picked it.
ALTER TABLE "EventConfig_Template" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Interest" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- 2. Retire the usage keys of the pages and controls this branch removes: the
--    event config wizard and its bulk actions, the feedback form builder, and
--    the communication, email-actions, interests and campuses pages.
--
-- /!\ Warnings: this deletes every row carrying one of these fourteen keys,
-- from the raw table and from the monthly cube. The loss is intended and no
-- backfill is owed: each key measured a screen or a control that no longer
-- exists, so no figure read from it could be acted on, and the counts that
-- decided the removal are quoted in #483. Production does hold such rows (the
-- recorder has served it since 2026-08-28).
--
-- Required, not tidy, for the reasons 20260906120000 gives:
-- `scripts/seed/assert/stringCatalogues.ts` declares `Usage_FeatureUse.feature`
-- with `ownedBy: EVERY_ROW`, so `bun run seed --check` refuses a key the
-- catalogue no longer declares; and `usage/rollup.ts` only recomputes a month
-- that still has raw rows, so a cube row under a retired key would outlive the
-- raw retention with nothing to ever remove it.
DELETE FROM "Usage_FeatureUse"
WHERE "feature" IN (
  'admin_event_config_save',
  'admin_event_bulk_modules',
  'admin_event_bulk_activation',
  'admin_event_template_save',
  'admin_event_template_delete',
  'admin_sf_status_add',
  'admin_feedback_form_write',
  'admin_communication_view',
  'admin_email_actions_view',
  'admin_email_actions_save',
  'admin_interests_view',
  'admin_interest_write',
  'admin_campuses_view',
  'admin_campus_write'
);

DELETE FROM "Usage_FeatureMonthly"
WHERE "feature" IN (
  'admin_event_config_save',
  'admin_event_bulk_modules',
  'admin_event_bulk_activation',
  'admin_event_template_save',
  'admin_event_template_delete',
  'admin_sf_status_add',
  'admin_feedback_form_write',
  'admin_communication_view',
  'admin_email_actions_view',
  'admin_email_actions_save',
  'admin_interests_view',
  'admin_interest_write',
  'admin_campuses_view',
  'admin_campus_write'
);
