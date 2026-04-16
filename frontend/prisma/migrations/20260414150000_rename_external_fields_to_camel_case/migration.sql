-- Campus: external_name -> externalName
ALTER TABLE "Campus" RENAME COLUMN "external_name" TO "externalName";
ALTER INDEX "Campus_external_name_key" RENAME TO "Campus_externalName_key";

-- Event: external_id -> externalId
ALTER TABLE "Event" RENAME COLUMN "external_id" TO "externalId";
ALTER INDEX "Event_external_id_key" RENAME TO "Event_externalId_key";

-- Talent: salesforceId -> externalId
ALTER TABLE "Talent" RENAME COLUMN "salesforceId" TO "externalId";
