-- Backfill a login account (`bauth_user`) for every talent that predates eager
-- account minting: SF-imported talents created as `Talent` rows with
-- `userId = null` that only got an account lazily at first login. This makes
-- `bauth_user.email` the reachable identity for the whole backlog, a
-- precondition for dropping `Talent.email` later in the epic.
--
-- Mirrors the create branch of `ensureTalentUser` (services/talentAccount.ts):
--   1. create a `role = 'student'` account for talents whose email is held by
--      NO `bauth_user` yet;
--   2. link every account-less talent to the (non-staff, non-parent, unlinked)
--      account holding its email — the ones just created, plus any pre-existing
--      orphan student account on the same address.
-- A talent whose email belongs to a staff or parent account is an SF data
-- anomaly: it is left `userId = null` (surfaced as an auth conflict), never
-- forced onto that identity. `Talent.email` is `@unique`, so no two talents
-- contend for the same address.
--
-- Data-only migration (no schema change). Rolling-safe: it only adds accounts,
-- so a pre-deploy pod that still mints lazily just adopts the row we created.

-- 1. Create the missing student accounts.
INSERT INTO "bauth_user" ("id", "email", "emailVerified", "name", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       lower(btrim(t."email")),
       false,
       concat_ws(' ', t."prenom", t."nom"),
       'student',
       now(),
       now()
FROM "Talent" t
WHERE t."userId" IS NULL
  AND t."email" IS NOT NULL
  AND btrim(t."email") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "bauth_user" u
    WHERE lower(u."email") = lower(btrim(t."email"))
  );

-- 2. Link account-less talents to the student account holding their email.
--    Skips staff/parent-owned addresses and any account already tied to a
--    talent, so only safe (orphan / freshly-created) accounts are adopted.
UPDATE "Talent" t
SET "userId" = u."id"
FROM "bauth_user" u
WHERE t."userId" IS NULL
  AND t."email" IS NOT NULL
  AND lower(u."email") = lower(btrim(t."email"))
  AND u."role" <> 'parent'
  AND NOT EXISTS (SELECT 1 FROM "StaffProfile" sp WHERE sp."userId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "Talent" t2 WHERE t2."userId" = u."id");
