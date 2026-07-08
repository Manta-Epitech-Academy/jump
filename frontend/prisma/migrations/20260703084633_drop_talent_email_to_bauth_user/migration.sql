-- Move the SF-claimed login email to its proper home (the SF mirror), then drop
-- the redundant `Talent.email` column. The active login identity now lives
-- solely on `bauth_user.email` (read via `Talent.userId`), exactly like
-- `StaffProfile`. This ends the two-column duplication that generated the
-- auth-identity drift/lockout class of bugs.
--
-- Invariant after steps 1-3: every talent email survives the drop somewhere —
-- as the linked `bauth_user.email` (the backfill migration + the sync's eager
-- mint) and/or as `TalentSfImport.sfEmail` (steps 2-3, step 3 creating the
-- mirror rows pre-mirror-era anomalies never got). Nothing is lost when
-- step 4 removes the column.

-- 1. Add the SF-claimed email to the mirror (its true home — email is SF-owned).
ALTER TABLE "TalentSfImport" ADD COLUMN "sfEmail" TEXT;

-- 2. Backfill it from `Talent.email`, the last SF-synced value (email was
--    SF-owned and always synced onto Talent), so the AUTH-conflict classifier
--    keeps a "desired email" to compare against `bauth_user.email`.
UPDATE "TalentSfImport" sf
SET "sfEmail" = t."email"
FROM "Talent" t
WHERE t."id" = sf."talentId" AND t."email" IS NOT NULL;

-- 3. Preserve the email of pre-mirror-era anomalies instead of dropping it. A
--    talent with an email, no login account and no mirror row (e.g. a legacy
--    test lead carrying a staff address, which the account backfill correctly
--    refused to adopt) would otherwise lose its email irrecoverably — and that
--    address is exactly what an admin needs to arbitrate the anomaly. For this
--    set the email is by construction SF's last claim (only the pre-mirror
--    sync ever wrote it on accountless talents; OAuth-created talents always
--    carry a userId), so creating the mirror row it never got — claims-only,
--    every other field NULL = "unknown at the time" — is honest, not
--    fabrication. These rows then surface post-deploy as accountless
--    anomalies, arbitrated from the app at leisure; no deploy-time human gate.
INSERT INTO "TalentSfImport" ("talentId", "sfEmail", "syncedAt")
SELECT t."id", t."email", now()
FROM "Talent" t
WHERE t."email" IS NOT NULL
  AND t."userId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TalentSfImport" sf WHERE sf."talentId" = t."id"
  );

-- 4. Drop the redundant column. Its unique index (`Talent_email_key`) is dropped
--    with it by Postgres.
ALTER TABLE "Talent" DROP COLUMN "email";
