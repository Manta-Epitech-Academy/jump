-- Planning is now data-driven: it is neither a per-event module nor a campus
-- feature flag. The dev view + talent calendar surface wherever an event has a
-- real schedule (time slots); the pedago editor is gated by role. So drop the
-- planning rows the earlier migrations seeded:
--   - the `planning` EventConfig_Module rows backfilled onto stage events,
--   - the `planning` CampusFeatureFlag overrides.
DELETE FROM "EventConfig_Module" WHERE "moduleKey" = 'planning';
DELETE FROM "CampusFeatureFlag" WHERE "flagKey" = 'planning';
