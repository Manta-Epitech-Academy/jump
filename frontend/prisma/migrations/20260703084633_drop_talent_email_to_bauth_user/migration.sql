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

-- 3. Guard the drop: a talent still carrying an email must keep either a way to
--    log in (a linked `bauth_user`) or the address itself (the sfEmail backfill
--    above — which only reaches talents that HAVE a mirror row). A row with
--    neither (a pre-mirror-era legacy anomaly) would lose its email
--    irrecoverably; fail loud so a human resolves it, instead of the drop
--    silently destroying a login identity.
DO $$
DECLARE
  lossy int;
BEGIN
  SELECT count(*) INTO lossy
  FROM "Talent" t
  WHERE t."email" IS NOT NULL
    AND t."userId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "TalentSfImport" sf WHERE sf."talentId" = t."id"
    );
  IF lossy > 0 THEN
    RAISE EXCEPTION 'drop Talent.email: % talent(s) carry an email but have no login account and no SF mirror — their email would be lost. Resolve them by hand, then re-run.', lossy;
  END IF;
END $$;

-- 4. Drop the redundant column. Its unique index (`Talent_email_key`) is dropped
--    with it by Postgres.
ALTER TABLE "Talent" DROP COLUMN "email";
