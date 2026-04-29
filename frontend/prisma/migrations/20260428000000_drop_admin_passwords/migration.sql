-- Remove credential (email+password) accounts for admin users.
-- Admins authenticate via Microsoft OAuth only — password login is disabled.
DELETE FROM "bauth_account"
WHERE "providerId" = 'credential'
  AND "userId" IN (SELECT "id" FROM "bauth_user" WHERE "role" = 'admin');
