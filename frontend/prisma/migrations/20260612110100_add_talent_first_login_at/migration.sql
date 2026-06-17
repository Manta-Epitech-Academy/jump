-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "firstLoginAt" TIMESTAMP(3);

-- Backfill firstLoginAt from the one authoritative signal: the earliest real
-- (non-impersonated) bauth_session on record. A real session is the only proof
-- that a talent genuinely logged in.
--
-- We deliberately do NOT fall back to lastActiveAt. Until the impersonation
-- guard shipping in this same release, every admin request made while
-- impersonating a talent stamped that talent's lastActiveAt (see the repair
-- below), so the column is contaminated and cannot stand in for a real login.
-- Trusting it would bake a false "connecté" onto talents an admin only ever
-- impersonated, which is the exact bug this projection exists to kill.
--
-- A talent whose real session was later deleted (logout, identity repair)
-- backfills to NULL here and re-stamps firstLoginAt on their next login via
-- hooks.server.ts. That self-healing false "Jamais" is the error we accept, over
-- the sticky false "connecté" a lastActiveAt fallback would leave behind.
UPDATE "Talent" t
SET "firstLoginAt" = (
  SELECT MIN(s."createdAt")
  FROM "bauth_session" s
  WHERE s."userId" = t."userId"
    AND s."impersonatedBy" IS NULL
)
WHERE t."firstLoginAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "bauth_session" s
    WHERE s."userId" = t."userId"
      AND s."impersonatedBy" IS NULL
  );

-- Repair lastActiveAt polluted by pre-guard impersonation. Before this release's
-- guard, impersonating a talent stamped their lastActiveAt, so a talent who was
-- only ever impersonated (never a real login of their own) now carries a bogus
-- "recent activity". Clear lastActiveAt for every talent with no real session:
-- by the same rule the firstLoginAt backfill applies, no real session means
-- never genuinely connected, so any lastActiveAt they hold is impersonation
-- residue. Talents with a real session are left untouched.
--
-- This runs here, in the same migration, for two reasons:
--   1. It absorbs the one-off scripts/repair-impersonation-last-active.ts
--      (deleted in this change), so the cleanup ships atomically with the column
--      instead of waiting on a manual run nobody is guaranteed to do.
--   2. It unsticks RGPD retention. The anonymization window keys off lastActiveAt
--      (anonymizationService.ts), so the inflated value was holding never-active
--      talents out of their erasure window indefinitely.
--
-- A genuine returning login self-heals on the next visit; the guard stops any
-- new pollution from here on.
UPDATE "Talent" t
SET "lastActiveAt" = NULL
WHERE t."lastActiveAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "bauth_session" s
    WHERE s."userId" = t."userId"
      AND s."impersonatedBy" IS NULL
  );
