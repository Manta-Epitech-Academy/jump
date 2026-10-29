-- Clear the Microsoft refresh tokens stored before Jump stopped asking for one.
--
-- The provider's default scopes carried `offline_access`, so every staff
-- sign-in stored a refresh token in `bauth_account`: a credential that outlives
-- any session it was read through, which an admin impersonating a member of
-- staff could read over HTTP (security audit run-1). `server/auth.ts` now
-- requests the four scopes Jump uses and nothing else, so Microsoft issues no
-- refresh token from here on.
--
-- That alone leaves the old ones in place for good: BetterAuth refreshes the
-- tokens on each sign-in but drops the fields the provider did not return
-- before it writes (`oauth2/link-account.mjs`), so a missing refresh token
-- never overwrites a stored one. Hence this `UPDATE`.
--
-- Nothing is lost. Nothing in Jump refreshes a Microsoft token:
-- `syncMicrosoftAvatar` reads the access token once, right after sign-in.
UPDATE "bauth_account"
SET "refreshToken" = NULL, "refreshTokenExpiresAt" = NULL
WHERE "providerId" = 'microsoft';
