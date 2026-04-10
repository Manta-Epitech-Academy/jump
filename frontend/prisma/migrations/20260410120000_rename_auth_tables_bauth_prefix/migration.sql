-- Rename BetterAuth tables to add bauth_ prefix
ALTER TABLE "user" RENAME TO "bauth_user";
ALTER TABLE "session" RENAME TO "bauth_session";
ALTER TABLE "account" RENAME TO "bauth_account";
