-- BetterAuth 1.7.0 to 1.7.2 keyed an OAuth account on (issuer, accountId), and
-- `20260831120000_add_bauth_account_issuer` followed it with a required column
-- and a unique index. 1.7.3 reverted that: accounts are found by
-- (providerId, accountId) again, as in 1.6, and `issuer` is never written. A
-- NOT NULL column BetterAuth never fills rejects every insert, so on 1.7.3 and
-- later each Microsoft sign-in that creates or relinks a `bauth_account` row
-- fails with "Argument `issuer` is missing"
-- (https://www.better-auth.com/docs/guides/1-7-upgrade-guide).
--
-- Warnings: `issuer` and its unique index `bauth_account_issuer_accountId_key`
-- are dropped with no backfill. Every row written since
-- `20260831120000_add_bauth_account_issuer` carries a value, and nothing reads
-- it: no code in Jump, and no BetterAuth from 1.7.3 on. Dropped rather than
-- relaxed to NULL so the model matches what BetterAuth's own generator emits
-- for Prisma (no field, no compound unique). The index goes first, as the
-- guide asks.
DROP INDEX "bauth_account_issuer_accountId_key";

ALTER TABLE "bauth_account" DROP COLUMN "issuer";
