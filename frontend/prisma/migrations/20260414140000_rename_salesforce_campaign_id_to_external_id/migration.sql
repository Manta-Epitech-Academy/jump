-- RenameColumn
ALTER TABLE "Event" RENAME COLUMN "salesforceCampaignId" TO "external_id";

-- RenameIndex
ALTER INDEX "Event_salesforceCampaignId_key" RENAME TO "Event_external_id_key";
