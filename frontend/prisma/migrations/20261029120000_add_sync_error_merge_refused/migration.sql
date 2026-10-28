-- A contact Salesforce ties to several Jump talents that Jump will not merge.
ALTER TYPE "Sync_ErrorKind" ADD VALUE 'MERGE_REFUSED';

-- AlterTable
ALTER TABLE "Sync_Error" ADD COLUMN     "convertedLeadIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A refused merge is a contact row, like a nameless contact: no one talent
-- stands for it, so it carries the contact's Salesforce id, and the Leads
-- converted into it are what find its talents when read. Only that kind
-- carries any. Hand-written, as the CHECK it replaces.
--
-- The kind is compared as text: PostgreSQL refuses to use an enum value in the
-- transaction that added it, and an enum literal here would be such a use.
ALTER TABLE "Sync_Error" DROP CONSTRAINT "Sync_Error_shape_matches_kind";

ALTER TABLE "Sync_Error"
  ADD CONSTRAINT "Sync_Error_shape_matches_kind"
  CHECK (
    ("kind"::text = 'MISSING_NAME'  AND "talentId" IS NULL     AND "externalId" IS NOT NULL AND "detail" IS NULL AND cardinality("convertedLeadIds") = 0) OR
    ("kind"::text = 'MERGE_REFUSED' AND "talentId" IS NULL     AND "externalId" IS NOT NULL AND "detail" IS NULL AND cardinality("convertedLeadIds") > 0) OR
    ("kind"::text NOT IN ('MISSING_NAME', 'MERGE_REFUSED') AND "talentId" IS NOT NULL AND "externalId" IS NULL AND "contactName" IS NULL AND "email" IS NULL AND cardinality("convertedLeadIds") = 0)
  );
