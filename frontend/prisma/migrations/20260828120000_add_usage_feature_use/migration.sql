-- Usage analytics: which features are actually used, and by whom.
--
-- One migration for the whole change, per the branch rule. It carries the two
-- tables, the enum, the two StaffProfile activity projections, the talent's
-- right to object, and a best-effort backfill of the staff projections.

-- CreateEnum
CREATE TYPE "UsageActorKind" AS ENUM ('talent', 'staff');

-- CreateTable
CREATE TABLE "Usage_FeatureUse" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "actorKind" "UsageActorKind" NOT NULL,
    "staffProfileId" TEXT,
    "actorHash" TEXT,
    "campusId" TEXT,
    "eventId" TEXT,
    "impersonated" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usage_FeatureUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usage_FeatureMonthly" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "actorKind" "UsageActorKind" NOT NULL,
    "campusId" TEXT,
    "month" TEXT NOT NULL,
    "uses" INTEGER NOT NULL,
    "distinctActors" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usage_FeatureMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usage_FeatureUse_feature_dedupeKey_key" ON "Usage_FeatureUse"("feature", "dedupeKey");

-- CreateIndex
CREATE INDEX "Usage_FeatureUse_feature_occurredAt_idx" ON "Usage_FeatureUse"("feature", "occurredAt");

-- CreateIndex
CREATE INDEX "Usage_FeatureUse_campusId_occurredAt_idx" ON "Usage_FeatureUse"("campusId", "occurredAt");

-- CreateIndex
CREATE INDEX "Usage_FeatureUse_staffProfileId_occurredAt_idx" ON "Usage_FeatureUse"("staffProfileId", "occurredAt");

-- CreateIndex
CREATE INDEX "Usage_FeatureUse_occurredAt_idx" ON "Usage_FeatureUse"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Usage_FeatureMonthly_feature_actorKind_campusId_month_key" ON "Usage_FeatureMonthly"("feature", "actorKind", "campusId", "month");

-- CreateIndex
CREATE INDEX "Usage_FeatureMonthly_month_idx" ON "Usage_FeatureMonthly"("month");

-- AddForeignKey
ALTER TABLE "Usage_FeatureUse" ADD CONSTRAINT "Usage_FeatureUse_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "firstLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "usageAnalyticsOptOutAt" TIMESTAMP(3);

-- Backfill the staff activity projections from bauth_session.
--
-- Same rule and same reasoning as 20260612110100_add_talent_first_login_at: a
-- real (non-impersonated) session is the only proof of a genuine login, and the
-- `impersonatedBy IS NULL` filter matters for staff too, because the
-- impersonation endpoint accepts `kind: 'staff'`.
--
-- Best-effort, and the error it accepts is deliberate. A member whose sessions
-- were since deleted (logout, identity repair, relink) backfills to NULL and
-- re-stamps on their next request, so the page reads "Jamais" until they come
-- back. That self-healing false negative is the one to accept; a fallback onto
-- some other timestamp would leave a sticky false "connecte" on an account
-- nobody ever opened, which is the exact thing this column exists to surface.
--
-- Without this, the "never logged in" tile reads every one of the 138 staff
-- accounts as never opened on the day of deploy, which is worse than useless
-- because it looks like an answer.
UPDATE "StaffProfile" p
SET "firstLoginAt" = sub."first",
    "lastActiveAt" = sub."last"
FROM (
  SELECT s."userId",
         MIN(s."createdAt") AS "first",
         MAX(s."createdAt") AS "last"
  FROM "bauth_session" s
  WHERE s."impersonatedBy" IS NULL
  GROUP BY s."userId"
) sub
WHERE p."userId" = sub."userId";
