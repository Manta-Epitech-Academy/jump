/*
  Warnings:

  - A unique constraint covering the columns `[issuer,accountId]` on the table `bauth_account` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `issuer` to the `bauth_account` table without a default value. This is not possible if the table is not empty.

*/
-- BetterAuth 1.7 added `issuer` to its `account` table and keys an OAuth
-- account on (issuer, accountId) rather than (providerId, accountId): see
-- @better-auth/core/dist/db/get-tables.mjs. `bauth_account` had neither, so
-- every Microsoft sign-in on 1.7 fails with a PrismaClientValidationError on
-- an unknown `issuer` argument (issue #296).
--
-- Existing rows are deleted rather than backfilled with a hardcoded tenant
-- issuer URL. A `bauth_account` row is an OAuth link plus cached tokens, not
-- user data: `bauth_user`, `StaffProfile`, roles and history all live
-- elsewhere and are untouched by this DELETE. `accountLinking.trustedProviders`
-- already carries `microsoft` (src/lib/server/auth.ts), which is the
-- mechanism that recreates the link, with the correct `issuer`, on that
-- member's next Microsoft sign-in - the same mechanism the whole staff login
-- path already depends on. A hardcoded tenant ID would put an organisation
-- identifier in git and be wrong on any environment whose tenant differs.
-- Sessions are unaffected: `bauth_session` references `bauth_user`, never
-- `bauth_account`.
DELETE FROM "bauth_account";

-- AlterTable
ALTER TABLE "bauth_account" ADD COLUMN     "issuer" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "bauth_account_issuer_accountId_key" ON "bauth_account"("issuer", "accountId");
