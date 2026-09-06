-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "reglementVersion" TEXT;

-- Data Backfill: pin every existing signature to the text it was actually shown.
-- Until now the règlement PDF took its body from a single build-time import, so a
-- regeneration (which happens on every guardian co-signature) re-rendered whatever
-- the current wording was, under a signature already given. The generic 2026-2027
-- wording lands in this same release, so without this line every talent still
-- waiting on a parent would have their document silently rewritten.
-- Hardcoded to '2025-2026', NOT derived from the signature date: the key names the
-- TEXT that was in force, and one single text has been in force for every signature
-- taken so far, whichever year it was taken in.
UPDATE "Talent"
SET "reglementVersion" = '2025-2026'
WHERE "rulesSignedAt" IS NOT NULL
  AND "reglementVersion" IS NULL;
