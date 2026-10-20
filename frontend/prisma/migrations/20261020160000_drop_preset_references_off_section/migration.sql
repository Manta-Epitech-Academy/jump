-- A preset carries a feedback form, a closing grid or a certificate only for
-- the section that uses it (bilan, closings, inscrits): `saveTemplate` now
-- drops the others, for the wizard and `write_event_template` alike. Until now
-- only the wizard dropped them, so a preset saved over the API from an event
-- that kept a reference to a section it had turned off carries that reference.
-- Applying such a preset attached a form, grid or certificate nobody chose, and
-- a grid or certificate it names cannot be deleted (`onDelete: Restrict`).
--
-- Data only: clear each reference whose section the preset does not enable.

UPDATE "EventConfig_Template" t
SET "feedbackFormId" = NULL
WHERE t."feedbackFormId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EventConfig_TemplateModule" m
    WHERE m."templateId" = t."id" AND m."moduleKey" = 'bilan'
  );

UPDATE "EventConfig_Template" t
SET "closingTemplateId" = NULL
WHERE t."closingTemplateId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EventConfig_TemplateModule" m
    WHERE m."templateId" = t."id" AND m."moduleKey" = 'closings'
  );

UPDATE "EventConfig_Template" t
SET "diplomaTemplateId" = NULL
WHERE t."diplomaTemplateId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EventConfig_TemplateModule" m
    WHERE m."templateId" = t."id" AND m."moduleKey" = 'inscrits'
  );
