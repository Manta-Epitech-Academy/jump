-- Backfill a Planning row for every Event that does not yet have one.
-- Going forward, Planning is created together with the Event in all
-- event-creation paths (EventService, syncService, campaignService),
-- so loaders can assume it always exists.

INSERT INTO "Planning" ("id", "eventId", "createdAt", "updatedAt")
SELECT 'pln_' || e."id", e."id", NOW(), NOW()
FROM "Event" e
WHERE NOT EXISTS (
  SELECT 1 FROM "Planning" p WHERE p."eventId" = e."id"
);
