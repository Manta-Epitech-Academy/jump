/*
  Warnings:

  - The `SyncError` table is replaced by `Sync_Error`. Its open rows are carried over (see the backfill below); these are lost:
    - resolved rows: "resolved" only ever hid a row, it fixed nothing, and the sync now closes an error itself;
    - rows whose message comes from a retired template (the `Talent.email` era, before July 2026), which no code writes any more;
    - login rows whose talent no longer exists in Jump;
    - the columns `errorType`, `message`, `existingExtId`, `eventExtId`, `occurrenceCount`, `resolved`, `resolvedAt`, `updatedAt`. The kind replaces the first two, and the last six were either never written by the current sync or meant nothing an admin acts on.

  No further backfill is owed: an error that is still true is met again by the next full pass, which recreates its row.
*/

-- CreateEnum
CREATE TYPE "Sync_ErrorKind" AS ENUM ('MISSING_NAME', 'ADDRESS_TAKEN', 'LOGIN_FAILURE');

-- CreateTable
CREATE TABLE "Sync_Error" (
    "id" TEXT NOT NULL,
    "kind" "Sync_ErrorKind" NOT NULL,
    "talentId" TEXT,
    "externalId" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "detail" TEXT,
    "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sync_Error_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sync_Error_talentId_key" ON "Sync_Error"("talentId");

-- CreateIndex
CREATE UNIQUE INDEX "Sync_Error_externalId_key" ON "Sync_Error"("externalId");

-- CreateIndex
CREATE INDEX "Sync_Error_lastOccurredAt_idx" ON "Sync_Error"("lastOccurredAt");

-- AddForeignKey
ALTER TABLE "Sync_Error" ADD CONSTRAINT "Sync_Error_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Two shapes, never mixed. A login error belongs to a talent Jump has, and its
-- address and name are read off that talent; a nameless contact has no talent
-- row, so it carries what Salesforce sent. Hand-written: Prisma cannot express
-- a CHECK, and `migrate diff` does not read one.
ALTER TABLE "Sync_Error"
  ADD CONSTRAINT "Sync_Error_shape_matches_kind"
  CHECK (
    ("kind" = 'MISSING_NAME'  AND "talentId" IS NULL     AND "externalId" IS NOT NULL AND "detail" IS NULL) OR
    ("kind" <> 'MISSING_NAME' AND "talentId" IS NOT NULL AND "externalId" IS NULL     AND "contactName" IS NULL AND "email" IS NULL)
  );

-- Backfill the open rows, so the age of the oldest error survives. The cause
-- was only ever spelled in `message`, so the current sync's three templates are
-- read back from it; anything else is a retired template and is dropped.
--
-- The old key (`email`, `attemptedExtId`) could split one contact over several
-- rows. The latest row gives the values, and the start is the earliest
-- occurrence of that cause, which is what `firstOccurredAt` means.
INSERT INTO "Sync_Error" ("id", "kind", "externalId", "contactName", "email", "firstOccurredAt", "lastOccurredAt")
SELECT DISTINCT ON (e."attemptedExtId")
  e."id",
  'MISSING_NAME',
  e."attemptedExtId",
  NULLIF(btrim(e."talentName"), ''),
  NULLIF(e."email", ''),
  min(e."createdAt") OVER (PARTITION BY e."attemptedExtId"),
  e."lastOccurredAt"
FROM "SyncError" e
WHERE NOT e."resolved" AND e."errorType" = 'MISSING_NAME'
ORDER BY e."attemptedExtId", e."lastOccurredAt" DESC;

-- One login error per talent: when the old key split a talent over several
-- rows, the latest cause is the one that still holds, and it starts at its own
-- earliest occurrence.
WITH "login" AS (
  SELECT
    e."id",
    t."id" AS "talentId",
    CASE
      WHEN e."message" LIKE 'Compte de connexion non créé%' AND e."message" LIKE '%Corrigez l''adresse dans Salesforce%' THEN 'ADDRESS_TAKEN'
      WHEN e."message" LIKE 'Divergence d''identité de connexion non auto-résoluble%' THEN 'ADDRESS_TAKEN'
      ELSE 'LOGIN_FAILURE'
    END::"Sync_ErrorKind" AS "kind",
    CASE
      WHEN e."message" LIKE 'Compte de connexion non créé%' AND e."message" LIKE '%Corrigez l''adresse dans Salesforce%' THEN NULL
      WHEN e."message" LIKE 'Divergence d''identité de connexion non auto-résoluble%' THEN NULL
      ELSE e."message"
    END AS "detail",
    e."createdAt",
    e."lastOccurredAt"
  FROM "SyncError" e
  JOIN "Talent" t ON t."externalId" = e."attemptedExtId"
  WHERE NOT e."resolved"
    AND e."errorType" = 'DUPLICATE_EMAIL'
    AND (
      e."message" LIKE 'Compte de connexion non créé%' OR
      e."message" LIKE 'Réconciliation de l''identité de connexion échouée%' OR
      e."message" LIKE 'Divergence d''identité de connexion non auto-résoluble%'
    )
)
INSERT INTO "Sync_Error" ("id", "talentId", "kind", "detail", "firstOccurredAt", "lastOccurredAt")
SELECT DISTINCT ON (l."talentId")
  l."id",
  l."talentId",
  l."kind",
  l."detail",
  min(l."createdAt") OVER (PARTITION BY l."talentId", l."kind"),
  l."lastOccurredAt"
FROM "login" l
ORDER BY l."talentId", l."lastOccurredAt" DESC;

-- DropTable
DROP TABLE "SyncError";
