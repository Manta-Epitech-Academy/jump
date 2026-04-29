-- Drop remaining credential (email+password) accounts for staff and students.
-- The previous migration (20260428000000_drop_admin_passwords) only removed
-- admin credentials. Password login is now fully disabled
-- (`emailAndPassword: false` in auth.ts) — staff via Microsoft OAuth,
-- students/parents via email OTP — so all credential rows are dead.
DELETE FROM "bauth_account" WHERE "providerId" = 'credential';
