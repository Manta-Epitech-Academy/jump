/**
 * The class A writes that steer the Salesforce worker: which campaigns it pulls,
 * how often, a pass asked for now, and whether the deletions a full pass held
 * back may go ahead. Plus the vocabulary of member statuses it brings back,
 * which is Salesforce's and moves without a release.
 *
 * Each is bounded to one named row and sends nothing to anybody. A source and a
 * cadence are reversible, by writing the previous value back. A request is not
 * withdrawn, it is satisfied: it ends when a pass covering it succeeds, and
 * until then it can only make the worker run sooner, never pull anything the
 * perimeter does not already serve. A release is withdrawn by the full pass
 * itself, when the roster it brings is no longer empty. None has a screen, and
 * deliberately: a campaign is named by an opaque Salesforce id that a person
 * copies out of Salesforce anyway, and the cadence is two numbers somebody
 * changes twice a year. The admin space stops growing UI, and this is the case
 * it was written for.
 *
 * What they change is read by the worker's next tick, through `/api/worker/config`
 * for the first three and through the next full pass's participations push for
 * a release, so tightening the incremental during a stage takes effect within
 * fifteen minutes with nothing redeployed and nobody touching the cluster.
 */

import { prisma } from '$lib/server/db';
import { normalizeSfStatus } from '$lib/domain/sfMemberStatus';
import { upsertMemberStatus } from '$lib/server/services/devSpaceVisibility';
import type { SyncMode, SyncSourceKind } from '@prisma/client';
import { OperationRefusedError } from '../errors';
import type { WriteOutcome } from '../plan';
import { resolveScope } from '../scope';

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

/**
 * Ask for a pass of one mode at the worker's next wake-up, whatever the cadence
 * says.
 *
 * The cadence is untouched, so there is nothing to put back afterwards: the
 * request is satisfied by the first successful run of that mode (or, for an
 * incremental, of either) that starts after it, and from then on the cadence
 * rules again. A run that fails leaves it pending, the same way it leaves the
 * watermark. Safe to repeat: a second request only moves the date forward, and
 * still asks for one pass, not two.
 */
export async function requestSync(params: {
  mode: SyncMode;
}): Promise<WriteOutcome> {
  const select = { mode: true, requestedAt: true } as const;
  const state = (row: { mode: SyncMode; requestedAt: Date } | null) =>
    row ? { mode: row.mode, requestedAt: row.requestedAt.toISOString() } : null;

  const before = await prisma.sync_Request.findUnique({
    where: { mode: params.mode },
    select,
  });
  const requestedAt = new Date();
  const after = await prisma.sync_Request.upsert({
    where: { mode: params.mode },
    create: { mode: params.mode, requestedAt },
    update: { requestedAt },
    select,
  });

  return { applied: true, before: state(before), after: state(after) };
}

/**
 * Let the next full pass apply the deletions it held back on one event.
 *
 * A full pass that cannot prove its deletions (an empty roster, or members it
 * could not resolve) keeps the enrolments and records a `Sync_PruneHold`. When
 * a person knows the campaign really was emptied in Salesforce, this is how
 * they say so. It deletes nothing itself: it stamps `releasedAt`, and the next
 * full pass that carries the event removes the enrolments if its fresh roster
 * is still empty. So the deletion is still made by a full pass and by nothing
 * else, and against what Salesforce says at that moment rather than at the
 * moment of the hold.
 *
 * Only an empty roster can be released, and that is the whole of what makes
 * this a tool. A hold over unresolved members is the case the hold exists for:
 * one of them may be the very talent whose enrolment would go, so releasing it
 * would hand a person the deletion the full pass refused to make. Its way out
 * is fixing the member's SyncError, after which the next complete roster prunes
 * by itself. The database refuses the other shape too (`Sync_PruneHold_counts_check`).
 *
 * Reversible until that pass runs, by the pass itself: a roster that arrives
 * with members renews the hold and withdraws the release. Safe to repeat:
 * releasing a released hold leaves its first release date in place.
 */
export async function releasePruneHold(params: {
  eventId: string;
}): Promise<WriteOutcome> {
  const { event } = await resolveScope({ eventId: params.eventId });

  const before = await pruneHoldState(params.eventId);
  if (!before)
    throw new OperationRefusedError(
      `Aucune suppression n'est retenue sur « ${event!.label} » : sa dernière reprise complète a appliqué les siennes, ou ne le concernait pas. La liste des suppressions retenues se lit dans stats_sync_health.`,
    );
  if (before.sentCount > 0)
    throw new OperationRefusedError(
      `Les suppressions retenues sur « ${event!.label} » ne viennent pas d'une campagne vide : ${before.resolvedCount} membre(s) sur ${before.sentCount} ont pu être rattachés à un talent, et un membre non rattaché peut être l'inscrit qu'elles supprimeraient. Elles s'appliqueront d'elles-mêmes à la reprise complète suivante une fois les erreurs de ces membres traitées sur /staff/admin/sync-errors.`,
    );
  if (before.releasedAt) return { applied: true, before, after: before };

  await prisma.sync_PruneHold.update({
    where: { eventId: params.eventId },
    data: { releasedAt: new Date() },
  });
  return {
    applied: true,
    before,
    after: await pruneHoldState(params.eventId),
  };
}

/** A hold as it lands on the audit row: dates as strings, since it is JSON. */
async function pruneHoldState(eventId: string) {
  const row = await prisma.sync_PruneHold.findUnique({
    where: { eventId },
    select: {
      pendingRemovals: true,
      sentCount: true,
      resolvedCount: true,
      lastHeldAt: true,
      releasedAt: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    lastHeldAt: row.lastHeldAt.toISOString(),
    releasedAt: row.releasedAt?.toISOString() ?? null,
  };
}

type MemberStatusState = { memberStatus: string; shownByDefault: boolean };

/**
 * Add a Salesforce member status to the words Jump knows, or change whether a
 * newly created event shows it. Bounded to one catalogue row and changes no
 * event: the rule and the write are `upsertMemberStatus`'s, shared with the
 * « Membres Salesforce » dialog. There is no delete: events and templates
 * reference the word, and old enrolments still carry it.
 */
export async function writeSyncMemberStatus(params: {
  memberStatus: string;
  shownByDefault?: boolean;
}): Promise<WriteOutcome> {
  const status = normalizeSfStatus(params.memberStatus);
  if (status === null)
    throw new OperationRefusedError('Le statut Salesforce est vide.');

  const stateOf = async (): Promise<MemberStatusState | null> => {
    const row = await prisma.sync_MemberStatus.findUnique({
      where: { status },
      select: { status: true, shownByDefault: true },
    });
    return row
      ? { memberStatus: row.status, shownByDefault: row.shownByDefault }
      : null;
  };

  const before = await stateOf();
  await upsertMemberStatus(status, params.shownByDefault);
  return { applied: true, before, after: await stateOf() };
}
