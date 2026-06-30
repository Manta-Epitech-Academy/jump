-- The dev surface flags moved to per-event modules (see EventConfig_Module).
-- The previous migration's backfill already copied each campus's effective
-- surfaces onto its events, so these CampusFeatureFlag override rows are now
-- dead. staff_intervenants is dropped too: its only page (the dev event "team"
-- / intervenants surface) was removed.
--
-- Kept deliberately separate from the EventConfig_Module migration so a rolling
-- deploy applies it only once the module-reading code is live: during the brief
-- overlap an old pod that still reads these flags simply falls back to the code
-- default (inscrits/entretiens on, emargement/bilan off), never an error.
DELETE FROM "CampusFeatureFlag"
WHERE "flagKey" IN (
  'inscrits',
  'entretiens',
  'emargement',
  'bilan',
  'staff_intervenants'
);
