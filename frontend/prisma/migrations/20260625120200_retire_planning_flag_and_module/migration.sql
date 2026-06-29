-- Planning is now data-driven: it is neither a per-event module nor a campus
-- feature flag. The dev view + talent calendar surface wherever an event has a
-- real schedule (time slots); the pedago editor is gated by role. The module
-- backfill (20260625120000) was already updated to never seed `planning` rows,
-- so only the leftover campus feature-flag overrides need retiring here.
DELETE FROM "CampusFeatureFlag" WHERE "flagKey" = 'planning';
