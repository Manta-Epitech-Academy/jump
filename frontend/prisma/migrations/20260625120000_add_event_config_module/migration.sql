-- CreateTable
CREATE TABLE "EventConfig_Module" (
    "eventId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventConfig_Module_pkey" PRIMARY KEY ("eventId","moduleKey")
);

-- CreateIndex
CREATE INDEX "EventConfig_Module_moduleKey_idx" ON "EventConfig_Module"("moduleKey");

-- AddForeignKey
ALTER TABLE "EventConfig_Module" ADD CONSTRAINT "EventConfig_Module_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed per-event modules from each campus's currently-effective
-- surface flags, so every existing Stage de Seconde event keeps exactly the
-- surfaces it shows today. Effective = the CampusFeatureFlag override when
-- present, else the code default (inscrits/entretiens on; emargement/planning/
-- bilan off). Only stage_seconde events were ever in the dev workspace, so
-- only they are seeded; other event types stay out of it (no module rows).
INSERT INTO "EventConfig_Module" ("eventId", "moduleKey")
SELECT e."id", m."moduleKey"
FROM "Event" e
CROSS JOIN (VALUES
    ('inscrits', true),
    ('entretiens', true),
    ('emargement', false),
    ('planning', false),
    ('bilan', false)
) AS m("moduleKey", "defaultEnabled")
LEFT JOIN "CampusFeatureFlag" f
    ON f."campusId" = e."campusId" AND f."flagKey" = m."moduleKey"
WHERE e."eventType" = 'stage_seconde'
  AND COALESCE(f."enabled", m."defaultEnabled") = true
ON CONFLICT DO NOTHING;
