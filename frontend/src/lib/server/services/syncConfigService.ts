/**
 * What the Salesforce worker is told on every tick: what to pull, whether to
 * pull it now, in which mode, and from when.
 *
 * The worker holds no configuration and no cadence of its own. It is woken on a
 * fixed fine tick by a CronJob and asks this. So tightening the incremental
 * during a stage is a write in Jump that takes effect at the next tick, with
 * nothing to redeploy and nobody touching the cluster, which is the whole point
 * of the refonte.
 *
 * The decision itself is `domain/syncSchedule.ts`, deliberately pure: this file
 * only reads rows and hands them over.
 */

import { prisma } from '$lib/server/db';
import {
  decideSync,
  type SyncCadence,
  type SyncDecision,
} from '$lib/domain/syncSchedule';
import type { WorkerConfigAnswer } from '$lib/validation/workerSync';
import { lastOkRun } from './syncRunService';

/**
 * The whitelist, as the worker reads it.
 *
 * Two filters, and the second one is load-bearing beyond this function. A
 * source is served only if it is enabled AND its campus carries a non-null
 * `Campus.externalName`, because that name is the only handle the worker has on
 * a campus. The generator writes no external name at all, so a generated
 * database answers an empty list on any machine: that is how a validation
 * environment stays out of every sync's scope, and it is a property of the data
 * rather than a setting somebody can re-enable by forgetting. Arming a campus
 * is an explicit act on `/staff/admin/campuses`.
 */
export async function listWorkerSources(): Promise<
  WorkerConfigAnswer['sources']
> {
  const rows = await prisma.sync_Source.findMany({
    where: { enabled: true, campus: { externalName: { not: null } } },
    select: {
      salesforceCampaignId: true,
      kind: true,
      campus: { select: { externalName: true } },
    },
    orderBy: { salesforceCampaignId: 'asc' },
  });

  return rows.map((r) => ({
    salesforceCampaignId: r.salesforceCampaignId,
    kind: r.kind,
    // Non-null by the `where` above; the assertion is the type system catching
    // up with the filter, not an assumption.
    campusExtName: r.campus.externalName!,
  }));
}

/** Both cadence rows. They ship with the migration, so both are always there. */
export async function listCadences(): Promise<SyncCadence[]> {
  const rows = await prisma.sync_Cadence.findMany({
    select: { mode: true, intervalMinutes: true },
  });
  return rows.map((r) => ({
    mode: r.mode,
    intervalMinutes: r.intervalMinutes,
  }));
}

/** The decision alone, for callers that want it without the whitelist. */
export async function currentSyncDecision(now = new Date()): Promise<{
  decision: SyncDecision;
  cadences: SyncCadence[];
}> {
  const [cadences, lastOkFull, lastOkIncremental] = await Promise.all([
    listCadences(),
    lastOkRun('full'),
    lastOkRun('incremental'),
  ]);

  return {
    decision: decideSync({ now, cadences, lastOkFull, lastOkIncremental }),
    cadences,
  };
}

/**
 * The whole answer to `GET /api/worker/config`.
 *
 * Shaped to the worker's parser rather than to our own convenience: `mode` is
 * always a real mode even when nothing is due (it is validated before
 * `shouldSync` is read), and `since` is always present as a key, `null` in
 * `full`. `workerConfigAnswerSchema` transcribes those rules and a unit test
 * holds this function to them.
 */
export async function getWorkerConfig(
  now = new Date(),
): Promise<WorkerConfigAnswer> {
  const [sources, { decision }] = await Promise.all([
    listWorkerSources(),
    currentSyncDecision(now),
  ]);

  return {
    sources,
    shouldSync: decision.shouldSync,
    mode: decision.mode,
    since: decision.since,
  };
}
