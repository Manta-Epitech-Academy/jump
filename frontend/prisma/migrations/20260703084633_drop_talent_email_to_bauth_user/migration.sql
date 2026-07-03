-- Move the SF-claimed login email to its proper home (the SF mirror), then drop
-- the redundant `Talent.email` column. The active login identity now lives
-- solely on `bauth_user.email` (read via `Talent.userId`), exactly like
-- `StaffProfile`. This ends the two-column duplication that generated the
-- auth-identity drift/lockout class of bugs.
--
-- Precondition (met by the earlier `backfill_talent_accounts` migration + the
-- eager mint in the sync): every talent with an email has a `bauth_user`, so the
-- login identity survives the drop.

-- 1. Add the SF-claimed email to the mirror (its true home — email is SF-owned).
ALTER TABLE "TalentSfImport" ADD COLUMN "sfEmail" TEXT;

-- 2. Backfill it from `Talent.email`, the last SF-synced value (email was
--    SF-owned and always synced onto Talent), so the AUTH-conflict classifier
--    keeps a "desired email" to compare against `bauth_user.email`.
UPDATE "TalentSfImport" sf
SET "sfEmail" = t."email"
FROM "Talent" t
WHERE t."id" = sf."talentId" AND t."email" IS NOT NULL;

-- 3. Drop the redundant column. Its unique index (`Talent_email_key`) is dropped
--    with it by Postgres.
ALTER TABLE "Talent" DROP COLUMN "email";
