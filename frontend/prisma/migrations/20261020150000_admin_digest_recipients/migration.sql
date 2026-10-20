-- The weekly admin digest stops following the admin role (#426). The role was
-- given to national leadership so they could read the admin space, and that
-- alone put a working mail in their inbox, which nobody had decided.
--
-- No backfill: false for everyone means no digest goes out after this deploys
-- until the team designates its recipients over write_admin_digest_recipient.
-- Choosing them is a decision, so no migration makes it.

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "receivesAdminDigest" BOOLEAN NOT NULL DEFAULT false;
