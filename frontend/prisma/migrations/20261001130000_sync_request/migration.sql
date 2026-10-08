-- A person can now ask for a synchronisation pass now, rather than wait for the
-- cadence.
--
-- Until now the only way to make the worker run sooner was to lower a cadence
-- and remember to raise it again, and a full pass could not be forced at all
-- without changing its own cadence. Relaunching the worker by hand did nothing:
-- `/api/worker/config` answered that no pass was due.
--
-- One row per mode, written by `ops_request_sync` and never consumed. Whether a
-- request is still pending is derived by `decideSync` from the runs that started
-- after it, so there is nothing to clear and no retention to own. No backfill:
-- an empty table means nothing was ever requested.

-- CreateTable
CREATE TABLE "Sync_Request" (
    "mode" "SyncMode" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sync_Request_pkey" PRIMARY KEY ("mode")
);
