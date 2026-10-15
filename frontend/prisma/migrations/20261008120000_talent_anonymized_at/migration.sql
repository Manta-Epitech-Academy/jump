-- `Talent.anonymizedAt` records that `anonymizeTalent` erased the talent. Until
-- now the only trace was the placeholder name the scrub writes, which the
-- inactivity sweep read back to skip a row it had already done. A CTFd instance
-- now asks Jump which of its accounts belong to erased talents and deletes
-- them, so "erased" has to be a fact a reader can trust rather than a value
-- that happens to be in the name.
--
-- Backfill: every row the scrub has already written. `updatedAt` is the closest
-- date there is, and it is never earlier than the erasure.

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

UPDATE "Talent"
SET "anonymizedAt" = "updatedAt"
WHERE "nom" = 'Anonymisé' AND "prenom" = 'Anonymisé';
