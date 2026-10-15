-- The Jump half of the refonded Salesforce worker: what to pull, how often, and
-- what each run did.
--
-- One migration for the whole change, per the branch rule. The worker is now
-- driven by Jump and holds no state of its own: it asks `/api/worker/config`
-- whether a sync is due, in which mode and from when, and reports back into
-- `Sync_Run`. None of that had anywhere to live.
--
-- Warnings: the `AppSetting` row keyed `sync.last` is deleted at the bottom. It
-- is the single overwritten JSON blob `Sync_Run` replaces, and it cannot be
-- carried over: it records no mode, so it could not become a run of either kind,
-- and nothing reads it after this migration. `AppSetting` itself stays, the seed
-- generator keeps its manifest there.

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('full', 'incremental');

-- CreateEnum
CREATE TYPE "SyncSourceKind" AS ENUM ('parent', 'orphan');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('running', 'ok', 'error');

-- CreateTable
CREATE TABLE "Sync_Source" (
    "id" TEXT NOT NULL,
    "salesforceCampaignId" TEXT NOT NULL,
    "kind" "SyncSourceKind" NOT NULL,
    "campusId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sync_Source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sync_Source_salesforceCampaignId_key" ON "Sync_Source"("salesforceCampaignId");

-- CreateIndex
CREATE INDEX "Sync_Source_campusId_idx" ON "Sync_Source"("campusId");

-- AddForeignKey
ALTER TABLE "Sync_Source" ADD CONSTRAINT "Sync_Source_campusId_fkey"
  FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Sync_Run" (
    "id" TEXT NOT NULL,
    "mode" "SyncMode" NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "eventsCount" INTEGER,
    "talentsCount" INTEGER,
    "participationsCount" INTEGER,
    "error" TEXT,

    CONSTRAINT "Sync_Run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sync_Run_mode_status_finishedAt_idx" ON "Sync_Run"("mode", "status", "finishedAt");

-- CreateIndex
CREATE INDEX "Sync_Run_startedAt_idx" ON "Sync_Run"("startedAt");

-- CreateTable
CREATE TABLE "Sync_Cadence" (
    "mode" "SyncMode" NOT NULL,
    "intervalMinutes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sync_Cadence_pkey" PRIMARY KEY ("mode")
);

-- The two rows the table exists to hold. There is one per mode and there will
-- never be another, so they ship here rather than waiting for a write: a missing
-- row would make `/api/worker/config` refuse to decide, which reads as an outage.
--
-- 180 and 1440 are the starting cadences, not a ceiling: the whole point of the
-- table is that the team tightens the incremental during a stage and loosens it
-- afterwards, from `write_sync_cadence`, without touching the cluster.
INSERT INTO "Sync_Cadence" ("mode", "intervalMinutes", "updatedAt") VALUES
  ('incremental', 180, CURRENT_TIMESTAMP),
  ('full', 1440, CURRENT_TIMESTAMP);

-- The single overwritten blob `Sync_Run` replaces. See the Warnings above for
-- why nothing is carried over from it.
DELETE FROM "AppSetting" WHERE "key" = 'sync.last';
