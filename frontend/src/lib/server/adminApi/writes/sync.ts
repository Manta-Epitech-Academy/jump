/**
 * The class A writes that steer the Salesforce worker: which campaigns it pulls,
 * and how often.
 *
 * Both are bounded to one named row, reversible, and send nothing to anybody.
 * Neither has a screen, and deliberately: a campaign is named by an opaque
 * Salesforce id that a person copies out of Salesforce anyway, and the cadence
 * is two numbers somebody changes twice a year. The admin space stops growing
 * UI, and this is the case it was written for.
 *
 * What they change is read by `/api/worker/config` on the worker's next tick, so
 * tightening the incremental during a stage takes effect within fifteen minutes
 * with nothing redeployed and nobody touching the cluster.
 */

import { prisma } from '$lib/server/db';
import type { SyncMode, SyncSourceKind } from '@prisma/client';
import { OperationRefusedError } from '../errors';
import type { WriteOutcome } from '../plan';

/**
 * The shape of a Salesforce id, checked here so a typo is refused rather than
 * silently syncing nothing. The worker asserts the same pattern before it
 * interpolates the id into SOQL, and refusing at the source is the difference
 * between a clear answer now and a run that aborts every fifteen minutes.
 */
const SF_ID_RE = /^[a-zA-Z0-9]{15,18}$/;

type SourceState = {
  salesforceCampaignId: string;
  kind: SyncSourceKind;
  campus: string;
  enabled: boolean;
  label: string | null;
  /**
   * Whether this source is actually served to the worker. A source on a campus
   * with no Salesforce name is configured and inert, which is the whole of the
   * isolation a generated environment relies on, so the answer says it rather
   * than letting somebody wonder why nothing syncs.
   */
  servedToWorker: boolean;
};

async function sourceState(
  salesforceCampaignId: string,
): Promise<SourceState | null> {
  const row = await prisma.sync_Source.findUnique({
    where: { salesforceCampaignId },
    select: {
      salesforceCampaignId: true,
      kind: true,
      enabled: true,
      label: true,
      campus: { select: { name: true, externalName: true } },
    },
  });
  if (!row) return null;

  return {
    salesforceCampaignId: row.salesforceCampaignId,
    kind: row.kind,
    campus: row.campus.name,
    enabled: row.enabled,
    label: row.label,
    servedToWorker: row.enabled && row.campus.externalName !== null,
  };
}

/**
 * Add a campaign to the synchronised perimeter, move it, rename it or switch it
 * off.
 *
 * Safe to repeat: the same call twice leaves the same row, since it is an upsert
 * on the campaign id rather than an insert. Switching a source off is this same
 * write with `enabled: false`, not a delete, which is what keeps it reversible
 * and therefore a tool at all.
 */
export async function writeSyncSource(params: {
  salesforceCampaignId: string;
  kind?: SyncSourceKind;
  campus?: string;
  enabled?: boolean;
  label?: string;
}): Promise<WriteOutcome> {
  if (!SF_ID_RE.test(params.salesforceCampaignId))
    throw new OperationRefusedError(
      `« ${params.salesforceCampaignId} » n'a pas la forme d'un identifiant de campagne Salesforce (15 ou 18 caractères alphanumériques). Il se copie depuis l'URL de la campagne dans Salesforce.`,
    );

  const before = await sourceState(params.salesforceCampaignId);

  let campusId: string | undefined;
  if (params.campus !== undefined) {
    const campus = await prisma.campus.findFirst({
      where: { name: { equals: params.campus, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!campus) {
      const all = await prisma.campus.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      throw new OperationRefusedError(
        `Campus « ${params.campus} » inconnu. Campus disponibles : ${all.map((c) => c.name).join(', ')}.`,
      );
    }
    campusId = campus.id;
  }

  // Creating needs both, because neither has a defensible default: a campaign
  // on the wrong campus puts a cohort in front of the wrong team, and guessing
  // the kind turns one campaign into all of its children or the reverse.
  if (!before && (campusId === undefined || params.kind === undefined))
    throw new OperationRefusedError(
      `La campagne ${params.salesforceCampaignId} n'est pas encore suivie : préciser « campus » et « kind » pour l'ajouter.`,
    );

  await prisma.sync_Source.upsert({
    where: { salesforceCampaignId: params.salesforceCampaignId },
    create: {
      salesforceCampaignId: params.salesforceCampaignId,
      kind: params.kind!,
      campusId: campusId!,
      enabled: params.enabled ?? true,
      label: params.label ?? null,
    },
    update: {
      ...(params.kind !== undefined ? { kind: params.kind } : {}),
      ...(campusId !== undefined ? { campusId } : {}),
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      ...(params.label !== undefined ? { label: params.label } : {}),
    },
  });

  return {
    applied: true,
    before,
    after: await sourceState(params.salesforceCampaignId),
  };
}

/**
 * The floor and the ceiling on a cadence.
 *
 * The floor is the worker's own tick: asking for a pass every two minutes when
 * the CronJob wakes it every fifteen does not make it run more often, it just
 * makes the configured number a lie. The ceiling is a fortnight, past which a
 * full reconcile has stopped being a deletion net in any useful sense.
 */
const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 20_160;

/**
 * Set how often one pass runs.
 *
 * Safe to repeat: the same value written twice is the same row. Takes effect at
 * the worker's next wake-up, which is within fifteen minutes, because the
 * cadence is read on every tick rather than baked into the deployment.
 */
export async function writeSyncCadence(params: {
  mode: SyncMode;
  intervalMinutes: number;
}): Promise<WriteOutcome> {
  if (
    params.intervalMinutes < MIN_INTERVAL_MINUTES ||
    params.intervalMinutes > MAX_INTERVAL_MINUTES
  )
    throw new OperationRefusedError(
      `Intervalle hors bornes : entre ${MIN_INTERVAL_MINUTES} minutes (le worker n'est réveillé que toutes les 15 minutes, en demander davantage n'accélère rien) et ${MAX_INTERVAL_MINUTES} minutes.`,
    );

  const before = await prisma.sync_Cadence.findUnique({
    where: { mode: params.mode },
    select: { mode: true, intervalMinutes: true },
  });

  const after = await prisma.sync_Cadence.upsert({
    where: { mode: params.mode },
    create: { mode: params.mode, intervalMinutes: params.intervalMinutes },
    update: { intervalMinutes: params.intervalMinutes },
    select: { mode: true, intervalMinutes: true },
  });

  return { applied: true, before, after };
}
