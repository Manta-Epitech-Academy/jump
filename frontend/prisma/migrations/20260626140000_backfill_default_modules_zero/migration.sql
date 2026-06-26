-- Backfill: pre-existing events that never got module rows (chiefly old Coding
-- Clubs created before the per-event modules feature) start with the default
-- preset, so the config dialog shows the four surfaces pre-checked like a new
-- event, instead of an all-off screen that reads as a bug.
--
-- Safe now, unlike the earlier attempt: dev-workspace visibility moved to the
-- explicit `devActivatedAt` gate (migration 20260626130000), so seeding modules
-- no longer surfaces anything. This MUST run AFTER that activation cutover -
-- the cutover activated events that had modules AT THAT POINT, so the events
-- filled here stay devActivatedAt = NULL (hidden) until an admin validates them.
--
-- Only TRULY empty events are touched (NOT EXISTS), so any event already given a
-- deliberate subset by the first backfill (20260625120000) is left untouched.
INSERT INTO "EventConfig_Module" ("eventId", "moduleKey")
SELECT e."id", m."moduleKey"
FROM "Event" e
CROSS JOIN (VALUES
    ('inscrits'),
    ('emargement'),
    ('bilan'),
    ('entretiens')
) AS m("moduleKey")
WHERE NOT EXISTS (
  SELECT 1 FROM "EventConfig_Module" x WHERE x."eventId" = e."id"
)
ON CONFLICT DO NOTHING;
