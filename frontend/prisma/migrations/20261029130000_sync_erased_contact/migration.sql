-- The Salesforce contacts the sync must never import again: those whose
-- talent was erased at their own request (`fulfillTalentDeletion`). The
-- erasure nulls `Talent.externalId`, so without this table the next push that
-- carries the contact re-creates the talent and its login.
--
-- A readmission stamps the row instead of deleting it, so who let a contact
-- back is kept: the bar holds only while "readmittedAt" is null.
--
-- No backfill: every request fulfilled before this migration has already
-- nulled the id it would need, and nothing else in Jump holds it.

CREATE TABLE "Sync_ErasedContact" (
    "externalId" TEXT NOT NULL,
    "readmittedAt" TIMESTAMP(3),
    "readmittedBy" TEXT,

    CONSTRAINT "Sync_ErasedContact_pkey" PRIMARY KEY ("externalId")
);
